// frame-events.js – Hệ thống Frame Events cho Unity
'use strict';

// ── Color palette cho events – liền nhau không trùng ─────────────────────────
const EVENT_COLORS = [
  '#ff4d6d', // đỏ hồng
  '#ffd166', // vàng
  '#06d6a0', // xanh lá
  '#4cc9f0', // xanh dương nhạt
  '#f77f00', // cam
  '#c77dff', // tím
  '#80ed99', // xanh mint
  '#ff9f1c', // vàng cam
  '#e040fb', // tím hồng
  '#00b4d8', // cyan
  '#ffb347', // cam nhạt
  '#43e97b', // xanh lá sáng
  '#f72585', // hồng đậm
  '#7209b7', // tím đậm
  '#4ade80', // lime
];

function getEventColor(idx) {
  return EVENT_COLORS[idx % EVENT_COLORS.length];
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function getAnimEvents(animName) {
  if (!S.animEvents) S.animEvents = {};
  if (!S.animEvents[animName]) S.animEvents[animName] = [];
  return S.animEvents[animName];
}

function addFrameEvent(animName, time) {
  const events = getAnimEvents(animName);
  const newEv = { time: parseFloat(time.toFixed(4)), name: 'on_event', int: 0, float: 0, string: '' };
  events.push(newEv);
  events.sort((a, b) => a.time - b.time);
  return newEv;
}

function removeFrameEvent(animName, idx) {
  const events = getAnimEvents(animName);
  events.splice(idx, 1);
}

function updateFrameEvent(animName, idx, field, value) {
  const events = getAnimEvents(animName);
  if (!events[idx]) return;
  if (field === 'time') {
    events[idx].time = parseFloat(parseFloat(value).toFixed(4)) || 0;
    events.sort((a, b) => a.time - b.time);
  } else if (field === 'int') {
    events[idx].int = parseInt(value) || 0;
  } else if (field === 'float') {
    events[idx].float = parseFloat(value) || 0;
  } else {
    events[idx][field] = value;
  }
}

function getAllEventNames() {
  if (!S.animEvents) return [];
  const names = new Set();
  for (const anEvents of Object.values(S.animEvents)) {
    for (const ev of anEvents) if (ev.name) names.add(ev.name);
  }
  return [...names];
}

// ── Custom spinner helper ─────────────────────────────────────────────────────
// Tạo wrapper với nút ▲▼ đẹp và scroll chuột

function makeNumWrap(inp, step, min, max) {
  const wrap = document.createElement('div');
  wrap.className = 'fe-num-wrap';
  wrap.appendChild(inp);

  const btns = document.createElement('div');
  btns.className = 'fe-spin-btns';

  const up = document.createElement('button');
  up.type = 'button';
  up.textContent = '▲';
  up.title = 'Tăng';

  const dn = document.createElement('button');
  dn.type = 'button';
  dn.textContent = '▼';
  dn.title = 'Giảm';

  function nudge(dir) {
    let v = parseFloat(inp.value) || 0;
    v = Math.round((v + dir * step) / step) * step;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    // round to avoid float jitter
    const decimals = (step.toString().split('.')[1] || '').length;
    inp.value = v.toFixed(decimals);
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }

  up.addEventListener('mousedown', e => { e.preventDefault(); nudge(1); });
  dn.addEventListener('mousedown', e => { e.preventDefault(); nudge(-1); });

  // Scroll chuột trên cả wrapper
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    nudge(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  btns.appendChild(up);
  btns.appendChild(dn);
  wrap.appendChild(btns);
  return wrap;
}

// ── UI: Event Editor Panel ────────────────────────────────────────────────────

function buildEventEditorPanel() {
  const container = $('feEditorWrap');
  if (!container) return;
  if (!S.currentAnim) {
    container.innerHTML = '<div class="fe-empty">Chưa chọn animation</div>';
    return;
  }

  const animName = S.currentAnim;
  const events   = getAnimEvents(animName);
  const fps      = S.data?.meta?.fps || 30;
  const dur      = S.dur || 1;

  // Datalist autocomplete
  const allNames = getAllEventNames();
  const datalistId = 'fe-names-list';
  let dlEl = document.getElementById(datalistId);
  if (!dlEl) {
    dlEl = document.createElement('datalist');
    dlEl.id = datalistId;
    document.body.appendChild(dlEl);
  }
  dlEl.innerHTML = allNames.map(n => `<option value="${n}">`).join('');

  // ── Build header
  const header = document.createElement('div');
  header.className = 'fe-header';
  header.innerHTML = `
    <span>⏱ Time (s)</span>
    <span>🏷 Event Name</span>
    <span style="text-align:right">INT</span>
    <span style="text-align:right">FLOAT</span>
    <span>STRING</span>
    <span></span>
  `;

  // ── Build rows
  const list = document.createElement('div');
  list.className = 'fe-list';
  list.id = 'feList';

  if (events.length === 0) {
    list.innerHTML = '<div class="fe-empty">Chưa có event nào. Nhấn ＋ để thêm.</div>';
  }

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const frame = Math.round(ev.time * fps);
    const evColor = getEventColor(i);
    const row = document.createElement('div');
    row.className = 'fe-row';
    row.dataset.idx = i;
    row.style.borderLeft = `3px solid ${evColor}`;

    // --- TIME cell
    const cellTime = document.createElement('div');
    cellTime.className = 'fe-cell fe-time';

    const inpTime = document.createElement('input');
    inpTime.className = 'fe-inp fe-inp-time';
    inpTime.type = 'number';
    inpTime.step = '0.001';
    inpTime.min = '0';
    inpTime.max = dur.toFixed(3);
    inpTime.value = ev.time;

    inpTime.addEventListener('change', () => {
      feUpdateField(animName, i, 'time', inpTime.value);
      buildEventEditorPanel();
    });

    const frameLabel = document.createElement('span');
    frameLabel.className = 'fe-frame-label';
    frameLabel.textContent = `f${frame}`;

    // Time wrap với spinner
    const timeWrap = makeNumWrap(inpTime, 0.001, 0, dur);
    timeWrap.style.width = '50px';
    timeWrap.style.flexShrink = '0';
    cellTime.appendChild(timeWrap);
    cellTime.appendChild(frameLabel);

    // --- NAME cell
    const cellName = document.createElement('div');
    cellName.className = 'fe-cell fe-name';
    const inpName = document.createElement('input');
    inpName.className = 'fe-inp fe-inp-name';
    inpName.setAttribute('list', datalistId);
    inpName.type = 'text';
    inpName.value = ev.name || '';
    inpName.placeholder = 'on_hit';
    inpName.style.color = evColor;
    inpName.style.fontWeight = '700';
    inpName.addEventListener('change', () => feUpdateField(animName, i, 'name', inpName.value));
    inpName.addEventListener('input',  () => feUpdateField(animName, i, 'name', inpName.value));
    cellName.appendChild(inpName);

    // --- INT cell
    const cellInt = document.createElement('div');
    cellInt.className = 'fe-cell fe-int';
    const inpInt = document.createElement('input');
    inpInt.className = 'fe-inp fe-inp-num';
    inpInt.type = 'number';
    inpInt.step = '1';
    inpInt.value = ev.int;
    inpInt.placeholder = '0';
    inpInt.addEventListener('change', () => feUpdateField(animName, i, 'int', inpInt.value));
    cellInt.appendChild(makeNumWrap(inpInt, 1));

    // --- FLOAT cell
    const cellFloat = document.createElement('div');
    cellFloat.className = 'fe-cell fe-float';
    const inpFloat = document.createElement('input');
    inpFloat.className = 'fe-inp fe-inp-num';
    inpFloat.type = 'number';
    inpFloat.step = '0.01';
    inpFloat.value = ev.float;
    inpFloat.placeholder = '0.0';
    inpFloat.addEventListener('change', () => feUpdateField(animName, i, 'float', inpFloat.value));
    cellFloat.appendChild(makeNumWrap(inpFloat, 0.01));

    // --- STRING cell
    const cellStr = document.createElement('div');
    cellStr.className = 'fe-cell fe-str';
    const inpStr = document.createElement('input');
    inpStr.className = 'fe-inp fe-inp-str';
    inpStr.type = 'text';
    inpStr.value = ev.string || '';
    inpStr.placeholder = '(optional)';
    inpStr.addEventListener('change', () => feUpdateField(animName, i, 'string', inpStr.value));
    cellStr.appendChild(inpStr);

    // --- ACTION cell
    const cellAct = document.createElement('div');
    cellAct.className = 'fe-cell fe-actions';

    const pinBtn = document.createElement('button');
    pinBtn.className = 'fe-btn fe-pin-btn';
    pinBtn.title = `Gán vào frame hiện tại (${S.currentTime.toFixed(3)}s)`;
    pinBtn.textContent = '📍';
    pinBtn.addEventListener('click', () => fePinToCurrentTime(animName, i));

    const delBtn = document.createElement('button');
    delBtn.className = 'fe-btn fe-del-btn';
    delBtn.title = 'Xóa event';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => feRemove(animName, i));

    cellAct.appendChild(pinBtn);
    cellAct.appendChild(delBtn);

    row.appendChild(cellTime);
    row.appendChild(cellName);
    row.appendChild(cellInt);
    row.appendChild(cellFloat);
    row.appendChild(cellStr);
    row.appendChild(cellAct);
    list.appendChild(row);
  }

  // ── Footer
  const footer = document.createElement('div');
  footer.className = 'fe-footer';
  const addBtn = document.createElement('button');
  addBtn.className = 'fe-add-btn';
  addBtn.textContent = '＋ Thêm event tại frame hiện tại';
  addBtn.addEventListener('click', feAdd);
  const addNamedBtn = document.createElement('button');
  addNamedBtn.className = 'fe-add-btn fe-add-named';
  addNamedBtn.textContent = '＋ Nhập tên trước';
  addNamedBtn.addEventListener('click', feAddNamed);
  footer.appendChild(addBtn);
  footer.appendChild(addNamedBtn);

  // ── Assemble
  container.innerHTML = '';
  container.appendChild(header);
  container.appendChild(list);
  container.appendChild(footer);
}

// ── Actions ───────────────────────────────────────────────────────────────────

function feAdd() {
  if (!S.currentAnim) return;
  addFrameEvent(S.currentAnim, S.currentTime);
  buildEventEditorPanel();
  markDirty();
}

function feAddNamed() {
  if (!S.currentAnim) return;
  const name = prompt('Tên event (vd: on_hit, on_footstep, on_spawn):', 'on_event');
  if (name === null) return;
  const ev = addFrameEvent(S.currentAnim, S.currentTime);
  ev.name = name.trim() || 'on_event';
  buildEventEditorPanel();
  markDirty();
}

function feRemove(animName, idx) {
  removeFrameEvent(animName, idx);
  buildEventEditorPanel();
  markDirty();
}

function feUpdateField(animName, idx, field, value) {
  updateFrameEvent(animName, idx, field, value);
  if (field === 'time') buildEventEditorPanel();
  markDirty();
}

function fePinToCurrentTime(animName, idx) {
  updateFrameEvent(animName, idx, 'time', S.currentTime);
  buildEventEditorPanel();
  markDirty();
  showToast(`📍 Event gán tại ${S.currentTime.toFixed(3)}s`, 'ok');
}

function refreshEventPanel() {
  if (document.getElementById('feEditorWrap')) {
    buildEventEditorPanel();
  }
}

// ── drawEventMarkers – vẽ markers + playhead trên evtTrack ───────────────────

function drawEventMarkers() {
  if (!S.currentAnim || !S.animEvents) return;
  const events = S.animEvents[S.currentAnim] || [];
  const track = $('evtTrack');
  if (!track) return;

  // Xóa markers cũ (giữ playhead nếu có)
  // Rebuild toàn bộ cho đơn giản
  track.innerHTML = '';

  const dur = S.dur || 1;

  // Vẽ event markers – mỗi event có màu riêng đồng bộ với fe-row
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const color = getEventColor(i);
    const pct = dur > 0 ? (ev.time / dur) * 100 : 0;
    const marker = document.createElement('div');
    marker.className = 'evt-marker';
    marker.style.left = pct.toFixed(2) + '%';
    marker.style.background = color;
    marker.style.boxShadow = `0 0 4px ${color}88`;
    marker.title = `[${i}] ${ev.name || 'event'} @ ${ev.time.toFixed(3)}s`;
    // Tooltip label nhỏ bên trên marker
    const lbl = document.createElement('div');
    lbl.className = 'evt-marker-label';
    lbl.textContent = ev.name || `#${i}`;
    lbl.style.color = color;
    marker.appendChild(lbl);
    // Click marker → seek
    marker.addEventListener('click', () => {
      if (typeof seekTo === 'function') seekTo(ev.time);
    });
    track.appendChild(marker);
  }

  // Vẽ playhead
  if (S.currentTime !== undefined && dur > 0) {
    const pct = (S.currentTime / dur) * 100;
    const ph = document.createElement('div');
    ph.className = 'evt-playhead';
    ph.style.left = pct.toFixed(2) + '%';
    track.appendChild(ph);
  }
}

// ── Refresh khi đổi animation ─────────────────────────────────────────────────

function updateEventAnimLabel() {
  const lbl = $('feAnimLabel');
  if (lbl) lbl.textContent = S.currentAnim ? `▶ ${S.currentAnim}` : '—';
}

// ── Quick preset add ─────────────────────────────────────────────────────────

function feAddPreset(name) {
  if (!S.currentAnim) { showToast('Chưa chọn animation!', 'warn'); return; }
  const ev = addFrameEvent(S.currentAnim, S.currentTime);
  ev.name = name;
  buildEventEditorPanel();
  drawEventMarkers();
  markDirty();
  showToast(`✚ ${name} @ ${S.currentTime.toFixed(3)}s`, 'ok');
}

// ── markDirty stub ────────────────────────────────────────────────────────────

if (typeof markDirty === 'undefined') {
  window.markDirty = function() {};
}
