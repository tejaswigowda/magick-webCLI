/*
 * operations.js
 * Shared, dependency-free registry of image operations.
 *
 * Loaded by BOTH the main thread (app.js, to build the UI/forms) and the
 * worker (imagemagick-worker.js, to execute them). It has zero imports so it
 * works in either context. `apply()` receives the live magick-wasm module
 * namespace as its third argument so this file never has to import it itself.
 */

// Operations that can be queued in Stack mode and run in a single decode pass.
export const CHAINABLE_OPERATIONS = [
  {
    id: 'resize',
    label: 'Resize',
    icon: '\u229E',
    hint: 'Fit the image within a box. Leave a field blank to auto-scale it.',
    params: [
      { key: 'width', label: 'Width (px)', type: 'number', min: 1, placeholder: 'auto' },
      { key: 'height', label: 'Height (px)', type: 'number', min: 1, placeholder: 'auto' },
      { key: 'stretch', label: 'Stretch (ignore aspect ratio)', type: 'checkbox', default: false },
      {
        key: 'filter', label: 'Filter', type: 'select', default: 'Lanczos',
        options: ['Lanczos', 'Mitchell', 'Triangle', 'Point', 'Cubic', 'Box'],
      },
    ],
    apply(image, p, m) {
      const width = p.width ? Number(p.width) : image.width;
      const height = p.height ? Number(p.height) : image.height;
      const filter = m.FilterType[p.filter] ?? m.FilterType.Lanczos;
      if (p.stretch) {
        const geometry = new m.MagickGeometry(width, height);
        geometry.ignoreAspectRatio = true;
        image.resize(geometry, filter);
      } else {
        image.resize(width, height, filter);
      }
    },
    describe: (p) => `resize ${p.width || 'auto'}x${p.height || 'auto'}${p.stretch ? ' (stretch)' : ''}`,
  },
  {
    id: 'crop',
    label: 'Crop',
    icon: '\u25A4',
    hint: 'Fields auto-fill from the loaded image; drag values down from there.',
    params: [
      { key: 'x', label: 'X offset', type: 'number', min: 0, default: 0 },
      { key: 'y', label: 'Y offset', type: 'number', min: 0, default: 0 },
      { key: 'width', label: 'Width (px)', type: 'number', min: 1 },
      { key: 'height', label: 'Height (px)', type: 'number', min: 1 },
    ],
    apply(image, p, m) {
      const width = p.width ? Number(p.width) : image.width;
      const height = p.height ? Number(p.height) : image.height;
      image.crop(new m.MagickGeometry(Number(p.x) || 0, Number(p.y) || 0, width, height));
      image.resetPage();
    },
    describe: (p) => `crop ${p.width}x${p.height}+${p.x || 0}+${p.y || 0}`,
  },
  {
    id: 'rotate',
    label: 'Rotate',
    icon: '\u21BB',
    params: [
      { key: 'degrees', label: 'Degrees', type: 'number', default: 90, step: 1 },
    ],
    apply(image, p) { image.rotate(Number(p.degrees) || 0); },
    describe: (p) => `rotate ${p.degrees}\u00B0`,
  },
  {
    id: 'flip',
    label: 'Flip / Flop',
    icon: '\u2B0D',
    params: [
      {
        key: 'direction', label: 'Direction', type: 'select', default: 'horizontal',
        options: ['horizontal', 'vertical', 'both'],
      },
    ],
    apply(image, p) {
      if (p.direction === 'horizontal' || p.direction === 'both') image.flop();
      if (p.direction === 'vertical' || p.direction === 'both') image.flip();
    },
    describe: (p) => `flip (${p.direction})`,
  },
  {
    id: 'grayscale',
    label: 'Grayscale',
    icon: '\u25D1',
    params: [],
    apply(image) { image.grayscale(); },
    describe: () => 'grayscale',
  },
  {
    id: 'sepia',
    label: 'Sepia Tone',
    icon: '\u25C6',
    params: [
      { key: 'threshold', label: 'Threshold (%)', type: 'range', min: 0, max: 100, default: 80 },
    ],
    apply(image, p, m) { image.sepiaTone(new m.Percentage(Number(p.threshold) ?? 80)); },
    describe: (p) => `sepia ${p.threshold}%`,
  },
  {
    id: 'blur',
    label: 'Blur',
    icon: '\u2248',
    params: [
      { key: 'radius', label: 'Radius', type: 'number', default: 0, min: 0 },
      { key: 'sigma', label: 'Sigma', type: 'number', default: 3, min: 0.1, step: 0.1 },
    ],
    apply(image, p) { image.gaussianBlur(Number(p.radius) || 0, Number(p.sigma) || 3); },
    describe: (p) => `blur ${p.radius || 0}x${p.sigma || 3}`,
  },
  {
    id: 'sharpen',
    label: 'Sharpen',
    icon: '\u25C9',
    params: [
      { key: 'radius', label: 'Radius', type: 'number', default: 0, min: 0 },
      { key: 'sigma', label: 'Sigma', type: 'number', default: 1, min: 0.1, step: 0.1 },
    ],
    apply(image, p) { image.sharpen(Number(p.radius) || 0, Number(p.sigma) || 1); },
    describe: (p) => `sharpen ${p.radius || 0}x${p.sigma || 1}`,
  },
  {
    id: 'charcoal',
    label: 'Charcoal Sketch',
    icon: '\u270F',
    params: [
      { key: 'radius', label: 'Radius', type: 'number', default: 1, min: 0.1, step: 0.1 },
      { key: 'sigma', label: 'Sigma', type: 'number', default: 1, min: 0.1, step: 0.1 },
    ],
    apply(image, p) { image.charcoal(Number(p.radius) || 1, Number(p.sigma) || 1); },
    describe: (p) => `charcoal ${p.radius || 1}x${p.sigma || 1}`,
  },
  {
    id: 'oilpaint',
    label: 'Oil Paint',
    icon: '\u25D0',
    params: [
      { key: 'radius', label: 'Radius', type: 'number', default: 3, min: 1 },
    ],
    apply(image, p) { image.oilPaint(Number(p.radius) || 3); },
    describe: (p) => `oil-paint ${p.radius || 3}`,
  },
  {
    id: 'negate',
    label: 'Negate',
    icon: '\u2298',
    params: [],
    apply(image) { image.negate(); },
    describe: () => 'negate',
  },
  {
    id: 'solarize',
    label: 'Solarize',
    icon: '\u2600',
    params: [
      { key: 'factor', label: 'Factor (%)', type: 'range', min: 0, max: 100, default: 50 },
    ],
    apply(image, p, m) { image.solarize(new m.Percentage(Number(p.factor) ?? 50)); },
    describe: (p) => `solarize ${p.factor}%`,
  },
  {
    id: 'vignette',
    label: 'Vignette',
    icon: '\u25D6',
    params: [
      { key: 'radius', label: 'Radius', type: 'number', default: 0, min: 0 },
      { key: 'sigma', label: 'Sigma', type: 'number', default: 10, min: 0 },
    ],
    apply(image, p) {
      image.vignette(Number(p.radius) || 0, Number(p.sigma) || 10, 0, 0);
    },
    describe: (p) => `vignette ${p.radius || 0}x${p.sigma || 10}`,
  },
  {
    id: 'adjust',
    label: 'Adjust (Brightness / Contrast / Saturation)',
    icon: '\u25C9',
    params: [
      { key: 'brightness', label: 'Brightness (%)', type: 'range', min: 0, max: 200, default: 100 },
      { key: 'contrast', label: 'Contrast (%)', type: 'range', min: -100, max: 100, default: 0 },
      { key: 'saturation', label: 'Saturation (%)', type: 'range', min: 0, max: 300, default: 100 },
    ],
    apply(image, p, m) {
      const brightness = Number(p.brightness) ?? 100;
      const saturation = Number(p.saturation) ?? 100;
      const contrast = Number(p.contrast) ?? 0;
      image.modulate(new m.Percentage(brightness), new m.Percentage(saturation), new m.Percentage(100));
      if (contrast !== 0) {
        image.brightnessContrast(new m.Percentage(0), new m.Percentage(contrast));
      }
    },
    describe: (p) => `adjust b${p.brightness} c${p.contrast} s${p.saturation}`,
  },
  {
    id: 'threshold',
    label: 'Threshold (B&W)',
    icon: '\u25D0',
    params: [
      { key: 'level', label: 'Level (%)', type: 'range', min: 0, max: 100, default: 50 },
    ],
    apply(image, p, m) { image.threshold(new m.Percentage(Number(p.level) ?? 50)); },
    describe: (p) => `threshold ${p.level}%`,
  },
  {
    id: 'posterize',
    label: 'Posterize (Reduce Colors)',
    icon: '\u25A3',
    params: [
      { key: 'colors', label: 'Colors', type: 'number', default: 16, min: 2, max: 256 },
    ],
    apply(image, p, m) {
      const settings = new m.QuantizeSettings();
      settings.colors = Number(p.colors) || 16;
      image.quantize(settings);
    },
    describe: (p) => `posterize ${p.colors || 16} colors`,
  },
  {
    id: 'edge',
    label: 'Edge Detect',
    icon: '\u25A2',
    params: [
      { key: 'radius', label: 'Radius', type: 'number', default: 0, min: 0 },
      { key: 'sigma', label: 'Sigma', type: 'number', default: 1, min: 0.1, step: 0.1 },
    ],
    apply(image, p, m) {
      image.cannyEdge(Number(p.radius) || 0, Number(p.sigma) || 1, new m.Percentage(10), new m.Percentage(30));
    },
    describe: (p) => `edge ${p.radius || 0}x${p.sigma || 1}`,
  },
  {
    id: 'wave',
    label: 'Wave Distortion',
    icon: '\u223F',
    params: [
      { key: 'amplitude', label: 'Amplitude', type: 'number', default: 10, min: 0 },
      { key: 'length', label: 'Length', type: 'number', default: 120, min: 1 },
    ],
    apply(image, p, m) {
      image.wave(m.PixelInterpolateMethod.Bilinear, Number(p.amplitude) || 10, Number(p.length) || 120);
    },
    describe: (p) => `wave ${p.amplitude || 10}/${p.length || 120}`,
  },
  {
    id: 'pad',
    label: 'Pad / Letterbox',
    icon: '\u25A2',
    params: [
      {
        key: 'ratio', label: 'Target Ratio', type: 'select', default: '16:9',
        options: ['16:9', '9:16', '1:1', '4:3', '4:5', '21:9'],
      },
      {
        key: 'color', label: 'Pad Color', type: 'select', default: 'Black',
        options: ['Black', 'White', 'Gray'],
      },
    ],
    apply(image, p, m) {
      const [rw, rh] = p.ratio.split(':').map(Number);
      const srcRatio = image.width / image.height;
      const targetRatio = rw / rh;
      let width = image.width;
      let height = image.height;
      if (targetRatio > srcRatio) width = Math.round(height * targetRatio);
      else height = Math.round(width / targetRatio);
      const color = new m.MagickColor(p.color);
      image.backgroundColor = color;
      image.extent(new m.MagickGeometry(width, height), m.Gravity.Center, color);
    },
    describe: (p) => `pad to ${p.ratio} (${p.color})`,
  },
  {
    id: 'autoorient',
    label: 'Auto Orient',
    icon: '\u21BB',
    params: [],
    apply(image) { image.autoOrient(); },
    describe: () => 'auto-orient',
  },
  {
    id: 'strip',
    label: 'Strip Metadata',
    icon: '\u2715',
    params: [],
    apply(image) { image.strip(); },
    describe: () => 'strip-metadata',
  },
];

// Operations that need more than one input image, or a whole batch. These are
// only available in Single mode (mirrors ffmpeg-webCLI's multi-input rules).
export const MULTI_INPUT_OPERATIONS = [
  {
    id: 'watermark',
    label: 'Watermark / Logo Overlay',
    icon: '\u25AD',
    params: [
      {
        key: 'position', label: 'Position', type: 'select', default: 'southeast',
        options: ['southeast', 'northwest', 'northeast', 'southwest', 'center'],
      },
      { key: 'width', label: 'Width (% of base)', type: 'range', min: 5, max: 100, default: 20 },
      { key: 'opacity', label: 'Opacity (%)', type: 'range', min: 5, max: 100, default: 100 },
    ],
  },
  {
    id: 'montage',
    label: 'Montage / Contact Sheet',
    icon: '\u25A6',
    params: [
      { key: 'tileWidth', label: 'Tile Width (px)', type: 'number', default: 256, min: 16 },
      { key: 'tileHeight', label: 'Tile Height (px)', type: 'number', default: 256, min: 16 },
      { key: 'columns', label: 'Columns', type: 'number', default: 4, min: 1 },
      { key: 'background', label: 'Background', type: 'select', default: 'White', options: ['White', 'Black', 'Gray'] },
    ],
  },
  {
    id: 'compare',
    label: 'Compare / Diff',
    icon: '\u2260',
    params: [
      {
        key: 'metric', label: 'Metric', type: 'select', default: 'PeakSignalToNoiseRatio',
        options: ['PeakSignalToNoiseRatio', 'MeanAbsolute', 'RootMeanSquared', 'StructuralSimilarity', 'Absolute'],
      },
    ],
  },
];

export const OUTPUT_FORMATS = ['PNG', 'JPEG', 'WEBP', 'GIF', 'BMP', 'TIFF', 'AVIF'];

export function findOperation(id) {
  return CHAINABLE_OPERATIONS.find((o) => o.id === id) || MULTI_INPUT_OPERATIONS.find((o) => o.id === id);
}

export function defaultParams(op) {
  const params = {};
  for (const p of op.params) params[p.key] = p.default ?? '';
  return params;
}
