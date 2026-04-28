// export.js – Xuất file JSON/Spine
'use strict';

function updateExpFileNamePreview() {
  const preview = $('expFileNamePreview');
  if (!preview) return;
  const prefix = getExportPrefix();
  preview.textContent = prefix ? `→ ${prefix}_spine.json / ${prefix}_export.zip` : '';
}

function getExportPrefix() {
  // Ưu tiên tên tuỳ chỉnh do người dùng nhập
  const custom = (S._exportName || '').trim();
  if (custom) return custom.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const src = S._sourceZipName || 'export';
  return src.replace(/\.zip$/i, '').replace(/[^a-zA-Z0-9_\-]/g, '_');
}

function buildSpineJSON(animNames, opts, atlasEntries) {
  const meta = S.data.meta || {};
  const fps  = opts.fpsOverride || meta.fps || 30;
  const W    = meta.canvasW || 390;
  const H    = meta.canvasH || 390;
  const sc   = opts.scale;
  const spread = S.outputSpread || 1.0;
  const partSpacing = S.partSpacing || 1.0;

  const skeleton = {
    hash: '', spine: '4.2.00', x: 0, y: 0,
    width: W * sc, height: H * sc, fps, images: './'
  };

  const allLayers = new Set();
  for (const animName of animNames) {
    const animTL = S.timeline[animName] || {};
    const animHiddenSet = S.animHiddenLayers[animName] || new Set();
    for (const lname in animTL) {
      if (animHiddenSet.has(lname)) continue;
      const kfs = animTL[lname];
      const hasData = kfs.some(kf => kf.parts?.length > 0);
      if (!opts.onlyActive || hasData) allLayers.add(lname);
    }
  }

  const layersSorted = S.layers
    .filter(l => allLayers.has(l.name))
    .sort((a, b) => a.zDepth - b.zDepth);

  const layerMaxParts = {};
  for (const layer of layersSorted) {
    const lname = layer.name;
    let maxP = 0;
    for (const animName of animNames) {
      const kfs = (S.timeline[animName] || {})[lname] || [];
      for (const kf of kfs) maxP = Math.max(maxP, (kf.parts || []).length);
    }
    layerMaxParts[lname] = Math.max(maxP, 1);
  }

  const bones = [{ name: 'root', x: 0, y: 0 }];
  const slots = [];
  const layerBoneMap = {};

  // skinMap: { skinName → { slotName → { attName → {...} } } }
  // Layer không có tag → vào "default"
  // Layer có tag(s) → mỗi tag là một skin riêng
  const skinMap = { default: {} };

  for (const layer of layersSorted) {
    const lname = layer.name;
    const safeName = lname.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const nParts = layerMaxParts[lname];
    layerBoneMap[lname] = [];

    // Xác định skin(s) của layer này
    const layerTags = (S.layerTags && S.layerTags[lname]) || [];
    // Nếu không có tag → default; nếu có tag → mỗi tag là skin riêng
    const targetSkins = layerTags.length > 0 ? layerTags : ['default'];
    for (const sk of targetSkins) {
      if (!skinMap[sk]) skinMap[sk] = {};
    }

    for (let pi = 0; pi < nParts; pi++) {
      const boneName = nParts === 1
        ? 'bone_' + safeName
        : 'bone_' + safeName + '_p' + pi;
      const slotName = nParts === 1
        ? 'slot_' + safeName
        : 'slot_' + safeName + '_p' + pi;

      layerBoneMap[lname].push({ boneName, slotName });
      bones.push({ name: boneName, parent: 'root', x: 0, y: 0 });
      slots.push({ name: slotName, bone: boneName, attachment: null });

      const bmpsForPart = new Set();
      for (const animName of animNames) {
        const kfs = (S.timeline[animName] || {})[lname] || [];
        for (const kf of kfs) {
          const p = (kf.parts || [])[pi];
          if (p) bmpsForPart.add(p.bitmap);
        }
      }

      const slotSkin = {};
      for (const bmp of bmpsForPart) {
        const sz = S.bitmaps[bmp] || { w: 1, h: 1 };
        const attName = bmp.split('/').pop().replace(/\.[^.]+$/, '');
        slotSkin[attName] = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
                              width: sz.w * sc, height: sz.h * sc };
      }

      if (Object.keys(slotSkin).length > 0) {
        // Gán attachment vào tất cả skin của layer này
        for (const sk of targetSkins) {
          skinMap[sk][slotName] = slotSkin;
        }
      }
    }
  }

  // Build mảng skins theo thứ tự: default trước, rồi các tag skin
  const skinsArray = Object.entries(skinMap).map(([name, attachments]) => ({ name, attachments }));
  // Đảm bảo default luôn đứng đầu
  skinsArray.sort((a, b) => (a.name === 'default' ? -1 : b.name === 'default' ? 1 : a.name.localeCompare(b.name)));

  const animations = {};
  for (const animName of animNames) {
    const animTL = S.timeline[animName] || {};
    const bones_anim = {};
    const slots_anim = {};
    const animDur = S.animations[animName]?.duration || 1;

    for (const layer of layersSorted) {
      const lname = layer.name;
      const animHiddenSet = S.animHiddenLayers[animName] || new Set();
      if (animHiddenSet.has(lname)) continue;
      const kfs = animTL[lname];
      if (!kfs || !kfs.length) continue;

      const hasData = kfs.some(kf => kf.parts?.length > 0);
      if (opts.onlyActive && !hasData) continue;

      const partInfos = layerBoneMap[lname];
      if (!partInfos) continue;
      const nParts = partInfos.length;

      // Tính sẵn centroid cho từng keyframe (nếu có nhiều part)
      const centroids = [];
      for (const kf of kfs) {
        const parts = kf.parts || [];
        const visibleParts = parts.filter(p => p.alpha > 0.005);
        if (visibleParts.length > 0) {
          let sumX = 0, sumY = 0;
          for (const p of visibleParts) {
            sumX += p.x;
            sumY += p.y;
          }
          centroids.push({ time: kf.time, x: sumX / visibleParts.length, y: sumY / visibleParts.length });
        } else {
          centroids.push({ time: kf.time, x: 0, y: 0 });
        }
      }

      for (let pi = 0; pi < nParts; pi++) {
        const { boneName, slotName } = partInfos[pi];

        const translateKeys = [], rotateKeys = [], scaleKeys = [], attachKeys = [], colorKeys = [];
        let prevAtt = undefined;
        let prevX = null, prevY = null, prevRot = null, prevSx = null, prevSy = null, prevAlpha = null;

        for (let idx = 0; idx < kfs.length; idx++) {
          const kf = kfs[idx];
          const parts = kf.parts || [];
          const isVisible = kf.visible !== false;

          const p = (isVisible && parts.length > pi) ? parts[pi] : null;

          if (!p) {
            // Layer trống / visible=False: chỉ set attachment=null, KHÔNG thêm alpha=0
            // Alpha=0 sai vì Unity/Spine sẽ nội suy fade out khi không cần thiết.
            // Visibility được xử lý bằng attachment=null, không phải alpha track.
            if (prevAtt !== null) {
              attachKeys.push({ time: kf.time, name: null });
              prevAtt = null;
            }
            // KHÔNG push colorKey ở đây — giữ nguyên alpha hiện tại
            continue;
          }

          // 1. partSpacing
          const cent = centroids[idx] || { x: 0, y: 0 };
          let spacedX = p.x;
          let spacedY = p.y;
          if (parts.filter(p => p.alpha > 0.005).length > 1) {
            spacedX = cent.x + (p.x - cent.x) * partSpacing;
            spacedY = cent.y + (p.y - cent.y) * partSpacing;
          }

          // 2. outputSpread + scale
          const x = (spacedX / spread) * sc;
          const y = (spacedY / spread) * sc;

          const rot   = p.rot;
          const sx    = p.sx;
          const sy    = p.sy;
          const alpha_raw = (p.alpha !== undefined && p.alpha !== null) ? p.alpha : 1;
          // Áp dụng alphaOverride
          const _ao = S.alphaOverrides && S.alphaOverrides[lname];
          const _delta = _ao ? ((_ao[animName] !== undefined) ? _ao[animName] : (_ao['all'] !== undefined ? _ao['all'] : 0)) : 0;
          const alpha = Math.max(0, Math.min(1, alpha_raw + _delta));

          const isFirst = (prevX === null);
          if (isFirst || prevX !== x || prevY !== y) {
            translateKeys.push({ time: kf.time, x, y });
            prevX = x; prevY = y;
          }
          if (isFirst || prevRot !== rot) {
            rotateKeys.push({ time: kf.time, value: rot });
            prevRot = rot;
          }
          if (isFirst || prevSx !== sx || prevSy !== sy) {
            scaleKeys.push({ time: kf.time, x: sx, y: sy });
            prevSx = sx; prevSy = sy;
          }

          // Alpha → Spine "alpha" timeline (Spine 4.x): { time, value: 0-1 }
          if (isFirst || prevAlpha !== alpha) {
            colorKeys.push({ time: kf.time, value: parseFloat(Math.max(0, Math.min(1, alpha)).toFixed(5)) });
            prevAlpha = alpha;
          }

          const attName = p.bitmap.split('/').pop().replace(/\.[^.]+$/, '');
          if (attName !== prevAtt) {
            attachKeys.push({ time: kf.time, name: attName });
            prevAtt = attName;
          }
        }

        if (translateKeys.length > 0 && translateKeys[0].time > 0) {
          translateKeys.unshift({ time: 0, x: translateKeys[0].x, y: translateKeys[0].y });
        }
        if (rotateKeys.length > 0 && rotateKeys[0].time > 0) {
          rotateKeys.unshift({ time: 0, value: rotateKeys[0].value });
        }
        if (scaleKeys.length > 0 && scaleKeys[0].time > 0) {
          scaleKeys.unshift({ time: 0, x: scaleKeys[0].x, y: scaleKeys[0].y });
        }
        if (colorKeys.length > 0 && colorKeys[0].time > 0) {
          colorKeys.unshift({ time: 0, value: 1 });
        }

        if (attachKeys.length > 0 && attachKeys[0].time > 0 && attachKeys[0].name !== null) {
          attachKeys.unshift({ time: 0, name: null });
        }

        if (prevAtt !== null && prevAtt !== undefined) {
          const lastKF = kfs[kfs.length - 1];
          const lastHasData = (lastKF?.parts || []).length > pi && lastKF?.visible !== false;
          if (lastHasData) {
            const endTime = parseFloat(animDur.toFixed(6));
            attachKeys.push({ time: endTime, name: null });
          }
        }

        const bt = {};
        if (translateKeys.length > 0) bt.translate = translateKeys;
        if (rotateKeys.length > 0)    bt.rotate    = rotateKeys;
        if (scaleKeys.length > 0)     bt.scale     = scaleKeys;
        if (Object.keys(bt).length)   bones_anim[boneName] = bt;

        // Build slot animation: attachment + alpha
        const slotAnim = {};
        if (attachKeys.length > 0) slotAnim.attachment = attachKeys;
        // Chỉ export alpha keys nếu alpha thực sự thay đổi (không phải luôn = 1)
        const hasAlphaAnim = colorKeys.some(k => k.value !== 1);
        if (colorKeys.length > 0 && hasAlphaAnim) slotAnim.alpha = colorKeys;
        if (Object.keys(slotAnim).length > 0) {
          slots_anim[slotName] = slotAnim;
        }
      }
    }

    animations[animName] = { bones: bones_anim, slots: slots_anim };
  }

  const eventsRegistry = {};
  const animEventsMap  = {};

  for (const animName of animNames) {
    const evList = (S.animEvents && S.animEvents[animName]) || [];
    if (!evList.length) continue;

    const timelineEntries = [];
    for (const ev of evList) {
      if (!eventsRegistry[ev.name]) {
        eventsRegistry[ev.name] = {
          int:    ev.int    || 0,
          float:  ev.float  || 0,
          string: ev.string || ''
        };
      }
      const entry = { time: ev.time, name: ev.name };
      if (ev.int    !== 0) entry.int    = ev.int;
      if (ev.float  !== 0) entry.float  = ev.float;
      if (ev.string !== '') entry.string = ev.string;
      timelineEntries.push(entry);
    }

    if (timelineEntries.length > 0) {
      animEventsMap[animName] = timelineEntries;
    }
  }

  for (const animName of animNames) {
    if (animEventsMap[animName]) {
      animations[animName].events = animEventsMap[animName];
    }
  }

  const topLevelEvents = Object.keys(eventsRegistry).length > 0 ? eventsRegistry : undefined;
  return { skeleton, bones, slots,
    skins: skinsArray,
    ...(topLevelEvents ? { events: topLevelEvents } : {}),
    animations };
}

function downloadJSON(obj, filename) {
  downloadBlob(JSON.stringify(obj, null, 2), 'application/json', filename);
}

function doExport() {
  if (!S.data) return;
  const fmt      = $('expFormat').value;
  const onlyActive = $('expOnlyActive').checked;
  const scale    = parseFloat($('expScale').value) || 1;
  const fpsOverride = parseInt($('expFps').value) || 0;
  const anims    = getSelectedAnims();
  if (!anims.length) { $('expStatus').textContent = '⚠ Chưa chọn animation nào'; return; }

  if (fmt === 'json_raw') {
    // Build tagIndex từ layerTags hiện tại
    const tagIndex = {};
    for (const [lname, tags] of Object.entries(S.layerTags || {})) {
      for (const tag of tags) {
        if (!tagIndex[tag]) tagIndex[tag] = [];
        if (!tagIndex[tag].includes(lname)) tagIndex[tag].push(lname);
      }
    }

    const out = {
      meta: S.data.meta,
      bitmaps: S.bitmaps,
      // Tags tích hợp thẳng vào JSON chính
      layerTags: S.layerTags,   // { layerName → [tag, ...] }
      tagIndex,                  // { tagName   → [layerName, ...] }
      animEvents: S.animEvents || {},
      animations: {}
    };
    for (const anim of anims) {
      out.animations[anim] = {};
      const animTL = S.timeline[anim] || {};
      for (const lname in animTL) {
        const kfs = animTL[lname];
        if (onlyActive && !kfs.some(kf => kf.parts?.length > 0)) continue;
        out.animations[anim][lname] = kfs;
      }
    }
    downloadBlob(JSON.stringify(out, null, 2), 'application/json', getExportPrefix() + '_raw.json');
    $('expStatus').textContent = `✓ Xuất JSON (${anims.length} anim · ${Object.keys(tagIndex).length} skin tags)`;
  } else if (fmt === 'spine') {
    const spine = buildSpineJSON(anims, { scale, onlyActive, fpsOverride });
    downloadBlob(JSON.stringify(spine, null, 2), 'application/json', getExportPrefix() + '_spine.json');
    $('expStatus').textContent = `✓ Xuất Spine JSON (${anims.length} anim)`;
  } else {
    exportSpine3File(anims, { scale, onlyActive, fpsOverride });
  }
}

async function exportSpine3File(anims, opts) {
  const btn = $('expBtn');
  btn.disabled = true;
  $('expStatus').textContent = '⏳ Đang tạo atlas PNG...';

  try {
    const pad = parseInt($('expPad').value) || 2;
    const scale = opts.scale || 1;

    const usedBmps = new Set();
    for (const animName of anims) {
      const animTL = S.timeline[animName] || {};
      for (const lname in animTL) {
        for (const kf of animTL[lname]) {
          for (const p of (kf.parts||[])) usedBmps.add(p.bitmap);
        }
      }
    }

    const entries = [];
    for (const key of usedBmps) {
      const img = S.imgCache[key];
      if (!img || S.imgMissing[key]) continue;
      const w = Math.round((img.naturalWidth  || S.bitmaps[key]?.w || 1) * scale);
      const h = Math.round((img.naturalHeight || S.bitmaps[key]?.h || 1) * scale);
      entries.push({ key, img, w, h, x: 0, y: 0 });
    }
    entries.sort((a, b) => b.h - a.h);

    const maxW = 4096;
    let curX = pad, curY = pad, shelfH = 0, atlasW = 0, atlasH = 0;
    for (const e of entries) {
      if (curX + e.w + pad > maxW) { curX = pad; curY += shelfH + pad; shelfH = 0; }
      e.x = curX; e.y = curY;
      curX += e.w + pad;
      shelfH = Math.max(shelfH, e.h);
      atlasW = Math.max(atlasW, e.x + e.w + pad);
      atlasH = Math.max(atlasH, e.y + e.h + pad);
    }

    const ac = document.createElement('canvas');
    ac.width = atlasW || 1; ac.height = atlasH || 1;
    const ax = ac.getContext('2d');
    for (const e of entries) {
      ax.drawImage(e.img, e.x, e.y, e.w, e.h);
    }

    const pngBlob = await new Promise(res => ac.toBlob(res, 'image/png'));

    const atlasName = getExportPrefix() + '_atlas.png';
    const atlasFileName = getExportPrefix() + '_atlas.atlas.txt';
    let atlasText = `${atlasName}\nsize: ${atlasW}, ${atlasH}\nformat: RGBA8888\nfilter: Linear, Linear\nrepeat: none\n`;
    for (const e of entries) {
      const stem = e.key.split('/').pop().replace(/\.png$/i, '');
      atlasText += `${stem}\n  rotate: false\n  xy: ${e.x}, ${e.y}\n  size: ${e.w}, ${e.h}\n  orig: ${e.w}, ${e.h}\n  offset: 0, 0\n  index: -1\n`;
    }

    const spine = buildSpineJSON(anims, opts, entries);

    const JSZip2 = await loadJSZip();
    const outZip = new JSZip2();
    const prefix = getExportPrefix();
    outZip.file(prefix + '_spine.json', JSON.stringify(spine, null, 2));
    outZip.file(atlasName, pngBlob);
    outZip.file(atlasFileName, atlasText);

    const zipBlob = await outZip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const zipName = prefix + '_export.zip';
    downloadBlob(zipBlob, 'application/zip', zipName);

    $('expStatus').textContent =
      `✓ Đã xuất ZIP: ${zipName}\n📄 ${prefix}_spine.json\n🖼 ${atlasName}\n📋 ${atlasFileName}\n(${anims.length} anim · ${entries.length} sprites)`;
  } catch(e) {
    $('expStatus').textContent = '❌ Lỗi: ' + e.message;
    console.error(e);
  }
  btn.disabled = false;
}

function expSelAll(v) {
  document.querySelectorAll('#expAnimChecklist input[type=checkbox]').forEach(cb => cb.checked = v);
}

function getSelectedAnims() {
  return [...document.querySelectorAll('#expAnimChecklist input[type=checkbox]')]
    .filter(cb => cb.checked).map(cb => cb.dataset.expname);
}