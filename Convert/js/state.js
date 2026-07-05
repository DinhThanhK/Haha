// state.js – Quản lý trạng thái toàn cục
'use strict';

// Biến hỗ trợ shift-click multi-lock layer
let _lastLockedLayer = null;

// Biến toàn cục cho canvas và context
let canvas, ctx;

const S = {
  data: null,
  bitmaps: {},
  imgCache: {},
  imgLoaded: {},
  imgMissing: {},
  layers: [],
  timeline: {},
  animations: {},
  animNames: [],
  boneMap: {},
  spriteRegistry: {},

  currentAnim: null,
  currentTime: 0,
  playing: false,
  looping: true,
  speed: 1.0,
  zoom: 1.0,
  outputSpread: 1.37,          // <<< SPREAD FEATURE 
  partSpacing: 1,            // <<< BITMAP SPACING

  lastRaf: null,
  lastTs: null,
  dur: 1,
  highlightLayer: null,
  missingCount: 0,
  loadedCount: 0,

  hiddenLayers: new Set(),
  activeLayersOnly: false,
  layerTags: {},
  lockedMoveLayers: new Set(),

  // edit mode
  editMode: false,
  editLayer: null,
  editScope: 'all',
  offsets: {},
  alphaOverrides: {},   // { layerName: { [animName|'all']: deltaAlpha } }
  lockedParts: new Set(),

  // similar-layer animations panel
  similarLayerSelected: 'all',
  _similarLayers: [],
  _similarSourceLayer: null,

  // Frame events (per animation)
  animEvents: {},

  // Undo / Redo stacks
  _undoStack: [],
  _redoStack: [],

  // Multi-layer selection (Ctrl+click)
  selectedLayers: new Set(),

  // Per-animation hidden layers
  animHiddenLayers: {},

  // Session management
  _sourceZipName: null,
  _exportName: '',      // Tên file xuất tuỳ chỉnh (lưu trong session)
  _sessionDirty: false,
  _hoverBgCanvas: null,
  _hoverBgAnim: null,
  _hoverBgTime: null,

  // drag state
  _dragging: false,
  _dragLayer: null,
  _dragLayers: null,
  _dragStartX: 0,
  _dragStartY: 0,
  _partDragging: false,
  _partDragLayer: null,
  _partDragIndex: undefined,
};
// ── Canvas swap helper cho zpSpread preview ──────────────────────────────────
// renderFrame dùng `canvas` và `ctx` là let trong file này.
// Hàm này swap tạm thời để render vào canvas khác, rồi restore.
function withCanvas(altCanvas, altCtx, fn) {
  const _c = canvas, _x = ctx;
  canvas = altCanvas;
  ctx    = altCtx;
  try { fn(); } finally {
    canvas = _c;
    ctx    = _x;
  }
}
