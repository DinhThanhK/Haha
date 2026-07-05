// edit-mode.js – Chế độ chỉnh sửa offset, lock part, drag (hỗ trợ multi-layer + similar layers)
'use strict';

// ── Toast notification ────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, type = 'ok') {
  let toast = document.getElementById('editToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'editToast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'edit-toast ' + type;
  toast.style.opacity = '1';
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
}

// ── Setup ─────────────────────────────────────────────────────────────────────
function setupEditMode() {
  $('editToggle').onclick = () => {
    S.editMode = !S.editMode;
    $('editToggle').classList.toggle('on', S.editMode);
    canvas.classList.toggle('edit-mode', S.editMode);
    if (S.editMode) {
      $('editCard').classList.add('visible');
      $('editToggle').textContent = '✏ Edit ON';
    } else {
      $('editCard').classList.remove('visible');
      $('editToggle').textContent = '✏ Edit';
      canvas.classList.remove('edit-hover');
    }
  };

  const addWheelSupport = (inputId) => {
    const input = $(inputId);
    input.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = e.shiftKey ? 1.0 : 0.5;
      const delta = e.deltaY > 0 ? -step : step;
      let val = parseFloat(input.value) || 0;
      val = Math.round((val + delta) * 100) / 100;
      input.value = val;
      applyOffsetLive();
    }, { passive: false });
  };
  addWheelSupport('editDX');
  addWheelSupport('editDY');

  // Wheel support for alpha — smaller step
  const alphaInput = $('editDA');
  alphaInput.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = e.shiftKey ? 0.1 : 0.05;
    const delta = e.deltaY > 0 ? -step : step;
    let val = parseFloat(alphaInput.value) || 0;
    val = Math.max(-1, Math.min(1, Math.round((val + delta) * 100) / 100));
    alphaInput.value = val;
    applyAlphaLive();
  }, { passive: false });

  ['editDX', 'editDY'].forEach(id => {
    $(id).addEventListener('input', () => applyOffsetLive());
  });
  $('editDA').addEventListener('input', () => applyAlphaLive());

  $('resetOffsetBtn').onclick = resetLayerOffset;
  $('resetAlphaBtn').onclick  = resetLayerAlpha;

  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('mousemove', onCanvasHover);
  canvas.addEventListener('mouseleave', () => {
    $('canvasHitTooltip').style.display = 'none';
  });

  setupCanvasDrag();
}

// Debounce timer và flag cho undo khi dùng input DX/DY
let _offsetLiveUndoPending = false;

// ── Apply offset live (auto, no button) ──────────────────────────────────────
function applyOffsetLive() {
  if (!S.editLayer) return;
  const layerName = S.editLayer;

  const targetDX = parseFloat($('editDX').value) || 0;
  const targetDY = parseFloat($('editDY').value) || 0;

  const prev = S.offsets[layerName] || { dx: 0, dy: 0 };
  const dx = targetDX - prev.dx;
  const dy = targetDY - prev.dy;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    $('editDX').classList.toggle('changed', targetDX !== 0);
    $('editDY').classList.toggle('changed', targetDY !== 0);
    return;
  }

  if (!_offsetLiveUndoPending) {
    pushUndo(`Chỉnh offset layer "${layerName}"`);
    _offsetLiveUndoPending = true;
    setTimeout(() => { _offsetLiveUndoPending = false; }, 1000);
  }

  applyDeltaToLayer(layerName, dx, dy);
  S.offsets[layerName] = { dx: targetDX, dy: targetDY };

  const similarUpdated = applySimilarLayerDelta(layerName, dx, dy);

  markDirty();
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  refreshDeltaPreview();

  $('editDX').classList.toggle('changed', targetDX !== 0);
  $('editDY').classList.toggle('changed', targetDY !== 0);

  if (similarUpdated.length > 0) {
    showToast(
      `✓ Đã cập nhật vị trí layer "${layerName}" và ${similarUpdated.length} layer tương tự: ${similarUpdated.slice(0,3).join(', ')}${similarUpdated.length > 3 ? '...' : ''}`,
      'ok'
    );
  }
}

function applyDeltaToLayer(layerName, dx, dy) {
  for (const aname of Object.keys(S.timeline)) {
    const kfs = (S.timeline[aname] || {})[layerName];
    if (!kfs) continue;
    for (const kf of kfs) {
      if (!kf.parts) continue;
      for (const part of kf.parts) {
        part.x += dx;
        part.y += dy;
      }
    }
  }
}

function applySimilarLayerDelta(sourceLayer, dx, dy) {
  const updated = [];
  if (!S._similarLayers?.length) return updated;
  const sel = S.similarLayerSelected;
  const targets = sel === 'all' ? S._similarLayers : (sel !== sourceLayer ? [sel] : []);
  for (const tLayer of targets) {
    applyDeltaToLayer(tLayer, dx, dy);
    if (!S.offsets[tLayer]) S.offsets[tLayer] = { dx: 0, dy: 0 };
    S.offsets[tLayer].dx += dx;
    S.offsets[tLayer].dy += dy;
    updated.push(tLayer);
  }
  return updated;
}

// ── Canvas interaction ────────────────────────────────────────────────────────
function canvasToLogical(cx, cy) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: cx * scaleX, y: cy * scaleY };
}

function onCanvasClick(e) {
  if (S.editMode) return;
  const rect = canvas.getBoundingClientRect();
  const { x, y } = canvasToLogical(e.clientX - rect.left, e.clientY - rect.top);
  const hit = hitTestLayers(x, y);
  if (hit) {
    highlightLayer(hit);
    spawnHitRing(e.clientX, e.clientY);
    swTab('info');
  }
}

function onCanvasHover(e) {
  if (S._dragging) return;
  const rect = canvas.getBoundingClientRect();
  const { x, y } = canvasToLogical(e.clientX - rect.left, e.clientY - rect.top);
  const hit = hitTestLayers(x, y);

  if (S.editMode) {
    canvas.classList.toggle('edit-hover', !!hit);
  } else {
    canvas.style.cursor = hit ? 'pointer' : '';
  }

  const tooltip = $('canvasHitTooltip');
  if (hit) {
    tooltip.textContent = '📌 ' + hit;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top  = (e.clientY - 10) + 'px';
  } else {
    tooltip.style.display = 'none';
  }
}

function setupCanvasDrag() {
  canvas.addEventListener('mousedown', onCanvasMouseDown);
  window.addEventListener('mousemove', onCanvasMouseDrag);
  window.addEventListener('mouseup',   onCanvasMouseUp);
}

function onCanvasMouseDown(e) {
  if (e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  const { x, y } = canvasToLogical(e.clientX - rect.left, e.clientY - rect.top);

  // === MULTI-LAYER DRAG: Kéo tất cả các layer đã khóa (lockedMoveLayers) + similar layers của chúng ===
  if (S.lockedMoveLayers && S.lockedMoveLayers.size > 0 && S.editMode && S.currentAnim) {
    const animTL = S.timeline[S.currentAnim] || {};
    // Tìm layer khóa đầu tiên bị click (để xác định có nên kéo hay không)
    let hitLockedLayer = null;
    for (const lockedName of S.lockedMoveLayers) {
      if (S.hiddenLayers.has(lockedName)) continue;
      const kfs = animTL[lockedName];
      const kf  = kfs ? getActiveKF(kfs, S.currentTime) : null;
      const parts = kf?.parts || [];
      let hit = false;
      for (const part of parts) {
        if (pointInPart(x, y, part, canvas.width, canvas.height)) { hit = true; break; }
      }
      if (hit) { hitLockedLayer = lockedName; break; }
    }
    if (hitLockedLayer) {
      // Lấy tất cả các lockedMoveLayers có dữ liệu ở frame hiện tại
      const allDragLayers = [...S.lockedMoveLayers].filter(layerName => {
        const kfs = animTL[layerName];
        const kf = kfs ? getActiveKF(kfs, S.currentTime) : null;
        return kf?.parts?.length > 0;
      });
      if (allDragLayers.length > 0) {
        // Mở rộng danh sách: thêm các similar layers cho từng locked layer
        const finalDragLayers = new Set();
        for (const layerName of allDragLayers) {
          finalDragLayers.add(layerName);
          const similar = getSimilarLayers(layerName);
          if (similar.length) {
            if (S.similarLayerSelected === 'all') {
              similar.forEach(s => finalDragLayers.add(s));
            } else if (S.similarLayerSelected !== layerName && similar.includes(S.similarLayerSelected)) {
              finalDragLayers.add(S.similarLayerSelected);
            }
          }
        }
        S._dragLayers = [...finalDragLayers];
        S._dragging = true;
        S._dragStartX = e.clientX;
        S._dragStartY = e.clientY;
        canvas.classList.add('layer-drag');
        e.preventDefault();
        return;
      }
    }
  }

  // === LOCKED BITMAP DRAG (kéo nhiều bitmap đã khóa cùng lúc) ===
  if (S.lockedParts.size > 0 && S.currentAnim) {
    for (const key of S.lockedParts) {
      const sep = key.lastIndexOf('::');
      const layerName = key.slice(0, sep);
      const partIndex = parseInt(key.slice(sep + 2), 10);
      if (S.hiddenLayers.has(layerName)) continue;
      const kfs = (S.timeline[S.currentAnim] || {})[layerName];
      const kf  = kfs ? getActiveKF(kfs, S.currentTime) : null;
      const part = kf?.parts?.[partIndex];
      if (part && pointInPart(x, y, part, canvas.width, canvas.height)) {
        pushUndo('Di chuyển bitmap');
        S._partDragging = true;
        S._partDragLayer = layerName;
        S._partDragIndex = partIndex;
        S._dragStartX = e.clientX;
        S._dragStartY = e.clientY;
        canvas.classList.add('layer-drag');
        e.preventDefault();
        return;
      }
    }
  }

  // === SINGLE LAYER DRAG (edit mode, không khóa hoặc chỉ có 1 layer khóa) ===
  const hit = hitTestLayers(x, y);
  if (!hit) return;
  if (!S.editMode) return;

  selectEditLayer(hit);
  pushUndo(`Di chuyển layer "${hit}"`);
  S._dragging  = true;
  S._dragLayer = hit;
  S._dragStartX = e.clientX;
  S._dragStartY = e.clientY;
  canvas.classList.add('layer-drag');
  e.preventDefault();
}

function onCanvasMouseDrag(e) {
  // ── Part drag: di chuyển TẤT CẢ locked bitmaps cùng lúc ──
  if (S._partDragging) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const rawDX = (e.clientX - S._dragStartX) * scaleX;
    const rawDY = (e.clientY - S._dragStartY) * scaleY;
    S._dragStartX = e.clientX;
    S._dragStartY = e.clientY;
    const dx = rawDX;
    const dy = -rawDY;

    const movedParts = [];
    for (const key of S.lockedParts) {
      const sep = key.lastIndexOf('::');
      const layerName = key.slice(0, sep);
      const pi = parseInt(key.slice(sep + 2), 10);

      const targets = [layerName];
      if (S._similarLayers?.length) {
        const sel = S.similarLayerSelected;
        if (sel === 'all') targets.push(...S._similarLayers);
        else if (sel !== layerName) targets.push(sel);
      }

      for (const tLayer of targets) {
        for (const aname of Object.keys(S.timeline)) {
          const kfs = (S.timeline[aname] || {})[tLayer];
          if (!kfs) continue;
          for (const kf of kfs) {
            if (!kf.parts?.[pi]) continue;
            kf.parts[pi].x += dx;
            kf.parts[pi].y += dy;
          }
        }
      }
      movedParts.push({ layerName, pi });
    }

    markDirty();
    if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);

    for (const { layerName, pi } of movedParts) {
      if (!S.currentAnim) continue;
      const kfs = (S.timeline[S.currentAnim] || {})[layerName];
      const kf  = kfs ? getActiveKF(kfs, S.currentTime) : null;
      const part = kf?.parts?.[pi];
      if (!part) continue;
      const esc = CSS.escape(layerName);
      const inpX = document.getElementById(`ppe-x-${esc}-${pi}`);
      const inpY = document.getElementById(`ppe-y-${esc}-${pi}`);
      if (inpX) inpX.value = part.x.toFixed(2);
      if (inpY) inpY.value = part.y.toFixed(2);
      const vx = document.getElementById(`pval-x-${esc}-${pi}`);
      const vy = document.getElementById(`pval-y-${esc}-${pi}`);
      if (vx) vx.textContent = part.x.toFixed(1);
      if (vy) vy.textContent = part.y.toFixed(1);
    }
    return;
  }

  // ── MULTI-LAYER DRAG: di chuyển tất cả layer trong S._dragLayers (bao gồm cả similar) ──
  if (S._dragLayers && S._dragLayers.length > 0) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const rawDX = (e.clientX - S._dragStartX) * scaleX;
    const rawDY = (e.clientY - S._dragStartY) * scaleY;
    S._dragStartX = e.clientX;
    S._dragStartY = e.clientY;
    const dx = rawDX;
    const dy = -rawDY;

    for (const layerName of S._dragLayers) {
      applyDeltaToLayer(layerName, dx, dy);
      if (!S.offsets[layerName]) S.offsets[layerName] = { dx: 0, dy: 0 };
      S.offsets[layerName].dx += dx;
      S.offsets[layerName].dy += dy;
    }

    markDirty();
    if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);

    if (S.editLayer && S._dragLayers.includes(S.editLayer)) {
      const off = S.offsets[S.editLayer];
      $('editDX').value = off.dx.toFixed(2);
      $('editDY').value = off.dy.toFixed(2);
      $('editDX').classList.toggle('changed', off.dx !== 0);
      $('editDY').classList.toggle('changed', off.dy !== 0);
      refreshDeltaPreview();
    }
    return;
  }

  // ── SINGLE LAYER DRAG (edit mode) ──
  if (!S._dragging || !S._dragLayer) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;

  const rawDX = (e.clientX - S._dragStartX) * scaleX;
  const rawDY = (e.clientY - S._dragStartY) * scaleY;
  S._dragStartX = e.clientX;
  S._dragStartY = e.clientY;

  const dx = rawDX;
  const dy = -rawDY;
  const layerName = S._dragLayer;

  applyDeltaToLayer(layerName, dx, dy);
  if (!S.offsets[layerName]) S.offsets[layerName] = { dx: 0, dy: 0 };
  S.offsets[layerName].dx += dx;
  S.offsets[layerName].dy += dy;

  applySimilarLayerDelta(layerName, dx, dy);

  markDirty();
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);

  if (S.editLayer === layerName) {
    const off = S.offsets[layerName];
    $('editDX').value = off.dx.toFixed(2);
    $('editDY').value = off.dy.toFixed(2);
    $('editDX').classList.toggle('changed', off.dx !== 0);
    $('editDY').classList.toggle('changed', off.dy !== 0);
    refreshDeltaPreview();
  }
}

function onCanvasMouseUp(e) {
  // ── Kết thúc part drag ──
  if (S._partDragging) {
    S._partDragging = false;

    const partNames = [];
    for (const key of S.lockedParts) {
      const sep = key.lastIndexOf('::');
      const layerName = key.slice(0, sep);
      const pi = parseInt(key.slice(sep + 2), 10);
      if (S.currentAnim) {
        const kfs = (S.timeline[S.currentAnim] || {})[layerName];
        const kf  = kfs ? getActiveKF(kfs, S.currentTime) : null;
        const bmpName = kf?.parts?.[pi]?.bitmap?.split('/').pop() || `part${pi}`;
        partNames.push(bmpName);
      }
    }
    const hasSimilar = S._similarLayers?.length > 0;
    const simLabel = !hasSimilar ? '' :
      S.similarLayerSelected === 'all'
        ? ` và ${S._similarLayers.length} layer tương tự`
        : ` và layer "${S.similarLayerSelected}"`;
    if (partNames.length > 0) {
      showToast(`✓ Đã di chuyển bitmap: ${partNames.join(', ')}${simLabel}`, 'ok');
    }

    S._partDragLayer = null;
    S._partDragIndex = undefined;
    canvas.classList.remove('layer-drag');
    spawnHitRing(e.clientX, e.clientY);
    return;
  }

  // ── Kết thúc multi-layer drag ──
  if (S._dragLayers && S._dragLayers.length > 0) {
    const count = S._dragLayers.length;
    showToast(`✓ Đã di chuyển ${count} layer (bao gồm cả similar) cùng lúc`, 'ok');
    S._dragLayers = null;
    canvas.classList.remove('layer-drag');
    spawnHitRing(e.clientX, e.clientY);
    return;
  }

  // ── Kết thúc single layer drag ──
  if (!S._dragging) return;
  S._dragging = false;
  canvas.classList.remove('layer-drag');
  if (S._dragLayer) {
    const layerName = S._dragLayer;
    spawnHitRing(e.clientX, e.clientY);
    const off = S.offsets[layerName] || { dx: 0, dy: 0 };
    if ($('editDX')) { $('editDX').value = off.dx.toFixed(2); $('editDX').classList.toggle('changed', off.dx !== 0); }
    if ($('editDY')) { $('editDY').value = off.dy.toFixed(2); $('editDY').classList.toggle('changed', off.dy !== 0); }
    refreshDeltaPreview();
    markDirty();

    const hasSimilar = S._similarLayers?.length > 0;
    const simLabel = !hasSimilar ? '' :
      S.similarLayerSelected === 'all'
        ? ` và ${S._similarLayers.length} layer tương tự`
        : ` và layer "${S.similarLayerSelected}"`;
    showToast(`✓ Đã cập nhật vị trí layer "${layerName}"${simLabel}`, 'ok');

    S._dragLayer = null;
  }
}

function spawnHitRing(clientX, clientY) {
  const ring = document.createElement('div');
  ring.className = 'hit-ring';
  ring.style.left = clientX + 'px';
  ring.style.top  = clientY + 'px';
  document.body.appendChild(ring);
  setTimeout(() => ring.remove(), 400);
}

function selectEditLayer(name) {
  S.editLayer = name;
  $('editLayerName').textContent = '📌 ' + name;
  const off = S.offsets[name] || { dx: 0, dy: 0 };
  $('editDX').value = off.dx.toFixed(2);
  $('editDY').value = off.dy.toFixed(2);
  $('editDX').classList.toggle('changed', off.dx !== 0);
  $('editDY').classList.toggle('changed', off.dy !== 0);

  // Load alpha override cho layer này
  const ao = (S.alphaOverrides && S.alphaOverrides[name]) || {};
  const scope = $('editAlphaScope').value || 'all';
  const deltaA = (ao[scope] !== undefined) ? ao[scope] : (ao['all'] !== undefined ? ao['all'] : 0);
  $('editDA').value = deltaA.toFixed(2);
  $('editDA').classList.toggle('changed', deltaA !== 0);

  highlightLayer(name);
  refreshDeltaPreview();
  swTab('info');
}

function refreshDeltaPreview() {
  const el = $('deltaPreview');
  if (!el) return;
  if (!S.editLayer) {
    el.innerHTML = 'Chọn layer để xem preview';
    return;
  }
  const off = S.offsets[S.editLayer] || { dx: 0, dy: 0 };
  const ao  = (S.alphaOverrides && S.alphaOverrides[S.editLayer]) || {};
  const scope = $('editAlphaScope')?.value || 'all';
  const deltaA = (ao[scope] !== undefined) ? ao[scope] : (ao['all'] !== undefined ? ao['all'] : 0);
  const hasSimilar = S._similarLayers?.length > 0;
  const simInfo = hasSimilar
    ? `<br>Similar: <span class="dc">${S.similarLayerSelected === 'all' ? S._similarLayers.length + ' layers' : S.similarLayerSelected}</span>`
    : '';
  const alphaInfo = deltaA !== 0 ? ` · <span style="color:var(--acc2)">Δα=${deltaA.toFixed(2)}</span>` : '';
  el.innerHTML = `Layer: <span class="dc">${S.editLayer}</span><br>Offset: <span class="dv">Δx=${off.dx.toFixed(2)}, Δy=${off.dy.toFixed(2)}</span>${alphaInfo}${simInfo}`;
}

function resetLayerOffset() {
  if (!S.editLayer) return;
  const layerName = S.editLayer;
  const off = S.offsets[layerName];
  if (!off || (off.dx === 0 && off.dy === 0)) return;

  applyDeltaToLayer(layerName, -off.dx, -off.dy);
  S.offsets[layerName] = { dx: 0, dy: 0 };
  $('editDX').value = 0; $('editDY').value = 0;
  $('editDX').classList.remove('changed');
  $('editDY').classList.remove('changed');
  refreshDeltaPreview();
  markDirty();
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  showToast(`↩ Đã reset layer "${layerName}" về vị trí gốc`, 'warn');
}

// ── Alpha override functions ─────────────────────────────────────────────────
let _alphaLiveUndoPending = false;

function applyAlphaLive() {
  if (!S.editLayer) return;
  const layerName = S.editLayer;
  const scope = $('editAlphaScope').value || 'all';
  const targetDA = Math.max(-1, Math.min(1, parseFloat($('editDA').value) || 0));

  if (!S.alphaOverrides) S.alphaOverrides = {};
  if (!S.alphaOverrides[layerName]) S.alphaOverrides[layerName] = {};

  const prev = S.alphaOverrides[layerName][scope] || 0;
  if (Math.abs(targetDA - prev) < 0.001) {
    $('editDA').classList.toggle('changed', targetDA !== 0);
    return;
  }

  if (!_alphaLiveUndoPending) {
    pushUndo(`Chỉnh alpha layer "${layerName}"`);
    _alphaLiveUndoPending = true;
    setTimeout(() => { _alphaLiveUndoPending = false; }, 1000);
  }

  S.alphaOverrides[layerName][scope] = targetDA;
  $('editDA').classList.toggle('changed', targetDA !== 0);

  markDirty();
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  refreshDeltaPreview();
}

function resetLayerAlpha() {
  if (!S.editLayer) return;
  const layerName = S.editLayer;
  if (!S.alphaOverrides || !S.alphaOverrides[layerName]) return;
  S.alphaOverrides[layerName] = {};
  $('editDA').value = 0;
  $('editDA').classList.remove('changed');
  refreshDeltaPreview();
  markDirty();
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  showToast(`↩ Đã reset alpha layer "${layerName}"`, 'warn');
}

// Thêm vào cuối edit-mode.js (sau resetLayerOffset)
function unlockAllLockedBitmaps() {
  if (!S.lockedParts || S.lockedParts.size === 0) return;
  const count = S.lockedParts.size;
  S.lockedParts.clear();
  // Cập nhật giao diện các nút lock
  document.querySelectorAll('.part-lock-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.textContent = '🔓';
    btn.title = 'Khóa để chỉnh vị trí';
    const row = btn.closest('.part-row');
    if (row) row.classList.remove('locked');
    const editor = row?.querySelector('.part-pos-editor');
    if (editor) editor.classList.remove('open');
  });
  // Xóa highlight khóa trên canvas
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();
  showToast(`✓ Đã mở khóa tất cả bitmap (${count} cũ)`, 'ok');
}