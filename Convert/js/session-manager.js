// session-manager.js – Lưu/phục hồi phiên làm việc
'use strict';

function buildSessionData() {
  return {
    _version: 3,
    _savedAt: new Date().toISOString(),
    _sourceZip: S._sourceZipName || '',
    _exportName: S._exportName || '',
    canvasW: canvas.width,
    canvasH: canvas.height,
    canvasManual: ($('canvasSizeBadge')?.textContent || '').includes('(manual)'),
    currentAnim: S.currentAnim,
    currentTime: S.currentTime,
    zoom: S.zoom,
    looping: S.looping,
    speed: S.speed,
    outputSpread: S.outputSpread,
    partSpacing: S.partSpacing,          // <<< BITMAP SPACING >>>
    highlightLayer: S.highlightLayer,
    hiddenLayers: [...S.hiddenLayers],
    layerTags: S.layerTags,
    offsets: S.offsets,
    alphaOverrides: S.alphaOverrides || {},
    lockedParts: [...S.lockedParts],
    lockedMoveLayers: [...(S.lockedMoveLayers || new Set())],
    animEvents: S.animEvents || {},
    timeline: S.timeline,
    layers: S.layers,
    similarLayerSelected: S.similarLayerSelected,
    animHiddenLayers: Object.fromEntries(
      Object.entries(S.animHiddenLayers || {}).map(([k, v]) => [k, [...v]])
    ),
  };
}

function saveSession() {
  if (!S.data) {
    setStatus('⚠ Chưa có dữ liệu để lưu', 'err');
    return;
  }
  const session = buildSessionData();
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const name = (S._sourceZipName || 'session').replace(/\.[^.]+$/, '') + '_session.json';
  downloadBlob(blob, 'application/json', name);
  S._sessionDirty = false;
  setStatus(`✓ Đã lưu phiên: ${name}`, 'ok');
  updateSaveSessionBtn(false);
}

function updateSaveSessionBtn(dirty) {
  const btn = $('saveSessionBtn');
  if (!btn) return;
  if (dirty) {
    btn.classList.add('dirty');
    btn.title = 'Có thay đổi chưa lưu – Click để lưu phiên';
  } else {
    btn.classList.remove('dirty');
    btn.title = 'Lưu phiên làm việc';
  }
}

async function loadSessionFile(file) {
  try {
    const text = await file.text();
    const session = JSON.parse(text);
    if (!session._version) throw new Error('File session không hợp lệ');
    applySession(session);
    setStatus(`✓ Đã khôi phục phiên: ${file.name}`, 'ok');
  } catch(e) {
    setStatus('❌ Lỗi đọc session: ' + e.message, 'err');
  }
}

function applySession(session) {
  if (session.timeline) S.timeline = session.timeline;
  if (session.layers && Array.isArray(session.layers) && session.layers.length > 0) S.layers = session.layers;

  if (session.layerTags)      S.layerTags      = session.layerTags;
  if (session.offsets)        S.offsets        = session.offsets;
  if (session.alphaOverrides) S.alphaOverrides = session.alphaOverrides;
  if (session.animEvents)     S.animEvents     = session.animEvents;

  S.hiddenLayers       = new Set(session.hiddenLayers || []);
  S.lockedParts        = new Set(session.lockedParts  || []);
  S.lockedMoveLayers   = new Set(session.lockedMoveLayers || []);
  S.looping            = session.looping  ?? true;
  S.speed              = session.speed    ?? 1.0;
  S.similarLayerSelected = session.similarLayerSelected || 'all';
  S.outputSpread       = session.outputSpread ?? 1.0;
  S.partSpacing        = session.partSpacing ?? 1.0;   // <<< BITMAP SPACING >>>\n
  // Tên file xuất tuỳ chỉnh
  S._exportName = session._exportName || '';
  const expFileInput = $('expFileName');
  if (expFileInput) expFileInput.value = S._exportName;
  if (typeof updateExpFileNamePreview === 'function') updateExpFileNamePreview();

  // Cập nhật UI
  const spreadInput = $('spreadVal');
  if (spreadInput) spreadInput.value = S.outputSpread.toFixed(3);
  const partInput = $('partSpacingVal');
  if (partInput) partInput.value = S.partSpacing.toFixed(3);

  if (session.animHiddenLayers) {
    S.animHiddenLayers = {};
    for (const [anim, arr] of Object.entries(session.animHiddenLayers)) {
      S.animHiddenLayers[anim] = new Set(arr);
    }
  }

  if (session.zoom) applyZoom(session.zoom);

  if (session.canvasW && session.canvasH) {
    canvas.width  = session.canvasW;
    canvas.height = session.canvasH;
    applyZoom(S.zoom);
    const badge = $('canvasSizeBadge');
    if (badge) {
      badge.textContent = `${session.canvasW}×${session.canvasH}${session.canvasManual ? ' (manual)' : ''}`;
    }
  }

  const loopBtn = $('loopBtn');
  if (loopBtn) loopBtn.classList.toggle('active', S.looping);

  if (typeof buildLayerList === 'function') buildLayerList();

  document.querySelectorAll('.layer-item').forEach(item => {
    const name = item.dataset.name;
    const hidden = S.hiddenLayers.has(name);
    item.classList.toggle('hidden-layer', hidden);
    const vis = item.querySelector('.layer-vis');
    if (vis) vis.textContent = hidden ? '🙈' : '👁';
    const lockBtn = item.querySelector('.layer-lock-move-btn');
    if (lockBtn) {
      const locked = S.lockedMoveLayers.has(name);
      lockBtn.classList.toggle('active', locked);
      lockBtn.title = locked ? 'Bỏ khóa layer' : 'Khóa layer (ưu tiên kéo)';
      lockBtn.textContent = locked ? '🔐' : '🔓';
    }
  });
  if (typeof updateUnlockAllBtn === 'function') updateUnlockAllBtn();

  if (session.currentAnim && S.animations[session.currentAnim]) {
    S.currentTime    = session.currentTime || 0;
    S.highlightLayer = session.highlightLayer || null;
    selectAnim(session.currentAnim);
    setTimeout(() => {
      if (S.currentAnim === session.currentAnim) {
        stopAnim();
        S.currentTime = session.currentTime || 0;
        $('scrubber').value = (S.currentTime / S.dur) * 10000;
        $('tInfo').textContent = S.currentTime.toFixed(2) + 's / ' + S.dur.toFixed(2) + 's';
        renderFrame(S.currentAnim, S.currentTime);
        if (S.highlightLayer) {
          document.querySelectorAll('.layer-item').forEach(item =>
            item.classList.toggle('active', item.dataset.name === S.highlightLayer));
        }
      }
    }, 500);
  }

  S._sessionDirty = false;
  updateSaveSessionBtn(false);
}

function markSessionDirty() {
  if (!S.data) return;
  S._sessionDirty = true;
  updateSaveSessionBtn(true);
}

function setupBeforeUnload() {
  window.addEventListener('beforeunload', e => {
    if (!S.data) return;
    if (S._sessionDirty !== false) {
      e.preventDefault();
      e.returnValue = 'Bạn đã lưu quá trình chưa?';
      return e.returnValue;
    }
  });
}