/*
 * imagemagick-worker.js
 * Dedicated Web Worker: loads magick-wasm once, then executes single-image
 * chains, batches, and the multi-input operations (watermark, montage,
 * compare) off the main thread so the UI never blocks.
 */
import {
  initializeImageMagick,
  ImageMagick,
  MagickImage,
  MagickImageInfo,
  MagickGeometry,
  MagickColor,
  MagickFormat,
  Percentage,
  FilterType,
  Gravity,
  Channels,
  CompositeOperator,
  EvaluateOperator,
  AlphaAction,
  ErrorMetric,
  CompareSettings,
  PixelInterpolateMethod,
  QuantizeSettings,
  ColorSpace,
  CompressionMethod,
  Interlace,
  Orientation,
  Point,
  Magick,
} from 'https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.43/dist/index.js';

import { findOperation } from './operations.js';

const MAGICK = {
  MagickGeometry, MagickColor, FilterType, Gravity, Channels, CompositeOperator,
  EvaluateOperator, AlphaAction, ErrorMetric, PixelInterpolateMethod, Percentage, QuantizeSettings,
};

function enumName(enumObj, value) {
  const entry = Object.entries(enumObj).find(([, v]) => v === value);
  return entry ? entry[0] : String(value);
}

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.43/dist/x86/magick.wasm';

const GRAVITY_MAP = {
  northwest: Gravity.Northwest, north: Gravity.North, northeast: Gravity.Northeast,
  west: Gravity.West, center: Gravity.Center, east: Gravity.East,
  southwest: Gravity.Southwest, south: Gravity.South, southeast: Gravity.Southeast,
};

let ready = null;

function ensureReady() {
  if (!ready) {
    // Fetching the bytes ourselves (rather than handing initializeImageMagick a
    // URL) avoids a broken streaming-instantiate code path inside Worker scope.
    ready = fetch(WASM_URL)
      .then((r) => r.arrayBuffer())
      .then((buf) => initializeImageMagick(new Uint8Array(buf)))
      .then(() => ({
        version: Magick.imageMagickVersion,
        delegates: Magick.delegates,
        features: Magick.features,
      }));
  }
  return ready;
}

function runChain(image, steps) {
  const log = [];
  for (const step of steps) {
    const op = findOperation(step.op);
    if (!op) continue;
    op.apply(image, step.params || {}, MAGICK);
    log.push(op.describe ? op.describe(step.params || {}) : op.id);
  }
  return log;
}

function writeImage(image, format, quality) {
  const fmt = MagickFormat[format] || MagickFormat.Png;
  image.format = fmt;
  if (quality) image.quality = Number(quality);
  return image.write(fmt, (data) => data.slice());
}

function mimeTypeFor(format) {
  const map = {
    PNG: 'image/png', JPEG: 'image/jpeg', WEBP: 'image/webp', GIF: 'image/gif',
    BMP: 'image/bmp', TIFF: 'image/tiff', AVIF: 'image/avif',
  };
  return map[format] || 'application/octet-stream';
}

function processOne(bytes, steps, output) {
  let resultBytes;
  let log;
  ImageMagick.read(new Uint8Array(bytes), (image) => {
    log = runChain(image, steps);
    resultBytes = writeImage(image, output.format, output.quality);
  });
  return { bytes: resultBytes, log };
}

function handleWatermark(payload) {
  const { base, overlay, params, output } = payload;
  let resultBytes;
  ImageMagick.read(new Uint8Array(base.bytes), (baseImage) => {
    ImageMagick.read(new Uint8Array(overlay.bytes), (overlayImage) => {
      const targetWidth = Math.max(1, Math.round(baseImage.width * (Number(params.width) || 20) / 100));
      const scale = targetWidth / overlayImage.width;
      const targetHeight = Math.max(1, Math.round(overlayImage.height * scale));
      overlayImage.resize(targetWidth, targetHeight);
      const opacity = Number(params.opacity);
      if (opacity && opacity < 100) {
        overlayImage.alpha(AlphaAction.On);
        overlayImage.evaluate(Channels.Alpha, EvaluateOperator.Multiply, opacity / 100);
      }
      const gravity = GRAVITY_MAP[params.position] || Gravity.Southeast;
      baseImage.compositeGravity(overlayImage, gravity, CompositeOperator.Over);
      resultBytes = writeImage(baseImage, output.format, output.quality);
    });
  });
  return resultBytes;
}

function handleMontage(payload) {
  const { files, params, output } = payload;
  // Built by hand (resize + composite) rather than ImageMagick's native
  // montage(), which unconditionally tries to render a per-tile filename
  // caption and throws UnableToReadFont since this wasm build has no fonts.
  const tileWidth = Number(params.tileWidth) || 256;
  const tileHeight = Number(params.tileHeight) || 256;
  const columns = Math.max(1, Number(params.columns) || 4);
  const rows = Math.ceil(files.length / columns);
  const background = new MagickColor(params.background || 'White');
  const canvas = MagickImage.create(background, columns * tileWidth, rows * tileHeight);

  files.forEach((file, index) => {
    ImageMagick.read(new Uint8Array(file.bytes), (tile) => {
      tile.resize(tileWidth, tileHeight);
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = col * tileWidth + Math.round((tileWidth - tile.width) / 2);
      const y = row * tileHeight + Math.round((tileHeight - tile.height) / 2);
      canvas.composite(tile, new Point(x, y), CompositeOperator.Over);
    });
  });

  const resultBytes = writeImage(canvas, output.format, output.quality);
  canvas.dispose();
  return resultBytes;
}

function handleCompare(payload) {
  const { a, b, params } = payload;
  let resultBytes;
  let distortion;
  ImageMagick.read(new Uint8Array(a.bytes), (imageA) => {
    ImageMagick.read(new Uint8Array(b.bytes), (imageB) => {
      if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
        imageB.resize(imageA.width, imageA.height);
      }
      const metric = ErrorMetric[params.metric] || ErrorMetric.PeakSignalToNoiseRatio;
      const settings = new CompareSettings(metric);
      imageA.compare(imageB, settings, (result) => {
        distortion = Number(result.distortion);
        resultBytes = result.difference.write(MagickFormat.Png, (data) => data.slice());
        result.difference.dispose();
      });
    });
  });
  return { bytes: resultBytes, distortion };
}

function handleIdentify(payload) {
  const { file, deep } = payload;
  const bytes = new Uint8Array(file.bytes);
  const info = MagickImageInfo.create(bytes);
  const result = {
    width: info.width,
    height: info.height,
    format: info.format,
    colorSpace: enumName(ColorSpace, info.colorSpace),
    compression: enumName(CompressionMethod, info.compression),
    quality: info.quality,
    interlace: enumName(Interlace, info.interlace),
    orientation: enumName(Orientation, info.orientation),
    byteLength: bytes.byteLength,
  };
  if (deep) {
    ImageMagick.read(bytes, (image) => {
      const stats = image.statistics().composite();
      result.stats = {
        mean: stats.mean, standardDeviation: stats.standardDeviation,
        minimum: stats.minimum, maximum: stats.maximum, entropy: stats.entropy,
      };
      result.hasAlpha = image.hasAlpha;
      result.totalColors = image.totalColors;
      const histogram = image.histogram();
      const sorted = [...histogram.entries()].sort((x, y) => (y[1] > x[1] ? 1 : -1)).slice(0, 8);
      result.topColors = sorted.map(([color, count]) => ({ color, count: Number(count) }));
    });
  }
  return result;
}

self.onmessage = async (event) => {
  const msg = event.data;
  const { id, kind } = msg;
  try {
    if (kind === 'init') {
      const info = await ensureReady();
      self.postMessage({ id, type: 'ready', ...info });
      return;
    }
    await ensureReady();

    if (kind === 'chain') {
      const { bytes, log } = processOne(msg.file.bytes, msg.steps, msg.output);
      self.postMessage({ id, type: 'result', name: msg.file.name, bytes, format: msg.output.format,
        mimeType: mimeTypeFor(msg.output.format), log }, [bytes.buffer]);
    } else if (kind === 'batch') {
      const total = msg.files.length;
      for (let i = 0; i < total; i++) {
        const file = msg.files[i];
        self.postMessage({ id, type: 'progress', index: i, total, name: file.name });
        try {
          const { bytes, log } = processOne(file.bytes, msg.steps, msg.output);
          self.postMessage({ id, type: 'file-result', index: i, total, name: file.name, bytes,
            format: msg.output.format, mimeType: mimeTypeFor(msg.output.format), log }, [bytes.buffer]);
        } catch (err) {
          self.postMessage({ id, type: 'file-error', index: i, total, name: file.name, message: err.message });
        }
      }
      self.postMessage({ id, type: 'done' });
    } else if (kind === 'watermark') {
      const bytes = handleWatermark(msg);
      self.postMessage({ id, type: 'result', name: 'watermarked', bytes, format: msg.output.format,
        mimeType: mimeTypeFor(msg.output.format) }, [bytes.buffer]);
    } else if (kind === 'montage') {
      const bytes = handleMontage(msg);
      self.postMessage({ id, type: 'result', name: 'montage', bytes, format: msg.output.format,
        mimeType: mimeTypeFor(msg.output.format) }, [bytes.buffer]);
    } else if (kind === 'compare') {
      const { bytes, distortion } = handleCompare(msg);
      self.postMessage({ id, type: 'result', name: 'diff', bytes, format: 'PNG',
        mimeType: mimeTypeFor('PNG'), distortion }, [bytes.buffer]);
    } else if (kind === 'identify') {
      const info = handleIdentify(msg);
      self.postMessage({ id, type: 'info', info });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
