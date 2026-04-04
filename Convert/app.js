/* ═══════════════════════════════════════════════════════
   IMG Tools — app.js
   Tab 1: PNG Simplify
   Tab 2: GIF → PNG
   Tab 3: Xoá Logo (watermark remover với vùng kéo thả)
   ═══════════════════════════════════════════════════════ */
'use strict';

/* ── Utils ────────────────────────────────────────────── */
const uid  = () => Math.random().toString(36).slice(2, 9);
const wait = ms => new Promise(r => setTimeout(r, ms));
function fmt(bytes) {
  if (bytes < 1024)    return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

/* ── Tab switching ────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.hidden = p.id !== 'tab-' + btn.dataset.tab;
    });
  });
});

/* ═══════════════════════════════════════════════════════
   FileProcessor — shared engine
   ═══════════════════════════════════════════════════════ */
class FileProcessor {
  constructor(opts) {
    this.opts  = opts;
    this.files = [];
    this.busy  = false;
    this._bind();
  }

  _bind() {
    const { dropzoneEl, fileInputEl, browseEl, processBtn, clearBtn, dlAllBtn } = this.opts;
    dropzoneEl.addEventListener('click', () => fileInputEl.click());
    browseEl.addEventListener('click', e => { e.stopPropagation(); fileInputEl.click(); });
    fileInputEl.addEventListener('change', e => { this.addFiles(e.target.files); fileInputEl.value = ''; });
    dropzoneEl.addEventListener('dragover',  e => { e.preventDefault(); dropzoneEl.classList.add('drag-over'); });
    dropzoneEl.addEventListener('dragleave', e => { if (!dropzoneEl.contains(e.relatedTarget)) dropzoneEl.classList.remove('drag-over'); });
    dropzoneEl.addEventListener('drop', e => { e.preventDefault(); dropzoneEl.classList.remove('drag-over'); this.addFiles(e.dataTransfer.files); });
    processBtn.addEventListener('click', () => this.processAll());
    clearBtn.addEventListener('click',   () => this.clearAll());
    dlAllBtn.addEventListener('click',   () => this.downloadAll());
  }

  addFiles(fileObjects) {
    const accept = Array.isArray(this.opts.accept) ? this.opts.accept : [this.opts.accept];
    const arr = Array.from(fileObjects).filter(f => accept.includes(f.type));
    if (!arr.length) return;
    arr.forEach(f => {
      const entry = { id: uid(), file: f, status: 'waiting', blob: null, thumbUrl: URL.createObjectURL(f) };
      this.files.push(entry);
      this._renderRow(entry);
    });
    this._updateToolbar();
  }

  _updateToolbar() {
    const n = this.files.length;
    this.opts.toolbarEl.hidden = n === 0;
    this.opts.countEl.textContent = n + ' file';
  }

  _renderRow(entry) {
    const row = document.createElement('div');
    row.className = 'file-row'; row.id = 'row-' + entry.id;

    const thumb = document.createElement('img');
    thumb.className = 'file-thumb'; thumb.src = entry.thumbUrl; thumb.alt = '';

    const info = document.createElement('div'); info.className = 'file-info';
    const name = document.createElement('div'); name.className = 'file-name'; name.textContent = entry.file.name;
    const meta = document.createElement('div'); meta.className = 'file-meta'; meta.id = 'meta-' + entry.id; meta.textContent = fmt(entry.file.size);
    const track = document.createElement('div'); track.className = 'progress-track'; track.id = 'track-' + entry.id; track.style.display = 'none';
    const bar   = document.createElement('div'); bar.className = 'progress-bar'; bar.id = 'bar-' + entry.id;
    track.appendChild(bar);
    info.append(name, meta, track);

    const right  = document.createElement('div'); right.className = 'file-right';
    const badge  = document.createElement('span'); badge.id = 'badge-' + entry.id; badge.style.display = 'none';
    const status = document.createElement('span'); status.className = 'status-pill status-waiting'; status.id = 'status-' + entry.id; status.textContent = 'chờ';
    const dlBtn  = document.createElement('button'); dlBtn.className = 'dl-btn'; dlBtn.id = 'dl-' + entry.id; dlBtn.textContent = '↓ tải về'; dlBtn.disabled = true;
    dlBtn.addEventListener('click', () => this._download(entry));
    right.append(badge, status, dlBtn);
    row.append(thumb, info, right);
    this.opts.listEl.appendChild(row);
  }

  setStatus(id, type, text) {
    const el = document.getElementById('status-' + id);
    if (!el) return; el.className = 'status-pill status-' + type; el.textContent = text;
  }
  setMeta(id, text)  { const el = document.getElementById('meta-' + id);  if (el) el.textContent = text; }
  setBadge(id, cls, text) {
    const el = document.getElementById('badge-' + id);
    if (!el) return; el.style.display = ''; el.className = cls; el.textContent = text;
  }
  setProgress(id, pct) {
    const track = document.getElementById('track-' + id);
    const bar   = document.getElementById('bar-'   + id);
    if (!track || !bar) return;
    if (pct === null) { track.style.display = 'none'; return; }
    track.style.display = 'block'; bar.style.width = pct + '%';
  }
  markDone(id)  { const r = document.getElementById('row-' + id); if (r) { r.classList.remove('error'); r.classList.add('done'); } const b = document.getElementById('dl-' + id); if (b) b.disabled = false; }
  markError(id) { const r = document.getElementById('row-' + id); if (r) r.classList.add('error'); }

  async processAll() {
    if (this.busy) return;
    this.busy = true; this.opts.processBtn.disabled = true;
    for (const e of this.files) { if (!e.blob && e.status !== 'error') await this.opts.processOne(e, this); }
    this.busy = false; this.opts.processBtn.disabled = false;
  }

  _download(entry) {
    if (!entry.blob) return;
    const url = URL.createObjectURL(entry.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.opts.outputName(entry.file.name);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  downloadAll() { this.files.filter(f => f.blob).forEach((e, i) => setTimeout(() => this._download(e), i * 100)); }
  clearAll() {
    this.files.forEach(f => f.thumbUrl && URL.revokeObjectURL(f.thumbUrl));
    this.files = []; this.opts.listEl.innerHTML = ''; this._updateToolbar();
  }
}

/* ═══════════════════════════════════════════════════════
   TAB 1 — PNG Simplify
   ═══════════════════════════════════════════════════════ */
async function processPNG(entry, proc) {
  entry.status = 'processing';
  proc.setStatus(entry.id, 'processing', 'đang xử lý');
  proc.setProgress(entry.id, 25);
  try {
    const bmp = await createImageBitmap(entry.file);
    proc.setProgress(entry.id, 55);
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    cv.getContext('2d').drawImage(bmp, 0, 0); bmp.close();
    proc.setProgress(entry.id, 80);
    const blob = await cv.convertToBlob({ type: 'image/png' });
    entry.blob = blob; entry.status = 'done';
    const diff = entry.file.size - blob.size;
    const pct  = (diff / entry.file.size * 100);
    proc.setProgress(entry.id, 100); await wait(180); proc.setProgress(entry.id, null);
    proc.setMeta(entry.id, `${fmt(entry.file.size)} → ${fmt(blob.size)}`);
    proc.setStatus(entry.id, 'done', 'xong');
    proc.setBadge(entry.id, 'savings-badge ' + (diff >= 0 ? 'savings-good' : 'savings-bad'), (diff >= 0 ? '-' : '+') + Math.abs(pct).toFixed(1) + '%');
    proc.markDone(entry.id);
  } catch(e) {
    console.error(e); entry.status = 'error'; proc.setProgress(entry.id, null);
    proc.setStatus(entry.id, 'error', 'lỗi'); proc.markError(entry.id);
  }
}

new FileProcessor({
  accept: 'image/png', listEl: document.getElementById('list-png'),
  toolbarEl: document.getElementById('toolbar-png'), countEl: document.getElementById('count-png'),
  processBtn: document.getElementById('process-png'), clearBtn: document.getElementById('clear-png'),
  dlAllBtn: document.getElementById('dlall-png'), dropzoneEl: document.getElementById('dz-png'),
  fileInputEl: document.getElementById('input-png'), browseEl: document.getElementById('browse-png'),
  processOne: processPNG, outputName: n => n.replace(/\.png$/i, '') + '_simple.png',
});

/* ═══════════════════════════════════════════════════════
   TAB 2 — GIF → PNG
   ═══════════════════════════════════════════════════════ */
async function processGIF(entry, proc) {
  entry.status = 'processing';
  proc.setStatus(entry.id, 'processing', 'đang chuyển');
  proc.setProgress(entry.id, 30);
  try {
    const bmp = await createImageBitmap(entry.file);
    proc.setProgress(entry.id, 65);
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, bmp.width, bmp.height);
    ctx.drawImage(bmp, 0, 0); bmp.close();
    proc.setProgress(entry.id, 85);
    const blob = await cv.convertToBlob({ type: 'image/png' });
    entry.blob = blob; entry.status = 'done';
    const outName = entry.file.name.replace(/\.gif$/i, '.png');
    proc.setProgress(entry.id, 100); await wait(180); proc.setProgress(entry.id, null);
    proc.setMeta(entry.id, `${fmt(entry.file.size)} → ${fmt(blob.size)}`);
    proc.setStatus(entry.id, 'done', 'xong');
    proc.setBadge(entry.id, 'conv-badge', outName);
    proc.markDone(entry.id);
  } catch(e) {
    console.error(e); entry.status = 'error'; proc.setProgress(entry.id, null);
    proc.setStatus(entry.id, 'error', 'lỗi'); proc.markError(entry.id);
  }
}

new FileProcessor({
  accept: 'image/gif', listEl: document.getElementById('list-gif'),
  toolbarEl: document.getElementById('toolbar-gif'), countEl: document.getElementById('count-gif'),
  processBtn: document.getElementById('process-gif'), clearBtn: document.getElementById('clear-gif'),
  dlAllBtn: document.getElementById('dlall-gif'), dropzoneEl: document.getElementById('dz-gif'),
  fileInputEl: document.getElementById('input-gif'), browseEl: document.getElementById('browse-gif'),
  processOne: processGIF, outputName: n => n.replace(/\.gif$/i, '.png'),
});

/* ═══════════════════════════════════════════════════════
   TAB 3 — WATERMARK REMOVER
   ═══════════════════════════════════════════════════════ */

/* -- localStorage save path -- */
const savePathInput = document.getElementById('save-path');
const STORAGE_KEY_PATH = 'imgtools_save_path';

/* Load saved path */
try {
  const saved = localStorage.getItem(STORAGE_KEY_PATH);
  if (saved) savePathInput.value = saved;
} catch(e) {}

/* Save on change */
savePathInput.addEventListener('input', () => {
  try { localStorage.setItem(STORAGE_KEY_PATH, savePathInput.value.trim()); } catch(e) {}
});

/* -- Coords state -- */
const WM_DEFAULTS = { x1: 50, y1: 77, x2: 96, y2: 100 };
const coords = { ...WM_DEFAULTS };

const STORAGE_KEY_COORDS = 'imgtools_wm_coords';
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_COORDS));
  if (saved && typeof saved.x1 === 'number') Object.assign(coords, saved);
} catch(e) {}

function saveCoords() {
  try { localStorage.setItem(STORAGE_KEY_COORDS, JSON.stringify(coords)); } catch(e) {}
}

/* Coord inputs */
const inputX1 = document.getElementById('coord-x1');
const inputY1 = document.getElementById('coord-y1');
const inputX2 = document.getElementById('coord-x2');
const inputY2 = document.getElementById('coord-y2');

function loadCoordsToInputs() {
  inputX1.value = coords.x1; inputY1.value = coords.y1;
  inputX2.value = coords.x2; inputY2.value = coords.y2;
}
loadCoordsToInputs();

function readCoordsFromInputs() {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  coords.x1 = clamp(parseFloat(inputX1.value) || 0, 0, 99);
  coords.y1 = clamp(parseFloat(inputY1.value) || 0, 0, 99);
  coords.x2 = clamp(parseFloat(inputX2.value) || 0, coords.x1 + 1, 100);
  coords.y2 = clamp(parseFloat(inputY2.value) || 0, coords.y1 + 1, 100);
  loadCoordsToInputs();
  saveCoords();
}

[inputX1, inputY1, inputX2, inputY2].forEach(el => {
  el.addEventListener('change', () => { readCoordsFromInputs(); updateEraseBox(); });
});

document.getElementById('wm-reset-coords').addEventListener('click', () => {
  Object.assign(coords, WM_DEFAULTS); loadCoordsToInputs(); updateEraseBox(); saveCoords();
});

/* -- Preview canvas -- */
const previewCanvas  = document.getElementById('wm-preview-canvas');
const canvasWrap     = document.getElementById('wm-canvas-wrap');
const noPreview      = document.getElementById('wm-no-preview');
const eraseBox       = document.getElementById('erase-box');
const eraseLabel     = document.getElementById('erase-label');
const sampleInput    = document.getElementById('wm-sample-input');
const loadSampleBtn  = document.getElementById('wm-load-sample-btn');
const applyPreviewBtn= document.getElementById('wm-apply-preview');

let previewImg = null;  // ImageBitmap of sample

loadSampleBtn.addEventListener('click', () => sampleInput.click());
sampleInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  sampleInput.value = '';
  loadSampleImage(f);
});

async function loadSampleImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    previewImg = bmp;
    drawPreview(bmp, false);
    noPreview.classList.add('hidden');
    eraseBox.classList.add('visible');
    updateEraseBox();
  } catch(e) { console.error(e); }
}

function drawPreview(bmp, erased) {
  const maxSize = canvasWrap.clientWidth || 280;
  const scale   = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
  previewCanvas.width  = Math.round(bmp.width  * scale);
  previewCanvas.height = Math.round(bmp.height * scale);
  const ctx = previewCanvas.getContext('2d');
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.drawImage(bmp, 0, 0, previewCanvas.width, previewCanvas.height);

  if (erased) {
    const x1 = Math.round(coords.x1 / 100 * previewCanvas.width);
    const y1 = Math.round(coords.y1 / 100 * previewCanvas.height);
    const x2 = Math.round(coords.x2 / 100 * previewCanvas.width);
    const y2 = Math.round(coords.y2 / 100 * previewCanvas.height);
    ctx.clearRect(x1, y1, x2 - x1, y2 - y1);
  }
}

function updateEraseBox() {
  if (!previewImg) return;
  const cw = previewCanvas.offsetWidth;
  const ch = previewCanvas.offsetHeight;
  if (!cw || !ch) return;

  const offX = previewCanvas.offsetLeft;
  const offY = previewCanvas.offsetTop;

  const x1 = offX + coords.x1 / 100 * cw;
  const y1 = offY + coords.y1 / 100 * ch;
  const x2 = offX + coords.x2 / 100 * cw;
  const y2 = offY + coords.y2 / 100 * ch;

  eraseBox.style.left   = x1 + 'px';
  eraseBox.style.top    = y1 + 'px';
  eraseBox.style.width  = (x2 - x1) + 'px';
  eraseBox.style.height = (y2 - y1) + 'px';

  eraseLabel.textContent = `${coords.x1}%,${coords.y1}% → ${coords.x2}%,${coords.y2}%`;
}

applyPreviewBtn.addEventListener('click', () => {
  if (!previewImg) return;
  readCoordsFromInputs();
  drawPreview(previewImg, true);
  updateEraseBox();
});

/* -- Draggable erase box -- */
let drag = null;  // { type: 'move'|corner, startX, startY, startCoords }

function pxToPercent(px, total) { return Math.max(0, Math.min(100, px / total * 100)); }

eraseBox.addEventListener('mousedown', e => {
  if (e.target.classList.contains('erase-handle')) return;
  e.preventDefault();
  const cw = previewCanvas.offsetWidth;
  const ch = previewCanvas.offsetHeight;
  drag = { type: 'move', startX: e.clientX, startY: e.clientY, startCoords: { ...coords }, cw, ch };
});

eraseBox.querySelectorAll('.erase-handle').forEach(handle => {
  handle.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    const cw = previewCanvas.offsetWidth;
    const ch = previewCanvas.offsetHeight;
    drag = { type: handle.dataset.corner, startX: e.clientX, startY: e.clientY, startCoords: { ...coords }, cw, ch };
  });
});

document.addEventListener('mousemove', e => {
  if (!drag || !previewImg) return;
  const dxPct = (e.clientX - drag.startX) / drag.cw * 100;
  const dyPct = (e.clientY - drag.startY) / drag.ch * 100;
  const sc = drag.startCoords;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  if (drag.type === 'move') {
    const w = sc.x2 - sc.x1;
    const h = sc.y2 - sc.y1;
    coords.x1 = clamp(sc.x1 + dxPct, 0, 100 - w);
    coords.y1 = clamp(sc.y1 + dyPct, 0, 100 - h);
    coords.x2 = coords.x1 + w;
    coords.y2 = coords.y1 + h;
  } else if (drag.type === 'br') {
    coords.x2 = clamp(sc.x2 + dxPct, sc.x1 + 1, 100);
    coords.y2 = clamp(sc.y2 + dyPct, sc.y1 + 1, 100);
  } else if (drag.type === 'bl') {
    coords.x1 = clamp(sc.x1 + dxPct, 0, sc.x2 - 1);
    coords.y2 = clamp(sc.y2 + dyPct, sc.y1 + 1, 100);
  } else if (drag.type === 'tr') {
    coords.x2 = clamp(sc.x2 + dxPct, sc.x1 + 1, 100);
    coords.y1 = clamp(sc.y1 + dyPct, 0, sc.y2 - 1);
  } else if (drag.type === 'tl') {
    coords.x1 = clamp(sc.x1 + dxPct, 0, sc.x2 - 1);
    coords.y1 = clamp(sc.y1 + dyPct, 0, sc.y2 - 1);
  }

  // Round to 1 decimal
  ['x1','y1','x2','y2'].forEach(k => { coords[k] = Math.round(coords[k] * 10) / 10; });
  loadCoordsToInputs();
  updateEraseBox();
  if (previewImg) drawPreview(previewImg, false);
});

document.addEventListener('mouseup', () => {
  if (drag) { saveCoords(); drag = null; }
});

/* Also update box when canvas resizes */
new ResizeObserver(() => { if (previewImg) { drawPreview(previewImg, false); updateEraseBox(); } }).observe(canvasWrap);

/* -- Batch watermark removal -- */
async function processWatermark(entry, proc) {
  entry.status = 'processing';
  proc.setStatus(entry.id, 'processing', 'đang xử lý');
  proc.setProgress(entry.id, 30);
  try {
    const bmp = await createImageBitmap(entry.file);
    proc.setProgress(entry.id, 60);

    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext('2d');
    ctx.drawImage(bmp, 0, 0); bmp.close();

    /* Erase region based on % coords */
    const x1 = Math.round(coords.x1 / 100 * cv.width);
    const y1 = Math.round(coords.y1 / 100 * cv.height);
    const x2 = Math.round(coords.x2 / 100 * cv.width);
    const y2 = Math.round(coords.y2 / 100 * cv.height);
    ctx.clearRect(x1, y1, x2 - x1, y2 - y1);

    proc.setProgress(entry.id, 85);
    const blob = await cv.convertToBlob({ type: 'image/png' });
    entry.blob = blob; entry.status = 'done';

    proc.setProgress(entry.id, 100); await wait(180); proc.setProgress(entry.id, null);
    proc.setMeta(entry.id, `${fmt(entry.file.size)} → ${fmt(blob.size)}`);
    proc.setStatus(entry.id, 'done', 'xong');
    proc.setBadge(entry.id, 'savings-badge savings-good', '✓ logo xoá');
    proc.markDone(entry.id);
  } catch(e) {
    console.error(e); entry.status = 'error'; proc.setProgress(entry.id, null);
    proc.setStatus(entry.id, 'error', 'lỗi'); proc.markError(entry.id);
  }
}

new FileProcessor({
  accept: ['image/png', 'image/gif'],
  listEl: document.getElementById('list-wm'),
  toolbarEl: document.getElementById('toolbar-wm'), countEl: document.getElementById('count-wm'),
  processBtn: document.getElementById('process-wm'), clearBtn: document.getElementById('clear-wm'),
  dlAllBtn: document.getElementById('dlall-wm'), dropzoneEl: document.getElementById('dz-wm'),
  fileInputEl: document.getElementById('input-wm'), browseEl: document.getElementById('browse-wm'),
  processOne: processWatermark,
  outputName: n => n.replace(/\.(png|gif)$/i, '') + '_clean.png',
});