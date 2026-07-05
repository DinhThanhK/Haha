// ui-builder.js – Xây dựng các card UI, panel
'use strict';

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
  // Restore saved trim state if available
  const savedChecklist = S._expAnimChecklist || {};
  for (const name of S.animNames) {
    const anim = S.animations[name];
    const dur  = anim.duration;
    const saved = savedChecklist[name] || {};
    const isChecked = saved.checked !== false; // default true
    const trimStart = (saved.trimStart !== undefined) ? saved.trimStart : null;
    const trimEnd   = (saved.trimEnd   !== undefined) ? saved.trimEnd   : null;
    const hasTrim   = (trimStart !== null && trimStart > 0) || (trimEnd !== null && trimEnd < dur - 0.001);
    const trimOpen  = saved.trimOpen || false;

    const wrapper = document.createElement('div');
    wrapper.className = 'exp-anim-item';
    wrapper.dataset.expname = name;

    const tsVal = trimStart !== null ? trimStart : 0;
    const teVal = trimEnd   !== null ? trimEnd   : dur;

    wrapper.innerHTML = `
      <label class="exp-anim-check" style="cursor:default">
        <input type="checkbox" ${isChecked ? 'checked' : ''} data-expname="${name}" style="cursor:pointer">
        <span class="ean">${name}</span>
        <span class="emeta">${anim.frameCount}f · ${dur.toFixed(2)}s</span>
        <button class="exp-anim-trim-btn${hasTrim || trimOpen ? ' active' : ''}" title="Chỉnh thời gian xuất" data-for="${name}">✂</button>
      </label>
      <div class="exp-anim-trim-row${trimOpen ? '' : ' hidden'}" data-trim-for="${name}">
        <label>Từ</label>
        <input type="number" class="trim-start${trimStart !== null && trimStart > 0 ? ' trim-active' : ''}" data-for="${name}"
          min="0" max="${dur.toFixed(3)}" step="0.01" value="${tsVal.toFixed(3)}">
        <label>→</label>
        <input type="number" class="trim-end${trimEnd !== null && trimEnd < dur - 0.001 ? ' trim-active' : ''}" data-for="${name}"
          min="0" max="${dur.toFixed(3)}" step="0.01" value="${teVal.toFixed(3)}">
        <label>s</label>
        <button class="trim-reset" data-for="${name}" title="Reset về mặc định">↺</button>
      </div>`;

    // Toggle trim row
    wrapper.querySelector('.exp-anim-trim-btn').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const trimRow = wrapper.querySelector('.exp-anim-trim-row');
      const open = trimRow.classList.toggle('hidden');
      // open==true means now hidden; open==false means visible
      e.currentTarget.classList.toggle('active', !open);
      _saveExpAnimChecklistState();
    });

    // Checkbox change
    wrapper.querySelector('input[type=checkbox]').addEventListener('change', () => {
      _saveExpAnimChecklistState();
    });

    // Trim inputs
    const startInput = wrapper.querySelector('.trim-start');
    const endInput   = wrapper.querySelector('.trim-end');

    function onTrimChange() {
      let ts = parseFloat(startInput.value);
      let te = parseFloat(endInput.value);
      if (isNaN(ts)) ts = 0;
      if (isNaN(te)) te = dur;
      ts = Math.max(0, Math.min(ts, dur));
      te = Math.max(0, Math.min(te, dur));
      if (ts > te) { const tmp = ts; ts = te; te = tmp; }
      startInput.classList.toggle('trim-active', ts > 0.0001);
      endInput.classList.toggle('trim-active', te < dur - 0.001);
      // Update trim btn highlight
      const anyTrim = ts > 0.0001 || te < dur - 0.001;
      wrapper.querySelector('.exp-anim-trim-btn').classList.toggle('active',
        !wrapper.querySelector('.exp-anim-trim-row').classList.contains('hidden') || anyTrim);
      _saveExpAnimChecklistState();
    }
    startInput.addEventListener('input', onTrimChange);
    endInput.addEventListener('input', onTrimChange);

    // Reset button
    wrapper.querySelector('.trim-reset').addEventListener('click', e => {
      e.preventDefault();
      startInput.value = (0).toFixed(3);
      endInput.value   = dur.toFixed(3);
      startInput.classList.remove('trim-active');
      endInput.classList.remove('trim-active');
      _saveExpAnimChecklistState();
    });

    list.appendChild(wrapper);
  }
  const btn = $('expBtn');
  btn.disabled = false;
  btn.onclick = doExport;
  $('expFormat').onchange = () => {
    $('atlasRow').style.display = $('expFormat').value === 'spine3file' ? '' : 'none';
  };
}

// Lưu trạng thái checklist (checked, trimStart, trimEnd, trimOpen) vào S._expAnimChecklist
function _saveExpAnimChecklistState() {
  const result = {};
  document.querySelectorAll('#expAnimChecklist .exp-anim-item').forEach(wrapper => {
    const name = wrapper.dataset.expname;
    if (!name) return;
    const cb       = wrapper.querySelector('input[type=checkbox]');
    const tsInput  = wrapper.querySelector('.trim-start');
    const teInput  = wrapper.querySelector('.trim-end');
    const trimRow  = wrapper.querySelector('.exp-anim-trim-row');
    const dur      = S.animations[name]?.duration || 1;
    const ts = tsInput ? parseFloat(tsInput.value) : 0;
    const te = teInput ? parseFloat(teInput.value) : dur;
    result[name] = {
      checked:   cb ? cb.checked : true,
      trimStart: (ts > 0.0001) ? ts : null,
      trimEnd:   (te < dur - 0.001) ? te : null,
      trimOpen:  trimRow ? !trimRow.classList.contains('hidden') : false,
    };
  });
  S._expAnimChecklist = result;
  markSessionDirty();
}

// Lấy danh sách anim được chọn kèm thông tin trim
function getSelectedAnimsWithTrim() {
  const items = [];
  document.querySelectorAll('#expAnimChecklist .exp-anim-item').forEach(wrapper => {
    const name = wrapper.dataset.expname;
    if (!name) return;
    const cb = wrapper.querySelector('input[type=checkbox]');
    if (!cb || !cb.checked) return;
    const dur = S.animations[name]?.duration || 1;
    const tsInput = wrapper.querySelector('.trim-start');
    const teInput = wrapper.querySelector('.trim-end');
    const trimStart = tsInput ? Math.max(0, parseFloat(tsInput.value) || 0) : 0;
    const trimEnd   = teInput ? Math.min(dur, parseFloat(teInput.value) || dur) : dur;
    items.push({ name, trimStart, trimEnd });
  });
  return items;
}

function updateRightPanel(animName, t) {
  const animTL = S.timeline[animName] || {};
  const fps = S.data?.meta?.fps || 30;
  const frameNum = Math.round(t * fps);

  $('frameCard').innerHTML = `<h3>▶ Playback</h3>` +
    kvRow('Anim', animName, 'g') +
    kvRow('Time', t.toFixed(4) + 's') +
    kvRow('Frame', frameNum + ' / ' + Math.round(S.dur * fps)) +
    kvRow('Speed', S.speed + '×') +
    kvRow('Loop', S.looping ? '✓' : '—');

  if (S.highlightLayer) {
    const kfs = animTL[S.highlightLayer];
    const kf  = kfs ? getActiveKF(kfs, t) : null;
    const parts = kf?.parts || [];
    const lockCount = S.lockedMoveLayers ? S.lockedMoveLayers.size : 0;
    const unlockXBtn = lockCount > 0
      ? `<button onclick="unlockAllMoveLayers()" title="Bỏ khóa tất cả layer" style="margin-left:auto;background:none;border:1px solid var(--acc);color:var(--acc);border-radius:3px;padding:1px 5px;font-size:10px;cursor:pointer;line-height:1.4">✕🔓${lockCount > 1 ? ' ' + lockCount : ''}</button>`
      : '';
    
    // Nút mở khóa tất cả bitmap
    const bitmapLockCount = S.lockedParts.size;
    const unlockBitmapBtn = bitmapLockCount > 0
      ? `<button onclick="unlockAllLockedBitmaps()" title="Mở khóa tất cả bitmap" style="margin-left:6px;background:none;border:1px solid var(--acc3);color:var(--acc3);border-radius:3px;padding:1px 5px;font-size:10px;cursor:pointer;line-height:1.4">🔓 Bitmaps (${bitmapLockCount})</button>`
      : '';

    $('partsCard').innerHTML = `<h3 style="display:flex;align-items:center;gap:4px">🧩 Layer: ${S.highlightLayer}${unlockXBtn}${unlockBitmapBtn}</h3>` +
      (parts.length === 0
        ? '<div style="color:var(--mut2);font-size:10px">Không có part ở frame này</div>'
        : parts.map((p, pi) => buildPartRowHTML(p, pi, S.highlightLayer)).join(''));
    attachPartLockListeners();

    if (parts.length > 0) {
      const p = parts[0];
      const bm = S.boneMap[S.highlightLayer];
      const bmEntry = bm?.bitmaps?.[0];
      let matHtml = '<h3>🔢 Matrix (selected)</h3>';
      matHtml += `<div class="matrix-disp">`;
      matHtml += `sx: <span class="mv">${p.sx.toFixed(5)}</span>  sy: <span class="mv">${p.sy.toFixed(5)}</span>\n`;
      matHtml += `rot: <span class="mv">${p.rot.toFixed(3)}°</span>\n`;
      matHtml += `tx: <span class="mv">${p.x.toFixed(3)}</span>  ty: <span class="mv">${p.y.toFixed(3)}</span>\n`;
      if (bmEntry?.defaultWorldMatrix) {
        const m = bmEntry.defaultWorldMatrix;
        matHtml += `\n<span style="color:var(--mut2)">World (default):</span>\n`;
        matHtml += `a:<span class="mv">${m.a.toFixed(4)}</span> b:<span class="mv">${m.b.toFixed(4)}</span>\n`;
        matHtml += `c:<span class="mv">${m.c.toFixed(4)}</span> d:<span class="mv">${m.d.toFixed(4)}</span>\n`;
        matHtml += `tx:<span class="mv">${m.tx.toFixed(2)}</span> ty:<span class="mv">${m.ty.toFixed(2)}</span>`;
      }
      matHtml += `</div>`;
      $('matrixCard').innerHTML = matHtml;
    } else {
      $('matrixCard').innerHTML = '<h3>🔢 Matrix</h3><div style="color:var(--mut2);font-size:10px">Không có part để hiển thị</div>';
    }
  } else {
    let count = 0;
    for (const lname in animTL) {
      const kf = getActiveKF(animTL[lname], t);
      if (kf?.parts?.length > 0) count++;
    }
    $('partsCard').innerHTML = `<h3>🧩 Frame Parts</h3>` +
      kvRow('Active layers', count, 'g') +
      `<div style="color:var(--mut2);font-size:10px;margin-top:5px">Click layer để xem chi tiết</div>`;
    $('matrixCard').innerHTML = '<h3>🔢 Matrix</h3><div style="color:var(--mut2);font-size:10px">Click layer để xem</div>';
  }
}

function buildPartRowHTML(p, pi, layerName) {
  const esc = CSS.escape(layerName);
  const lockKey = layerName + '::' + pi;
  const isLocked = S.lockedParts.has(lockKey);
  const lockedClass = isLocked ? ' locked' : '';
  const lockBtnClass = isLocked ? ' active' : '';
  const editorOpen = isLocked ? ' open' : '';
  return `
    <div class="part-row${lockedClass}" id="prow-${esc}-${pi}" data-bitmap="${p.bitmap}">
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
        <span class="part-bmp">${p.bitmap.split('/').pop()}</span>
        <button class="part-lock-btn${lockBtnClass}" id="plockbtn-${esc}-${pi}"
          title="${isLocked ? 'Mở khóa' : 'Khóa để chỉnh vị trí'}"
          data-layer="${layerName.replace(/"/g,'&quot;')}" data-pi="${pi}">
          ${isLocked ? '🔒' : '🔓'}
        </button>
        <button class="part-split-btn" title="Tách bitmap này thành layer riêng"
          data-layer="${layerName.replace(/"/g,'&quot;')}" data-bitmap="${p.bitmap.replace(/"/g,'&quot;')}">
          ↗
        </button>
      </div>
      <div class="part-nums">
        x:<span id="pval-x-${esc}-${pi}">${p.x.toFixed(1)}</span> y:<span id="pval-y-${esc}-${pi}">${p.y.toFixed(1)}</span>
        sx:<span>${p.sx.toFixed(3)}</span> sy:<span>${p.sy.toFixed(3)}</span>
        rot:<span>${p.rot.toFixed(1)}°</span> α:<span>${p.alpha.toFixed(2)}</span>
      </div>
      <div class="part-pos-editor${editorOpen}" id="ppe-${esc}-${pi}">
        <div class="ppe-title">🎯 Chỉnh vị trí bitmap</div>
        <div class="ppe-drag-hint">🖱 Kéo trên canvas hoặc nhập — áp dụng ngay tất cả animation</div>
        <div class="ppe-row">
          <label class="ppe-label">X</label>
          <input class="ppe-input" id="ppe-x-${esc}-${pi}" type="number" step="0.5"
            value="${p.x.toFixed(2)}"
            onwheel="ppeWheel(event,'${esc}',${pi},'x')"
            oninput="ppeMarkChanged(this);ppeApplyLive('${layerName.replace(/'/g,"\\'")}',${pi},'x',parseFloat(this.value)||0)">
        </div>
        <div class="ppe-row">
          <label class="ppe-label">Y</label>
          <input class="ppe-input" id="ppe-y-${esc}-${pi}" type="number" step="0.5"
            value="${p.y.toFixed(2)}"
            onwheel="ppeWheel(event,'${esc}',${pi},'y')"
            oninput="ppeMarkChanged(this);ppeApplyLive('${layerName.replace(/'/g,"\\'")}',${pi},'y',parseFloat(this.value)||0)">
        </div>
        <button class="ppe-save-btn" onclick="ppeSave('${esc}',${pi})" style="display:none">💾 Save vị trí</button>
        <div class="ppe-hint">Vị trí tương đối trong XFL coord<br>(+X = phải, +Y = lên)</div>
      </div>
    </div>`;
}

// === HOVER PREVIEW BITMAP + LAYER (optimized) ===
// Dùng 1 mousemove + 1 mouseover duy nhất trên document, tránh lag khi hàng nghìn layer
let _hoverRafId = null;
let _hoverMouseX = 0;
let _hoverMouseY = 0;
let _hoverCurrentBitmap = null;
let _hoverCurrentLayer = null;
let _hoverPreviewDiv = null;
let _hoverBhpCanvas = null;
let _hoverBhpCtx = null;
let _hoverBhpLabel = null;
let _hoverInitialized = false;

function _hoverPositionUpdate() {
  if (_hoverPreviewDiv && _hoverPreviewDiv.style.display !== 'none') {
    _hoverPreviewDiv.style.transform =
      `translate(${_hoverMouseX + 20}px, ${_hoverMouseY - 20}px)`;
  }
  _hoverRafId = null;
}

// ── Phân tích độ sáng trung bình của ảnh (sample nhanh) ──────────────────────
function _getImgLuminance(img) {
  try {
    const SZ = 32;
    const tmp = document.createElement('canvas');
    tmp.width = SZ; tmp.height = SZ;
    const tc = tmp.getContext('2d');
    tc.drawImage(img, 0, 0, SZ, SZ);
    const data = tc.getImageData(0, 0, SZ, SZ).data;
    let sum = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 20) continue; // bỏ pixel trong suốt
      // relative luminance (ITU-R BT.709)
      const r = data[i] / 255, g = data[i+1] / 255, b = data[i+2] / 255;
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      count++;
    }
    if (count === 0) return 0.5;
    return sum / count;
  } catch(e) { return 0.5; }
}

function _applyHoverBg(lum) {
  if (!_hoverPreviewDiv) return;
  // Nếu ảnh tối (lum < 0.45) → nền sáng; ảnh sáng → nền tối
  if (lum < 0.45) {
    _hoverPreviewDiv.style.setProperty('--bhp-bg', '#d8d8d8');
    _hoverPreviewDiv.style.setProperty('--bhp-canvas-bg', '#e4e4e4');
  } else {
    _hoverPreviewDiv.style.setProperty('--bhp-bg', '#1a1a2e');
    _hoverPreviewDiv.style.setProperty('--bhp-canvas-bg', '#12121e');
  }
}

// Tính kích thước canvas preview phù hợp cho ảnh: giữ tỷ lệ, đảm bảo nằm trong [MIN,MAX]
function _calcPreviewSize(imgW, imgH) {
  const MIN = 40, MAX = 160, PREF = 90;
  if (!imgW || !imgH) return { canvW: PREF, canvH: PREF, drawW: PREF, drawH: PREF };
  const aspect = imgW / imgH;
  // Scale sao cho cạnh lớn nhất = PREF
  let dw = (aspect >= 1) ? PREF : PREF * aspect;
  let dh = (aspect >= 1) ? PREF / aspect : PREF;
  // Đảm bảo cạnh nhỏ không dưới MIN
  if (Math.min(dw, dh) < MIN) {
    const scale = MIN / Math.min(dw, dh);
    dw *= scale; dh *= scale;
  }
  // Không vượt MAX
  if (Math.max(dw, dh) > MAX) {
    const scale = MAX / Math.max(dw, dh);
    dw *= scale; dh *= scale;
  }
  return { canvW: Math.round(dw), canvH: Math.round(dh), drawW: dw, drawH: dh };
}

function _drawBitmapPreview(bitmapPath) {
  if (_hoverCurrentBitmap === bitmapPath) return;
  _hoverCurrentBitmap = bitmapPath;
  _hoverCurrentLayer = null;

  const bhpCanvas = _hoverBhpCanvas;
  const ctx = _hoverBhpCtx;
  const label = _hoverBhpLabel;

  const img = S.imgCache[bitmapPath];
  if (img && img.complete && !S.imgMissing[bitmapPath]) {
    const { canvW, canvH, drawW, drawH } = _calcPreviewSize(img.width, img.height);
    bhpCanvas.width  = canvW;
    bhpCanvas.height = canvH;
    ctx.clearRect(0, 0, canvW, canvH);
    ctx.drawImage(img, (canvW - drawW) / 2, (canvH - drawH) / 2, drawW, drawH);
    label.textContent = bitmapPath.split('/').pop();
    // Smart background
    const lum = _getImgLuminance(img);
    _applyHoverBg(lum);
  } else {
    const size = 60;
    bhpCanvas.width = size; bhpCanvas.height = size;
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = '#ff0066'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    ctx.font = '10px monospace'; ctx.fillStyle = '#ff0066';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', size / 2, size / 2);
    label.textContent = bitmapPath.split('/').pop() + ' (missing)';
    _applyHoverBg(0.5);
  }
}

// Retry timer cho layer preview khi anh chua load
let _layerPreviewRetryTimer = null;

function _drawLayerPreview(layerName, _forceRedraw) {
  // Chi dung cache neu khong phai force redraw (vi du sau khi anh load xong)
  if (!_forceRedraw && _hoverCurrentLayer === layerName) return;
  _hoverCurrentLayer = layerName;
  _hoverCurrentBitmap = null;
  if (_layerPreviewRetryTimer) { clearTimeout(_layerPreviewRetryTimer); _layerPreviewRetryTimer = null; }

  const bhpCanvas = _hoverBhpCanvas;
  const ctx = _hoverBhpCtx;
  const label = _hoverBhpLabel;
  label.textContent = layerName;

  if (!S.currentAnim) { bhpCanvas.width = 80; bhpCanvas.height = 80; ctx.clearRect(0,0,80,80); return; }
  const animTL = S.timeline[S.currentAnim] || {};
  const kfs = animTL[layerName];
  const kf = kfs && typeof getActiveKF === 'function' ? getActiveKF(kfs, S.currentTime) : null;
  const parts = (kf?.parts || []).filter(p => p.alpha > 0.005);

  if (parts.length === 0) {
    const size = 80;
    bhpCanvas.width = size; bhpCanvas.height = size;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#888'; ctx.font = '9px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('no part', size/2, size/2);
    _applyHoverBg(0.5);
    return;
  }

  // Kiem tra tat ca anh co san chua — neu chua thi schedule retry (hieu nang: max 1 timer)
  const missingImgs = parts.filter(p => {
    const img = S.imgCache[p.bitmap];
    return !img || (!S.imgMissing[p.bitmap] && !img.complete);
  });
  if (missingImgs.length > 0) {
    // Hien thi spinner chu trong luc cho
    const size = 80;
    bhpCanvas.width = size; bhpCanvas.height = size;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#888'; ctx.font = '9px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('...', size/2, size/2);
    // Retry sau 200ms, reset cache key de force redraw
    _layerPreviewRetryTimer = setTimeout(() => {
      if (_hoverCurrentLayer === layerName && _hoverPreviewDiv && _hoverPreviewDiv.style.display !== 'none') {
        _hoverCurrentLayer = null; // reset de force redraw
        _drawLayerPreview(layerName, true);
      }
    }, 200);
    return;
  }

  const mainCanvas = document.getElementById('mainCanvas');
  const W = mainCanvas ? (mainCanvas.width || 390) : 390;
  const H = mainCanvas ? (mainCanvas.height || 390) : 390;

  // Tinh bounding box thuc te cua cac part tren canvas
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const part of parts) {
    const img = S.imgCache[part.bitmap];
    const szW = (img && img.naturalWidth > 0) ? img.naturalWidth  : (S.bitmaps[part.bitmap]?.w || 1);
    const szH = (img && img.naturalHeight > 0) ? img.naturalHeight : (S.bitmaps[part.bitmap]?.h || 1);
    const tx = part.x + W/2, ty = H/2 - part.y;
    const r = part.rot * Math.PI / 180;
    const cosR = Math.cos(r), sinR = Math.sin(r);
    const m = { a: part.sx*cosR, b: part.sx*sinR, c: -part.sy*sinR, d: part.sy*cosR, tx, ty };
    const ox = szW/2, oy = szH/2;
    const corners = [[-ox,-oy],[ox,-oy],[ox,oy],[-ox,oy]];
    for (const [lx, ly] of corners) {
      const px = m.a*lx + m.c*ly + m.tx;
      const py = m.b*lx + m.d*ly + m.ty;
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
  }

  const bbW = maxX - minX, bbH = maxY - minY;
  if (bbW <= 0 || bbH <= 0) { _applyHoverBg(0.5); return; }
  const { canvW, canvH } = _calcPreviewSize(bbW, bbH);

  bhpCanvas.width  = canvW;
  bhpCanvas.height = canvH;
  ctx.clearRect(0, 0, canvW, canvH);

  const PAD = 4;
  const scX = (canvW - PAD*2) / bbW;
  const scY = (canvH - PAD*2) / bbH;
  const sc  = Math.min(scX, scY);

  ctx.save();
  ctx.translate(canvW/2 - (minX + bbW/2)*sc, canvH/2 - (minY + bbH/2)*sc);
  ctx.scale(sc, sc);
  for (const part of parts) {
    if (typeof drawPartOnCtx === 'function') drawPartOnCtx(ctx, part, W, H, false);
  }
  ctx.restore();

  // Smart background: sample tu canvas da ve, dung offscreen nho (hieu nang)
  const SZ = 24;
  const tmp = document.createElement('canvas'); tmp.width = SZ; tmp.height = SZ;
  const tc = tmp.getContext('2d');
  tc.drawImage(bhpCanvas, 0, 0, SZ, SZ);
  const data = tc.getImageData(0, 0, SZ, SZ).data;
  let sum = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i+3]; if (a < 20) continue;
    const r2 = data[i]/255, g2 = data[i+1]/255, b2 = data[i+2]/255;
    sum += 0.2126*r2 + 0.7152*g2 + 0.0722*b2; count++;
  }
  _applyHoverBg(count === 0 ? 0.5 : sum/count);
}

function setupPartRowHover() {
  if (_hoverInitialized) return;
  _hoverInitialized = true;

  _hoverPreviewDiv = document.getElementById('bitmapHoverPreview');
  _hoverBhpCanvas  = document.getElementById('bhpCanvas');
  _hoverBhpLabel   = document.getElementById('bhpLabel');
  if (!_hoverPreviewDiv || !_hoverBhpCanvas) return;

  // Dùng position fixed + transform thay vì left/top để tránh reflow
  _hoverPreviewDiv.style.position = 'fixed';
  _hoverPreviewDiv.style.left = '0';
  _hoverPreviewDiv.style.top  = '0';
  _hoverPreviewDiv.style.willChange = 'transform';
  _hoverBhpCtx = _hoverBhpCanvas.getContext('2d');

  // 1 mousemove duy nhất – chỉ update tọa độ, throttle bằng rAF
  document.addEventListener('mousemove', (e) => {
    _hoverMouseX = e.clientX;
    _hoverMouseY = e.clientY;
    if (_hoverRafId) return;
    _hoverRafId = requestAnimationFrame(_hoverPositionUpdate);
  }, { passive: true });

  // 1 mouseover duy nhất – event delegation
  document.addEventListener('mouseover', (e) => {
    const row  = e.target.closest('.part-row');
    const item = !row && e.target.closest('.layer-item');

    if (row) {
      const bmp = row.dataset.bitmap;
      if (!bmp) return;
      _drawBitmapPreview(bmp);
      _hoverPreviewDiv.style.display = 'block';
    } else if (item) {
      const name = item.dataset.name;
      if (!name) return;
      _drawLayerPreview(name);
      _hoverPreviewDiv.style.display = 'block';
    } else if (!e.target.closest('#bitmapHoverPreview')) {
      _hoverPreviewDiv.style.display = 'none';
      _hoverCurrentBitmap = null;
      _hoverCurrentLayer  = null;
      // Huy retry timer neu dang cho anh load
      if (_layerPreviewRetryTimer) { clearTimeout(_layerPreviewRetryTimer); _layerPreviewRetryTimer = null; }
    }
  }, { passive: true });
}

function attachPartLockListeners() {
  document.querySelectorAll('.part-lock-btn').forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    const layerName = fresh.dataset.layer;
    const pi = parseInt(fresh.dataset.pi, 10);
    fresh.addEventListener('click', () => {
      togglePartLock(layerName, pi);
    });
  });

  document.querySelectorAll('.part-split-btn').forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', e => {
      e.stopPropagation();
      const layerName  = fresh.dataset.layer;
      const bitmapPath = fresh.dataset.bitmap;
      showSplitToast(fresh, layerName, bitmapPath);
    });
  });

  setupPartRowHover();
}

function togglePartLock(layerName, pi) {
  const key = layerName + '::' + pi;
  if (S.lockedParts.has(key)) {
    S.lockedParts.delete(key);
  } else {
    S.lockedParts.add(key);
  }
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  updatePartDragState();
}
function updatePartDragState() {
  document.querySelectorAll('.part-lock-btn').forEach(btn => {
    const layerName = btn.dataset.layer;
    const pi = parseInt(btn.dataset.pi, 10);
    const key = layerName + '::' + pi;
    const isLocked = S.lockedParts.has(key);
    const esc = CSS.escape(layerName);

    btn.classList.toggle('active', isLocked);
    btn.title = isLocked ? 'Mở khóa' : 'Khóa để chỉnh vị trí';
    btn.textContent = isLocked ? '🔒' : '🔓';

    const row = document.getElementById(`prow-${esc}-${pi}`);
    if (row) row.classList.toggle('locked', isLocked);

    const editor = document.getElementById(`ppe-${esc}-${pi}`);
    if (editor) editor.classList.toggle('open', isLocked);
  });
}
function ppeMarkChanged(input) { input.classList.add('changed'); }
function ppeWheel(e, escapedLayer, pi, axis) {
  e.preventDefault();
  const layerName = unescapeLayerName(escapedLayer);
  const inpEl = document.getElementById(`ppe-${axis}-${escapedLayer}-${pi}`);
  if (!inpEl) return;
  const step = e.shiftKey ? 5 : 0.5;
  const delta = e.deltaY > 0 ? -step : step;
  let val = parseFloat(inpEl.value) || 0;
  val = Math.round((val + delta) * 100) / 100;
  inpEl.value = val;
  inpEl.classList.add('changed');
  ppeApplyLive(layerName, pi, axis, val);
}
function ppeApplyLive(layerName, pi, axis, val) {
  if (!S.currentAnim) return;
  const curKfs = (S.timeline[S.currentAnim] || {})[layerName];
  const curKf  = curKfs ? getActiveKF(curKfs, S.currentTime) : null;
  const curVal = curKf?.parts?.[pi]?.[axis];
  if (curVal === undefined) return;
  const delta = val - curVal;
  if (delta === 0) return;

  if (!S._ppeUndoPending) {
    pushUndo(`Chỉnh vị trí bitmap`);
    S._ppeUndoPending = true;
    setTimeout(() => { S._ppeUndoPending = false; }, 800);
  }

  const targets = [layerName];
  if (S._similarLayers?.length) {
    const sel = S.similarLayerSelected;
    if (sel === 'all') {
      targets.push(...S._similarLayers);
    } else if (sel !== 'none' && sel !== layerName) {
      targets.push(sel);
    }
  }

  for (const tLayer of targets) {
    for (const aname of Object.keys(S.timeline)) {
      const kfs = (S.timeline[aname] || {})[tLayer];
      if (!kfs) continue;
      for (const kf of kfs) {
        if (!kf.parts?.[pi]) continue;
        kf.parts[pi][axis] += delta;
      }
    }
  }

  markDirty();
  renderFrame(S.currentAnim, S.currentTime);
  const esc = CSS.escape(layerName);
  const valEl = document.getElementById(`pval-${axis}-${esc}-${pi}`);
  if (valEl) valEl.textContent = val.toFixed(1);
}
function ppeSave(escapedLayer, pi) {
  const layerName = unescapeLayerName(escapedLayer);
  const inpX = document.getElementById(`ppe-x-${escapedLayer}-${pi}`);
  const inpY = document.getElementById(`ppe-y-${escapedLayer}-${pi}`);
  if (!inpX || !inpY) return;
  const newX = parseFloat(inpX.value);
  const newY = parseFloat(inpY.value);
  if (isNaN(newX) || isNaN(newY)) return;

  const curKfs = (S.timeline[S.currentAnim] || {})[layerName];
  const curKf  = curKfs ? getActiveKF(curKfs, S.currentTime) : null;
  const curX = curKf?.parts?.[pi]?.x;
  const curY = curKf?.parts?.[pi]?.y;
  if (curX === undefined || curY === undefined) return;
  const dX = newX - curX;
  const dY = newY - curY;

  const targets = [layerName];
  if (S._similarLayers?.length) {
    const sel = S.similarLayerSelected;
    if (sel === 'all') targets.push(...S._similarLayers);
    else if (sel !== 'none' && sel !== layerName) targets.push(sel);
  }

  for (const tLayer of targets) {
    for (const aname of Object.keys(S.timeline)) {
      const kfs = (S.timeline[aname] || {})[tLayer];
      if (!kfs) continue;
      for (const kf of kfs) {
        if (!kf.parts?.[pi]) continue;
        kf.parts[pi].x += dX;
        kf.parts[pi].y += dY;
      }
    }
  }

  inpX.classList.remove('changed');
  inpY.classList.remove('changed');
  markDirty();
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);

  const btn = document.querySelector(`#prow-${escapedLayer}-${pi} .ppe-save-btn`);
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Đã lưu!';
    btn.style.background = 'linear-gradient(135deg,var(--grn),var(--acc))';
    setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 900);
  }
}