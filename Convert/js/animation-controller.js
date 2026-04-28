// animation-controller.js – Điều khiển phát animation
'use strict';

function startAnim() {
  S.playing = true; S.lastTs = null;
  $('playBtn').textContent = '⏸'; $('playBtn').classList.add('active');
  S.lastRaf = requestAnimationFrame(tick);
}
function stopAnim() {
  S.playing = false;
  if (S.lastRaf) cancelAnimationFrame(S.lastRaf);
  $('playBtn').textContent = '▶'; $('playBtn').classList.remove('active');
}

// Tách updateUI ra khỏi renderFrame để giảm layout thrashing
function tick(ts) {
  if (!S.playing) return;
  // Apply ZP animation speed scale (mirrors SetAnimationSpeed in ZombieMovement.cs)
  const _userSpeed = S.speed;
  if (typeof ZP !== 'undefined' && ZP._getAnimScale) S.speed *= ZP._getAnimScale();
  let dt = 0;
  if (S.lastTs !== null) {
    dt = (ts - S.lastTs) / 1000 * S.speed;
    S.currentTime += dt;
    if (S.currentTime > S.dur) {
      if (S.looping) S.currentTime = S.currentTime % S.dur;
      else { S.currentTime = S.dur; stopAnim(); }
    }
  }
  S.lastTs = ts;
  S.speed = _userSpeed; // restore sau khi tính dt
  renderFrame(S.currentAnim, S.currentTime);
  if (typeof drawEventMarkers === 'function') drawEventMarkers();
  if (typeof ZP !== 'undefined' && dt > 0) ZP.onTick(dt / _userSpeed);
  // Batch DOM writes sau render
  const sv = (S.currentTime / S.dur) * 10000;
  $('scrubber').value = sv;
  $('tInfo').textContent = S.currentTime.toFixed(2) + 's / ' + S.dur.toFixed(2) + 's';
  S.lastRaf = requestAnimationFrame(tick);
}

function stepFrame(dir) {
  if (S.playing) stopAnim();
  const fps = S.data?.meta?.fps || 30;
  S.currentTime = Math.max(0, Math.min(S.dur, S.currentTime + dir / fps));
  $('scrubber').value = (S.currentTime / S.dur) * 10000;
  $('tInfo').textContent = S.currentTime.toFixed(2) + 's / ' + S.dur.toFixed(2) + 's';
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  if (typeof drawEventMarkers === 'function') drawEventMarkers();
}

/** Seek tới thời điểm cụ thể (dùng khi click marker trên evtTrack) */
function seekTo(time) {
  if (S.playing) stopAnim();
  S.currentTime = Math.max(0, Math.min(S.dur, time));
  $('scrubber').value = (S.currentTime / S.dur) * 10000;
  $('tInfo').textContent = S.currentTime.toFixed(2) + 's / ' + S.dur.toFixed(2) + 's';
  if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
  if (typeof drawEventMarkers === 'function') drawEventMarkers();
  if (typeof ZP !== 'undefined') ZP.seekZombieTo(S.currentTime);
}

function selectAnim(name) {
  S.currentAnim = name;
  S.currentTime = 0;
  S.dur = S.animations[name]?.duration || 1;
  S.lockedParts.clear();

  // Sync hiddenLayers theo animation được chọn
  _syncHiddenLayersForAnim(name);

  document.querySelectorAll('.anim-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.name === name));

  updateLayerActiveState(name);
  // Rebuild layer list nếu đang filter active (vì active set thay đổi theo anim)
  if (S.activeLayersOnly) buildLayerList();
  $('scrubber').value = 0;
  $('tInfo').textContent = '0.00s / ' + S.dur.toFixed(2) + 's';
  $('animLabel').textContent = name;

  // Lưu canvas size manual trước khi chuyển anim
  const badgeEl = $('canvasSizeBadge');
  const isManual = badgeEl && badgeEl.textContent.includes('(manual)');
  const manualW = isManual ? canvas.width : null;
  const manualH = isManual ? canvas.height : null;

  loadImagesForAnim(name, () => {
    stopAnim(); startAnim();
    if (isManual && manualW && manualH) {
      // Giữ lại size manual khi chuyển animation
      canvas.width  = manualW;
      canvas.height = manualH;
      applyZoom(S.zoom);
      if (S.currentAnim) renderFrame(S.currentAnim, S.currentTime);
      badgeEl.textContent = `${manualW}×${manualH} (manual)`;
    } else {
      autoExpandCanvas(S.data?.meta?.canvasW||390, S.data?.meta?.canvasH||390);
    }
    if (typeof refreshEventPanel === 'function') refreshEventPanel();
    if (typeof updateEventAnimLabel === 'function') updateEventAnimLabel();
    // Refresh thumbnails tĩnh cho tất cả layers
    if (typeof refreshAllThumbs === 'function') setTimeout(refreshAllThumbs, 50);
  });
}

function updateLayerActiveState(animName) {
  const animTL = S.timeline[animName] || {};
  document.querySelectorAll('.layer-item').forEach(item => {
    const kfs = animTL[item.dataset.name] || [];
    const has = kfs.some(kf => kf.parts?.length > 0);
    item.classList.toggle('has-data', has);
    const visBtn = item.querySelector('.layer-vis');
    if (visBtn) visBtn.textContent = S.hiddenLayers.has(item.dataset.name) ? '🙈' : '👁';
  });
}

function loadImagesForAnim(animName, onReady) {
  const needed = new Set();
  const animTL = S.timeline[animName] || {};
  for (const lname in animTL) {
    for (const kf of animTL[lname]) {
      for (const part of (kf.parts||[])) needed.add(part.bitmap);
    }
  }
  let pending = 0;
  for (const bmpName of needed) {
    if (S.imgLoaded[bmpName]) {
      // Nếu đang bị đánh dấu missing nhưng thực tế cache đã có ảnh thật
      // (do ZIP/folder load sau) → xóa missing flag
      if (S.imgMissing[bmpName]) {
        const mediaKey = 'media/' + bmpName.split('/').pop();
        if (S.imgLoaded[mediaKey] && !S.imgMissing[mediaKey] && S.imgCache[mediaKey]) {
          S.imgCache[bmpName] = S.imgCache[mediaKey];
          delete S.imgMissing[bmpName];
          if (S.missingCount > 0) S.missingCount--;
        }
      }
      continue;
    }
    pending++;
    const img = new Image();
    const fname = bmpName.split('/').pop();
    img.src = fname + '.png';
    img.onload = () => {
      S.imgCache[bmpName] = img;
      S.imgLoaded[bmpName] = true;
      S.loadedCount++;
      pending--;
      if (pending === 0) { updateImgHint(); onReady(); }
    };
    img.onerror = () => {
      const sz = S.bitmaps[bmpName] || { w: 32, h: 32 };
      const c = document.createElement('canvas');
      c.width = sz.w || 32; c.height = sz.h || 32;
      const cx2 = c.getContext('2d');
      cx2.fillStyle = '#ff006622';
      cx2.fillRect(0, 0, c.width, c.height);
      cx2.strokeStyle = '#ff0066';
      cx2.lineWidth = 1;
      cx2.strokeRect(0.5, 0.5, c.width-1, c.height-1);
      cx2.fillStyle = '#ff006688';
      cx2.font = `${Math.max(8, Math.min(12, sz.w/4))}px monospace`;
      cx2.textAlign = 'center';
      cx2.fillText('?', c.width/2, c.height/2+4);
      S.imgCache[bmpName] = c;
      S.imgLoaded[bmpName] = true;
      S.imgMissing[bmpName] = true;
      S.missingCount++;
      pending--;
      if (pending === 0) { updateImgHint(); onReady(); }
    };
  }
  if (pending === 0) {
    S.missingCount = Object.keys(S.imgMissing).length;
    updateImgHint(); onReady();
  }
}

function updateImgHint() {
  const missing = Object.keys(S.imgMissing).length;
  const loaded  = Object.keys(S.imgLoaded).length - missing;
  const hint = $('imgStatusHint');
  const warn = $('noImgWarn');
  if (missing > 0) {
    hint.textContent = `🖼 ${loaded} loaded · ${missing} missing`;
    hint.style.color = 'var(--amb)';
    warn.classList.remove('hidden');
  } else if (loaded > 0) {
    hint.textContent = `🖼 ${loaded} images loaded`;
    hint.style.color = 'var(--grn)';
    warn.classList.add('hidden');
  } else {
    hint.textContent = '';
    warn.classList.add('hidden');
  }
}
// ── Sync hiddenLayers khi đổi animation ──────────────────────────────────────
function _syncHiddenLayersForAnim(animName) {
  // Lấy set ẩn của animation mới (hoặc rỗng)
  const animHidden = S.animHiddenLayers[animName] || new Set();
  S.hiddenLayers = new Set(animHidden);

  // Cập nhật UI
  document.querySelectorAll('.layer-item').forEach(item => {
    const name = item.dataset.name;
    const hidden = S.hiddenLayers.has(name);
    item.classList.toggle('hidden-layer', hidden);
    const vis = item.querySelector('.layer-vis');
    if (vis) vis.textContent = hidden ? '🙈' : '👁';
  });
}