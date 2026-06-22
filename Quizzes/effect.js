/**
 * effects.js — QuizMaster Visual Effects Library (ES Module)
 * ===========================================================
 * Import vào quizzes.js:
 *   import { spawnConfetti, spawnWrongEffect } from "./effects.js";
 *
 * Thêm hiệu ứng mới: chỉ cần viết function rồi push vào
 * CORRECT_EFFECTS hoặc WRONG_EFFECTS ở cuối file.
 */

// ─────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────

function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function makeOverlayCanvas(zIndex = 7999) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:${zIndex}`;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  return { canvas, ctx: canvas.getContext('2d'), W: canvas.width, H: canvas.height };
}

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `${Math.round(f(0)*255)},${Math.round(f(8)*255)},${Math.round(f(4)*255)}`;
}

function drawStar5(ctx, x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.42;
    i === 0 ? ctx.moveTo(x + Math.cos(a)*rr, y + Math.sin(a)*rr)
            : ctx.lineTo(x + Math.cos(a)*rr, y + Math.sin(a)*rr);
  }
  ctx.closePath();
}


// ─────────────────────────────────────────────
//  CORRECT EFFECTS
// ─────────────────────────────────────────────

function effectStarBurst() {
  const { canvas, ctx, W, H } = makeOverlayCanvas();
  const cx = W / 2, cy = H / 2;
  const hue = randInt(0, 360);
  const colA = hsl(hue, 1, 0.75);
  const colB = hsl((hue + 40) % 360, 1, 0.88);
  const RAY_COUNT = 18;
  const rays = Array.from({ length: RAY_COUNT }, (_, i) => ({
    angle: (i / RAY_COUNT) * Math.PI * 2 + rand(-0.15, 0.15),
    len: 0,
    maxLen: rand(0.38, 0.58) * Math.max(W, H),
    alpha: 0,
    color: Math.random() > 0.5 ? colA : colB,
  }));
  const STAR_COUNT = 28;
  const stars = Array.from({ length: STAR_COUNT }, () => {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(3, 9);
    return {
      x: cx, y: cy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rand(3, 8), alpha: 1,
      color: Math.random() > 0.5 ? colA : colB,
      rot: rand(0, Math.PI * 2), rotSpeed: rand(-0.25, 0.25),
    };
  });
  let flashAlpha = 0.9, frame = 0;
  const TOTAL = 75;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const t = frame / TOTAL;
    if (flashAlpha > 0) {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 140);
      grad.addColorStop(0, `rgba(${colB},${flashAlpha})`);
      grad.addColorStop(0.4, `rgba(${colA},${flashAlpha * 0.5})`);
      grad.addColorStop(1, `rgba(${colA},0)`);
      ctx.beginPath(); ctx.arc(cx, cy, 140, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();
      flashAlpha -= 0.055;
    }
    rays.forEach(r => {
      r.len = Math.min(r.maxLen, r.len + r.maxLen * 0.09);
      r.alpha = t < 0.35 ? (t / 0.35) * 0.45 : (1 - (t - 0.35) / 0.65) * 0.45;
      const ex = cx + Math.cos(r.angle) * r.len;
      const ey = cy + Math.sin(r.angle) * r.len;
      const grad = ctx.createLinearGradient(cx, cy, ex, ey);
      grad.addColorStop(0, `rgba(${r.color},${r.alpha})`);
      grad.addColorStop(0.6, `rgba(${r.color},${r.alpha * 0.4})`);
      grad.addColorStop(1, `rgba(${r.color},0)`);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(r.angle - 0.09) * r.len, cy + Math.sin(r.angle - 0.09) * r.len);
      ctx.lineTo(ex, ey);
      ctx.lineTo(cx + Math.cos(r.angle + 0.09) * r.len, cy + Math.sin(r.angle + 0.09) * r.len);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      ctx.restore();
    });
    stars.forEach(s => {
      s.x += s.vx; s.y += s.vy; s.vy += 0.12;
      s.alpha = Math.max(0, 1 - t * 1.2);
      s.rot += s.rotSpeed;
      ctx.save();
      ctx.globalAlpha = s.alpha;
      const sg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 3.5);
      sg.addColorStop(0, `rgba(${s.color},0.7)`);
      sg.addColorStop(1, `rgba(${s.color},0)`);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.size * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = sg; ctx.fill();
      drawStar5(ctx, s.x, s.y, s.size, s.rot);
      ctx.fillStyle = `rgb(${s.color})`; ctx.fill();
      ctx.restore();
    });
    frame++;
    if (frame < TOTAL) requestAnimationFrame(draw); else canvas.remove();
  }
  draw();
}

function effectBubbles() {
  const { canvas, ctx, W, H } = makeOverlayCanvas();
  const BUBBLE_COUNT = 55;
  const bubbles = Array.from({ length: BUBBLE_COUNT }, () => {
    const hue = randInt(0, 360);
    const r = rand(10, 48);
    return {
      x: rand(r, W - r), y: H + rand(0, 120), r,
      vy: rand(2.5, 6.5),
      wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.04, 0.10), wobbleAmp: rand(8, 24),
      hue, alpha: rand(0.55, 0.85), delay: randInt(0, 18),
    };
  });
  let frame = 0;
  const TOTAL = 100;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const t = frame / TOTAL;
    bubbles.forEach(b => {
      if (frame < b.delay) return;
      b.y -= b.vy; b.wobble += b.wobbleSpeed;
      const bx = b.x + Math.sin(b.wobble) * b.wobbleAmp;
      const fadeIn = Math.min(1, (frame - b.delay) / 10);
      const fadeOut = b.y < H * 0.1 ? (b.y / (H * 0.1)) : 1;
      const a = b.alpha * fadeIn * fadeOut;
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(bx - b.r*0.3, b.y - b.r*0.3, b.r*0.1, bx, b.y, b.r);
      g.addColorStop(0, `hsla(${b.hue},100%,90%,0.95)`);
      g.addColorStop(0.5, `hsla(${b.hue},90%,65%,0.55)`);
      g.addColorStop(1, `hsla(${b.hue},80%,50%,0.25)`);
      ctx.beginPath(); ctx.arc(bx, b.y, b.r, 0, Math.PI*2);
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = `hsla(${b.hue},100%,80%,0.7)`; ctx.stroke();
      ctx.beginPath(); ctx.arc(bx - b.r*0.28, b.y - b.r*0.3, b.r*0.22, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,0.55)`; ctx.fill();
      ctx.restore();
    });
    frame++;
    if (frame < TOTAL) requestAnimationFrame(draw); else canvas.remove();
  }
  draw();
}

function effectFireworks() {
  const { canvas, ctx, W, H } = makeOverlayCanvas();
  const palettes = [
    [0, 30, 60, 120, 200, 280, 320],
    [0, 15, 30, 45],
    [180, 200, 220, 240, 260],
    [280, 300, 320, 340, 360],
    [60, 90, 120, 150],
  ];
  const palette = randPick(palettes);
  function makeShell(cx, cy, hue) {
    const count = randInt(40, 70);
    const speed = rand(3, 7);
    return Array.from({ length: count }, () => {
      const angle = rand(0, Math.PI * 2);
      const sp = speed * rand(0.5, 1.0);
      return {
        x: cx, y: cy,
        vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp,
        alpha: 1, r: rand(2, 5),
        hue: hue + rand(-18, 18), trail: [], gravity: rand(0.06, 0.14),
      };
    });
  }
  const shellCount = randInt(3, 5);
  const shells = Array.from({ length: shellCount }, (_, i) => ({
    particles: makeShell(rand(W*0.15, W*0.85), rand(H*0.08, H*0.5), palette[i % palette.length]),
    delay: i * 8,
  }));
  let frame = 0;
  const TOTAL = 110;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    shells.forEach(shell => {
      if (frame < shell.delay) return;
      shell.particles.forEach(p => {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 7) p.trail.shift();
        p.x += p.vx; p.y += p.vy;
        p.vy += p.gravity; p.vx *= 0.98; p.vy *= 0.98;
        p.alpha = Math.max(0, p.alpha - rand(0.012, 0.022));
        if (p.alpha <= 0) return;
        if (p.trail.length >= 2) {
          for (let i = 1; i < p.trail.length; i++) {
            ctx.save();
            ctx.globalAlpha = (i / p.trail.length) * p.alpha * 0.5;
            ctx.strokeStyle = `hsl(${p.hue},100%,70%)`;
            ctx.lineWidth = p.r * 0.5;
            ctx.beginPath();
            ctx.moveTo(p.trail[i-1].x, p.trail[i-1].y);
            ctx.lineTo(p.trail[i].x, p.trail[i].y);
            ctx.stroke(); ctx.restore();
          }
        }
        ctx.save(); ctx.globalAlpha = p.alpha;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r*2.5);
        g.addColorStop(0, `hsl(${p.hue},100%,90%)`);
        g.addColorStop(0.5, `hsl(${p.hue},100%,65%)`);
        g.addColorStop(1, `hsla(${p.hue},100%,50%,0)`);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r*2.5, 0, Math.PI*2);
        ctx.fillStyle = g; ctx.fill(); ctx.restore();
      });
    });
    frame++;
    if (frame < TOTAL) requestAnimationFrame(draw); else canvas.remove();
  }
  draw();
}

function effectConfettiRain() {
  const { canvas, ctx, W, H } = makeOverlayCanvas();
  const shapes = ['rect', 'circle', 'triangle'];
  const pieces = Array.from({ length: 120 }, () => ({
    x: rand(0, W), y: rand(-H*0.5, 0),
    vx: rand(-1.5, 1.5), vy: rand(3, 8),
    rot: rand(0, Math.PI*2), rotSpeed: rand(-0.15, 0.15),
    w: rand(6, 16), h: rand(4, 10),
    hue: randInt(0, 360), alpha: rand(0.7, 1),
    shape: randPick(shapes),
    swing: rand(0, Math.PI*2), swingSpeed: rand(0.03, 0.08), swingAmp: rand(1, 3),
    delay: randInt(0, 30),
  }));
  let frame = 0;
  const TOTAL = 120;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const t = frame / TOTAL;
    pieces.forEach(p => {
      if (frame < p.delay) return;
      p.x += p.vx + Math.sin(p.swing) * p.swingAmp;
      p.y += p.vy; p.rot += p.rotSpeed; p.swing += p.swingSpeed;
      const fadeOut = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      if (p.y > H + 20 || fadeOut <= 0) return;
      ctx.save(); ctx.globalAlpha = p.alpha * fadeOut;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = `hsl(${p.hue},100%,65%)`;
      if (p.shape === 'rect') ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      else if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0,0,p.w/2,0,Math.PI*2); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(0,-p.h/2); ctx.lineTo(p.w/2,p.h/2); ctx.lineTo(-p.w/2,p.h/2); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    });
    frame++;
    if (frame < TOTAL) requestAnimationFrame(draw); else canvas.remove();
  }
  draw();
}

function effectGalaxySpiral() {
  const { canvas, ctx, W, H } = makeOverlayCanvas();
  const cx = W/2, cy = H/2;
  const hue = randPick([120, 180, 260, 300, 30]);
  const armCount = randInt(2, 4);
  const particles = Array.from({ length: 180 }, (_, i) => {
    const arm = i % armCount;
    const prog = i / 180;
    const angle = arm * (Math.PI*2/armCount) + prog * Math.PI * 4;
    const dist = prog * Math.min(W, H) * 0.42;
    return { angle, dist, alpha: 0, r: rand(1.5, 4), hueOff: rand(-30, 30), speed: rand(0.03, 0.07) };
  });
  let frame = 0;
  const TOTAL = 95;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const t = frame / TOTAL;
    particles.forEach(p => {
      p.angle += p.speed * (1 - t * 0.5);
      const px = cx + Math.cos(p.angle) * p.dist * t;
      const py = cy + Math.sin(p.angle) * p.dist * t;
      p.alpha = Math.min(1, t*3) * Math.max(0, 1 - (t-0.5)*2);
      if (p.alpha <= 0) return;
      ctx.save(); ctx.globalAlpha = p.alpha;
      const g = ctx.createRadialGradient(px, py, 0, px, py, p.r*3);
      g.addColorStop(0, `hsl(${hue+p.hueOff},100%,90%)`);
      g.addColorStop(1, `hsla(${hue+p.hueOff},100%,60%,0)`);
      ctx.beginPath(); ctx.arc(px, py, p.r*3, 0, Math.PI*2);
      ctx.fillStyle = g; ctx.fill(); ctx.restore();
    });
    frame++;
    if (frame < TOTAL) requestAnimationFrame(draw); else canvas.remove();
  }
  draw();
}


// ─────────────────────────────────────────────
//  WRONG EFFECTS
// ─────────────────────────────────────────────

function effectBlackHole() {
  const { canvas, ctx, W, H } = makeOverlayCanvas();
  const cx = rand(W*0.35, W*0.65);
  const cy = rand(H*0.35, H*0.65);
  const ringHues = [[160,0,60],[100,0,120],[0,60,120],[0,120,60]];
  const [ra, ga, ba] = randPick(ringHues);
  const BH_MAX = rand(70, 110);
  function makeCrack() {
    const angle = rand(0, Math.PI*2);
    const segs = randInt(4, 8);
    const pts = [{ x: cx, y: cy }];
    let ax = cx, ay = cy;
    const baseLen = rand(50, 140);
    for (let i = 0; i < segs; i++) {
      const dev = rand(-0.8, 0.8), len = (baseLen/segs)*rand(0.6,1.2);
      ax += Math.cos(angle+dev)*len; ay += Math.sin(angle+dev)*len;
      pts.push({ x: ax, y: ay });
    }
    return { pts, alpha: 0.95, color: Math.random()>0.5?[ra*1.6|0,ga,ba]:[200,0,180] };
  }
  const cracks = Array.from({ length: randInt(7,13) }, makeCrack);
  const debris = Array.from({ length: 32 }, () => {
    const angle = rand(0, Math.PI*2), dist = rand(60, 240);
    return { x: cx+Math.cos(angle)*dist, y: cy+Math.sin(angle)*dist, alpha: rand(0.7,1), size: rand(2,5), color: Math.random()>0.5?[ra*2|0,ga,ba]:[120,0,180] };
  });
  let flashAlpha = 0.35, frame = 0;
  const TOTAL = 72;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const t = frame / TOTAL;
    if (flashAlpha > 0) {
      ctx.fillStyle = `rgba(${ra},${ga},${ba},${flashAlpha*0.8})`; ctx.fillRect(0,0,W,H); flashAlpha -= 0.022;
    }
    const bhRadius = t < 0.5 ? (t/0.5)*BH_MAX : BH_MAX*(1-(t-0.5)/0.5);
    if (bhRadius > 1) {
      const glow = ctx.createRadialGradient(cx,cy,bhRadius*0.3,cx,cy,bhRadius*2.8);
      glow.addColorStop(0, `rgba(${ra},${ga},${ba},${0.6*(1-t)})`);
      glow.addColorStop(0.5, `rgba(${Math.floor(ra/2)},0,${Math.floor(ba*1.5)},${0.3*(1-t)})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(cx,cy,bhRadius*2.8,0,Math.PI*2); ctx.fillStyle=glow; ctx.fill();
      for (let r=bhRadius; r<bhRadius*1.6; r+=2) {
        const a = (1-(r-bhRadius)/(bhRadius*0.6))*0.55*(1-t*0.7);
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
        ctx.strokeStyle=`rgba(${ra*2|0},${Math.floor(ga+(r-bhRadius)*50)},${ba},${a})`; ctx.lineWidth=1.5; ctx.stroke();
      }
      const core = ctx.createRadialGradient(cx,cy,0,cx,cy,bhRadius);
      core.addColorStop(0,'rgba(0,0,0,1)'); core.addColorStop(0.75,'rgba(8,0,18,1)'); core.addColorStop(1,`rgba(${ra*0.2|0},0,${ba*0.4|0},0.7)`);
      ctx.beginPath(); ctx.arc(cx,cy,bhRadius,0,Math.PI*2); ctx.fillStyle=core; ctx.fill();
    }
    cracks.forEach(c => {
      c.alpha = Math.max(0, c.alpha-0.02); if (c.alpha<=0) return;
      ctx.save(); ctx.globalAlpha=c.alpha; ctx.shadowColor=`rgb(${c.color})`; ctx.shadowBlur=18;
      ctx.beginPath(); ctx.moveTo(c.pts[0].x,c.pts[0].y); c.pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
      ctx.strokeStyle=`rgb(${c.color})`; ctx.lineWidth=2.2; ctx.stroke();
      ctx.lineWidth=0.7; ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.stroke(); ctx.restore();
    });
    debris.forEach(d => {
      const dx=cx-d.x, dy=cy-d.y, dist=Math.sqrt(dx*dx+dy*dy)||1, pull=(3+t*7)/dist;
      d.x+=dx*pull; d.y+=dy*pull; d.alpha=Math.max(0,d.alpha-0.016); if(d.alpha<=0) return;
      ctx.save(); ctx.globalAlpha=d.alpha; ctx.fillStyle=`rgb(${d.color})`;
      ctx.beginPath(); ctx.arc(d.x,d.y,d.size,0,Math.PI*2); ctx.fill(); ctx.restore();
    });
    frame++;
    if (frame < TOTAL) requestAnimationFrame(draw); else canvas.remove();
  }
  draw();
}

function effectScreenCrack() {
  const { canvas, ctx, W, H } = makeOverlayCanvas();
  const impactX = rand(W*0.3, W*0.7), impactY = rand(H*0.3, H*0.7);
  const crackColor = randPick([[255,60,60],[200,0,200],[255,120,0],[0,180,255]]);
  function makeCrackTree(ox, oy, angle, depth, len) {
    if (depth<=0||len<12) return [];
    const segs = [];
    let ax=ox, ay=oy;
    for (let i=0; i<randInt(3,6); i++) {
      const dev=rand(-0.45,0.45), segLen=(len/randInt(3,6))*rand(0.7,1.3);
      const ex=ax+Math.cos(angle+dev)*segLen, ey=ay+Math.sin(angle+dev)*segLen;
      segs.push({x1:ax,y1:ay,x2:ex,y2:ey,alpha:0,delay:depth*3+i*2});
      ax=ex; ay=ey;
      if (Math.random()<0.55&&depth>1) segs.push(...makeCrackTree(ax,ay,angle+rand(0.4,1.1)*(Math.random()>0.5?1:-1),depth-1,len*rand(0.45,0.7)));
    }
    return segs;
  }
  const allSegs = [];
  for (let i=0; i<randInt(4,8); i++) allSegs.push(...makeCrackTree(impactX,impactY,(i/8)*Math.PI*2+rand(-0.3,0.3),4,rand(80,180)));
  let impactFlash=1.0, shakeFrame=0, frame=0;
  const TOTAL=90;
  function draw() {
    ctx.clearRect(0,0,W,H);
    const t=frame/TOTAL;
    let dx=0,dy=0;
    if (shakeFrame<10) { dx=rand(-6,6); dy=rand(-4,4); shakeFrame++; }
    const overlayAlpha=Math.max(0,0.5-t*0.5);
    if (overlayAlpha>0) { ctx.fillStyle=`rgba(0,0,0,${overlayAlpha})`; ctx.fillRect(0,0,W,H); }
    if (impactFlash>0) {
      ctx.save(); ctx.translate(dx,dy);
      const g=ctx.createRadialGradient(impactX,impactY,0,impactX,impactY,80);
      g.addColorStop(0,`rgba(255,255,255,${impactFlash})`); g.addColorStop(0.4,`rgba(${crackColor},${impactFlash*0.6})`); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(impactX,impactY,80,0,Math.PI*2); ctx.fillStyle=g; ctx.fill(); ctx.restore();
      impactFlash-=0.08;
    }
    ctx.save(); ctx.translate(dx,dy);
    allSegs.forEach(seg => {
      if (frame<seg.delay) return;
      seg.alpha=Math.min(1,seg.alpha+0.15);
      const fadeOut=t>0.6?1-(t-0.6)/0.4:1;
      if (seg.alpha<=0||fadeOut<=0) return;
      ctx.save(); ctx.globalAlpha=seg.alpha*fadeOut;
      ctx.shadowColor=`rgb(${crackColor})`; ctx.shadowBlur=10;
      ctx.strokeStyle=`rgb(${crackColor})`; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(seg.x1,seg.y1); ctx.lineTo(seg.x2,seg.y2); ctx.stroke();
      ctx.lineWidth=0.6; ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.stroke(); ctx.restore();
    });
    ctx.restore();
    frame++;
    if (frame<TOTAL) requestAnimationFrame(draw); else canvas.remove();
  }
  draw();
}

function effectRain() {
  const { canvas, ctx, W, H } = makeOverlayCanvas();
  const rainColor = randPick([[100,160,255],[150,200,255],[180,130,255],[100,220,220]]);
  const drops = Array.from({ length: 180 }, () => ({
    x: rand(0,W), y: rand(-H,H*0.5), len: rand(18,60), vy: rand(18,38), alpha: rand(0.3,0.75), delay: randInt(0,20),
  }));
  const splashes = [];
  let frame=0;
  const TOTAL=100;
  function draw() {
    ctx.clearRect(0,0,W,H);
    const t=frame/TOTAL;
    ctx.fillStyle=`rgba(0,10,30,${Math.max(0,0.35-t*0.35)})`; ctx.fillRect(0,0,W,H);
    drops.forEach(d => {
      if (frame<d.delay) return;
      d.y+=d.vy;
      if (d.y>H+d.len) { splashes.push({x:d.x,y:H-2,r:0,maxR:rand(6,18),alpha:0.7}); d.y=rand(-d.len*2,0); d.x=rand(0,W); }
      const fadeOut=t>0.75?1-(t-0.75)/0.25:1;
      ctx.save(); ctx.globalAlpha=d.alpha*fadeOut; ctx.lineWidth=rand(0.8,1.8);
      ctx.strokeStyle=`rgba(${rainColor},0.7)`; ctx.beginPath(); ctx.moveTo(d.x,d.y); ctx.lineTo(d.x-2,d.y+d.len); ctx.stroke(); ctx.restore();
    });
    for (let i=splashes.length-1; i>=0; i--) {
      const s=splashes[i]; s.r+=1.2; s.alpha-=0.055;
      if (s.alpha<=0||s.r>s.maxR) { splashes.splice(i,1); continue; }
      ctx.save(); ctx.globalAlpha=s.alpha; ctx.strokeStyle=`rgba(${rainColor},1)`; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,Math.PI,Math.PI*2); ctx.stroke(); ctx.restore();
    }
    frame++;
    if (frame<TOTAL) requestAnimationFrame(draw); else canvas.remove();
  }
  draw();
}

function effectLightning() {
  const { canvas, ctx, W, H } = makeOverlayCanvas();
  const strikeX = rand(W*0.2, W*0.8);
  const lightColor = randPick([[180,200,255],[255,255,200],[200,100,255],[100,255,220]]);
  function makeBolt(x1,y1,x2,y2,roughness,depth) {
    if (depth<=0) return [{x1,y1,x2,y2}];
    const mx=(x1+x2)/2+rand(-roughness,roughness), my=(y1+y2)/2+rand(-roughness*0.5,roughness*0.5);
    const segs=[...makeBolt(x1,y1,mx,my,roughness*0.5,depth-1),...makeBolt(mx,my,x2,y2,roughness*0.5,depth-1)];
    if (depth>=2&&Math.random()<0.45) segs.push(...makeBolt(mx,my,mx+rand(-80,80),my+rand(30,120),roughness*0.4,depth-2));
    return segs;
  }
  const bolts = Array.from({ length: randInt(1,3) }, (_,i) => ({
    segs: makeBolt(strikeX+rand(-40,40),0,strikeX+rand(-20,20),H*rand(0.5,0.95),80,5),
    alpha: 1, delay: i*6,
  }));
  let flashAlpha=0.7, frame=0;
  const TOTAL=55;
  function draw() {
    ctx.clearRect(0,0,W,H); const t=frame/TOTAL;
    if (flashAlpha>0) { ctx.fillStyle=`rgba(${lightColor},${flashAlpha*0.4})`; ctx.fillRect(0,0,W,H); flashAlpha-=0.08; }
    bolts.forEach(bolt => {
      if (frame<bolt.delay) return;
      bolt.alpha=Math.max(0,1-(frame-bolt.delay)/20);
      bolt.segs.forEach(seg => {
        ctx.save(); ctx.globalAlpha=bolt.alpha;
        ctx.shadowColor=`rgb(${lightColor})`; ctx.shadowBlur=22;
        ctx.strokeStyle=`rgb(${lightColor})`; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.moveTo(seg.x1,seg.y1); ctx.lineTo(seg.x2,seg.y2); ctx.stroke();
        ctx.shadowBlur=0; ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=0.9; ctx.stroke(); ctx.restore();
      });
    });
    if (t>0.1&&t<0.5) {
      const gAlpha=(0.5-t)/0.4*0.6, g=ctx.createRadialGradient(strikeX,H,0,strikeX,H,120);
      g.addColorStop(0,`rgba(${lightColor},${gAlpha})`); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(strikeX,H,120,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
    }
    frame++;
    if (frame<TOTAL) requestAnimationFrame(draw); else canvas.remove();
  }
  draw();
}

function effectGlitch() {
  const { canvas, ctx, W, H } = makeOverlayCanvas();
  const glitchColors=[[255,0,80],[0,255,200],[255,200,0],[0,100,255],[200,0,255]];
  let frame=0;
  const TOTAL=60;
  function draw() {
    ctx.clearRect(0,0,W,H); const t=frame/TOTAL;
    const intensity=t<0.3?t/0.3:t>0.7?(1-t)/0.3:1;
    for (let y=0; y<H; y+=randInt(4,20)) {
      if (Math.random()<0.3*intensity) {
        const color=randPick(glitchColors);
        ctx.fillStyle=`rgba(${color},${rand(0.08,0.22)*intensity})`;
        ctx.fillRect(rand(-40,40)*intensity,y,W,randInt(2,8));
      }
    }
    for (let i=0; i<randInt(2,6); i++) {
      const color=randPick(glitchColors);
      ctx.fillStyle=`rgba(${color},${rand(0.1,0.35)*intensity})`;
      ctx.fillRect(rand(0,W),0,rand(2,30)*intensity,H);
    }
    const pulse=Math.sin(frame*0.8)*0.1*intensity;
    if (pulse>0) { ctx.fillStyle=`rgba(0,0,0,${pulse})`; ctx.fillRect(0,0,W,H); }
    frame++;
    if (frame<TOTAL) requestAnimationFrame(draw); else canvas.remove();
  }
  draw();
}


// ─────────────────────────────────────────────
//  ANSWER GLOW (đúng = xanh, sai = đỏ)
// ─────────────────────────────────────────────

function spawnAnswerGlow(isCorrect) {
  const { canvas, ctx, W, H } = makeOverlayCanvas(7998);
  const cx=W/2, cy=H/2;
  const baseColor = isCorrect
    ? randPick([[0,212,170],[100,255,180],[60,200,255]])
    : randPick([[255,60,60],[200,0,180],[255,100,0]]);
  const rings = Array.from({length:3},(_,i)=>({ r:0, maxR:rand(280,500), delay:i*7, alpha:0.55-i*0.1 }));
  let frame=0;
  const TOTAL=45;
  function draw() {
    ctx.clearRect(0,0,W,H); const t=frame/TOTAL;
    rings.forEach(ring => {
      if (frame<ring.delay) return;
      const prog=(frame-ring.delay)/(TOTAL-ring.delay);
      ring.r=ring.maxR*prog;
      const a=ring.alpha*(1-prog); if (a<=0) return;
      for (let blur=0; blur<3; blur++) {
        const spread=(blur+1)*12;
        const g=ctx.createRadialGradient(cx,cy,ring.r-spread,cx,cy,ring.r+spread);
        g.addColorStop(0,`rgba(${baseColor},0)`);
        g.addColorStop(0.4,`rgba(${baseColor},${a*(0.8-blur*0.2)})`);
        g.addColorStop(1,`rgba(${baseColor},0)`);
        ctx.beginPath(); ctx.arc(cx,cy,ring.r+spread,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      }
    });
    frame++;
    if (frame<TOTAL) requestAnimationFrame(draw); else canvas.remove();
  }
  draw();
}


// ─────────────────────────────────────────────
//  EFFECT POOLS
//  → Thêm hiệu ứng mới: chỉ push function vào đây
// ─────────────────────────────────────────────

const CORRECT_EFFECTS = [
  effectStarBurst,
  effectBubbles,
  effectFireworks,
  effectConfettiRain,
  effectGalaxySpiral,
];

const WRONG_EFFECTS = [
  effectBlackHole,
  effectScreenCrack,
  effectRain,
  effectLightning,
  effectGlitch,
];


// ─────────────────────────────────────────────
//  ANTI-REPEAT TRACKER
// ─────────────────────────────────────────────

let _lastCorrectIdx = -1;
let _lastWrongIdx   = -1;

function pickEffect(pool, lastIdx) {
  if (pool.length === 1) return 0;
  let idx;
  do { idx = randInt(0, pool.length - 1); } while (idx === lastIdx);
  return idx;
}


// ─────────────────────────────────────────────
//  PUBLIC API  (export cho quizzes.js import)
// ─────────────────────────────────────────────

export function spawnConfetti(n = 20) {
  if (n > 20) {
    effectConfettiRain();
    setTimeout(effectFireworks, 200);
    return;
  }
  spawnAnswerGlow(true);
  const idx = pickEffect(CORRECT_EFFECTS, _lastCorrectIdx);
  _lastCorrectIdx = idx;
  CORRECT_EFFECTS[idx]();
}

export function spawnWrongEffect() {
  spawnAnswerGlow(false);
  const idx = pickEffect(WRONG_EFFECTS, _lastWrongIdx);
  _lastWrongIdx = idx;
  WRONG_EFFECTS[idx]();
}