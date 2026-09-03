# magick-webCLI

A browser-based image editor powered by [magick-wasm](https://github.com/dlemstra/magick-wasm) (ImageMagick compiled to WebAssembly). No uploads, no servers, all processing happens locally in your browser.

▶ Live app: [https://tejaswigowda.com/magick-webCLI/](https://tejaswigowda.com/magick-webCLI/)

> Fourth in the webCLI family of zero-egress, offline-first browser tools, alongside [ffmpeg-webCLI](https://github.com/tejaswigowda/ffmpeg-webCLI), [whisper-webCLI](https://github.com/tejaswigowda/whisper-webCLI), and [3mf-webCLI](https://github.com/tejaswigowda/3mf-webCLI). Same look and feel, same privacy promise: your images never leave your device.

## Paper

This tool is a reference implementation of the Web-CLI architecture, described in:

> The Web-CLI: Verifiable Privacy for Tools, Models, and Inference Engines in the Browser
> Tejaswi Gowda, Arizona State University. arXiv: [https://arxiv.org/abs/2608.28950](https://arxiv.org/abs/2608.28950)

The paper defines the four properties (fidelity, progressive disclosure, offline-first, zero egress), presents reference implementations, and argues that for sensitive data, client-side should be the default architecture -- because it makes privacy a verifiable technical property rather than a policy promise.

## Key Features

✓ **No Server Uploads** : All image processing happens entirely on your device

✓ **100+ Formats** : PNG, JPEG, WebP, GIF, BMP, TIFF, AVIF, HEIC, PSD, and dozens more via ImageMagick's native format support

✓ **26 Operations** : Resize, crop, rotate, effects (sepia, charcoal, oil paint, blur, sharpen, edge detect, wave distortion, vignette, solarize), color adjustment, posterize, threshold, pad/letterbox, watermarking, montage, and image diff

✓ **Operation Chaining (Stack Mode)** : Queue multiple operations and run them in a single decode/encode pass -- no quality loss from repeated re-encoding

✓ **Batch Processing** : Apply the same operation or chain to many images at once; per-file progress, individual downloads, and ZIP-all

✓ **Offline-First PWA** : Works completely offline after first use; install as a native app

✓ **Screen Wake Lock** : Screen stays active during long batch jobs

✓ **Fast & Responsive** : All ImageMagick work runs in a Web Worker so the UI never blocks

✓ **Privacy First** : Zero data collection, zero telemetry; works with your files locally

✓ **Two-Column Responsive Layout** : Input/Operations on the left, Output on the right; collapses to a single column on narrow screens

✓ **Font Awesome + Unicode Icons Only** : No emoji, no custom icon fonts beyond Font Awesome; operation icons are plain Unicode glyphs

## When to use this instead of cloud tools

Cloud tools like TinyPNG, Photopea's server features, Cloudinary, and various "convert my image" sites handle these same tasks. Every one of them uploads your file to a server. Some are free with ads, some charge, but all of them see your file.

`magick-webCLI` does format conversion, resizing, cropping, effects, watermarking, and montage all in your browser, for free. Reach for it when your images are private, when you can't install ImageMagick, or when you'd simply rather not upload. Your image never leaves your device.

## Use Cases

### ⊞ Resize
Fit an image within a box, preserving aspect ratio by default, or force an exact width/height with the "stretch" option. Choose the resampling filter (Lanczos, Mitchell, Triangle, Point, Cubic, Box).

### ▤ Crop
Fields auto-fill with the loaded image's dimensions so you can drag values down from there instead of starting from scratch.

### ↻ Rotate / Flip / Flop
Rotate by any angle in degrees; flip horizontally, vertically, or both.

### ◑ Grayscale / Sepia Tone
Convert to grayscale, or apply a sepia tone with an adjustable threshold.

### ≈ Blur / Sharpen
Gaussian blur and unsharp-style sharpening with independent radius/sigma controls.

### ✏ Charcoal Sketch / ◐ Oil Paint
Classic ImageMagick artistic effects -- charcoal sketch and oil-painting simulation.

### ⊘ Negate / ☀ Solarize / ◖ Vignette
Invert colors, apply a solarize threshold effect, or add a soft vignette.

### ◉ Adjust (Brightness / Contrast / Saturation)
Three independent controls backed by `modulate` (brightness/saturation) and `brightnessContrast` (contrast).

### ◐ Threshold (B&W) / ▣ Posterize
Reduce an image to pure black & white at an adjustable level, or reduce the color palette to N colors.

### ▢ Edge Detect / ∿ Wave Distortion
Canny edge detection, or a playful sine-wave pixel distortion.

### ▢ Pad / Letterbox
Add colored bars to bring an image to a specific aspect ratio (16:9, 9:16, 1:1, 4:3, 4:5, 21:9) without cropping or stretching.

### ↻ Auto Orient / ✕ Strip Metadata
Apply the EXIF orientation flag permanently, or strip all embedded metadata (GPS, camera info, timestamps) before sharing.

### ⛓ Operation Chaining (Stack Mode)
Switch the Operations panel to Stack mode, configure an op, and click **Add to Stack** to queue it. The queue is reorderable (move up/down, remove), and a live composed preview shows the exact sequence before you run it. All queued operations run against a single decoded image and are encoded only once.

### ▶ Batch Processing
Enable Batch mode in the Input card, drop multiple images, and Process runs the current operation (or stack) against every file. Each file shows live status (pending/processing/done/error); completed files appear in the Batch Outputs panel where you can download individually or grab everything as a ZIP.

### ▭ Watermark / Logo Overlay
Composite a second image (logo, watermark) onto the loaded image. Controls: position (5 gravity presets), width as a percentage of the base image, and opacity.

### ▦ Montage / Contact Sheet
Arrange every image currently in the batch queue into a single contact-sheet image. Configure tile size and column count.

### ≠ Compare / Diff
Load two images and compute a pixel-difference visualization plus a distortion score, using any of ImageMagick's error metrics (PSNR, RMSE, SSIM, mean absolute error, absolute error).

### ↓ Format Conversion
Every operation ends with a format + quality choice: PNG, JPEG, WebP, GIF, BMP, TIFF, AVIF. Quality applies to lossy formats (JPEG/WebP/AVIF).

## How It Works

1. Drop an image (or several, in Batch mode). ImageMagick's WebAssembly core (~15 MB) downloads automatically in the background and is cached for offline use.
2. Pick an operation (or build a chain in Stack mode) and adjust its parameters -- forms are generated from a single shared operation registry ([`operations.js`](docs/operations.js)) used by both the UI and the worker.
3. Click **Process**. All ImageMagick work -- decode, every operation in the chain, re-encode -- runs inside a dedicated Web Worker ([`imagemagick-worker.js`](docs/imagemagick-worker.js)), so the page stays responsive.
4. Preview and download the result, or grab the whole batch as a ZIP built entirely client-side ([`zip-writer.js`](docs/zip-writer.js), no dependencies).

```
┌──────────────────────────────┐
│ index.html (UI · webCLI look)│
│ - drag & drop, batch queue    │
│ - operation forms, stack list │
│ - result / batch previews     │
└──────────────┬────────────────┘
               │ postMessage
               ▼
┌───────────────────────────────┐
│ imagemagick-worker.js         │
│ (Web Worker)                  │
│ - loads magick-wasm + memory  │
│ - runs operations.js apply()  │
│ - watermark / montage / diff  │
└───────────────────────────────┘
```

All file I/O stays on your machine. Nothing is sent to any server except the one-time download of the ImageMagick WebAssembly core and the app's own static assets, both served from a CDN and cached by the service worker for offline use thereafter.

## Privacy & Security

Zero-egress verification:

1. Open DevTools (F12) → Network tab.
2. Load the app and process any image.
3. Observe zero outbound requests during processing -- only the initial asset/WASM-core downloads appear. No telemetry, no analytics, no external API calls.

Data storage:

- The ImageMagick WebAssembly core and app shell are cached by the service worker for offline use.
- No image data is ever sent to, or stored on, any server.

## Running Locally

### Prerequisites

- Node.js 14+ (only for the local dev server -- the app itself has no npm dependencies)
- A modern browser with Web Worker + ES module support (Chrome, Edge, Firefox, Safari 15+)

### Setup

```
git clone https://github.com/tejaswigowda/magick-webCLI.git
cd magick-webCLI
node server.js
```

Open http://127.0.0.1:8009

### Deployment

Deploy the `docs/` folder to any static host:

- **GitHub Pages** -- enable in repo settings; serve from `docs/`
- **Vercel / Netlify / Cloudflare Pages** -- drag & drop the `docs/` folder
- **Traditional web server** -- copy `docs/` to the web root

No special HTTP headers are required -- magick-wasm's current build doesn't need `SharedArrayBuffer`, so the app runs from any plain static host. The bundled dev server sets `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` for parity with the rest of the webCLI family, but they're optional.

## Project Structure

```
docs/
├── index.html              Main UI (webCLI look & feel, PWA manifest)
├── style.css               Dark theme, shared webCLI design tokens
├── app.js                  App controller (UI + orchestration)
├── operations.js           Shared operation registry (metadata + apply logic)
├── imagemagick-worker.js   Web Worker: loads magick-wasm, runs all image ops
├── zip-writer.js           Dependency-free ZIP (STORE) builder for batch downloads
├── service-worker.js       PWA offline caching
└── manifest.json           PWA manifest

server.js                   Node.js dev server
```

### Dependencies

None at the app layer -- pure browser APIs plus [`@imagemagick/magick-wasm`](https://www.npmjs.com/package/@imagemagick/magick-wasm) loaded directly from a CDN in the worker. Node.js is only used for the local development server.

## Known Limitations

1. The ImageMagick WebAssembly core is ~15 MB; the first load takes a moment even though it's cached after that.
2. AVIF/HEIC support depends on the codecs bundled into the upstream `magick-wasm` build; if a format fails to decode or encode, the log panel will show ImageMagick's own error message.
3. `Compare / Diff` resizes the second image to match the first's dimensions before comparing, since ImageMagick's compare requires equal dimensions.
4. Montage arranges whatever is currently in the batch queue; it does not accept a separate file picker.

## Part of the Web-CLI family

A family of zero-egress browser tools -- your data never leaves your device, verifiable in DevTools. All free, open source, and installable as offline PWAs.

- [ffmpeg-webCLI](https://github.com/tejaswigowda/ffmpeg-webCLI) -- full FFmpeg in the browser: trim, convert, compress, caption, and 30+ video operations. ([live](https://tejaswigowda.com/ffmpeg-webCLI/))
- [whisper-webCLI](https://github.com/tejaswigowda/whisper-webCLI) -- speech-to-text with Whisper (Transformers.js), ~99 languages, on-device. ([live](https://tejaswigowda.com/whisper-webCLI/))
- [chat-webCLI](https://github.com/tejaswigowda/chat-webCLI) -- local LLM chat via WebLLM/WebGPU; prompts never leave the device. ([live](https://tejaswigowda.com/chat-webCLI/))
- [3mf-webCLI](https://github.com/tejaswigowda/3mf-webCLI) -- GLB → multi-material 3MF for AMS/MMU 3D printing, client-side. ([live](https://tejaswigowda.com/3mf-webCLI/))

Architecture paper: [arXiv:2608.28950](https://arxiv.org/abs/2608.28950)

## Acknowledgments

- [magick-wasm](https://github.com/dlemstra/magick-wasm) -- Dirk Lemstra's WebAssembly build of [ImageMagick](https://imagemagick.org/) (Apache-2.0), the engine this entire app is built on.
- Design inspiration: [ffmpeg-webCLI](https://github.com/tejaswigowda/ffmpeg-webCLI), [whisper-webCLI](https://github.com/tejaswigowda/whisper-webCLI), and [3mf-webCLI](https://github.com/tejaswigowda/3mf-webCLI) -- the coherent webCLI line's pattern and ethos.

## License

This project is licensed under the Apache License 2.0, matching [magick-wasm](https://github.com/dlemstra/magick-wasm), the engine it embeds. See [LICENSE](LICENSE) for details.

Questions? Open an issue or submit a PR.