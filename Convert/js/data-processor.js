// data-processor.js – Xử lý dữ liệu JSON, build UI lists
'use strict';

function processData(data) {
  const meta = data.meta || {};
  const fps  = meta.fps || 30;
  const W    = meta.canvasW || 390;
  const H    = meta.canvasH || 390;

  S.bitmaps = {};
  S.bitmapSizesFromJSON = false;
  const rawBitmaps = data.bitmaps || {};
  let nonZeroCount = 0;
  for (const name in rawBitmaps) {
    const rv = rawBitmaps[name];
    if (rv.w > 0 && rv.h > 0) nonZeroCount++;
  }
  S.bitmapSizesFromJSON = (nonZeroCount > 0);
  for (const name in rawBitmaps) {
    const rv = rawBitmaps[name];
    let w = rv.w || 0, h = rv.h || 0;
    if (!w || !h) {
      const base = name.split('/').pop().replace('.png','');
      const m = base.match(/_(\d+)x(\d+)(?:_\d+)?$/);
      if (m) { w = +m[1]; h = +m[2]; }
    }
    S.bitmaps[name] = { w: w || 1, h: h || 1 };
  }

  S.animations   = data.animations || {};
  S.animNames    = Object.keys(S.animations);
  S.boneMap      = data.boneMap || {};
  S.spriteRegistry = data.spriteRegistry || {};
  S.timeline     = data.compactTimeline || {};

  const raw = data.mainLayers || [];
  S.layers = raw.slice().sort((a, b) => a.zDepth - b.zDepth);
  // Normalize tên layer thành string để tránh lỗi so sánh number vs string
  S.layers.forEach(l => { l.name = String(l.name); });

  const prevTags = S.layerTags || {};
  S.layerTags = {};
  for (const l of S.layers) {
    // Ưu tiên: tag từ file JSON > tag in-memory > rỗng
    S.layerTags[l.name] = (data.layerTags && data.layerTags[l.name]) || prevTags[l.name] || [];
  }
  _openTagEditor = null;

  // Load frame events from JSON if present
  const prevEvents = S.animEvents || {};
  S.animEvents = {};
  for (const an of S.animNames) {
    S.animEvents[an] = (data.animEvents && data.animEvents[an]) ? data.animEvents[an] : (prevEvents[an] || []);
  }

  canvas.width  = W;
  canvas.height = H;
  setTimeout(() => autoExpandCanvas(W, H), 0);
  applyZoom(S.zoom);

  buildAnimList();
  S.activeLayersOnly = true; // Mặc định filter chỉ hiện layer active
  buildLayerList();
  buildMetaCard(meta, data);
  buildIssueCard(data.issues || []);
  buildExportPanel();
  if ($('expTagsBtn')) $('expTagsBtn').disabled = false;

  $('dropZone').style.display = 'none';
  $('zipLoadRow').style.display = 'flex';
  $('animSectionRow').style.display = 'flex';
  $('layerSection').style.display = 'flex';

  setStatus(`✓ ${S.animNames.length} anims · ${S.layers.length} layers · ${S.bitmapSizesFromJSON ? 'center-mode' : 'topleft-mode'}`, 'ok');

  if (S.animNames.length > 0) selectAnim(S.animNames[0]);
}

function buildAnimList() {
  const list = $('animList');
  list.innerHTML = '';
  for (const name of S.animNames) {
    const anim = S.animations[name];
    const btn  = document.createElement('button');
    btn.className    = 'anim-btn';
    btn.dataset.name = name;
    btn.innerHTML = `
      <span class="anim-dot"></span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${name}</span>
      <span class="anim-meta">${anim.frameCount}f·${anim.duration.toFixed(2)}s</span>`;
    btn.onclick = () => selectAnim(name);
    list.appendChild(btn);
  }
}

function buildLayerList() {
  const scroll = $('layerList');
  scroll.innerHTML = '';
  const sorted = S.layers.slice().sort((a, b) => b.zDepth - a.zDepth);

  // Tính set layer active nếu cần filter
  let activeSet = null;
  if (S.activeLayersOnly && S.currentAnim) {
    const animTL = S.timeline[S.currentAnim] || {};
    activeSet = new Set();
    for (const layer of S.layers) {
      const kfs = animTL[layer.name];
      const kf = kfs ? getActiveKF(kfs, S.currentTime) : null;
      if (kf?.parts?.length > 0) activeSet.add(layer.name);
    }
  }

  for (const layer of sorted) {
    const name = layer.name;

    // Ẩn hẳn khỏi DOM nếu activeLayersOnly và không có part
    if (activeSet && !activeSet.has(name)) continue;

    const item = document.createElement('div');
    item.className    = 'layer-item';
    item.dataset.name = name;
    if (S.hiddenLayers.has(name)) item.classList.add('hidden-layer');
    if ((S.lockedMoveLayers || new Set()).has(name)) item.classList.add('locked-move-active');

    const tagsHtml = renderTagPills(name);
    const isLockedMove = (S.lockedMoveLayers || new Set()).has(name);

    item.innerHTML = `
      <button class="layer-vis" title="Ẩn/hiện" data-vis="${name}">👁</button>
      <button class="layer-lock-move-btn${isLockedMove ? ' active' : ''}" title="${isLockedMove ? 'Bỏ khóa layer' : 'Khóa layer (ưu tiên kéo)'}" data-name="${name}">${isLockedMove ? '🔐' : '🔓'}</button>
      <span class="layer-dot"></span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;min-width:0">${name}</span>
      <span class="layer-tags" id="tpills-${CSS.escape(name)}" data-layer="${name}">${tagsHtml}</span>
      <button class="tag-edit-btn" id="tebtn-${CSS.escape(name)}" title="Gán tag cho layer">🏷</button>
      <button class="layer-copy-btn" title="Sao chép layer (và layer tương tự)" data-copy="${name}">⧉</button>
      <span class="layer-z-controls">
        <button class="layer-z-btn" title="Z-order lên" data-zup="${name}">▲</button>
        <span class="layer-z">${layer.zDepth}</span>
        <button class="layer-z-btn" title="Z-order xuống" data-zdown="${name}">▼</button>
      </span>`;

    item.querySelector('.layer-vis').addEventListener('click', e => {
      e.stopPropagation();
      toggleLayerVisibility(name);
    });
    item.querySelector('.layer-lock-move-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (e.shiftKey && typeof _lastLockedLayer !== 'undefined' && _lastLockedLayer) {
        // Shift+click: lock/unlock toàn bộ layer từ _lastLockedLayer đến name
        const allItems = [...document.querySelectorAll('.layer-item')];
        const idxA = allItems.findIndex(el => el.dataset.name === _lastLockedLayer);
        const idxB = allItems.findIndex(el => el.dataset.name === name);
        if (idxA >= 0 && idxB >= 0) {
          const [from, to] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
          const willLock = !S.lockedMoveLayers.has(name);
          for (let i = from; i <= to; i++) {
            const n = allItems[i].dataset.name;
            if (willLock) S.lockedMoveLayers.add(n);
            else S.lockedMoveLayers.delete(n);
            const btn2 = allItems[i].querySelector('.layer-lock-move-btn');
            if (btn2) {
              btn2.classList.toggle('active', willLock);
              btn2.textContent = willLock ? '🔐' : '🔓';
              btn2.title = willLock ? 'Bỏ khóa layer' : 'Khóa layer (ưu tiên kéo)';
            }
            allItems[i].classList.toggle('locked-move-active', willLock);
          }
          updateUnlockAllBtn();
          if (typeof markSessionDirty === 'function') markSessionDirty();
          if (typeof refreshLayerHighlightUI === 'function') refreshLayerHighlightUI();
          return;
        }
      }
      _lastLockedLayer = name;
      toggleLayerLockMove(name);
    });
    item.querySelector('.tag-edit-btn').addEventListener('click', e => {
      e.stopPropagation();
      toggleTagEditor(name);
    });
    item.querySelector('[data-zup]').addEventListener('click', e => {
      e.stopPropagation();
      moveLayerZOrder(name, +1);
    });
    item.querySelector('[data-zdown]').addEventListener('click', e => {
      e.stopPropagation();
      moveLayerZOrder(name, -1);
    });
    item.querySelector('.layer-copy-btn').addEventListener('click', e => {
      e.stopPropagation();
      copyLayer(name);
    });
    item.addEventListener('click', (e) => {
      highlightLayer(name, e.ctrlKey || e.metaKey);
      if (S.editMode && !e.ctrlKey && !e.metaKey) selectEditLayer(name);
    });

    scroll.appendChild(item);

    const editorRow = document.createElement('div');
    editorRow.className = 'tag-editor-row';
    editorRow.id = 'te-' + CSS.escape(name);
    editorRow.dataset.layer = name;
    editorRow.innerHTML = buildTagEditorHTML(name);
    editorRow.addEventListener('click', e => e.stopPropagation());
    scroll.appendChild(editorRow);
  }
  // Ghost item cuối danh sách: tạo khoảng trống để hover item thực cuối cùng không bị cắt
  const ghost = document.createElement('div');
  ghost.className = 'layer-item layer-item--ghost';
  ghost.setAttribute('aria-hidden', 'true');
  scroll.appendChild(ghost);

  // Áp lại tag filter sau khi rebuild list
  if (typeof applyTagFilter === 'function') applyTagFilter();
}

// data-processor.js (phần bổ sung)
function buildMetaCard(meta, data) {
  const rows = [
    ['FPS',       meta.fps],
    ['Canvas',    meta.canvasW + '×' + meta.canvasH],
    ['Frames',    meta.maxFrame],
    ['Layers',    (data.mainLayers||[]).length],
    ['Sprites',   Object.keys(data.spriteRegistry||{}).length],
    ['Bitmaps',   Object.keys(data.bitmaps||{}).length],
    ['Anims',     S.animNames.length],
    ['Doc',       meta.docName||'—'],
  ];
  $('metaCard').innerHTML = '<h3>ℹ Project</h3>' +
    rows.map(([k,v]) => `<div class="kv"><span class="kk">${k}</span><span class="kv2 g">${v}</span></div>`).join('');
}

function buildIssueCard(issues) {
  const card = $('issueCard');
  if (!issues.length) {
    card.innerHTML = '<h3>⚠ Issues</h3><div style="color:var(--acc);font-size:10px">✓ Không có vấn đề</div>';
    return;
  }
  const groups = {};
  for (const i of issues) groups[i.type] = (groups[i.type]||0)+1;
  card.innerHTML = `<h3>⚠ Issues (${issues.length})</h3>` +
    Object.entries(groups).map(([k,v]) =>
      `<div class="kv"><span class="kk">${k}</span><span class="kv2 r">${v}</span></div>`
    ).join('');
}

function buildExportPanel() {
  const list = $('expAnimChecklist');
  list.innerHTML = '';
  for (const name of S.animNames) {
    const anim = S.animations[name];
    const row  = document.createElement('label');
    row.className = 'exp-anim-check';
    row.innerHTML = `
      <input type="checkbox" checked data-expname="${name}">
      <span class="ean">${name}</span>
      <span class="emeta">${anim.frameCount}f · ${anim.duration.toFixed(2)}s</span>`;
    list.appendChild(row);
  }
  const btn = $('expBtn');
  btn.disabled = false;
  btn.onclick = doExport;
  $('expFormat').onchange = () => {
    $('atlasRow').style.display = $('expFormat').value === 'spine3file' ? '' : 'none';
  };
}