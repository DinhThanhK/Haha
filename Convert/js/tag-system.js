// tag-system.js – Quản lý tag cho layer
'use strict';

const TAG_PRESETS = [
  { id:'always', label:'always', cls:'pre-always', group:'🎭 Luôn hiện' },

  { id:'body',    label:'body',    cls:'pre-body',    group:'🦴 Bộ phận' },
  { id:'head',    label:'head',    cls:'pre-head',    group:'🦴 Bộ phận' },
  { id:'arm_full', label:'arm_full', cls:'pre-arm-full', group:'🦴 Bộ phận' },
  { id:'arm_torn', label:'arm_torn', cls:'pre-arm-torn', group:'🦴 Bộ phận' },

  { id:'hat',       label:'hat',       cls:'pre-hat',       group:'🎩 Phụ kiện' },
  { id:'buckethead_3',  label:'buckethead_3',  cls:'pre-buckethead-3',  group:'🎩 Phụ kiện' },
  { id:'buckethead_2',  label:'buckethead_2',  cls:'pre-buckethead-2',  group:'🎩 Phụ kiện' },
  { id:'buckethead_1',  label:'buckethead_1',  cls:'pre-buckethead-1',  group:'🎩 Phụ kiện' },

  { id:'conehead_3', label:'conehead_3', cls:'pre-conehead-3', group:'🎩 Phụ kiện' },
  { id:'conehead_2', label:'conehead_2', cls:'pre-conehead-2', group:'🎩 Phụ kiện' },
  { id:'conehead_1', label:'conehead_1', cls:'pre-conehead-1', group:'🎩 Phụ kiện' },

  { id:'brickhead_3', label:'brickhead_3', cls:'pre-brickhead-3', group:'🎩 Phụ kiện' },
  { id:'brickhead_2', label:'brickhead_2', cls:'pre-brickhead-2', group:'🎩 Phụ kiện' },
  { id:'brickhead_1', label:'brickhead_1', cls:'pre-brickhead-1', group:'🎩 Phụ kiện' },

  { id:'armor_3', label:'armor_3', cls:'pre-armor-3', group:'🎩 Phụ kiện' },
  { id:'armor_2', label:'armor_2', cls:'pre-armor-2', group:'🎩 Phụ kiện' },
  { id:'armor_1', label:'armor_1', cls:'pre-armor-1', group:'🎩 Phụ kiện' },

  { id:'butter',  label:'butter',  cls:'pre-butter',  group:'✨ Hiệu ứng' },
  { id:'poison',  label:'poison',  cls:'pre-poison',  group:'✨ Hiệu ứng' },

  { id:'vfx',    label:'vfx',    cls:'pre-vfx',    group:'🔧 Khác' },
  { id:'debris', label:'debris', cls:'pre-debris', group:'🔧 Khác' },
  { id:'shadow', label:'shadow', cls:'pre-shadow', group:'🔧 Khác' },
];

const TAG_COLOR_MAP = {
  always: 't-always',
  body: 't-body', head: 't-body', arm_full: 't-body', arm_torn: 't-body',
  hat: 't-hat',
  buckethead_1: 't-hat', buckethead_2: 't-hat', buckethead_3: 't-hat',
  conehead_1: 't-hat', conehead_2: 't-hat', conehead_3: 't-hat',
  brickhead_1: 't-hat', brickhead_2: 't-hat', brickhead_3: 't-hat',
  armor_1: 't-hat', armor_2: 't-hat', armor_3: 't-hat',
  butter: 't-butter', poison: 't-poison',
  vfx: 't-custom', debris: 't-custom', shadow: 't-custom',
};

function getTagClass(tag) {
  return TAG_COLOR_MAP[tag] || 't-custom';
}

function renderTagPills(layerName) {
  const tags = S.layerTags[layerName] || [];
  if (!tags.length) return '<span class="tag-pill t-none">—</span>';
  const max = 2;
  let html = tags.slice(0, max).map(t =>
    `<span class="tag-pill ${getTagClass(t)}">${t}</span>`
  ).join('');
  if (tags.length > max) html += `<span class="tag-pill-more">+${tags.length - max}</span>`;
  return html;
}

function buildTagEditorHTML(layerName) {
  const tags = S.layerTags[layerName] || [];

  const groups = {};
  for (const p of TAG_PRESETS) {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  }

  let presetsHtml = '';
  for (const [gname, items] of Object.entries(groups)) {
    presetsHtml += `<div class="te-label">${gname}</div><div class="te-presets">`;
    presetsHtml += items.map(p => {
      const active = tags.includes(p.id) ? ' active' : '';
      // KHÔNG dùng CSS.escape trong onclick string — truyền tên qua data-tag-layer
      return `<button class="te-preset-btn ${p.cls}${active}" data-tag="${p.id}" data-tag-layer="${layerName.replace(/"/g,'&quot;')}"
        onclick="teTogglePreset(this)">${p.label}</button>`;
    }).join('');
    presetsHtml += '</div>';
  }

  const currentHtml = tags.length
    ? tags.map(t => `<span class="te-tag-chip" data-tag="${t.replace(/"/g,'&quot;')}" data-chip-layer="${layerName.replace(/"/g,'&quot;')}">
        ${t}
        <span class="te-tag-remove" onclick="teRemoveTagEl(this)">✕</span>
      </span>`).join('')
    : '<span style="font-size:9px;color:var(--mut)">Chưa có tag nào</span>';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span style="font-size:9px;color:var(--acc3);font-weight:700">🏷 Tags: <span style="color:var(--txt)">${layerName}</span></span>
      <button class="layer-ctrl-btn te-clear-all-btn" onclick="teClearAllEl(this)">✗ Xóa hết</button>
    </div>

    <div class="te-label">Tags hiện tại</div>
    <div class="te-current-tags" data-layer="${layerName.replace(/"/g,'&quot;')}">${currentHtml}</div>

    ${presetsHtml}

    <div class="te-label" style="margin-top:4px">Tag tuỳ chỉnh</div>
    <div class="te-custom-row">
      <input class="te-custom-input te-custom-inp"
        placeholder="VD: wing, glow, costume_gold…"
        onkeydown="if(event.key==='Enter')teAddCustomEl(this)">
      <button class="te-add-btn" onclick="teAddCustomEl(this.previousElementSibling)">＋ Thêm</button>
    </div>`;
}

let _openTagEditor = null;

function toggleTagEditor(layerName) {
  const editorId = 'te-' + CSS.escape(layerName);
  const btnId    = 'tebtn-' + CSS.escape(layerName);
  const editor   = document.getElementById(editorId);
  const btn      = document.getElementById(btnId);
  if (!editor) return;

  const isOpen = editor.classList.contains('open');

  if (_openTagEditor && _openTagEditor !== editorId) {
    const prev = document.getElementById(_openTagEditor);
    const prevLayer = prev?.dataset?.layer;
    if (prev) prev.classList.remove('open');
    if (prevLayer) {
      const prevBtn = document.getElementById('tebtn-' + CSS.escape(prevLayer));
      if (prevBtn) prevBtn.classList.remove('open');
    }
  }

  if (isOpen) {
    editor.classList.remove('open');
    btn.classList.remove('open');
    _openTagEditor = null;
  } else {
    editor.classList.add('open');
    btn.classList.add('open');
    _openTagEditor = editorId;
    // Force-select layer mà không trigger deselect (dù đang là layer đang active)
    S.highlightLayer = layerName;
    S.selectedLayers.clear();
    S.selectedLayers.add(layerName);
    const allHighlighted = new Set([...S.selectedLayers, ...(S.lockedMoveLayers || new Set())]);
    document.querySelectorAll('.layer-item').forEach(item => {
      item.classList.toggle('active', allHighlighted.has(item.dataset.name));
    });
    buildSimilarLayersPanel(layerName);
    setTimeout(() => editor.scrollIntoView({ block:'nearest', behavior:'smooth' }), 50);
  }
}

// ── Đọc layerName từ data attribute — KHÔNG dùng CSS.escape trong onclick args ──
function teTogglePreset(btn) {
  const layerName = btn.dataset.tagLayer;
  if (!layerName) return;
  const tag = btn.dataset.tag;
  if (!S.layerTags[layerName]) S.layerTags[layerName] = [];
  const tags = S.layerTags[layerName];
  const idx = tags.indexOf(tag);
  const isAdding = idx < 0;
  if (idx >= 0) tags.splice(idx, 1); else tags.push(tag);
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();
  const similarUpdated = applySimilarLayerTag(layerName, tag, isAdding);
  refreshTagUI(layerName);
  const action = isAdding ? 'Đã gán' : 'Đã gỡ';
  if (similarUpdated.length > 0) {
    showToast(`🏷 ${action} tag "${tag}" → "${layerName}" và ${similarUpdated.length} layer tương tự`, 'ok');
  } else {
    showToast(`🏷 ${action} tag "${tag}" cho layer "${layerName}"`, 'ok');
  }
}

function teAddCustomEl(inp) {
  const layerName = inp.closest('.tag-editor-row')?.dataset?.layer;
  if (!layerName) return;
  const val = inp.value.trim().toLowerCase().replace(/\s+/g,'_');
  if (!val) return;
  if (!S.layerTags[layerName]) S.layerTags[layerName] = [];
  if (!S.layerTags[layerName].includes(val)) {
    S.layerTags[layerName].push(val);
    markDirty();
    if (typeof markSessionDirty === 'function') markSessionDirty();
    const similarUpdated = applySimilarLayerTag(layerName, val, true);
    refreshTagUI(layerName);
    if (similarUpdated.length > 0) {
      showToast(`🏷 Đã gán tag "${val}" → "${layerName}" và ${similarUpdated.length} layer tương tự`, 'ok');
    } else {
      showToast(`🏷 Đã gán tag "${val}" cho layer "${layerName}"`, 'ok');
    }
  }
  inp.value = '';
}
// Alias cũ (teAddCustom) giữ để không vỡ nếu còn chỗ khác gọi
function teAddCustom(escapedName) {
  const layerName = unescapeLayerName(escapedName);
  const editorEl = Array.from(document.querySelectorAll('.tag-editor-row')).find(el => el.dataset.layer === layerName);
  const inp = editorEl?.querySelector('.te-custom-inp');
  if (inp) teAddCustomEl(inp);
}

function teRemoveTagEl(spanEl) {
  const chip = spanEl.closest('.te-tag-chip');
  if (!chip) return;
  const layerName = chip.dataset.chipLayer;
  const tag = chip.dataset.tag;
  if (!layerName || !tag) return;
  if (!S.layerTags[layerName]) return;
  S.layerTags[layerName] = S.layerTags[layerName].filter(t => t !== tag);
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();
  const similarUpdated = applySimilarLayerTag(layerName, tag, false);
  refreshTagUI(layerName);
  if (similarUpdated.length > 0) {
    showToast(`🏷 Đã gỡ tag "${tag}" khỏi "${layerName}" và ${similarUpdated.length} layer tương tự`, 'ok');
  } else {
    showToast(`🏷 Đã gỡ tag "${tag}" khỏi layer "${layerName}"`, 'ok');
  }
}
// Alias cũ
function teRemoveTag(escapedName, tag) {
  const layerName = unescapeLayerName(escapedName);
  if (!S.layerTags[layerName]) return;
  S.layerTags[layerName] = S.layerTags[layerName].filter(t => t !== tag);
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();
  const similarUpdated = applySimilarLayerTag(layerName, tag, false);
  refreshTagUI(layerName);
  if (similarUpdated.length > 0) {
    showToast(`🏷 Đã gỡ tag "${tag}" khỏi "${layerName}" và ${similarUpdated.length} layer tương tự`, 'ok');
  } else {
    showToast(`🏷 Đã gỡ tag "${tag}" khỏi layer "${layerName}"`, 'ok');
  }
}

function teClearAllEl(btn) {
  const layerName = btn.closest('.tag-editor-row')?.dataset?.layer;
  if (!layerName) return;
  const oldTags = [...(S.layerTags[layerName] || [])];
  S.layerTags[layerName] = [];
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();
  if (oldTags.length > 0 && S._similarLayers?.length) {
    const affectedLayers = new Set();
    for (const tag of oldTags) {
      applySimilarLayerTag(layerName, tag, false).forEach(l => affectedLayers.add(l));
    }
    refreshTagUI(layerName);
    if (affectedLayers.size > 0) {
      showToast(`🏷 Đã xóa hết tag khỏi "${layerName}" và ${affectedLayers.size} layer tương tự`, 'ok');
      return;
    }
  }
  refreshTagUI(layerName);
  if (oldTags.length > 0) showToast(`🏷 Đã xóa hết tag khỏi layer "${layerName}"`, 'ok');
}
// Alias cũ
function teClearAll(escapedName) {
  const layerName = unescapeLayerName(escapedName);
  const editorEl = Array.from(document.querySelectorAll('.tag-editor-row')).find(el => el.dataset.layer === layerName);
  if (editorEl) {
    const btn = editorEl.querySelector('.te-clear-all-btn');
    if (btn) { teClearAllEl(btn); return; }
  }
  // fallback inline
  const oldTags = [...(S.layerTags[layerName] || [])];
  S.layerTags[layerName] = [];
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();
  refreshTagUI(layerName);
  if (oldTags.length > 0) showToast(`🏷 Đã xóa hết tag khỏi layer "${layerName}"`, 'ok');
}

function refreshTagUI(layerName) {
  const esc = CSS.escape(layerName);
  // Helper: tìm element theo data-layer với giá trị raw (không CSS.escape)
  const byDataLayer = (sel, val) => {
    // So sánh bằng String() để xử lý trường hợp layer.name là number (vd: 21 vs "21")
    const sVal = String(val);
    return Array.from(document.querySelectorAll(sel)).find(el => el.dataset.layer === sVal) || null;
  };

  // Cập nhật pills trong layer list
  const pillsEl = byDataLayer('.layer-tags', layerName);
  if (pillsEl) pillsEl.innerHTML = renderTagPills(layerName);

  // Cập nhật danh sách tag hiện tại trong editor đang mở
  const curEl = byDataLayer('.te-current-tags', layerName);
  if (curEl) {
    const tags = S.layerTags[layerName] || [];
    const safeLayer = layerName.replace(/"/g, '&quot;');
    curEl.innerHTML = tags.length
      ? tags.map(t => `<span class="te-tag-chip" data-tag="${t.replace(/"/g,'&quot;')}" data-chip-layer="${safeLayer}">
          ${t}
          <span class="te-tag-remove" onclick="teRemoveTagEl(this)">✕</span>
        </span>`).join('')
      : '<span style="font-size:9px;color:var(--mut)">Chưa có tag nào</span>';
  }

  // Cập nhật trạng thái active của các nút preset trong editor đang mở
  const editorEl = byDataLayer('.tag-editor-row', layerName);
  if (editorEl) {
    const tags = S.layerTags[layerName] || [];
    editorEl.querySelectorAll('.te-preset-btn').forEach(btn => {
      btn.classList.toggle('active', tags.includes(btn.dataset.tag));
    });
  }

  const expTagsBtn = $('expTagsBtn');
  if (expTagsBtn) {
    const hasAnyTag = Object.values(S.layerTags).some(t => t.length > 0);
    expTagsBtn.disabled = !hasAnyTag;
  }
  // Cập nhật thanh lọc tag
  if (typeof rebuildTagFilterBar === 'function') rebuildTagFilterBar();
}

function unescapeLayerName(escaped) {
  const found = S.layers.find(l => CSS.escape(l.name) === escaped);
  return found ? found.name : escaped;
}

// ── Gán/gỡ tag cho similar layers (giống applySimilarLayerDelta) ──────────────
function applySimilarLayerTag(sourceLayer, tag, isAdding) {
  const updated = [];
  if (!S._similarLayers?.length) return updated;
  const sel = S.similarLayerSelected;
  const targets = sel === 'all' ? S._similarLayers : (sel !== sourceLayer ? [sel] : []);
  for (const tLayer of targets) {
    if (!S.layerTags[tLayer]) S.layerTags[tLayer] = [];
    const tTags = S.layerTags[tLayer];
    const idx = tTags.indexOf(tag);
    if (isAdding && idx < 0) {
      tTags.push(tag);
      refreshTagUI(tLayer);
      updated.push(tLayer);
    } else if (!isAdding && idx >= 0) {
      tTags.splice(idx, 1);
      refreshTagUI(tLayer);
      updated.push(tLayer);
    }
  }
  if (updated.length > 0) markDirty();
  return updated;
}

function exportTagsJSON() {
  if (!S.data) return;
  const docName = S.data?.meta?.docName || 'character';

  const layerDefs = S.layers.map(l => ({
    name: l.name,
    zDepth: l.zDepth,
    tags: S.layerTags[l.name] || [],
  }));

  const tagToLayers = {};
  for (const l of layerDefs) {
    for (const t of l.tags) {
      if (!tagToLayers[t]) tagToLayers[t] = [];
      tagToLayers[t].push(l.name);
    }
  }

  const allTags = [...new Set(Object.keys(tagToLayers))].sort();
  const enumHint = allTags.length
    ? `// Unity enum suggestion:\npublic enum LayerTag { ${allTags.map(t=>t.charAt(0).toUpperCase()+t.slice(1)).join(', ')} }`
    : '';

  const output = {
    _version: 1,
    _tool: 'XFL Deep Viewer v11',
    _doc: docName,
    _generated: new Date().toISOString(),
    _unityHint: enumHint,
    layers: layerDefs,
    tagIndex: tagToLayers,
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = (docName + '_layer_tags.json').replace(/\s+/g,'_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const tagged = layerDefs.filter(l => l.tags.length > 0).length;
  $('expTagsStatus').textContent = `✓ Xuất ${layerDefs.length} layers · ${tagged} đã có tag · ${allTags.length} tag types`;
}
// ── TAG FILTER BAR ────────────────────────────────────────────────────────────
// S._tagFilterHidden: Set<tag> – các tag đang bị ẩn (click để toggle)

function rebuildTagFilterBar() {
  const bar   = document.getElementById('tagFilterBar');
  const pills = document.getElementById('tagFilterPills');
  if (!bar || !pills) return;

  // Gom tất cả tag đang dùng + đếm số layer
  const tagCount = {};
  for (const [layerName, tags] of Object.entries(S.layerTags)) {
    for (const t of tags) {
      tagCount[t] = (tagCount[t] || 0) + 1;
    }
  }

  const allTags = Object.keys(tagCount).sort();

  if (allTags.length === 0) {
    bar.classList.add('hidden-bar');
    return;
  }
  bar.classList.remove('hidden-bar');

  if (!S._tagFilterHidden) S._tagFilterHidden = new Set();

  pills.innerHTML = allTags.map(tag => {
    const cls    = getTagClass(tag);
    const active = !S._tagFilterHidden.has(tag) ? 'active' : 'inactive';
    const count  = tagCount[tag];
    return `<span class="tfb-pill ${cls} ${active}" data-tag="${tag}"
              onclick="toggleTagFilter('${tag}')"
              title="${active === 'active' ? 'Click để ẩn' : 'Click để hiện'} layer có tag [${tag}]">
              ${tag}<span class="tfb-count">×${count}</span>
            </span>`;
  }).join('');
}

function toggleTagFilter(tag) {
  if (!S._tagFilterHidden) S._tagFilterHidden = new Set();

  if (S._tagFilterHidden.has(tag)) {
    S._tagFilterHidden.delete(tag);
  } else {
    S._tagFilterHidden.add(tag);
  }

  applyTagFilter();
  rebuildTagFilterBar();
}

function applyTagFilter() {
  if (!S._tagFilterHidden) S._tagFilterHidden = new Set();
  if (!S._tagFilterManaged) S._tagFilterManaged = new Set();

  for (const layer of S.layers) {
    const name = layer.name;
    const tags = S.layerTags[name] || [];
    const shouldHideByTag = tags.length > 0 && tags.every(t => S._tagFilterHidden.has(t));

    if (shouldHideByTag) {
      S.hiddenLayers.add(name);
      S._tagFilterManaged.add(name);
    } else if (S._tagFilterManaged.has(name)) {
      // Chỉ bỏ ẩn layer mà tag filter đã tự ẩn — không đụng đến hidden thủ công
      S.hiddenLayers.delete(name);
      S._tagFilterManaged.delete(name);
    }

    // Cập nhật icon trong panel
    const item = document.querySelector(`.layer-item[data-name="${CSS.escape(name)}"]`);
    if (item) {
      const isHidden = S.hiddenLayers.has(name);
      item.classList.toggle('hidden-layer', isHidden);
      const visBtn = item.querySelector('.layer-vis');
      if (visBtn) visBtn.textContent = isHidden ? '🙈' : '👁';
    }
  }

  if (!S.playing && S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
}

function _restoreTagFilterVisibility() {
  if (!S._tagFilterManaged) return;
  for (const name of S._tagFilterManaged) {
    S.hiddenLayers.delete(name);
    const item = document.querySelector(`.layer-item[data-name="${CSS.escape(name)}"]`);
    if (item) {
      item.classList.remove('hidden-layer');
      const visBtn = item.querySelector('.layer-vis');
      if (visBtn) visBtn.textContent = '👁';
    }
  }
  S._tagFilterManaged.clear();
  if (!S.playing && S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
}