// canvas-renderer.js – Vẽ frame, xử lý ma trận, hit test
'use strict';

let _currentDrawLayer = null;

function reconstructMatrix(sx, sy, rotDeg, tx, ty) {
  const r = rotDeg * Math.PI / 180;
  const cosR = Math.cos(r), sinR = Math.sin(r);
  return {
    a:  sx * cosR,
    b:  sx * sinR,
    c: -sy * sinR,
    d:  sy * cosR,
    tx, ty
  };
}

function getActiveKF(kfs, t) {
  if (!kfs?.length) return null;
  let res = null;
  for (const kf of kfs) {
    if (kf.time <= t + 1e-6) res = kf;
    else break;
  }
  return res;
}

// Hàm tính centroid của các part trong một layer tại frame hiện tại
function getLayerCentroid(animName, layerName, t) {
  const animTL = S.timeline[animName];
  if (!animTL) return null;
  const kfs = animTL[layerName];
  const kf = kfs ? getActiveKF(kfs, t) : null;
  const parts = kf?.parts || [];
  const visibleParts = parts.filter(p => p.alpha > 0.005);
  if (visibleParts.length === 0) return null;
  
  let sumX = 0, sumY = 0;
  for (const p of visibleParts) {
    sumX += p.x;
    sumY += p.y;
  }
  return { x: sumX / visibleParts.length, y: sumY / visibleParts.length };
}

function renderFrame(animName, t) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const animTL = S.timeline[animName];
  if (!animTL) return;

  for (const layer of S.layers) {
    if (S.hiddenLayers.has(layer.name)) continue;
    const kfs = animTL[layer.name];
    if (!kfs) continue;
    const kf = getActiveKF(kfs, t);
    if (!kf?.parts?.length || kf.visible === false) continue;
    _currentDrawLayer = layer.name;

    // Tính centroid cho layer này
    const centroid = getLayerCentroid(animName, layer.name, t);

    for (let pi = 0; pi < kf.parts.length; pi++) {
      const part = kf.parts[pi];
      if (part.alpha <= 0.005) continue;

      // Áp dụng alphaOverride nếu có
      let effectivePart = part;
      const ao = S.alphaOverrides && S.alphaOverrides[layer.name];
      if (ao) {
        const delta = (ao[animName] !== undefined) ? ao[animName] : (ao['all'] !== undefined ? ao['all'] : 0);
        if (delta !== 0) {
          effectivePart = Object.assign({}, part, { alpha: Math.max(0, Math.min(1, part.alpha + delta)) });
        }
      }
      if (effectivePart.alpha <= 0.005) continue;

      drawPart(effectivePart, W, H, false, pi, centroid);
    }
  }

  const needHighlight = S.highlightLayer ||
    (S.selectedLayers && S.selectedLayers.size > 0) ||
    (S.lockedMoveLayers && S.lockedMoveLayers.size > 0);
  if (needHighlight) drawHighlight(animName, t);
  updateRightPanel(animName, t);

  S._hoverBgCanvas = null;
}

function drawPart(part, W, H, highlight, partIndex, centroid) {
  const bmpName = part.bitmap;
  const img = S.imgCache[bmpName];
  let szW = (img && img.naturalWidth > 0) ? img.naturalWidth  : (S.bitmaps[bmpName]?.w || 1);
  let szH = (img && img.naturalHeight > 0) ? img.naturalHeight : (S.bitmaps[bmpName]?.h || 1);
  if (!szW || !szH) return;

  // 1. Áp dụng partSpacing (co giãn quanh centroid của layer)
  const partSpacing = S.partSpacing || 1.0;
  let spacedX = part.x;
  let spacedY = part.y;
  if (centroid) {
    spacedX = centroid.x + (part.x - centroid.x) * partSpacing;
    spacedY = centroid.y + (part.y - centroid.y) * partSpacing;
  }

  // 2. Áp dụng outputSpread (co giãn toàn bộ về tâm canvas)
  const spread = S.outputSpread || 1.0;
  const adjX = spacedX / spread;
  const adjY = spacedY / spread;
  const tx = adjX + W / 2;
  const ty = H / 2 - adjY;

  const m = reconstructMatrix(part.sx, part.sy, part.rot, tx, ty);
  const ox = -szW / 2;
  const oy = -szH / 2;

  const pts = [
    [ox,        oy       ],
    [ox + szW,  oy       ],
    [ox + szW,  oy + szH ],
    [ox,        oy + szH ],
  ].map(([lx, ly]) => ({
    x: m.a * lx + m.c * ly + m.tx,
    y: m.b * lx + m.d * ly + m.ty,
  }));

  if (img && !S.imgMissing[bmpName]) {
    ctx.save();
    ctx.globalAlpha = part.alpha;
    ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
    ctx.drawImage(img, ox, oy, szW, szH);
    ctx.restore();
  }

  if (!img || S.imgMissing[bmpName]) {
    ctx.save();
    ctx.globalAlpha = part.alpha;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,0,102,0.10)';
    ctx.fill();
    ctx.strokeStyle = '#ff0066';
    ctx.lineWidth = 1;
    ctx.stroke();
    const cx2 = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
    const cy2 = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
    ctx.fillStyle = '#ff0066cc';
    ctx.font = `${Math.max(7, Math.min(12, szW / 5))}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx2, cy2);
    ctx.restore();
  }

  if (highlight) {
    ctx.save();
    ctx.strokeStyle = '#00ffb4';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00ffb4';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#00ffb4';
    for (const pt of pts) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    ctx.strokeStyle = '#ffb020';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (partIndex !== undefined && S.lockedParts.has(_currentDrawLayer + '::' + partIndex)) {
    ctx.save();
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff8c00';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,140,0,0.12)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff8c00';
    for (const pt of pts) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const cx3 = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
    const cy3 = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx3 - 6, cy3); ctx.lineTo(cx3 + 6, cy3);
    ctx.moveTo(cx3, cy3 - 6); ctx.lineTo(cx3, cy3 + 6);
    ctx.stroke();
    ctx.restore();
  }
}

function drawHighlight(animName, t) {
  const W = canvas.width, H = canvas.height;

  const toHighlight = new Set([
    ...(S.selectedLayers || []),
    ...(S.lockedMoveLayers || []),
  ]);
  if (S.highlightLayer) toHighlight.add(S.highlightLayer);

  for (const layerName of toHighlight) {
    const kfs = (S.timeline[animName]||{})[layerName];
    if (!kfs) {
      if (layerName === S.highlightLayer) {
        ctx.save();
        ctx.font = '12px var(--font)';
        ctx.fillStyle = 'var(--amb)';
        ctx.textAlign = 'center';
        ctx.fillText(`⚠ ${layerName} (không có part ở frame này)`, canvas.width/2, 20);
        ctx.restore();
      }
      continue;
    }
    const kf = getActiveKF(kfs, t);
    if (!kf?.parts?.length) continue;

    _currentDrawLayer = layerName;
    const centroid = getLayerCentroid(animName, layerName, t);
    for (let pi = 0; pi < kf.parts.length; pi++) {
      drawPart(kf.parts[pi], W, H, true, pi, centroid);
    }
  }
}

function drawPartOnCtx(ctx2, part, W, H, highlight, centroid) {
  const bmpName = part.bitmap;
  const img = S.imgCache[bmpName];
  let szW = (img && img.naturalWidth > 0) ? img.naturalWidth  : (S.bitmaps[bmpName]?.w || 1);
  let szH = (img && img.naturalHeight > 0) ? img.naturalHeight : (S.bitmaps[bmpName]?.h || 1);
  if (!szW || !szH) return;

  // 1. partSpacing
  const partSpacing = S.partSpacing || 1.0;
  let spacedX = part.x;
  let spacedY = part.y;
  if (centroid) {
    spacedX = centroid.x + (part.x - centroid.x) * partSpacing;
    spacedY = centroid.y + (part.y - centroid.y) * partSpacing;
  }

  // 2. outputSpread
  const spread = S.outputSpread || 1.0;
  const adjX = spacedX / spread;
  const adjY = spacedY / spread;
  const tx = adjX + W / 2;
  const ty = H / 2 - adjY;

  const m  = reconstructMatrix(part.sx, part.sy, part.rot, tx, ty);
  const ox = -szW / 2, oy = -szH / 2;

  const pts = [
    [ox, oy], [ox+szW, oy], [ox+szW, oy+szH], [ox, oy+szH]
  ].map(([lx, ly]) => ({
    x: m.a*lx + m.c*ly + m.tx,
    y: m.b*lx + m.d*ly + m.ty,
  }));

  if (img && !S.imgMissing[bmpName]) {
    ctx2.save();
    ctx2.globalAlpha = part.alpha;
    ctx2.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
    ctx2.drawImage(img, ox, oy, szW, szH);
    ctx2.restore();
  } else {
    ctx2.save();
    ctx2.beginPath();
    ctx2.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx2.lineTo(p.x, p.y));
    ctx2.closePath();
    ctx2.fillStyle = 'rgba(255,0,102,0.15)';
    ctx2.fill();
    ctx2.strokeStyle = '#ff0066';
    ctx2.lineWidth = 1;
    ctx2.stroke();
    ctx2.restore();
  }

  if (highlight) {
    ctx2.save();
    ctx2.strokeStyle = '#00ffb4';
    ctx2.lineWidth = 1.5;
    ctx2.shadowColor = '#00ffb4';
    ctx2.shadowBlur = 5;
    ctx2.beginPath();
    ctx2.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx2.lineTo(pts[i].x, pts[i].y);
    ctx2.closePath();
    ctx2.stroke();
    ctx2.shadowBlur = 0;
    ctx2.restore();
  }
}

function pointInPart(lx, ly, part, W, H, centroid) {
  const img = S.imgCache[part.bitmap];
  const szW = (img && img.naturalWidth  > 0) ? img.naturalWidth  : (S.bitmaps[part.bitmap]?.w || 1);
  const szH = (img && img.naturalHeight > 0) ? img.naturalHeight : (S.bitmaps[part.bitmap]?.h || 1);

  // 1. partSpacing
  const partSpacing = S.partSpacing || 1.0;
  let spacedX = part.x;
  let spacedY = part.y;
  if (centroid) {
    spacedX = centroid.x + (part.x - centroid.x) * partSpacing;
    spacedY = centroid.y + (part.y - centroid.y) * partSpacing;
  }

  // 2. outputSpread
  const spread = S.outputSpread || 1.0;
  const adjX = spacedX / spread;
  const adjY = spacedY / spread;
  const tx = adjX + W / 2;
  const ty = H / 2 - adjY;

  const m  = reconstructMatrix(part.sx, part.sy, part.rot, tx, ty);
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-9) return false;
  const invDet = 1 / det;
  const ia = m.d * invDet, ib = -m.b * invDet;
  const ic = -m.c * invDet, id2 = m.a * invDet;

  const dx = lx - m.tx, dy = ly - m.ty;
  const localX = ia * dx + ic * dy;
  const localY = ib * dx + id2 * dy;
  return Math.abs(localX) <= szW / 2 + 2 && Math.abs(localY) <= szH / 2 + 2;
}

function hitTestLayers(canvasX, canvasY) {
  if (!S.currentAnim) return null;
  const W = canvas.width, H = canvas.height;
  const animTL = S.timeline[S.currentAnim] || {};
  const t = S.currentTime;
  const sorted = S.layers.slice().sort((a, b) => b.zDepth - a.zDepth);
  for (const layer of sorted) {
    if (S.hiddenLayers.has(layer.name)) continue;
    const kfs = animTL[layer.name];
    if (!kfs) continue;
    const kf = getActiveKF(kfs, t);
    if (!kf?.parts?.length || kf.visible === false) continue;
    const centroid = getLayerCentroid(S.currentAnim, layer.name, t);
    for (const part of kf.parts) {
      if (part.alpha <= 0.005) continue;
      if (pointInPart(canvasX, canvasY, part, W, H, centroid)) return layer.name;
    }
  }
  return null;
}