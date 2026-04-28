// layer-manager.js – Quản lý layer (visibility, highlight, preview)
'use strict';

function toggleLayerVisibility(name) {
  if (S.hiddenLayers.has(name)) {
    S.hiddenLayers.delete(name);
    // Cũng xóa khỏi animHiddenLayers của animation hiện tại
    if (S.currentAnim) {
      if (!S.animHiddenLayers[S.currentAnim]) S.animHiddenLayers[S.currentAnim] = new Set();
      S.animHiddenLayers[S.currentAnim].delete(name);
    }
  } else {
    S.hiddenLayers.add(name);
    // Ghi vào animHiddenLayers của animation hiện tại
    if (S.currentAnim) {
      if (!S.animHiddenLayers[S.currentAnim]) S.animHiddenLayers[S.currentAnim] = new Set();
      S.animHiddenLayers[S.currentAnim].add(name);
    }
  }
  const item = document.querySelector(`.layer-item[data-name="${CSS.escape(name)}"]`);
  if (item) {
    item.classList.toggle('hidden-layer', S.hiddenLayers.has(name));
    item.querySelector('.layer-vis').textContent = S.hiddenLayers.has(name) ? '🙈' : '👁';
  }
  if (!S.playing && S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();
}

function showAllLayers() {
  S.hiddenLayers.clear();
  document.querySelectorAll('.layer-item').forEach(item => {
    item.classList.remove('hidden-layer');
    item.querySelector('.layer-vis').textContent = '👁';
  });
  if (!S.playing && S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();
}

function hideAllLayers() {
  S.layers.forEach(l => S.hiddenLayers.add(l.name));
  document.querySelectorAll('.layer-item').forEach(item => {
    item.classList.add('hidden-layer');
    item.querySelector('.layer-vis').textContent = '🙈';
  });
  if (!S.playing && S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();
}

function showOnlyActiveLayers() {
  if (!S.currentAnim) return;
  const animTL = S.timeline[S.currentAnim] || {};
  const t = S.currentTime;
  S.hiddenLayers.clear();
  S.layers.forEach(l => {
    const kfs = animTL[l.name];
    const kf = kfs ? getActiveKF(kfs, t) : null;
    const hasData = kf?.parts?.length > 0;
    if (!hasData) S.hiddenLayers.add(l.name);
  });
  document.querySelectorAll('.layer-item').forEach(item => {
    const name = item.dataset.name;
    const hidden = S.hiddenLayers.has(name);
    item.classList.toggle('hidden-layer', hidden);
    item.querySelector('.layer-vis').textContent = hidden ? '🙈' : '👁';
  });
  if (!S.playing && S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();
}

// Toggle chế độ filter chỉ hiện layer active (ẩn hẳn khỏi DOM)
function toggleActiveLayerFilter(forceValue) {
  S.activeLayersOnly = forceValue !== undefined ? forceValue : !S.activeLayersOnly;
  const btn = document.getElementById('activeFilterBtn');
  if (btn) btn.classList.toggle('active', S.activeLayersOnly);
  buildLayerList();
}

// Bỏ khóa tất cả lockedMoveLayers
function unlockAllMoveLayers() {
  if (!S.lockedMoveLayers) return;
  const names = [...S.lockedMoveLayers];
  S.lockedMoveLayers.clear();
  for (const name of names) {
    const item = document.querySelector(`.layer-item[data-name="${CSS.escape(name)}"]`);
    if (item) {
      item.classList.remove('locked-move-active');
      const btn = item.querySelector('.layer-lock-move-btn');
      if (btn) { btn.classList.remove('active'); btn.textContent = '🔓'; btn.title = 'Khóa layer (ưu tiên kéo)'; }
    }
  }
  updateUnlockAllBtn();
  if (typeof markSessionDirty === 'function') markSessionDirty();
}

// Cập nhật hiển thị nút unlock-all trên header
function updateUnlockAllBtn() {
  const btn = document.getElementById('unlockAllBtn');
  if (!btn) return;
  const count = S.lockedMoveLayers ? S.lockedMoveLayers.size : 0;
  btn.style.display = count > 0 ? '' : 'none';
  btn.textContent = count > 0 ? `✕🔓 (${count})` : '✕🔓';
}

function highlightLayer(name, ctrlKey = false) {
  if (ctrlKey) {
    // Ctrl+click: toggle layer vào/ra khỏi selectedLayers (multi-select)
    if (S.selectedLayers.has(name)) {
      S.selectedLayers.delete(name);
      // Nếu xóa layer đang là highlightLayer chính thì chuyển sang layer khác
      if (S.highlightLayer === name) {
        S.highlightLayer = S.selectedLayers.size > 0 ? [...S.selectedLayers][S.selectedLayers.size - 1] : null;
      }
    } else {
      S.selectedLayers.add(name);
      S.highlightLayer = name;
    }
  } else {
    // Click thường: clear selection, chọn layer mới (hoặc deselect nếu click lại)
    if (S.editMode) {
      S.highlightLayer = name;
      S.selectedLayers.clear();
      S.selectedLayers.add(name);
    } else {
      if (S.highlightLayer === name && S.selectedLayers.size === 1) {
        // Deselect
        S.highlightLayer = null;
        S.selectedLayers.clear();
      } else {
        S.highlightLayer = name;
        S.selectedLayers.clear();
        S.selectedLayers.add(name);
      }
    }
  }

  // Cập nhật UI: highlight tất cả layer trong selectedLayers
  // Cũng highlight các layer đang bị khóa (lockedMoveLayers)
  const allHighlighted = new Set([...S.selectedLayers, ...(S.lockedMoveLayers || new Set())]);
  document.querySelectorAll('.layer-item').forEach(item => {
    item.classList.toggle('active', allHighlighted.has(item.dataset.name));
  });

  if (S.highlightLayer) {
    const activeItem = document.querySelector(`.layer-item[data-name="${CSS.escape(S.highlightLayer)}"]`);
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    buildSimilarLayersPanel(S.highlightLayer);
  } else {
    hideSimilarLayersPanel();
  }
  if (!S.playing && S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
}

// Gọi sau khi thay đổi lockedMoveLayers để refresh highlight UI
function refreshLayerHighlightUI() {
  const allHighlighted = new Set([...S.selectedLayers, ...(S.lockedMoveLayers || new Set())]);
  document.querySelectorAll('.layer-item').forEach(item => {
    item.classList.toggle('active', allHighlighted.has(item.dataset.name));
  });
  if (!S.playing && S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
}

// ─── Layer Lock Move ──────────────────────────────────────────────────────────
function toggleLayerLockMove(name) {
  if (!S.lockedMoveLayers) S.lockedMoveLayers = new Set();
  if (S.lockedMoveLayers.has(name)) {
    S.lockedMoveLayers.delete(name);
  } else {
    S.lockedMoveLayers.add(name);
  }
  const locked = S.lockedMoveLayers.has(name);
  const item = document.querySelector(`.layer-item[data-name="${CSS.escape(name)}"]`);
  if (item) {
    item.classList.toggle('locked-move-active', locked);
    const btn = item.querySelector('.layer-lock-move-btn');
    if (btn) {
      btn.classList.toggle('active', locked);
      btn.title = locked ? 'Bỏ khóa layer' : 'Khóa layer (ưu tiên kéo)';
      btn.textContent = locked ? '🔐' : '🔓';
    }
  }
  if (typeof markSessionDirty === 'function') markSessionDirty();
  updateUnlockAllBtn();
  refreshLayerHighlightUI();
}
function renderLayerThumb(layerName) {
  const thumbEl = document.getElementById('lthumb-' + CSS.escape(layerName));
  if (!thumbEl || !S.currentAnim) return;

  const SIZE = 24;
  thumbEl.width  = SIZE;
  thumbEl.height = SIZE;
  const tc = thumbEl.getContext('2d');
  tc.clearRect(0, 0, SIZE, SIZE);

  const animTL = S.timeline[S.currentAnim] || {};
  const kfs    = animTL[layerName];
  const kf     = kfs ? getActiveKF(kfs, S.currentTime) : null;
  const parts  = kf?.parts || [];

  if (parts.length === 0) {
    tc.fillStyle = 'rgba(255,255,255,0.04)';
    tc.fillRect(0, 0, SIZE, SIZE);
    return;
  }

  const W = canvas.width || 390, H = canvas.height || 390;
  const sc = Math.min(SIZE / W, SIZE / H);
  const offX = (SIZE - W * sc) / 2;
  const offY = (SIZE - H * sc) / 2;

  // Kiểm tra ảnh đã load chưa, nếu chưa thì retry sau 300ms
  let anyMissing = false;
  for (const part of parts) {
    const img = S.imgCache[part.bitmap];
    if (!img || (!S.imgMissing[part.bitmap] && !img.complete)) {
      anyMissing = true;
      break;
    }
  }
  if (anyMissing) {
    setTimeout(() => renderLayerThumb(layerName), 300);
    return;
  }

  tc.save();
  tc.translate(offX, offY);
  tc.scale(sc, sc);
  for (const part of parts) {
    drawPartOnCtx(tc, part, W, H, false);
  }
  tc.restore();
}

function refreshAllThumbs() {
  if (!S.currentAnim) return;
  for (const layer of S.layers) {
    renderLayerThumb(layer.name);
  }
}

// ─── Layer hover preview – đã tắt nặng, dùng thumbnail tĩnh ─────────────────
function setupLayerHoverPreview() {
  // Hover preview nặng đã được thay bằng thumbnail tĩnh trong mỗi layer-item.
  // Hàm này giữ lại để không bị lỗi khi app.js gọi setupLayerHoverPreview().
}
  // const scroll = $('layerList');
  // if (!scroll) return;

// ─── Similar Layers ───────────────────────────────────────────────────────
function getLayerBitmapSig(layerName) {
  const bmpSet = new Set();
  for (const aname of Object.keys(S.timeline)) {
    const kfs = (S.timeline[aname] || {})[layerName];
    if (!kfs) continue;
    for (const kf of kfs) {
      if (!kf.parts) continue;
      for (const part of kf.parts) {
        if (part.bitmap) bmpSet.add(part.bitmap.split('/').pop());
      }
    }
  }
  if (bmpSet.size === 0) return null;
  const sorted = [...bmpSet].sort();
  return sorted.length + ':' + sorted.join(',');
}

function getSimilarLayers(layerName) {
  const sig = getLayerBitmapSig(layerName);
  if (!sig) return [];
  return S.layers
    .filter(l => l.name !== layerName && getLayerBitmapSig(l.name) === sig)
    .map(l => l.name);
}

function buildSimilarLayersPanel(clickedLayer) {
  const panel = document.getElementById('animationsPanel');
  if (!panel) return;

  const similar = getSimilarLayers(clickedLayer);
  if (similar.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';
  // Đảm bảo row container hiển thị đúng dạng flex-row
  const row = document.getElementById('animSectionRow');
  if (row) row.style.flexDirection = 'row';
  const titleEl = panel.querySelector('.ptitle');
  if (titleEl) titleEl.textContent = `🔗 Similar Layers (${similar.length})`;

  const listEl = document.getElementById('similarLayerList');
  listEl.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'sim-btn' + (S.similarLayerSelected === 'all' ? ' active' : '');
  allBtn.textContent = `✦ All (${similar.length})`;
  allBtn.onclick = () => {
    S.similarLayerSelected = 'all';
    listEl.querySelectorAll('.sim-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
  };
  listEl.appendChild(allBtn);

  for (const name of similar) {
    const btn = document.createElement('button');
    btn.className = 'sim-btn sim-layer-btn' + (S.similarLayerSelected === name ? ' active' : '');
    btn.textContent = name;
    btn.title = name;
    btn.onclick = () => {
      S.similarLayerSelected = name;
      listEl.querySelectorAll('.sim-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
    listEl.appendChild(btn);
  }

  S._similarLayers = similar;
  S._similarSourceLayer = clickedLayer;
}

function hideSimilarLayersPanel() {
  const panel = document.getElementById('animationsPanel');
  if (panel) panel.style.display = 'none';
  const row = document.getElementById('animSectionRow');
  if (row) row.style.flexDirection = 'column';
  S._similarLayers = [];
  S._similarSourceLayer = null;
  S.similarLayerSelected = 'all';
}

// ─── Split Bitmap ─────────────────────────────────────────────────────────
function getLayerAllBitmaps(layerName) {
  const bmpSet = new Set();
  for (const aname of Object.keys(S.timeline)) {
    const kfs = (S.timeline[aname] || {})[layerName];
    if (!kfs) continue;
    for (const kf of kfs) {
      for (const part of (kf.parts || [])) {
        if (part.bitmap) bmpSet.add(part.bitmap);
      }
    }
  }
  return bmpSet;
}

function splitBitmapToNewLayer(sourceLayer, bitmapPath) {
  pushUndo(`Tách bitmap "${bitmapPath.split('/').pop()}" từ "${sourceLayer}"`);
  const similar = getSimilarLayers(sourceLayer);
  const allTargets = [sourceLayer, ...similar];

  for (const layerName of allTargets) {
    const newLayerName = _findFreeName(layerName);
    const srcLayerObj = S.layers.find(l => l.name === layerName);
    // Layer tách SAU phải có zDepth CAO HƠN → vẽ đè lên layer gốc
    const newZDepth = (srcLayerObj?.zDepth ?? 0) + 0.5;
    S.layers.push({ name: newLayerName, zDepth: newZDepth });
    S.layerTags[newLayerName] = [...(S.layerTags[layerName] || [])];

    for (const aname of Object.keys(S.timeline)) {
      const kfs = (S.timeline[aname] || {})[layerName];
      if (!kfs) continue;

      const newKfs = [];
      for (const kf of kfs) {
        const remainParts = [];
        const splitParts  = [];
        for (const part of (kf.parts || [])) {
          if (part.bitmap === bitmapPath) {
            splitParts.push({ ...part });
          } else {
            remainParts.push(part);
          }
        }
        kf.parts = remainParts;
        newKfs.push({
          time:    kf.time,
          visible: kf.visible,
          parts:   splitParts,
        });
      }
      if (!S.timeline[aname][newLayerName]) {
        S.timeline[aname][newLayerName] = newKfs;
      }
    }
  }

  buildLayerList();
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();
  highlightLayer(sourceLayer);
}

function _findFreeName(baseName) {
  const existing = new Set(S.layers.map(l => l.name));
  let candidate = baseName + '_x';
  let i = 2;
  while (existing.has(candidate)) {
    candidate = baseName + '_x' + i++;
  }
  return candidate;
}

// Chỉnh z-order thu cong: doi zDepth cua layer voi layer ke no trong sorted
function moveLayerZOrder(layerName, direction) {
  // direction: +1 = len tren (zDepth cao hon), -1 = xuong duoi
  // Ap dung dong loat cho ca similar layers (group dich chuyen cung nhau)
  pushUndo('Doi z-order "' + layerName + '"');

  const similar = getSimilarLayers(layerName);
  const allTargets = new Set([layerName, ...similar]);

  // Lay danh sach sorted theo zDepth tang dan
  const sorted = S.layers.slice().sort((a, b) => a.zDepth - b.zDepth);

  // Tim vi tri cua layer chinh trong sorted
  const mainIdx = sorted.findIndex(l => l.name === layerName);
  if (mainIdx < 0) return;

  // Khi direction = +1 (len tren): can tim layer non-target o phia TREN group
  // Khi direction = -1 (xuong duoi): can tim layer non-target o phia DUOI group
  let swapCandidate = null;
  if (direction === +1) {
    // Tim layer non-target dau tien co zDepth > max(target zDepth)
    const maxZ = Math.max(...S.layers.filter(l => allTargets.has(l.name)).map(l => l.zDepth));
    for (let i = 0; i < sorted.length; i++) {
      if (!allTargets.has(sorted[i].name) && sorted[i].zDepth > maxZ) {
        swapCandidate = sorted[i];
        break;
      }
    }
  } else {
    // Tim layer non-target cuoi cung co zDepth < min(target zDepth)
    const minZ = Math.min(...S.layers.filter(l => allTargets.has(l.name)).map(l => l.zDepth));
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!allTargets.has(sorted[i].name) && sorted[i].zDepth < minZ) {
        swapCandidate = sorted[i];
        break;
      }
    }
  }
  if (!swapCandidate) return; // da o dau/cuoi danh sach

  // Lay zDepth cua swapCandidate truoc khi doi
  const swapZ = swapCandidate.zDepth;
  // Tim zDepth cua layer target gan swapCandidate nhat (dung lam anchor)
  const targetObjs = S.layers.filter(l => allTargets.has(l.name));
  const anchorZ = direction === +1
    ? Math.max(...targetObjs.map(l => l.zDepth))
    : Math.min(...targetObjs.map(l => l.zDepth));

  // Tinh delta: khoang cach can vuot qua
  const delta = swapZ - anchorZ; // direction quyet dinh dau/cuoi

  // Dich toan bo target group
  targetObjs.forEach(l => { l.zDepth += delta; });
  // Dich swapCandidate nguoc lai (hoan vi vi tri voi anchor)
  swapCandidate.zDepth = anchorZ;

  buildLayerList();
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();

  // Refresh highlight UI ma KHONG toggle selection (khong goi highlightLayer)
  const allHighlighted = new Set([...(S.selectedLayers || new Set()), ...(S.lockedMoveLayers || new Set())]);
  document.querySelectorAll('.layer-item').forEach(item => {
    item.classList.toggle('active', allHighlighted.has(item.dataset.name));
  });
}

function showSplitToast(btn, layerName, bitmapPath) {
  document.querySelectorAll('.split-toast').forEach(el => el.remove());

  const bmpFilename = bitmapPath.split('/').pop();
  const similar = getSimilarLayers(layerName);
  const affectedCount = 1 + similar.length;

  const toast = document.createElement('div');
  toast.className = 'split-toast';

  const layerInfo = similar.length > 0
    ? `<div class="split-toast-sub">Sẽ tách trên <b>${affectedCount}</b> layer tương tự: ${[layerName, ...similar].join(', ')}</div>`
    : '';

  toast.innerHTML = `
    <div class="split-toast-msg">
      Tách <b>${bmpFilename}</b> từ layer <b>${layerName}</b> thành layer mới?
      ${layerInfo}
    </div>
    <div class="split-toast-btns">
      <button class="split-confirm-btn">✓ Xác nhận</button>
      <button class="split-cancel-btn">✗ Hủy</button>
    </div>`;

  const rect = btn.getBoundingClientRect();
  toast.style.position = 'fixed';
  toast.style.top = (rect.bottom + 6) + 'px';
  toast.style.left = Math.max(8, rect.left - 250) + 'px';
  toast.style.zIndex = '9999';

  document.body.appendChild(toast);

  toast.querySelector('.split-confirm-btn').addEventListener('click', () => {
    toast.remove();
    splitBitmapToNewLayer(layerName, bitmapPath);
  });
  toast.querySelector('.split-cancel-btn').addEventListener('click', () => {
    toast.remove();
  });

  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 8000);
}
