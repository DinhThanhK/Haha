// anim-rename.js – Đổi tên animation (double-click để rename)
'use strict';

/**
 * Đổi tên một animation trong toàn bộ state S.
 * Cập nhật: S.animNames, S.animations, S.timeline, S.animEvents,
 *           S.animHiddenLayers, S.currentAnim, export checklist, anim buttons.
 *
 * @param {string} oldName  Tên cũ
 * @param {string} newName  Tên mới (đã trim)
 * @returns {boolean}  true nếu rename thành công
 */
function renameAnimation(oldName, newName) {
  newName = newName.trim();

  // --- Validation ---
  if (!newName) {
    showRenameError('Tên không được để trống.');
    return false;
  }
  if (newName === oldName) return false; // không đổi gì
  if (S.animNames.includes(newName)) {
    showRenameError(`Animation "${newName}" đã tồn tại.`);
    return false;
  }
  if (!/^[a-zA-Z0-9_\-\s\.]+$/.test(newName)) {
    showRenameError('Tên chỉ được chứa chữ, số, dấu gạch, khoảng trắng hoặc dấu chấm.');
    return false;
  }

  // --- Undo support ---
  pushUndo(`Đổi tên animation "${oldName}" → "${newName}"`);

  // 1. animNames
  const idx = S.animNames.indexOf(oldName);
  if (idx !== -1) S.animNames[idx] = newName;

  // 2. animations object
  if (S.animations[oldName] !== undefined) {
    S.animations[newName] = S.animations[oldName];
    delete S.animations[oldName];
  }

  // 3. timeline
  if (S.timeline[oldName] !== undefined) {
    S.timeline[newName] = S.timeline[oldName];
    delete S.timeline[oldName];
  }

  // 4. animEvents
  if (S.animEvents && S.animEvents[oldName] !== undefined) {
    S.animEvents[newName] = S.animEvents[oldName];
    delete S.animEvents[oldName];
  }

  // 5. animHiddenLayers
  if (S.animHiddenLayers && S.animHiddenLayers[oldName] !== undefined) {
    S.animHiddenLayers[newName] = S.animHiddenLayers[oldName];
    delete S.animHiddenLayers[oldName];
  }

  // 6. alphaOverrides (per-anim key bên trong mỗi layer)
  if (S.alphaOverrides) {
    for (const layerName in S.alphaOverrides) {
      const ao = S.alphaOverrides[layerName];
      if (ao && ao[oldName] !== undefined) {
        ao[newName] = ao[oldName];
        delete ao[oldName];
      }
    }
  }

  // 7. offsets (nếu có key theo animName)
  if (S.offsets) {
    for (const layerName in S.offsets) {
      const off = S.offsets[layerName];
      if (off && typeof off === 'object' && off[oldName] !== undefined) {
        off[newName] = off[oldName];
        delete off[oldName];
      }
    }
  }

  // 8. currentAnim
  if (S.currentAnim === oldName) S.currentAnim = newName;

  // --- Rebuild UI ---
  _rebuildAnimListPreservingOrder();
  buildExportPanel();

  // Cập nhật animLabel
  const labelEl = $('animLabel');
  if (labelEl && labelEl.textContent === oldName) labelEl.textContent = newName;

  // Cập nhật feAnimLabel nếu có
  const feLabel = $('feAnimLabel');
  if (feLabel && feLabel.textContent === oldName) feLabel.textContent = newName;

  // Cập nhật frame-events panel
  if (typeof updateEventAnimLabel === 'function') updateEventAnimLabel();
  if (typeof refreshEventPanel === 'function') refreshEventPanel();

  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();

  setStatus(`✓ Đổi tên: "${oldName}" → "${newName}"`, 'ok');
  return true;
}

/**
 * Rebuild danh sách anim buttons, giữ nguyên thứ tự S.animNames,
 * và attach double-click để rename.
 */
function _rebuildAnimListPreservingOrder() {
  const list = $('animList');
  list.innerHTML = '';

  for (const name of S.animNames) {
    const anim = S.animations[name];
    const btn  = document.createElement('button');
    btn.className    = 'anim-btn';
    btn.dataset.name = name;

    const dot      = document.createElement('span');
    dot.className  = 'anim-dot';

    const nameSpan = document.createElement('span');
    nameSpan.className   = 'anim-name-label';
    nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis';
    nameSpan.textContent = name;

    const metaSpan = document.createElement('span');
    metaSpan.className   = 'anim-meta';
    metaSpan.textContent = `${anim.frameCount}f·${anim.duration.toFixed(2)}s`;

    btn.appendChild(dot);
    btn.appendChild(nameSpan);
    btn.appendChild(metaSpan);

    // Single-click → chọn animation
    btn.addEventListener('click', (e) => {
      // Nếu đang trong rename input, ignore click
      if (e.target.tagName === 'INPUT') return;
      selectAnim(name);
    });

    // Double-click trên nameSpan → bắt đầu rename
    nameSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      _startInlineRename(btn, name, nameSpan, metaSpan);
    });

    // Mark active nếu đang chọn
    if (S.currentAnim === name) btn.classList.add('active');

    list.appendChild(btn);
  }
}

/**
 * Bắt đầu inline rename: thay nameSpan bằng input.
 */
function _startInlineRename(btn, currentName, nameSpan, metaSpan) {
  // Tránh mở 2 rename cùng lúc
  if (btn.querySelector('.anim-rename-input')) return;

  const input = document.createElement('input');
  input.type        = 'text';
  input.value       = currentName;
  input.className   = 'anim-rename-input';
  input.title       = 'Enter để xác nhận · Esc để huỷ';
  input.style.cssText = `
    flex:1;min-width:0;font-size:10px;font-family:inherit;
    background:var(--sur2,#1a1a2e);color:var(--txt,#e0e0ff);
    border:1px solid var(--acc,#7c6df8);border-radius:3px;
    padding:1px 4px;outline:none;
  `;

  // Ẩn nameSpan, chèn input vào vị trí của nó
  nameSpan.style.display = 'none';
  btn.insertBefore(input, metaSpan);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim();
    input.remove();
    nameSpan.style.display = '';
    if (newName && newName !== currentName) {
      renameAnimation(currentName, newName);
    }
  };

  const cancel = () => {
    input.remove();
    nameSpan.style.display = '';
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    e.stopPropagation(); // Không trigger hotkey khác
  });

  input.addEventListener('blur', () => {
    // Delay nhỏ để tránh blur khi click cancel button
    setTimeout(() => {
      if (document.body.contains(input)) commit();
    }, 150);
  });

  // Click bên ngoài → commit
  input.addEventListener('click', (e) => e.stopPropagation());
}

/**
 * Hiển thị thông báo lỗi nhỏ gần animList.
 */
function showRenameError(msg) {
  let el = $('animRenameError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'animRenameError';
    el.style.cssText = `
      font-size:9px;color:var(--red,#ff4466);padding:3px 12px;
      background:var(--bg2,#0d0d1a);border-top:1px solid var(--red,#ff4466);
      animation:fadeIn .15s ease;
    `;
    const animList = $('animList');
    if (animList) animList.parentNode.insertBefore(el, animList.nextSibling);
  }
  el.textContent = '⚠ ' + msg;
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el && el.remove(), 3000);
}

/**
 * Override buildAnimList để luôn dùng phiên bản có rename support.
 * Gọi sau khi tất cả script khác đã load.
 */
function _patchBuildAnimList() {
  // Lưu bản gốc để dùng lại nếu cần
  if (typeof buildAnimList === 'function') {
    window._origBuildAnimList = buildAnimList;
  }
  window.buildAnimList = _rebuildAnimListPreservingOrder;
}

// Chạy patch sau khi DOM sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _patchBuildAnimList);
} else {
  _patchBuildAnimList();
}
