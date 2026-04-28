// undo-redo.js – Hệ thống Undo/Redo cho canvas operations
'use strict';

const MAX_UNDO = 40;

// ── Snapshot helpers ─────────────────────────────────────────────────────────

function _deepCloneTimeline(tl) {
  // JSON clone – đủ nhanh với timeline thông thường
  return JSON.parse(JSON.stringify(tl));
}

function _deepCloneLayers(layers) {
  return JSON.parse(JSON.stringify(layers));
}

function _buildSnapshot(label) {
  return {
    label,
    timeline: _deepCloneTimeline(S.timeline),
    layers:   _deepCloneLayers(S.layers),
    offsets:  JSON.parse(JSON.stringify(S.offsets)),
  };
}

// ── Push action (gọi TRƯỚC khi apply thay đổi) ───────────────────────────────
function pushUndo(label) {
  const snap = _buildSnapshot(label);
  S._undoStack.push(snap);
  if (S._undoStack.length > MAX_UNDO) S._undoStack.shift();
  S._redoStack = [];   // clear redo khi có action mới
  _refreshUndoUI();
}

// ── Undo ─────────────────────────────────────────────────────────────────────
function doUndo() {
  if (S._undoStack.length === 0) { showToast('Không có gì để Undo', 'warn'); return; }
  // Push current state vào redo
  S._redoStack.push(_buildSnapshot('redo'));
  const snap = S._undoStack.pop();
  _applySnapshot(snap);
  showToast(`↩ Undo: ${snap.label}`, 'ok');
  _refreshUndoUI();
}

// ── Redo ─────────────────────────────────────────────────────────────────────
function doRedo() {
  if (S._redoStack.length === 0) { showToast('Không có gì để Redo', 'warn'); return; }
  S._undoStack.push(_buildSnapshot('undo'));
  const snap = S._redoStack.pop();
  _applySnapshot(snap);
  showToast(`↪ Redo: ${snap.label}`, 'ok');
  _refreshUndoUI();
}

// ── Apply snapshot ────────────────────────────────────────────────────────────
function _applySnapshot(snap) {
  S.timeline = snap.timeline;
  S.layers   = snap.layers;
  S.offsets  = snap.offsets;

  // Reset multi-selection khi undo/redo
  S.selectedLayers = new Set();
  S.highlightLayer = null;

  // Rebuild UI
  if (typeof buildLayerList === 'function') buildLayerList();
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);

  // Refresh edit panel nếu đang mở
  if (S.editLayer) {
    if (typeof selectEditLayer === 'function') selectEditLayer(S.editLayer);
  }
  // Refresh partsCard
  if (S.highlightLayer && S.currentAnim) {
    if (typeof updateRightPanel === 'function') updateRightPanel(S.currentAnim, S.currentTime);
  }
  markDirty();
}

// ── UI buttons (Undo / Redo) ──────────────────────────────────────────────────
function _refreshUndoUI() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (undoBtn) {
    undoBtn.disabled = S._undoStack.length === 0;
    undoBtn.title = S._undoStack.length > 0
      ? `Undo: ${S._undoStack[S._undoStack.length - 1].label} (Ctrl+Z)`
      : 'Không có gì để Undo';
  }
  if (redoBtn) {
    redoBtn.disabled = S._redoStack.length === 0;
    redoBtn.title = S._redoStack.length > 0
      ? `Redo: ${S._redoStack[S._redoStack.length - 1].label} (Ctrl+Y)`
      : 'Không có gì để Redo';
  }
}

// ── Keyboard shortcut ──────────────────────────────────────────────────────────
function setupUndoRedoKeys() {
  document.addEventListener('keydown', e => {
    // Bỏ qua nếu đang focus vào input/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); doUndo(); }
    if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); doRedo(); }
  });
}