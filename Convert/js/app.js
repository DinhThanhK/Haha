// app.js – Khởi tạo ứng dụng
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  canvas = $('mainCanvas');
  ctx = canvas.getContext('2d');
  setupDrop();
  setupTransport();
  setupZoom();
  setupEditMode();
  setupUpdateBtn();
  setupLayerHoverPreview();
  setupBeforeUnload();
  setupSpreadControl();
  setupPartSpacingControl();
  hideLoad();
  $('loopBtn').classList.add('active');

  // Undo / Redo buttons
  $('undoBtn').addEventListener('click', () => doUndo());
  $('redoBtn').addEventListener('click', () => doRedo());
  setupUndoRedoKeys();

  // Nút Save Session
  const saveBtn = document.createElement('button');
  saveBtn.id = 'saveSessionBtn';
  saveBtn.className = 'edit-toggle';
  saveBtn.style.marginLeft = '8px';
  saveBtn.textContent = '💾 Save Session';
  saveBtn.title = 'Lưu phiên làm việc';
  saveBtn.onclick = saveSession;
  const header = document.querySelector('header');
  const updateBtn = $('btnUpdate');
  header.insertBefore(saveBtn, updateBtn.nextSibling);

  // === THÊM CHỨC NĂNG CHỈNH SIZE CANVAS THỦ CÔNG ===
  (function setupSizeBadgeEdit() {
    const badge = $('canvasSizeBadge');
    if (!badge) return;
    badge.title = 'Click để chỉnh size thủ công';
    badge.style.cursor = 'pointer';
    badge.style.pointerEvents = 'auto';

    badge.addEventListener('click', () => {
      const curW = canvas.width, curH = canvas.height;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = `${curW}×${curH}`;
      input.style.cssText = 'position:fixed;z-index:10000;font-size:11px;padding:2px 6px;width:100px;border:1px solid var(--acc);background:#0a0a14;color:var(--txt);border-radius:4px';
      const r = badge.getBoundingClientRect();
      input.style.top = r.top + 'px';
      input.style.left = r.left + 'px';
      document.body.appendChild(input);
      input.select();

      const apply = () => {
        const m = input.value.match(/(\d+)[×x,\s]+(\d+)/);
        if (m) {
          const nw = Math.max(1, parseInt(m[1])), nh = Math.max(1, parseInt(m[2]));
          canvas.width = nw; canvas.height = nh;
          applyZoom(S.zoom);
          if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
          badge.textContent = `${nw}×${nh} (manual)`;
          markSessionDirty();
        }
        input.remove();
      };

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') apply();
        if (e.key === 'Escape') input.remove();
      });
      input.addEventListener('blur', () => setTimeout(() => input.remove(), 150));
    });
  })();
  // ===================================================
});

function setupTransport() {
  $('playBtn').onclick  = () => S.playing ? stopAnim() : startAnim();
  $('loopBtn').onclick  = function() {
    S.looping = !S.looping;
    this.classList.toggle('active', S.looping);
    if (typeof markSessionDirty === 'function') markSessionDirty();
  };
  $('scrubber').addEventListener('input', () => {
    if (S.playing) stopAnim();
    S.currentTime = ($('scrubber').value / 10000) * S.dur;
    $('tInfo').textContent = S.currentTime.toFixed(2) + 's / ' + S.dur.toFixed(2) + 's';
    if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
    // Sync zombie preview theo scrubber
    if (typeof ZP !== 'undefined') ZP.seekZombieTo(S.currentTime);
    if (typeof drawEventMarkers === 'function') drawEventMarkers();
  });
  $('speedSel').addEventListener('change', e => {
    S.speed = parseFloat(e.target.value);
    if (typeof markSessionDirty === 'function') markSessionDirty();
  });
  $('stepBkBtn').onclick = () => stepFrame(-1);
  $('stepFwBtn').onclick = () => stepFrame(+1);
}

function setupZoom() {
  $('zoomIn').onclick    = () => applyZoom(Math.min(S.zoom * 1.25, 8));
  $('zoomOut').onclick   = () => applyZoom(Math.max(S.zoom / 1.25, 0.1));
  $('zoomReset').onclick = () => applyZoom(1);
  $('zoomFit').onclick   = () => {
    const wrap = document.querySelector('.canvas-wrap');
    const ww = wrap.clientWidth - 20, wh = wrap.clientHeight - 20;
    const z = Math.min(ww / canvas.width, wh / canvas.height);
    applyZoom(Math.min(z, 4));
  };
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    applyZoom(Math.max(0.1, Math.min(8, S.zoom * delta)));
  }, {passive: false});
}
function applyZoom(z) {
  S.zoom = z;
  canvas.style.width  = (canvas.width  * z) + 'px';
  canvas.style.height = (canvas.height * z) + 'px';
  $('zoomVal').textContent = Math.round(z * 100) + '%';
  if (typeof markSessionDirty === 'function') markSessionDirty();
}

function swTab(id) {
  document.querySelectorAll('.tpane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  $('pane-' + id).classList.add('active');
  document.querySelector(`.tab[onclick="swTab('${id}')"]`).classList.add('active');
  if (id === 'export' && typeof updateExpFileNamePreview === 'function') updateExpFileNamePreview();
}

// ========== SPREAD CONTROL ==========
function setupSpreadControl() {
  const spreadInput = $('spreadVal');
  const spreadInc = $('spreadInc');
  const spreadDec = $('spreadDec');
  if (!spreadInput) return;

  const updateSpread = (newVal) => {
    S.outputSpread = Math.min(2.0, Math.max(0.1, parseFloat(newVal) || 1.0));
    spreadInput.value = S.outputSpread.toFixed(3);
    if (S.currentAnim) {
      renderFrame(S.currentAnim, S.currentTime);
      autoExpandCanvas(S.data?.meta?.canvasW || 390, S.data?.meta?.canvasH || 390);
    }
    markDirty();
    if (typeof markSessionDirty === 'function') markSessionDirty();
  };

  spreadInc.addEventListener('click', () => updateSpread(S.outputSpread + 0.001));
  spreadDec.addEventListener('click', () => updateSpread(S.outputSpread - 0.001));
  spreadInput.addEventListener('change', (e) => updateSpread(e.target.value));
  spreadInput.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.001 : 0.001;
    updateSpread(S.outputSpread + delta);
  }, { passive: false });
}

// ========== PART SPACING CONTROL ==========
function setupPartSpacingControl() {
  const input = $('partSpacingVal');
  const inc = $('partSpacingInc');
  const dec = $('partSpacingDec');
  if (!input) return;

  const update = (newVal) => {
    S.partSpacing = Math.min(2.0, Math.max(0.1, parseFloat(newVal) || 1.0));
    input.value = S.partSpacing.toFixed(3);
    if (S.currentAnim) {
      renderFrame(S.currentAnim, S.currentTime);
      autoExpandCanvas(S.data?.meta?.canvasW || 390, S.data?.meta?.canvasH || 390);
    }
    markDirty();
    if (typeof markSessionDirty === 'function') markSessionDirty();
  };

  inc.addEventListener('click', () => update(S.partSpacing + 0.001));
  dec.addEventListener('click', () => update(S.partSpacing - 0.001));
  input.addEventListener('change', (e) => update(e.target.value));
  input.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.001 : 0.001;
    update(S.partSpacing + delta);
  }, { passive: false });
}
// ========================================

function autoExpandCanvas(baseW, baseH) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const spread = S.outputSpread || 1.0;
  const partSpacing = S.partSpacing || 1.0;

  for (const animName of S.animNames) {
    const animTL = S.timeline[animName] || {};
    for (const layer of S.layers) {
      const kfs = animTL[layer.name];
      if (!kfs) continue;
      for (const kf of kfs) {
        if (!kf.parts?.length || kf.visible === false) continue;
        // Tính centroid của layer tại keyframe này
        const visibleParts = kf.parts.filter(p => p.alpha > 0.005);
        let centroidX = 0, centroidY = 0;
        if (visibleParts.length > 0) {
          let sumX = 0, sumY = 0;
          for (const p of visibleParts) {
            sumX += p.x;
            sumY += p.y;
          }
          centroidX = sumX / visibleParts.length;
          centroidY = sumY / visibleParts.length;
        }
        for (const part of kf.parts) {
          if (part.alpha <= 0.005) continue;
          const img  = S.imgCache[part.bitmap];
          const szW  = (img && img.naturalWidth  > 0) ? img.naturalWidth  : (S.bitmaps[part.bitmap]?.w || 1);
          const szH  = (img && img.naturalHeight > 0) ? img.naturalHeight : (S.bitmaps[part.bitmap]?.h || 1);
          // 1. partSpacing
          let spacedX = part.x;
          let spacedY = part.y;
          if (visibleParts.length > 1) {
            spacedX = centroidX + (part.x - centroidX) * partSpacing;
            spacedY = centroidY + (part.y - centroidY) * partSpacing;
          }
          // 2. spread
          const adjX = spacedX / spread;
          const adjY = spacedY / spread;
          const tx   = adjX + baseW / 2;
          const ty   = baseH / 2 - adjY;
          const m    = reconstructMatrix(part.sx, part.sy, part.rot, tx, ty);
          const ox   = -szW / 2, oy = -szH / 2;
          const corners = [
            [ox, oy], [ox+szW, oy], [ox+szW, oy+szH], [ox, oy+szH]
          ];
          for (const [lx, ly] of corners) {
            const wx = m.a*lx + m.c*ly + m.tx;
            const wy = m.b*lx + m.d*ly + m.ty;
            if (wx < minX) minX = wx;
            if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy;
            if (wy > maxY) maxY = wy;
          }
        }
      }
    }
  }

  if (!isFinite(minX)) return;

  const MARGIN = 8;
  const needLeft  = Math.max(0, Math.ceil(baseW/2 - minX) + MARGIN);
  const needRight = Math.max(0, Math.ceil(maxX - baseW/2) + MARGIN);
  const needTop   = Math.max(0, Math.ceil(baseH/2 - minY) + MARGIN);
  const needBot   = Math.max(0, Math.ceil(maxY - baseH/2) + MARGIN);

  const newW = Math.max(baseW, needLeft + needRight);
  const newH = Math.max(baseH, needTop  + needBot);

  if (newW !== canvas.width || newH !== canvas.height) {
    canvas.width  = newW;
    canvas.height = newH;
    applyZoom(S.zoom);
    if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  }
  $('canvasSizeBadge').textContent = `${canvas.width}×${canvas.height}${newW > baseW || newH > baseH ? ' (auto-expanded)' : ''}`;
}

function markDirty() {
  const btn = $('btnUpdate');
  if (!btn) return;
  btn.classList.add('dirty');
  btn.textContent = 'Update*';
  if (typeof markSessionDirty === 'function') markSessionDirty();
}
function clearDirty() {
  const btn = $('btnUpdate');
  if (!btn) return;
  btn.classList.remove('dirty');
  btn.textContent = 'Update';
}
function setupUpdateBtn() {
  const btn = $('btnUpdate');
  btn.onclick = () => {
    if (!btn.classList.contains('dirty')) return;
    if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
    clearDirty();
    const orig = btn.textContent;
    btn.textContent = '✓ Đã cập nhật!';
    btn.style.background = 'linear-gradient(135deg,var(--grn),var(--acc))';
    setTimeout(() => {
      btn.textContent = 'Update';
      btn.style.background = '';
    }, 1200);
    setStatus('✓ Đã cập nhật — sẵn sàng xuất file', 'ok');
  };

  const watchIds = ['expFormat','expScale','expFps','expPad','expOnlyActive'];
  watchIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', markDirty);
  });
  const layerListEl = $('layerList');
  if (layerListEl) {
    new MutationObserver(() => markDirty()).observe(layerListEl, { subtree: true, childList: true, characterData: true });
  }
}