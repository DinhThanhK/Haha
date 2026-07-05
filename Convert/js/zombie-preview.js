// zombie-preview.js – ZombieMovement.cs simulator
// Zombie di chuyển THẬT trên canvas, camera follow, nút center
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// ZombieSimulator – mirror ZombieMovement.cs (updated version với SetAnimationSpeed)
// ─────────────────────────────────────────────────────────────────────────────
class ZombieSimulator {
  constructor() {
    // Inspector fields
    this.baseSpeedMultiplier = 1.0;
    this.lerpSpeed           = 1.0;
    this.slowMultiplier      = 0.4;

    // State
    this._canMove         = true;
    this._speedMultiplier = 1.0;
    this._animTimeScale   = 1.0;  // mirror SetAnimationSpeed
    this._x               = 0;   // world position (pixels)
    this._targetX         = 0;
    this._effectType      = null;
    this._effectTimer     = 0;
    this._effectTotal     = 0;
    this._tint            = 'none';
    this._simTime         = 0;
    this.pixelScale       = 80; // 1 float unit = 80px để dễ quan sát

    this.eventLog = [];
    this.LOG_MAX  = 20;
  }

  // Mirror OnSpineEvent — float * baseSpeedMultiplier * speedMultiplier
  fireEvent(evName, evFloat) {
    if (evName !== 'move_step' || !this._canMove) return;
    // Unity: _targetPosition += Vector3.LEFT * delta → X giảm (đi sang trái)
    // Trong preview: trái = X nhỏ hơn → trừ delta
    const delta = (evFloat || 0) * this.baseSpeedMultiplier * this._speedMultiplier;
    this._targetX -= delta * this.pixelScale; // sang trái
    this.eventLog.unshift({
      t: this._simTime, float: evFloat, delta, x: this._targetX, eff: this._effectType
    });
    if (this.eventLog.length > this.LOG_MAX) this.eventLog.length = this.LOG_MAX;
  }

  // Tính tổng displacement tại thời điểm t (dùng cho scrubber seek)
  // Tích lũy tất cả move_step events có time <= t
  computePositionAt(t, events) {
    let pos = 0;
    for (const ev of events) {
      if (ev.name !== 'move_step') continue;
      if (ev.time <= t) pos -= (ev.float || 0) * this.baseSpeedMultiplier * this._speedMultiplier * this.pixelScale;
    }
    return pos;
  }

  // Seek: đặt vị trí ngay tại t (không lerp)
  seekToTime(t, events) {
    const pos = this.computePositionAt(t, events);
    this._x       = pos;
    this._targetX = pos;
  }

  // Mirror Update() — lerp về targetX
  update(dt) {
    this._simTime += dt;
    if (this._effectTimer > 0) {
      this._effectTimer -= dt;
      if (this._effectTimer <= 0) { this._effectTimer = 0; this._endEffect(); }
    }
    // Unity Vector3.Lerp per-frame ≈ exponential lerp
    const k = 1 - Math.exp(-this.lerpSpeed * dt);
    this._x += (this._targetX - this._x) * k;
  }

  // Mirror ApplySlow → SlowRoutine: speedMultiplier + SetAnimationSpeed(slowMult)
  applySlow(dur) {
    this._start('slow', dur, this.slowMultiplier);
    this._animTimeScale = this.slowMultiplier;
  }

  // Mirror ApplyStun → StunRoutine: canMove=false + SetAnimationSpeed(0)
  applyStun(dur) {
    this._start('stun', dur, 1);
    this._canMove     = false;
    this._targetX     = this._x;
    this._animTimeScale = 0;
  }

  // Mirror ApplySpeedBuff → SpeedBuffRoutine: speedMultiplier=mult (anim speed unchanged)
  applySpeedBuff(mult, dur) {
    this._start('speedbuff', dur, mult);
    this._animTimeScale = 1.0; // buff không đổi anim speed
  }

  reset() {
    this._x = 0; this._targetX = 0;
    this._canMove = true; this._speedMultiplier = 1;
    this._animTimeScale = 1;
    this._effectType = null; this._effectTimer = 0; this._effectTotal = 0;
    this._tint = 'none'; this._simTime = 0; this.eventLog = [];
  }

  _start(type, dur, mult) {
    this._effectType = type; this._effectTimer = this._effectTotal = dur;
    if (type !== 'stun') { this._canMove = true; this._speedMultiplier = mult; }
    this._tint = { slow:'slow', stun:'stun', speedbuff:'buff' }[type];
  }

  _endEffect() {
    this._canMove = true; this._speedMultiplier = 1;
    this._animTimeScale = 1;
    this._effectType = null; this._tint = 'none';
  }

  get x()          { return this._x; }
  get tx()         { return this._targetX; }
  get tint()       { return this._tint; }
  get eff()        { return this._effectType; }
  get efft()       { return this._effectTimer; }
  get efftot()     { return this._effectTotal; }
  get smult()      { return this._speedMultiplier; }
  get animScale()  { return this._animTimeScale; }
}

// ─────────────────────────────────────────────────────────────────────────────
// ZP – Preview controller
// ─────────────────────────────────────────────────────────────────────────────
const ZP = (() => {
  const sim = new ZombieSimulator();
  let active = false;
  let zCanvas = null, zCtx = null;
  let _prevAnimTime = -1;
  let _isSeeking    = false;
  let _scrubbing    = false;  // đang giữ scrubber → disable tickEvents
  let _scrubEndTimer = 0;     // ms kể từ lần seek cuối, sau 150ms mới hết scrubbing

  // Sprite bbox cache
  let _bbCache = null, _bbAnimName = null, _bbOff = null;

  // zpSpread: S.outputSpread tạm thời chỉ cho preview (không ảnh hưởng export)
  let _zpSpread = 1.1;
  let _zpSpreadCanvas = null;  // offscreen canvas chứa sprite đã spread
  let _zpSpreadCtx    = null;
  let _zpSpreadDirty  = true;  // cần re-render khi spread thay đổi hoặc frame đổi

  // ── Camera / viewport ─────────────────────────────────────────────────────
  // cameraX = world X của cạnh trái canvas
  let cameraX    = -40;   // bắt đầu zombie ở 40px từ trái
  const CAM_MARGIN_L = 60;  // khoảng trống tối thiểu bên trái zombie
  const CAM_MARGIN_R = 120; // khoảng trống tối thiểu bên phải zombie (zombie đi sang phải)
  let camLerpX   = cameraX;  // camera smooth
  let camZoom    = 1.0;      // zoom: 1 = bình thường, 0.5 = xa hơn, 2 = gần hơn
  let camZoomTarget = 1.0;

  // Drag để pan camera
  let _drag = false, _dragStartMouse = 0, _dragStartCam = 0;

  // Environment tile offsets (không dùng worldX nữa — dùng cameraX)
  const CLOUDS  = [0.05, 0.28, 0.55, 0.78];
  const TREES_B = [0.04, 0.26, 0.50, 0.74, 0.94];
  const TREES_F = [0.10, 0.38, 0.65, 0.88];

  // Throttle log
  let _logTimer = 0;

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    zCanvas = document.getElementById('zpCanvas');
    if (!zCanvas) return;
    zCtx = zCanvas.getContext('2d', { alpha: false });

    // Scroll wheel cho params
    ['zp_baseSpeed','zp_lerpSpeed','zp_slowMult','zp_pixelScale','zp_zpSpread'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', syncCfg);
      el.addEventListener('wheel', e => {
        e.preventDefault();
        const step = parseFloat(el.step) || 0.1;
        let v = parseFloat(el.value) + (e.deltaY < 0 ? 1 : -1) * step;
        if (el.min !== '') v = Math.max(parseFloat(el.min), v);
        if (el.max !== '') v = Math.min(parseFloat(el.max), v);
        el.value = +v.toFixed(4);
        syncCfg();
      }, { passive: false });
    });

    // Kéo header để resize panel
    const panel  = document.getElementById('zpPanel');
    const header = document.getElementById('zpHeader');
    if (panel && header) {
      let drag = false, startY = 0, startH = 0;
      header.style.cursor = 'ns-resize';
      header.addEventListener('mousedown', e => {
        // Chỉ drag nếu click vào phần header (không phải input/button)
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        drag = true; startY = e.clientY; startH = panel.offsetHeight;
        document.body.style.userSelect = 'none';
      });
      document.addEventListener('mousemove', e => {
        if (!drag) return;
        const h = Math.max(100, Math.min(500, startH + startY - e.clientY));
        panel.style.height = h + 'px';
      });
      document.addEventListener('mouseup', () => {
        drag = false; document.body.style.userSelect = '';
        sizeCanvas();
      });
    }

    // Drag trên canvas để pan
    if (zCanvas) {
      zCanvas.addEventListener('mousedown', e => {
        _drag = true; _dragStartMouse = e.clientX; _dragStartCam = cameraX;
        zCanvas.style.cursor = 'grabbing';
      });
      document.addEventListener('mousemove', e => {
        if (!_drag) return;
        const dx = _dragStartMouse - e.clientX; // kéo trái = world đi trái = cameraX tăng
        cameraX = _dragStartCam + dx;
        camLerpX = cameraX; // snap cam ngay khi drag
      });
      document.addEventListener('mouseup', () => {
        _drag = false; if (zCanvas) zCanvas.style.cursor = 'grab';
      });
      zCanvas.style.cursor = 'grab';

      // Ctrl+Scroll = zoom, scroll thường = pan ngang
      zCanvas.addEventListener('wheel', e => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Zoom vào điểm chuột
          const rect = zCanvas.getBoundingClientRect();
          const mouseX = e.clientX - rect.left; // screen X của chuột
          const worldMouseX = mouseX / camZoom + cameraX; // world X trước zoom
          const zoomDelta = e.deltaY < 0 ? 1.15 : 0.87;
          camZoomTarget = Math.max(0.25, Math.min(4.0, camZoomTarget * zoomDelta));
          camZoom = camZoomTarget;
          cameraX = worldMouseX - mouseX / camZoom;
          camLerpX = cameraX;
          const zl = document.getElementById('zpZoomLabel');
          if (zl) zl.textContent = camZoom.toFixed(1) + '×';
        } else {
          cameraX += (e.deltaX || e.deltaY) * 0.8 / camZoom;
          camLerpX = cameraX;
        }
      }, { passive: false });
    }

    // Nút Center
    const centerBtn = document.getElementById('zpCenterBtn');
    if (centerBtn) centerBtn.addEventListener('click', snapToZombie);

    // Spread input – chỉ visual, lưu vào session qua S._zpSpread
    const spreadEl = document.getElementById('zp_zpSpread');
    if (spreadEl) {
      const onSpreadChange = () => {
        _zpSpread = Math.max(0.1, Math.min(5.0, parseFloat(spreadEl.value) || 1.0));
        _zpSpreadDirty = true;
        _bbCache = null; _bbAnimName = null; // invalidate bbox cache
        if (!active) return;
        sizeCanvas(); draw(0); // redraw ngay
      };
      spreadEl.addEventListener('change', onSpreadChange);
      spreadEl.addEventListener('wheel', e => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        spreadEl.value = Math.max(0.1, Math.min(5.0, parseFloat(spreadEl.value) + dir * 0.05)).toFixed(2);
        onSpreadChange();
      }, { passive: false });
    }

    // Zoom buttons
    function applyZoom(delta) {
      const rect = zCanvas ? zCanvas.getBoundingClientRect() : {width:400};
      const cx = (rect.width || 400) / 2;
      const worldCX = cx / camZoom + cameraX;
      camZoomTarget = Math.max(0.25, Math.min(4.0, camZoomTarget * delta));
      camZoom = camZoomTarget;
      cameraX = worldCX - cx / camZoom;
      camLerpX = cameraX;
      const lbl = document.getElementById('zpZoomLabel');
      if (lbl) lbl.textContent = camZoom.toFixed(1) + '×';
    }
    document.getElementById('zpZoomIn') ?.addEventListener('click', () => applyZoom(1.3));
    document.getElementById('zpZoomOut')?.addEventListener('click', () => applyZoom(0.77));
  }

  function syncCfg() {
    sim.baseSpeedMultiplier = +document.getElementById('zp_baseSpeed')?.value || 1;
    sim.lerpSpeed           = +document.getElementById('zp_lerpSpeed')?.value || 1;
    sim.slowMultiplier      = +document.getElementById('zp_slowMult')?.value  || 0.4;
    const psEl = document.getElementById('zp_pixelScale');
    if (psEl) sim.pixelScale = parseFloat(psEl.value) || 80;
  }

  // Snap camera: zombie ở vị trí CAM_MARGIN_L từ trái
  function snapToZombie() {
    const W = zCanvas?.width || 400;
    cameraX  = sim.x - W * 0.55;
    camLerpX = cameraX;
  }

  // ── Show/hide ─────────────────────────────────────────────────────────────
  function setVisible(v) {
    active = v;
    const panel = document.getElementById('zpPanel');
    if (!panel) return;
    panel.style.display = v ? 'flex' : 'none';
    if (v) {
      requestAnimationFrame(() => sizeCanvas());
      _prevAnimTime = S?.currentTime ?? 0;
      const W2 = zCanvas?.width || 400;
      cameraX = -(W2 * 0.45); camLerpX = cameraX;
    }
    updateBadge();
  }

  function sizeCanvas() {
    if (!zCanvas) return;
    const par = zCanvas.parentElement;
    if (!par) return;
    const w = par.clientWidth, h = par.clientHeight;
    if (w > 0 && h > 0 && (zCanvas.width !== w || zCanvas.height !== h)) {
      zCanvas.width = w; zCanvas.height = h;
    }
  }

  // ── onTick – từ animation-controller ─────────────────────────────────────
  function onTick(realDt) {
    if (!active) return;
    sizeCanvas();
    _zpSpreadDirty = true;

    // Khi đang scrub: countdown timer, không tickEvents
    if (_scrubbing) {
      _scrubEndTimer -= realDt * 1000;
      if (_scrubEndTimer <= 0) {
        // Scrub kết thúc: sync prevAnimTime để tickEvents chạy đúng từ đây
        _scrubbing = false;
        _prevAnimTime = S.currentTime;
      }
      // Không tickEvents khi scrubbing
    } else {
      tickEvents(realDt);
    }
    _isSeeking = false;

    sim.update(realDt);
    autoFollowCamera(realDt);
    draw(realDt);

    _logTimer += realDt;
    if (_logTimer >= 0.15) { _logTimer = 0; updateStats(); }
  }

  // ── Điều khiển S.speed theo animTimeScale ─────────────────────────────────
  // Được gọi TRƯỚC tick() → patch S.speed
  function applyAnimSpeed() {
    if (!active || typeof S === 'undefined') return;
    if (!S._zpOrigSpeed) S._zpOrigSpeed = S.speed;
    S.speed = (S._zpOrigSpeed || 1) * sim.animScale;
  }
  function restoreAnimSpeed() {
    if (!active || typeof S === 'undefined' || !S._zpOrigSpeed) return;
    S.speed = S._zpOrigSpeed;
    delete S._zpOrigSpeed;
  }

  // ── Seek zombie đến thời điểm t (gọi từ scrubber) ──────────────────────────
  function seekZombieTo(t) {
    if (!active || !S?.currentAnim || !S?.animEvents) return;
    const events = S.animEvents[S.currentAnim] || [];
    sim.seekToTime(t, events);
    _prevAnimTime  = t;
    _scrubbing     = true;   // tắt tickEvents khi đang scrub
    _scrubEndTimer = 200;    // 200ms sau lần seek cuối mới unlock
    _zpSpreadDirty = true;
    // Camera follow ngay, không smooth khi scrubbing
    if (!_drag) {
      const W = zCanvas?.width || 400;
      const zombieSX = (sim.x - cameraX) * camZoom;
      // Chỉ snap camera nếu zombie ra ngoài vùng nhìn thấy
      if (zombieSX < CAM_MARGIN_L || zombieSX > W - CAM_MARGIN_R) {
        cameraX  = sim.x - (W * 0.55) / camZoom;
        camLerpX = cameraX;
      }
    }
    // Vẽ ngay — dù animation không đang play
    sizeCanvas();
    draw(0);
  }

  // ── Fire events từ animation ──────────────────────────────────────────────
  function tickEvents() {
    if (!S?.currentAnim || !S?.animEvents) return;
    const evts = S.animEvents[S.currentAnim] || [];
    if (!evts.length) return;
    const t = S.currentTime, prev = _prevAnimTime;
    if (prev < 0) { _prevAnimTime = t; return; }
    const dur = S.dur || 1;

    if (t < prev - 0.05) {
      // loop
      for (const ev of evts) {
        if (ev.name !== 'move_step') continue;
        if (ev.time > prev && ev.time <= dur) sim.fireEvent(ev.name, ev.float);
        if (ev.time >= 0  && ev.time <= t)   sim.fireEvent(ev.name, ev.float);
      }
    } else {
      for (const ev of evts) {
        if (ev.name !== 'move_step') continue;
        if (ev.time > prev && ev.time <= t) sim.fireEvent(ev.name, ev.float);
      }
    }
    _prevAnimTime = t;
  }

  // ── Camera auto-follow ────────────────────────────────────────────────────
  function autoFollowCamera(dt) {
    if (!zCanvas || _drag) return;
    const W = zCanvas.width;
    const zombieScreenX = (sim.x - cameraX) * camZoom;

    // Zombie đi sang TRÁI → giữ zombie ở 55% từ trái
    const LEAD   = W * 0.55 / camZoom;
    const target = sim.x - LEAD;

    if (zombieScreenX < CAM_MARGIN_L || zombieScreenX > W - CAM_MARGIN_R) {
      cameraX = target;
    }

    // Smooth camera lerp
    const ck = 1 - Math.exp(-8 * dt);
    camLerpX += (cameraX - camLerpX) * ck;
  }

  // ── Bbox sprite ───────────────────────────────────────────────────────────
  // getZpSpreadCanvas: render lại frame với S.outputSpread = _zpSpread
  // dùng withCanvas() helper (same scope với let canvas/ctx trong state.js)
  // → mainCanvas và S.outputSpread thật KHÔNG bị đụng tới
  function getZpSpreadCanvas(mc) {
    if (!mc || mc.width === 0) return mc;
    if (!_zpSpreadDirty && _zpSpreadCanvas &&
        _zpSpreadCanvas.width === mc.width &&
        _zpSpreadCanvas.height === mc.height) {
      return _zpSpreadCanvas;
    }
    if (!_zpSpreadCanvas || _zpSpreadCanvas.width !== mc.width || _zpSpreadCanvas.height !== mc.height) {
      _zpSpreadCanvas = document.createElement('canvas');
      _zpSpreadCanvas.width  = mc.width;
      _zpSpreadCanvas.height = mc.height;
      _zpSpreadCtx = _zpSpreadCanvas.getContext('2d');
    }
    _zpSpreadDirty = false;

    // Swap S.outputSpread + canvas/ctx, render, restore
    const savedSpread = S.outputSpread;
    S.outputSpread = _zpSpread;
    _zpSpreadCtx.clearRect(0, 0, _zpSpreadCanvas.width, _zpSpreadCanvas.height);
    try {
      withCanvas(_zpSpreadCanvas, _zpSpreadCtx, () => {
        renderFrame(S.currentAnim, S.currentTime);
      });
    } catch(e) {
      // Fallback: copy mainCanvas nếu lỗi
      _zpSpreadCtx.drawImage(mc, 0, 0);
    }
    S.outputSpread = savedSpread;

    return _zpSpreadCanvas;
  }

  function getBBox(srcCanvas) {
    srcCanvas = srcCanvas || (typeof canvas !== 'undefined' ? canvas : document.getElementById('mainCanvas'));
    if (!srcCanvas || srcCanvas.width === 0) return null;
    const animName = S?.currentAnim;
    // Cache key bao gồm cả spread để invalidate khi spread đổi
    const cacheKey = animName + '|' + _zpSpread.toFixed(2);
    if (_bbAnimName === cacheKey && _bbCache !== undefined) return _bbCache;

    if (!_bbOff || _bbOff.width !== srcCanvas.width || _bbOff.height !== srcCanvas.height) {
      _bbOff = new OffscreenCanvas(srcCanvas.width, srcCanvas.height);
    }
    const bctx = _bbOff.getContext('2d');
    bctx.clearRect(0, 0, srcCanvas.width, srcCanvas.height);
    bctx.drawImage(srcCanvas, 0, 0);
    let data;
    try { data = bctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data; } catch(e) { _bbCache = null; _bbAnimName = cacheKey; return null; }
    const BW = srcCanvas.width, BH = srcCanvas.height;
    let x1=BW, y1=BH, x2=0, y2=0;
    for (let y=0; y<BH; y+=4) for (let x=0; x<BW; x+=4) {
      if (data[(y*BW+x)*4+3] > 12) {
        if (x<x1)x1=x; if (x>x2)x2=x; if (y<y1)y1=y; if (y>y2)y2=y;
      }
    }
    _bbCache = (x2>x1 && y2>y1) ? {x1, y1, x2:x2+4, y2:y2+4} : null;
    _bbAnimName = cacheKey;
    return _bbCache;
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  function draw(dt) {
    if (!zCtx || !zCanvas || zCanvas.width === 0) return;
    const W = zCanvas.width, H = zCanvas.height;
    const GY = Math.round(H * 0.88); // mặt đất thấp, để sprite có nhiều không gian
    const cam = camLerpX;
    const zoom = camZoom;

    // Với zoom: world → screen = (worldX - cam) * zoom
    // Pivot zoom ở giữa canvas
    const toScrX = wx => (wx - cam) * zoom;

    // ── Sky + Ground (không zoom) ──
    const sky = zCtx.createLinearGradient(0, 0, 0, GY);
    sky.addColorStop(0, '#08081c'); sky.addColorStop(1, '#1a1438');
    zCtx.fillStyle = sky; zCtx.fillRect(0, 0, W, GY);

    const grd = zCtx.createLinearGradient(0, GY, 0, H);
    grd.addColorStop(0, '#1e3d1e'); grd.addColorStop(1, '#0c1a0c');
    zCtx.fillStyle = grd; zCtx.fillRect(0, GY, W, H-GY);
    zCtx.fillStyle = '#3a7a3a'; zCtx.fillRect(0, GY, W, 2);

    // ── Zoom indicator (top-right) ──
    if (Math.abs(zoom - 1) > 0.05) {
      zCtx.save();
      zCtx.font = 'bold 8px monospace'; zCtx.textAlign = 'right'; zCtx.textBaseline = 'top';
      zCtx.fillStyle = '#ffffff55';
      zCtx.fillText(`🔍 ${zoom.toFixed(2)}×`, W - 8, 6);
      zCtx.restore();
    }

    // ── Clouds parallax 0.05× (không bị zoom – background) ──
    zCtx.save(); zCtx.globalAlpha = 0.16; zCtx.fillStyle = '#aaccff';
    for (let i = 0; i < CLOUDS.length; i++) {
      const TILE = W + 240;
      const worldPos = CLOUDS[i] * TILE;
      const sx = ((worldPos - cam * 0.05) % TILE + TILE) % TILE - 120;
      const y = 10 + i * 13; const r = 18 + (i%3)*10;
      zCtx.beginPath(); zCtx.ellipse(sx, y, r*2, r*0.55, 0, 0, Math.PI*2); zCtx.fill();
      zCtx.beginPath(); zCtx.ellipse(sx+r, y-r*0.3, r*1.2, r*0.45, 0, 0, Math.PI*2); zCtx.fill();
      zCtx.beginPath(); zCtx.ellipse(sx-r*0.8, y-r*0.2, r*0.9, r*0.4, 0, 0, Math.PI*2); zCtx.fill();
    }
    zCtx.restore();

    // ── BG trees parallax 0.25× (áp zoom vào size cây) ──
    const TILE_T = (W + 120);
    for (let i = 0; i < TREES_B.length; i++) {
      const wp = TREES_B[i] * TILE_T;
      // Screen X: parallax nhẹ, nhưng zoom ảnh hưởng vị trí ngang
      const rawX = ((wp - cam * 0.25) % TILE_T + TILE_T) % TILE_T - 60;
      const sx = rawX; // BG trees không zoom vị trí, chỉ zoom size nhẹ
      drawTree(sx, GY-1, (22+(i%3)*6)*Math.min(zoom,1.5), '#162a18', '#0e1f10');
    }

    // ── FG trees parallax 0.65× ──
    for (let i = 0; i < TREES_F.length; i++) {
      const wp = TREES_F[i] * TILE_T;
      const rawX = ((wp - cam * 0.65) % TILE_T + TILE_T) % TILE_T - 60;
      drawTree(rawX, GY, (34+(i%2)*10)*Math.min(zoom,1.5), '#1e4424', '#122814');
    }

    // ── Grass tufts tiled theo cam (zoom ảnh hưởng mật độ) ──
    const TILE_G = Math.max(20, 60 / zoom);
    const gOffset = ((-cam * zoom) % TILE_G + TILE_G) % TILE_G;
    zCtx.fillStyle = '#2a6a2a';
    for (let gx = gOffset - TILE_G; gx < W + TILE_G; gx += TILE_G) {
      const h = (5 + ((Math.round(gx/TILE_G) * 7) & 3) * 1.5) * Math.min(zoom, 1.5);
      zCtx.fillRect(gx-2, GY-h, 4, h);
      zCtx.fillRect(gx-6, GY-h+2, 3, h-2);
      zCtx.fillRect(gx+4, GY-h+1, 3, h-1);
    }

    // ── Origin marker (vị trí bắt đầu x=0) ──
    const originSX = toScrX(0);
    if (originSX > -10 && originSX < W + 10) {
      zCtx.save();
      zCtx.strokeStyle = '#ffffff18'; zCtx.lineWidth = 1; zCtx.setLineDash([4,4]);
      zCtx.beginPath(); zCtx.moveTo(originSX, 0); zCtx.lineTo(originSX, GY);
      zCtx.stroke(); zCtx.setLineDash([]);
      zCtx.fillStyle = '#ffffff22'; zCtx.font = '7px monospace'; zCtx.textAlign = 'center';
      zCtx.fillText('x=0', originSX, GY - 4);
      zCtx.restore();
    }

    // ── Distance ruler (từ origin → zombie) ──
    const zombieSX = toScrX(sim.x);
    if (Math.abs(sim.x) > 1) {
      const rx1 = Math.max(-2, Math.min(originSX, zombieSX));
      const rx2 = Math.min(W+2, Math.max(originSX, zombieSX));
      if (rx2 > rx1) {
        zCtx.save();
        zCtx.strokeStyle = '#ffffff15'; zCtx.lineWidth = 1; zCtx.setLineDash([2,5]);
        zCtx.beginPath(); zCtx.moveTo(rx1, GY+12); zCtx.lineTo(rx2, GY+12); zCtx.stroke();
        zCtx.setLineDash([]);
        zCtx.fillStyle = '#ffffff40'; zCtx.font = '7px monospace'; zCtx.textAlign = 'center';
        zCtx.fillText(`${Math.abs(sim.x).toFixed(1)}u`, (rx1+rx2)/2, GY+22);
        zCtx.restore();
      }
    }

    // ── Target marker (dấu cam) ──
    const targetSX = toScrX(sim.tx);
    if (Math.abs(sim.tx - sim.x) > 1 && targetSX > -10 && targetSX < W+10) {
      zCtx.save();
      zCtx.strokeStyle = '#ff990055'; zCtx.lineWidth = 1; zCtx.setLineDash([3,4]);
      zCtx.beginPath(); zCtx.moveTo(targetSX, GY-8); zCtx.lineTo(targetSX, GY+3); zCtx.stroke();
      zCtx.setLineDash([]);
      zCtx.fillStyle = '#ffaa00';
      zCtx.beginPath(); zCtx.arc(targetSX, GY-8, 3, 0, Math.PI*2); zCtx.fill();
      zCtx.restore();
    }

    // ── Zombie sprite (với zpSpread nếu khác 1) ──
    const mc = (typeof canvas !== 'undefined' ? canvas : null) || document.getElementById('mainCanvas');
    if (mc && mc.width > 0 && mc.height > 0 && zombieSX > -300 && zombieSX < W+300) {
      // Lấy source sprite – nếu zpSpread khác 1, render vào offscreen với spread tạm thời
      let srcCanvas = mc;
      if (Math.abs(_zpSpread - 1.0) > 0.01 && S?.currentAnim) {
        srcCanvas = getZpSpreadCanvas(mc);
      }

      const bb = getBBox(srcCanvas);
      if (bb) {
        const sw = bb.x2-bb.x1, sh = bb.y2-bb.y1;
        const baseScale = Math.min((GY * 0.85) / sh, (W * 0.55) / sw);
        const scale = baseScale * zoom;
        const dw = sw*scale, dh = sh*scale;
        const dx = zombieSX - dw*0.5;
        const dy = GY - dh;

        zCtx.save();
        if (sim.tint !== 'none') {
          const tc = {slow:'#44ccff', stun:'#ffaa00', buff:'#00ff88'}[sim.tint];
          zCtx.shadowColor = tc; zCtx.shadowBlur = 18;
        }
        if (sim.eff === 'stun') {
          zCtx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(sim._simTime * 8));
        }
        zCtx.drawImage(srcCanvas, bb.x1, bb.y1, sw, sh, dx, dy, dw, dh);
        zCtx.restore();

        // Shadow
        const sg = zCtx.createRadialGradient(zombieSX, GY+2, 0, zombieSX, GY+2, dw*0.45);
        sg.addColorStop(0,'#00000065'); sg.addColorStop(1,'#00000000');
        zCtx.fillStyle = sg;
        zCtx.beginPath(); zCtx.ellipse(zombieSX, GY+3, dw*0.44, 6, 0, 0, Math.PI*2); zCtx.fill();

        // Badge spread nếu đang bật
        if (Math.abs(_zpSpread - 1.0) > 0.01) {
          drawBadge(zCtx, W - 90, 6, `spread ${_zpSpread.toFixed(2)}×`, '#8855ff55');
        }
      } else {
        fallbackZombie(zombieSX, GY, H);
      }
    }

    // ── Off-screen indicator: mũi tên nếu zombie ngoài màn hình ──
    if (zombieSX < 10) {
      drawArrow(20, GY - 40, 'left', '#ffaa00');
    } else if (zombieSX > W - 10) {
      drawArrow(W - 20, GY - 40, 'right', '#00ff88');
    }

    // ── Effect overlay ──
    if (sim.eff) {
      const EC = {slow:'#44ccff', stun:'#ffaa00', speedbuff:'#00ff88'};
      const EL = {slow:'❄ SLOWED', stun:'⚡ STUNNED', speedbuff:'🔥 BUFFED'};
      zCtx.save(); zCtx.font = 'bold 10px monospace';
      zCtx.fillStyle = EC[sim.eff]||'#fff'; zCtx.textAlign = 'center';
      // Vẽ gần zombie nếu trong màn hình
      const lx = Math.max(60, Math.min(W-60, zombieSX));
      zCtx.shadowColor = EC[sim.eff]; zCtx.shadowBlur = 8;
      zCtx.fillText(EL[sim.eff]||'', lx, GY - H*0.62 - 10);
      zCtx.restore();
    }

    // ── Stats overlay badges ──
    const _ps = sim.pixelScale || 80;
    drawBadge(zCtx, 8, 6, `x ${(sim.x/_ps).toFixed(3)}u`);
    drawBadge(zCtx, 88, 6, `→ ${(sim.tx/_ps).toFixed(3)}u`);
    drawBadge(zCtx, 168, 6, `×${sim.smult.toFixed(2)}`);

    if (sim.eff) {
      const EC3 = {slow:'#44ccff44', stun:'#ffaa0044', speedbuff:'#00ff8844'};
      const EL3 = {slow:'❄', stun:'⚡', speedbuff:'🔥'};
      drawBadge(zCtx, 240, 6,
        `${EL3[sim.eff]} ${sim.efft.toFixed(1)}s anim×${sim.animScale.toFixed(2)}`,
        EC3[sim.eff]);
    }

    // ── Timer bar bottom ──
    if (sim.eff && sim.efftot > 0) {
      const pct = sim.efft / sim.efftot;
      const BC = {slow:'#44ccff', stun:'#ffaa00', speedbuff:'#00ff88'};
      zCtx.fillStyle = '#00000055'; zCtx.fillRect(0, H-3, W, 3);
      zCtx.fillStyle = BC[sim.eff]||'#fff'; zCtx.fillRect(0, H-3, W*pct, 3);
    }

    // ── Pan hint khi zombie off-screen ──
    if (zombieSX < 0 || zombieSX > W) {
      const msg = '📍 Nhấn CENTER để tìm zombie';
      zCtx.save();
      zCtx.font = '8px monospace'; zCtx.textAlign = 'center';
      zCtx.fillStyle = '#ffaa0099';
      zCtx.fillText(msg, W/2, H - 12);
      zCtx.restore();
    }
  }

  function drawArrow(x, y, dir, color) {
    zCtx.save();
    zCtx.fillStyle = color; zCtx.globalAlpha = 0.8;
    zCtx.beginPath();
    if (dir === 'left') {
      zCtx.moveTo(x+14, y-8); zCtx.lineTo(x, y); zCtx.lineTo(x+14, y+8);
    } else {
      zCtx.moveTo(x-14, y-8); zCtx.lineTo(x, y); zCtx.lineTo(x-14, y+8);
    }
    zCtx.closePath(); zCtx.fill();
    zCtx.restore();
  }

  function drawBadge(ctx, x, y, text, bg) {
    ctx.save();
    ctx.font = 'bold 8px monospace';
    const tw = ctx.measureText(text).width + 10;
    ctx.fillStyle = bg || '#000000bb';
    ctx.beginPath();
    ctx.roundRect(x, y, tw, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffffcc'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x+5, y+8);
    ctx.restore();
  }

  function drawTree(x, baseY, size, leafC, trunkC) {
    zCtx.fillStyle = trunkC;
    zCtx.fillRect(x-size*0.09, baseY-size*0.5, size*0.18, size*0.5);
    zCtx.fillStyle = leafC;
    for (const [oy, sc] of [[0.35,0.55],[0.65,0.42],[0.95,0.30]]) {
      zCtx.beginPath();
      zCtx.moveTo(x, baseY-size*(oy+sc*1.2));
      zCtx.lineTo(x+size*sc, baseY-size*oy);
      zCtx.lineTo(x-size*sc, baseY-size*oy);
      zCtx.closePath(); zCtx.fill();
    }
  }

  function fallbackZombie(x, y, H) {
    zCtx.font = `${H*0.38}px serif`; zCtx.textAlign='center'; zCtx.textBaseline='bottom';
    zCtx.fillText('🧟', x, y+4);
  }

  // ── DOM stats (throttled) ─────────────────────────────────────────────────
  function updateStats() {
    const logEl = document.getElementById('zpLog');
    if (!logEl) return;
    if (!sim.eventLog.length) {
      logEl.innerHTML = '<span style="color:var(--mut2)">— Cần event "move_step" với Float ≠ 0 —</span>';
      return;
    }
    const EC = {slow:'#4cf', stun:'#f90', speedbuff:'#0f8'};
    const _ps2 = sim.pixelScale || 80;
    logEl.innerHTML = sim.eventLog.map(e =>
      `<div style="border-bottom:1px solid #fff1;padding:1px 0">` +
      `<span style="color:var(--mut2)">${e.t.toFixed(2)}s</span> ` +
      `f=<b style="color:var(--acc2)">${(e.float||0).toFixed(3)}</b> ` +
      `Δ=<b>${(e.delta).toFixed(4)}</b>u ` +
      `x=<b>${(e.x/_ps2).toFixed(3)}</b>u` +
      (e.eff ? ` <span style="color:${EC[e.eff]||'#fff'}">[${e.eff}]</span>` : '') +
      `</div>`
    ).join('');
  }

  function updateBadge() {
    const el = document.getElementById('zpStatusBadge');
    if (!el) return;
    if (active && S?.currentAnim) {
      el.textContent = `▶ ${S.currentAnim}`; el.style.background='#00ff8820'; el.style.color='#0f8';
    } else {
      el.textContent = '—'; el.style.background='#ffffff10'; el.style.color='var(--mut2)';
    }
  }

  // ── Public ────────────────────────────────────────────────────────────────
  function applyEffect(type, dur) {
    if (type==='slow') sim.applySlow(dur);
    if (type==='stun') sim.applyStun(dur);
    if (type==='buff') sim.applySpeedBuff(2.0, dur);
  }

  function reset() {
    sim.reset();
    // Sync pixelScale + spreadVal từ input
    const psEl = document.getElementById('zp_pixelScale');
    if (psEl) sim.pixelScale = parseFloat(psEl.value) || 80;
    const W = zCanvas?.width || 400;
    cameraX = -(W * 0.45); camLerpX = cameraX;
    _bbCache = null; _bbAnimName = null; _prevAnimTime = S?.currentTime ?? 0;
    updateStats();
  }

  return { init, onTick, setVisible, applyEffect, reset, updateBadge, snapToZombie, seekZombieTo,
           _getAnimScale: () => active ? sim.animScale : 1 };
})();

// ── Hook vào tick() + patch S.speed theo animScale ────────────────────────────
// Được gọi từ animation-controller.js: ZP.onTick(realDt)

// ── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    ZP.init();
    const orig = window.swTab;
    window.swTab = function(name) {
      if (orig) orig(name);
      ZP.setVisible(name === 'events');
    };
    if (document.querySelector('.tab.active')?.textContent.includes('Event')) {
      ZP.setVisible(true);
    }
  }, 500);
});
