// anim-merge.js – Gộp 2 animation thành 1 animation mới
'use strict';

// ── Modal HTML ────────────────────────────────────────────────────────────────
function _buildMergeModalHTML() {
  return `
  <div id="animMergeOverlay" style="
    position:fixed;inset:0;background:#00000088;z-index:9000;
    display:flex;align-items:center;justify-content:center;
    animation:fadeIn .15s ease;
  ">
    <div style="
      background:var(--bg2,#0d0d1a);border:1px solid var(--acc,#7c6df8);
      border-radius:10px;padding:18px 22px;min-width:320px;max-width:420px;
      box-shadow:0 8px 40px #0009;display:flex;flex-direction:column;gap:12px;
    ">
      <div style="font-size:13px;font-weight:700;color:var(--acc,#7c6df8)">
        🔗 Gộp 2 Animation
      </div>

      <!-- Anim A -->
      <div>
        <div style="font-size:10px;color:var(--mut2);margin-bottom:4px">Animation đầu tiên (A)</div>
        <select id="mergeAnimA" style="
          width:100%;background:var(--sur2,#1a1a2e);color:var(--txt);
          border:1px solid var(--bdr);border-radius:5px;padding:5px 8px;
          font-size:11px;cursor:pointer;
        "></select>
      </div>

      <!-- Anim B -->
      <div>
        <div style="font-size:10px;color:var(--mut2);margin-bottom:4px">Animation thứ hai (B) — ghép nối tiếp sau A</div>
        <select id="mergeAnimB" style="
          width:100%;background:var(--sur2,#1a1a2e);color:var(--txt);
          border:1px solid var(--bdr);border-radius:5px;padding:5px 8px;
          font-size:11px;cursor:pointer;
        "></select>
      </div>

      <!-- Preview info -->
      <div id="mergePreviewInfo" style="
        background:var(--sur,#111127);border-radius:6px;padding:8px 10px;
        font-size:10px;color:var(--mut2);line-height:1.7;
      ">—</div>

      <!-- Tên mới -->
      <div>
        <div style="font-size:10px;color:var(--mut2);margin-bottom:4px">Tên animation mới</div>
        <input id="mergeNewName" type="text" placeholder="ví dụ: idle_to_run" maxlength="80" style="
          width:100%;box-sizing:border-box;
          background:var(--sur2,#1a1a2e);color:var(--txt);
          border:1px solid var(--bdr);border-radius:5px;padding:5px 8px;
          font-size:11px;outline:none;
        ">
        <div id="mergeNameError" style="font-size:9px;color:var(--red,#ff4466);margin-top:3px;display:none"></div>
      </div>

      <!-- Buttons -->
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button id="mergeCancelBtn" style="
          background:transparent;color:var(--mut2);border:1px solid var(--bdr);
          border-radius:5px;padding:5px 14px;font-size:11px;cursor:pointer;
        ">Hủy</button>
        <button id="mergeConfirmBtn" style="
          background:var(--acc,#7c6df8);color:#fff;border:none;
          border-radius:5px;padding:5px 16px;font-size:11px;
          cursor:pointer;font-weight:600;
        ">🔗 Gộp</button>
      </div>
    </div>
  </div>`;
}

// ── Open modal ────────────────────────────────────────────────────────────────
function openMergeAnimModal() {
  if (S.animNames.length < 2) {
    showToast('Cần ít nhất 2 animation để gộp!', 'warn');
    return;
  }

  // Xóa modal cũ nếu có
  const old = document.getElementById('animMergeOverlay');
  if (old) old.remove();

  document.body.insertAdjacentHTML('beforeend', _buildMergeModalHTML());

  const selA    = document.getElementById('mergeAnimA');
  const selB    = document.getElementById('mergeAnimB');
  const nameIn  = document.getElementById('mergeNewName');
  const preview = document.getElementById('mergePreviewInfo');
  const nameErr = document.getElementById('mergeNameError');

  // Populate selects
  for (const name of S.animNames) {
    const optA = document.createElement('option');
    optA.value = optA.textContent = name;
    selA.appendChild(optA);

    const optB = document.createElement('option');
    optB.value = optB.textContent = name;
    selB.appendChild(optB);
  }

  // Default: A = current, B = next
  if (S.currentAnim) selA.value = S.currentAnim;
  const idxA = S.animNames.indexOf(selA.value);
  selB.value = S.animNames[(idxA + 1) % S.animNames.length];

  // Tự động gợi ý tên
  function suggestName() {
    const a = selA.value, b = selB.value;
    if (a && b && a !== b) nameIn.value = a + '_' + b;
    else if (a) nameIn.value = a + '_merged';
    updatePreview();
  }

  function updatePreview() {
    const a = selA.value, b = selB.value;
    const animA = S.animations[a], animB = S.animations[b];
    if (!animA || !animB) { preview.textContent = '—'; return; }
    const totalFrames = animA.frameCount + animB.frameCount;
    const totalDur    = (animA.duration + animB.duration).toFixed(2);
    const same = a === b;
    preview.innerHTML =
      `<span style="color:var(--grn)">A</span>: ${a} — ${animA.frameCount}f · ${animA.duration.toFixed(2)}s<br>` +
      `<span style="color:var(--acc)">B</span>: ${b} — ${animB.frameCount}f · ${animB.duration.toFixed(2)}s<br>` +
      `<b>→ Kết quả</b>: ${totalFrames}f · ${totalDur}s` +
      (same ? '<br><span style="color:var(--amb)">⚠ A và B giống nhau — sẽ nhân đôi animation</span>' : '');
  }

  selA.addEventListener('change', suggestName);
  selB.addEventListener('change', suggestName);
  nameIn.addEventListener('input', () => { nameErr.style.display = 'none'; updatePreview(); });

  suggestName();

  // Confirm
  document.getElementById('mergeConfirmBtn').addEventListener('click', () => {
    const a      = selA.value;
    const b      = selB.value;
    const newName = nameIn.value.trim();
    nameErr.style.display = 'none';

    if (!newName) {
      nameErr.textContent = '⚠ Tên không được để trống.';
      nameErr.style.display = '';
      return;
    }
    if (!/^[a-zA-Z0-9_\-\s\.]+$/.test(newName)) {
      nameErr.textContent = '⚠ Tên chỉ được chứa chữ, số, dấu gạch, khoảng trắng hoặc dấu chấm.';
      nameErr.style.display = '';
      return;
    }
    if (S.animNames.includes(newName)) {
      nameErr.textContent = `⚠ Animation "${newName}" đã tồn tại.`;
      nameErr.style.display = '';
      return;
    }

    const ok = mergeAnimations(a, b, newName);
    if (ok) {
      document.getElementById('animMergeOverlay').remove();
    }
  });

  // Cancel / click outside
  document.getElementById('mergeCancelBtn').addEventListener('click', () => {
    document.getElementById('animMergeOverlay').remove();
  });
  document.getElementById('animMergeOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('animMergeOverlay')) {
      document.getElementById('animMergeOverlay').remove();
    }
  });

  // ESC để đóng
  const escHandler = e => {
    if (e.key === 'Escape') {
      const ov = document.getElementById('animMergeOverlay');
      if (ov) { ov.remove(); document.removeEventListener('keydown', escHandler); }
    }
  };
  document.addEventListener('keydown', escHandler);

  // Focus vào input tên
  setTimeout(() => nameIn.focus(), 50);
}

// ── Core merge logic ──────────────────────────────────────────────────────────
/**
 * Gộp animA và animB nối tiếp nhau thành animNew.
 * Timeline của B được dịch thời gian thêm duration của A.
 * Keyframe cuối của A (tại mỗi layer) được giữ làm "nền" cho B
 * nếu B không có keyframe tại t=0 cho layer đó.
 *
 * @param {string} nameA  Tên animation A
 * @param {string} nameB  Tên animation B
 * @param {string} nameNew  Tên animation kết quả
 * @returns {boolean}
 */
function mergeAnimations(nameA, nameB, nameNew) {
  const animA = S.animations[nameA];
  const animB = S.animations[nameB];
  if (!animA || !animB) {
    showToast('Không tìm thấy animation!', 'warn');
    return false;
  }

  pushUndo(`Gộp animation "${nameA}" + "${nameB}" → "${nameNew}"`);

  const tlA = S.timeline[nameA] || {};
  const tlB = S.timeline[nameB] || {};
  const durA = animA.duration;

  // Thu thập tất cả layer từ cả 2 anim
  const allLayers = new Set([...Object.keys(tlA), ...Object.keys(tlB)]);
  const newTL = {};

  for (const lname of allLayers) {
    const kfsA = (tlA[lname] || []).map(kf => _cloneKF(kf));
    const kfsB = (tlB[lname] || []).map(kf => {
      const cloned = _cloneKF(kf);
      cloned.time = +(cloned.time + durA).toFixed(6); // dịch thời gian
      return cloned;
    });

    // Nếu B có keyframe nhưng A không, hoặc B's first kf at offsetted time > durA,
    // thêm "freeze frame" từ cuối A để tránh layer nhảy đột ngột
    if (kfsA.length > 0 && kfsB.length > 0) {
      const firstBTime = kfsB[0].time;
      // Đã dịch, nên firstBTime >= durA
      // Nếu firstBTime > durA (tức B bắt đầu sau t=0), chèn freeze A cuối
      if (firstBTime > durA + 1e-6) {
        const lastKfA = _cloneKF(kfsA[kfsA.length - 1]);
        lastKfA.time = +(durA).toFixed(6);
        kfsB.unshift(lastKfA);
      }
    } else if (kfsA.length > 0 && kfsB.length === 0) {
      // B không có layer này → giữ trạng thái cuối A suốt phần B
      const lastKfA = _cloneKF(kfsA[kfsA.length - 1]);
      lastKfA.time = +(durA).toFixed(6);
      kfsB.push(lastKfA);
    } else if (kfsA.length === 0 && kfsB.length > 0) {
      // A không có layer này → B bắt đầu bình thường
    }

    newTL[lname] = [...kfsA, ...kfsB];
  }

  // Build animation metadata
  const fps = S.data?.meta?.fps || 30;
  const totalDur    = +(animA.duration + animB.duration).toFixed(6);
  const totalFrames = animA.frameCount + animB.frameCount;

  const newAnim = {
    duration:   totalDur,
    frameCount: totalFrames,
  };

  // Gộp events (dịch thời gian event của B)
  const eventsA = (S.animEvents && S.animEvents[nameA]) ? [...S.animEvents[nameA]] : [];
  const eventsB = (S.animEvents && S.animEvents[nameB]) ? S.animEvents[nameB].map(ev => ({
    ...ev,
    time: +(ev.time + durA).toFixed(6),
  })) : [];
  const newEvents = [...eventsA, ...eventsB];

  // Gộp animHiddenLayers (union)
  const hidA = S.animHiddenLayers[nameA] || new Set();
  const hidB = S.animHiddenLayers[nameB] || new Set();
  const newHidden = new Set([...hidA, ...hidB]);

  // Apply vào state
  S.animations[nameNew]        = newAnim;
  S.animNames.push(nameNew);
  S.timeline[nameNew]          = newTL;
  if (S.animEvents)        S.animEvents[nameNew]        = newEvents;
  if (S.animHiddenLayers)  S.animHiddenLayers[nameNew]  = newHidden;

  // Rebuild UI
  if (typeof buildAnimList === 'function') buildAnimList();
  buildExportPanel();
  markDirty();
  if (typeof markSessionDirty === 'function') markSessionDirty();

  // Chuyển sang animation mới
  selectAnim(nameNew);

  setStatus(`✓ Đã gộp "${nameA}" + "${nameB}" → "${nameNew}" (${totalFrames}f · ${totalDur.toFixed(2)}s)`, 'ok');
  showToast(`🔗 Gộp thành công → "${nameNew}"`, 'ok');

  return true;
}

// ── Deep clone một keyframe ───────────────────────────────────────────────────
function _cloneKF(kf) {
  return JSON.parse(JSON.stringify(kf));
}

// ── Inject nút Merge vào animSection sau khi DOM sẵn sàng ────────────────────
function _injectMergeButton() {
  const animSection = document.getElementById('animSection');
  if (!animSection) return;

  // Tránh inject 2 lần
  if (document.getElementById('mergeAnimBtn')) return;

  const animLabel = document.getElementById('animLabel');
  if (!animLabel) return;

  const btn = document.createElement('button');
  btn.id          = 'mergeAnimBtn';
  btn.title       = 'Gộp 2 animation thành 1 animation mới';
  btn.textContent = '🔗 Gộp anim';
  btn.style.cssText = `
    display:block;width:calc(100% - 16px);margin:4px 8px;
    background:var(--sur2,#1a1a2e);color:var(--acc,#7c6df8);
    border:1px solid var(--acc,#7c6df8);border-radius:5px;
    padding:4px 8px;font-size:10px;font-weight:600;cursor:pointer;
    transition:background .15s;
  `;
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'var(--acc,#7c6df8)';
    btn.style.color = '#fff';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'var(--sur2,#1a1a2e)';
    btn.style.color = 'var(--acc,#7c6df8)';
  });
  btn.addEventListener('click', openMergeAnimModal);

  // Chèn trước animLabel
  animSection.insertBefore(btn, animLabel);
}

// Chạy sau khi DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _injectMergeButton);
} else {
  _injectMergeButton();
}

// Cũng hook vào sau processData để đảm bảo button luôn có mặt
const _origProcessDataForMerge = typeof processData === 'function' ? processData : null;
// Patch nhẹ: chỉ inject button sau khi data load xong
document.addEventListener('DOMContentLoaded', () => {
  // Observe animSection xuất hiện (do processData mới show nó)
  const target = document.getElementById('animSectionRow');
  if (!target) return;
  const obs = new MutationObserver(() => _injectMergeButton());
  obs.observe(target, { attributes: true, attributeFilter: ['style'] });
});
