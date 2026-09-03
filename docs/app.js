/*
 * app.js
 * Controller: wires the UI to imagemagick-worker.js. No build step, no
 * framework -- plain DOM + ES modules, same philosophy as the rest of the
 * webCLI family.
 */
import { CHAINABLE_OPERATIONS, MULTI_INPUT_OPERATIONS, OUTPUT_FORMATS, findOperation, defaultParams } from './operations.js';
import { createZip } from './zip-writer.js';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const engineDot = $('engineDot');
const engineLabel = $('engineLabel');
const dropzone = $('dropzone');
const fileInput = $('fileInput');
const batchToggle = $('batchToggle');
const filePreview = $('filePreview');
const previewImg = $('previewImg');
const metaGrid = $('metaGrid');
const batchQueueEl = $('batchQueue');
const modeSwitch = $('modeSwitch');
const opSelect = $('opSelect');
const opHint = $('opHint');
const opParamsForm = $('opParams');
const stackRow = $('stackRow');
const addToStackBtn = $('addToStack');
const stackListEl = $('stackList');
const stackPreviewEl = $('stackPreview');
const multiInputExtras = $('multiInputExtras');
const formatSelect = $('formatSelect');
const qualityWrap = $('qualityWrap');
const qualityRange = $('qualityRange');
const qualityValue = $('qualityValue');
const processBtn = $('processBtn');
const processBtnLabel = $('processBtnLabel');
const resultEl = $('result');
const resultImg = $('resultImg');
const downloadLink = $('downloadLink');
const resultMeta = $('resultMeta');
const batchOutputsEl = $('batchOutputs');
const batchOutputList = $('batchOutputList');
const zipAllBtn = $('zipAllBtn');
const logEl = $('log');

// ---------- state ----------
let mode = 'single'; // 'single' | 'stack'
let stack = []; // [{op, params}]
let singleFile = null; // { name, bytes: ArrayBuffer, url }
let batchFiles = []; // [{ name, bytes, url, status, resultBlob, resultName }]
let overlayFile = null;
let compareFileA = null;
let compareFileB = null;
let wakeLock = null;

// ---------- log ----------
function log(msg) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------- engine (worker) ----------
let worker = null;
let engineReady = false;
let engineLoading = false;
let nextId = 1;
const pending = new Map();

function ensureWorker() {
  if (worker) return;
  worker = new Worker('imagemagick-worker.js', { type: 'module' });
  worker.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === 'ready') {
      engineReady = true;
      engineLoading = false;
      setEngineStatus('on', 'ImageMagick ready');
      log(`ImageMagick ${msg.version} loaded (${msg.features})`);
      updateProcessButton();
      const entry = pending.get(msg.id);
      if (entry) { entry.resolve(msg); pending.delete(msg.id); }
      return;
    }
    const entry = pending.get(msg.id);
    if (!entry) return;
    if (msg.type === 'error' || msg.type === 'file-error') {
      entry.onError ? entry.onError(msg) : entry.reject(new Error(msg.message));
      if (msg.type === 'error') pending.delete(msg.id);
    } else if (msg.type === 'progress') {
      entry.onProgress && entry.onProgress(msg);
    } else if (msg.type === 'file-result') {
      entry.onFileResult && entry.onFileResult(msg);
    } else if (msg.type === 'done') {
      entry.resolve(msg);
      pending.delete(msg.id);
    } else if (msg.type === 'result' || msg.type === 'info') {
      entry.resolve(msg);
      pending.delete(msg.id);
    }
  };
  worker.onerror = (err) => {
    setEngineStatus('off', 'Engine error');
    log(`Worker error: ${err.message}`);
  };
}

function loadEngine() {
  if (engineReady || engineLoading) return Promise.resolve();
  ensureWorker();
  engineLoading = true;
  setEngineStatus('loading', 'Loading ImageMagick\u2026');
  log('Fetching ImageMagick WebAssembly core (first time only, then cached offline)\u2026');
  return send({ kind: 'init' });
}

function send(msg, handlers = {}) {
  ensureWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, ...handlers });
    worker.postMessage({ id, ...msg });
  });
}

function setEngineStatus(state, text) {
  engineDot.className = `status-dot status-dot--${state}`;
  engineLabel.textContent = text;
}

// ---------- operation select ----------
function populateOperationSelect() {
  opSelect.innerHTML = '';
  const group = (label, ops) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = label;
    for (const op of ops) {
      const opt = document.createElement('option');
      opt.value = op.id;
      opt.textContent = `${op.icon} ${op.label}`;
      optgroup.appendChild(opt);
    }
    opSelect.appendChild(optgroup);
  };
  group('Chainable', CHAINABLE_OPERATIONS);
  if (mode === 'single') group('Multi-input (single mode only)', MULTI_INPUT_OPERATIONS);
  renderParamsForm();
}

function renderParamsForm() {
  const op = findOperation(opSelect.value) || CHAINABLE_OPERATIONS[0];
  opHint.textContent = op.hint || '';
  opParamsForm.innerHTML = '';
  opParamsForm.dataset.opId = op.id;
  const params = defaultParams(op);
  opParamsForm._currentParams = params;
  for (const p of op.params) {
    const label = document.createElement('label');
    if (p.type === 'checkbox') label.classList.add('checkbox');
    label.textContent = p.label;
    let input;
    if (p.type === 'select') {
      input = document.createElement('select');
      for (const optVal of p.options) {
        const o = document.createElement('option');
        o.value = optVal; o.textContent = optVal;
        input.appendChild(o);
      }
      input.value = p.default;
    } else if (p.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!p.default;
    } else if (p.type === 'range') {
      const wrap = document.createElement('span');
      input = document.createElement('input');
      input.type = 'range';
      input.min = p.min; input.max = p.max; input.value = p.default;
      const out = document.createElement('output');
      out.textContent = p.default;
      input.addEventListener('input', () => { out.textContent = input.value; params[p.key] = input.value; });
      wrap.append(input, ' ', out);
      label.appendChild(wrap);
      params[p.key] = p.default;
      opParamsForm.appendChild(label);
      continue;
    } else {
      input = document.createElement('input');
      input.type = p.type === 'number' ? 'number' : 'text';
      if (p.min !== undefined) input.min = p.min;
      if (p.max !== undefined) input.max = p.max;
      if (p.step !== undefined) input.step = p.step;
      if (p.placeholder) input.placeholder = p.placeholder;
      if (p.default !== undefined) input.value = p.default;
    }
    input.addEventListener('change', () => {
      params[p.key] = p.type === 'checkbox' ? input.checked : input.value;
    });
    params[p.key] = p.type === 'checkbox' ? input.checked : input.value;
    label.appendChild(input);
    opParamsForm.appendChild(label);
  }
  autofillCropFromImage();
  renderMultiInputExtras(op);
  updateStackPreview();
  updateProcessButton();
}

function autofillCropFromImage() {
  const op = findOperation(opSelect.value);
  if (!op || op.id !== 'crop' || !previewImg.naturalWidth) return;
  const widthInput = opParamsForm.querySelector('label:nth-of-type(3) input');
  const heightInput = opParamsForm.querySelector('label:nth-of-type(4) input');
  if (widthInput && !widthInput.value) widthInput.value = previewImg.naturalWidth;
  if (heightInput && !heightInput.value) heightInput.value = previewImg.naturalHeight;
  if (widthInput) opParamsForm._currentParams.width = widthInput.value;
  if (heightInput) opParamsForm._currentParams.height = heightInput.value;
}

function renderMultiInputExtras(op) {
  multiInputExtras.innerHTML = '';
  multiInputExtras.hidden = true;
  if (op.id === 'watermark') {
    multiInputExtras.hidden = false;
    multiInputExtras.appendChild(fileSlot('Overlay / logo image', (file) => { overlayFile = file; }));
  } else if (op.id === 'compare') {
    multiInputExtras.hidden = false;
    multiInputExtras.appendChild(fileSlot('Image A', (file) => { compareFileA = file; }));
    multiInputExtras.appendChild(fileSlot('Image B', (file) => { compareFileB = file; }));
  } else if (op.id === 'montage') {
    multiInputExtras.hidden = false;
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Uses every image currently in the batch queue below. Enable Batch mode and add 2+ images.';
    multiInputExtras.appendChild(p);
  }
}

function fileSlot(labelText, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'file-slot';
  const label = document.createElement('span');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  const status = document.createElement('span');
  status.className = 'hint';
  status.textContent = 'no file chosen';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const bytes = await file.arrayBuffer();
    status.textContent = `${file.name} (${prettySize(file.size)})`;
    onChange({ name: file.name, bytes });
    updateProcessButton();
  });
  wrap.append(label, input, status);
  return wrap;
}

opSelect.addEventListener('change', renderParamsForm);

// ---------- mode switch ----------
modeSwitch.addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-btn');
  if (!btn) return;
  mode = btn.dataset.mode;
  [...modeSwitch.children].forEach((b) => b.classList.toggle('active', b === btn));
  stackRow.hidden = mode !== 'stack';
  populateOperationSelect();
});

addToStackBtn.addEventListener('click', () => {
  const op = findOperation(opSelect.value);
  if (!op || !CHAINABLE_OPERATIONS.includes(op)) return;
  stack.push({ op: op.id, params: { ...opParamsForm._currentParams } });
  renderStack();
});

function renderStack() {
  stackListEl.innerHTML = '';
  stack.forEach((step, i) => {
    const op = findOperation(step.op);
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = `${op.icon} ${op.label}`;
    const btns = document.createElement('span');
    const up = mkBtn('\u2191', () => { if (i > 0) { [stack[i - 1], stack[i]] = [stack[i], stack[i - 1]]; renderStack(); } });
    const down = mkBtn('\u2193', () => { if (i < stack.length - 1) { [stack[i + 1], stack[i]] = [stack[i], stack[i + 1]]; renderStack(); } });
    const del = mkBtn('\u2715', () => { stack.splice(i, 1); renderStack(); });
    btns.append(up, down, del);
    li.append(span, btns);
    stackListEl.appendChild(li);
  });
  updateStackPreview();
  updateProcessButton();
}

function mkBtn(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function updateStackPreview() {
  if (mode !== 'stack') { stackPreviewEl.textContent = ''; return; }
  stackPreviewEl.textContent = stack.length
    ? stack.map((s) => findOperation(s.op).describe(s.params)).join(' \u2192 ')
    : '(stack empty -- add steps above)';
}

// ---------- file loading ----------
dropzone.addEventListener('click', () => fileInput.click());
['dragover', 'dragenter'].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
fileInput.addEventListener('change', () => handleFiles(fileInput.files));

batchToggle.addEventListener('change', () => {
  filePreview.hidden = batchToggle.checked;
  batchQueueEl.hidden = !batchToggle.checked;
  fileInput.multiple = batchToggle.checked;
  populateOperationSelect();
});

function prettySize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function handleFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/') || /\.(heic|avif|tiff?|bmp)$/i.test(f.name));
  if (!files.length) return;
  loadEngine().catch((err) => log(`Engine load failed: ${err.message}`));

  if (batchToggle.checked) {
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const url = URL.createObjectURL(new Blob([bytes]));
      batchFiles.push({ name: file.name, bytes, url, status: 'pending' });
    }
    renderBatchQueue();
  } else {
    const file = files[0];
    const bytes = await file.arrayBuffer();
    const url = URL.createObjectURL(new Blob([bytes]));
    singleFile = { name: file.name, bytes, url, size: file.size };
    previewImg.src = url;
    filePreview.hidden = false;
    previewImg.onload = () => {
      singleFile.naturalWidth = previewImg.naturalWidth;
      singleFile.naturalHeight = previewImg.naturalHeight;
      renderMeta({ name: file.name, width: previewImg.naturalWidth, height: previewImg.naturalHeight, byteLength: file.size });
      autofillCropFromImage();
      refineIdentify();
    };
  }
  updateProcessButton();
}

function renderMeta(info) {
  metaGrid.innerHTML = '';
  const rows = [
    ['File', info.name],
    ['Dimensions', info.width && info.height ? `${info.width} \u00D7 ${info.height}` : '\u2014'],
    ['Size', prettySize(info.byteLength)],
    ['Format', info.format || '\u2014'],
    ['Color space', info.colorSpace || '\u2014'],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    metaGrid.append(dt, dd);
  }
}

async function refineIdentify() {
  if (!singleFile) return;
  try {
    await loadEngine();
    const res = await send({ kind: 'identify', file: { name: singleFile.name, bytes: singleFile.bytes }, deep: false });
    renderMeta({ name: singleFile.name, width: res.info.width, height: res.info.height, byteLength: singleFile.size,
      format: res.info.format, colorSpace: res.info.colorSpace });
  } catch (err) {
    log(`Identify failed: ${err.message}`);
  }
}

function renderBatchQueue() {
  batchQueueEl.innerHTML = '';
  batchFiles.forEach((f, i) => {
    const li = document.createElement('li');
    const name = document.createElement('span'); name.textContent = f.name;
    const status = document.createElement('span');
    status.className = `batch-status batch-status--${f.status}`;
    status.textContent = f.status;
    const remove = mkBtn('\u2715', () => { batchFiles.splice(i, 1); renderBatchQueue(); });
    remove.className = 'btn btn-secondary';
    li.append(name, status, remove);
    batchQueueEl.appendChild(li);
  });
  batchQueueEl.hidden = batchFiles.length === 0;
}

// ---------- format / quality ----------
for (const fmt of OUTPUT_FORMATS) {
  const o = document.createElement('option');
  o.value = fmt; o.textContent = fmt;
  formatSelect.appendChild(o);
}
formatSelect.value = 'PNG';
formatSelect.addEventListener('change', () => {
  qualityWrap.style.display = ['JPEG', 'WEBP', 'AVIF'].includes(formatSelect.value) ? '' : 'none';
});
qualityWrap.style.display = 'none';
qualityRange.addEventListener('input', () => { qualityValue.textContent = qualityRange.value; });

function currentOutput() {
  return { format: formatSelect.value, quality: Number(qualityRange.value) };
}

// ---------- process ----------
function updateProcessButton() {
  const op = findOperation(opSelect.value);
  let ok = engineReady || engineLoading;
  if (!op) ok = false;
  else if (op.id === 'watermark') ok = ok && !!singleFile && !!overlayFile;
  else if (op.id === 'compare') ok = ok && !!compareFileA && !!compareFileB;
  else if (op.id === 'montage') ok = ok && batchFiles.length >= 2;
  else if (mode === 'stack') ok = ok && stack.length > 0 && (batchToggle.checked ? batchFiles.length > 0 : !!singleFile);
  else ok = ok && (batchToggle.checked ? batchFiles.length > 0 : !!singleFile);
  processBtn.disabled = !ok;
  processBtnLabel.textContent = engineLoading && !engineReady ? 'Loading ImageMagick\u2026' : 'Process';
}

processBtn.addEventListener('click', runProcess);

async function withWakeLock(fn) {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not supported / denied */ }
  try { await fn(); } finally { wakeLock?.release?.(); wakeLock = null; }
}

async function runProcess() {
  await loadEngine();
  const op = findOperation(opSelect.value);
  resultEl.hidden = true;
  batchOutputsEl.hidden = true;
  processBtn.disabled = true;
  try {
    await withWakeLock(async () => {
      if (op.id === 'watermark') await runWatermark();
      else if (op.id === 'compare') await runCompare();
      else if (op.id === 'montage') await runMontage();
      else if (batchToggle.checked) await runBatch(op);
      else await runSingle(op);
    });
  } catch (err) {
    log(`Error: ${err.message}`);
  } finally {
    updateProcessButton();
  }
}

function stepsForOp(op) {
  return mode === 'stack' ? stack : [{ op: op.id, params: { ...opParamsForm._currentParams } }];
}

async function runSingle(op) {
  const steps = stepsForOp(op);
  log(`Processing ${singleFile.name} \u2192 ${steps.map((s) => findOperation(s.op).describe(s.params)).join(', ')}`);
  const res = await send({ kind: 'chain', file: { name: singleFile.name, bytes: singleFile.bytes }, steps, output: currentOutput() });
  showResult(res, singleFile.name);
}

async function runBatch(op) {
  const steps = stepsForOp(op);
  batchFiles.forEach((f) => { f.status = 'pending'; });
  renderBatchQueue();
  batchOutputList.innerHTML = '';
  batchOutputsEl.hidden = false;
  const files = batchFiles.map((f) => ({ name: f.name, bytes: f.bytes }));
  await send({ kind: 'batch', files, steps, output: currentOutput() }, {
    onProgress: (msg) => { batchFiles[msg.index].status = 'processing'; renderBatchQueue(); log(`[${msg.index + 1}/${msg.total}] Processing ${msg.name}`); },
    onFileResult: (msg) => {
      batchFiles[msg.index].status = 'done';
      renderBatchQueue();
      addBatchOutputRow(msg);
    },
    onError: (msg) => { batchFiles[msg.index].status = 'error'; renderBatchQueue(); log(`Failed ${msg.name}: ${msg.message}`); },
  });
  log('Batch complete.');
}

function addBatchOutputRow(msg) {
  const blob = new Blob([msg.bytes], { type: msg.mimeType });
  const url = URL.createObjectURL(blob);
  const outName = withExt(msg.name, msg.format);
  const li = document.createElement('li');
  const img = document.createElement('img'); img.src = url;
  const name = document.createElement('span'); name.className = 'grow'; name.textContent = outName;
  const dl = document.createElement('a'); dl.href = url; dl.download = outName; dl.className = 'btn btn-secondary';
  dl.innerHTML = '<i class="fa-solid fa-download" aria-hidden="true"></i> Download';
  li.append(img, name, dl);
  batchOutputList.appendChild(li);
  batchOutputList._files = batchOutputList._files || [];
  batchOutputList._files.push({ name: outName, bytes: msg.bytes });
}

zipAllBtn.addEventListener('click', () => {
  const files = batchOutputList._files || [];
  if (!files.length) return;
  const blob = createZip(files.map((f) => ({ name: f.name, bytes: new Uint8Array(f.bytes) })));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'magick-webcli-batch.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
});

async function runWatermark() {
  log(`Compositing ${overlayFile.name} onto ${singleFile.name}`);
  const res = await send({
    kind: 'watermark',
    base: { name: singleFile.name, bytes: singleFile.bytes },
    overlay: { name: overlayFile.name, bytes: overlayFile.bytes },
    params: { ...opParamsForm._currentParams },
    output: currentOutput(),
  });
  showResult(res, 'watermarked');
}

async function runCompare() {
  log(`Comparing ${compareFileA.name} vs ${compareFileB.name}`);
  const res = await send({
    kind: 'compare',
    a: { name: compareFileA.name, bytes: compareFileA.bytes },
    b: { name: compareFileB.name, bytes: compareFileB.bytes },
    params: { ...opParamsForm._currentParams },
  });
  showResult(res, 'diff');
  log(`Distortion (${opParamsForm._currentParams.metric}): ${res.distortion}`);
}

async function runMontage() {
  log(`Building montage from ${batchFiles.length} images`);
  const res = await send({
    kind: 'montage',
    files: batchFiles.map((f) => ({ name: f.name, bytes: f.bytes })),
    params: { ...opParamsForm._currentParams },
    output: currentOutput(),
  });
  showResult(res, 'montage');
}

function withExt(name, format) {
  const ext = format.toLowerCase();
  return name.replace(/\.[^.]+$/, '') + '.' + ext;
}

function showResult(res, baseName) {
  const blob = new Blob([res.bytes], { type: res.mimeType });
  const url = URL.createObjectURL(blob);
  resultImg.src = url;
  const outName = withExt(baseName, res.format || 'PNG');
  downloadLink.href = url;
  downloadLink.download = outName;
  resultMeta.textContent = `${outName} \u00B7 ${prettySize(res.bytes.byteLength)}`;
  resultEl.hidden = false;
  if (res.log) log(`Done: ${res.log.join(' \u2192 ')}`);
  else log(`Done: wrote ${outName}`);
}

// ---------- init ----------
populateOperationSelect();
stackRow.hidden = true;
log('Ready. Drop an image to begin -- ImageMagick loads automatically.');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
