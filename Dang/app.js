/* ═══════════════════════════════════════════════════════════
   HỆ THỐNG ĐIỂM DANH ĐẢNG BỘ
   ─────────────────────────────────────────────────────────
   Bản đồ: Leaflet.js + OpenStreetMap
   ✅ Hoàn toàn miễn phí – không cần API key – không cần thẻ
   ✅ Dữ liệu bản đồ Việt Nam đầy đủ
   ✅ Không giới hạn lượt dùng
══════════════════════════════════════════════════════════ */

// ─── CONFIG – THAY ĐỔI CÁC GIÁ TRỊ NÀY ───────────────────
const CONFIG = {
  AD_DURATION_SECONDS: 15,
  QR_REFRESH_SECONDS:  30,
  ADMIN_PASSWORD:      'admin123',   // ← đổi mật khẩu thật trước khi deploy
  FUND_TARGET:         5_000_000,    // mục tiêu quỹ (VND)
  TOTAL_MEMBERS:       250,          // tổng số đảng viên
};

// ─── FAKE ADS DATA (thay bằng API thật nếu có) ────────────
const ADS = [
  { name: '🏪 Siêu thị BigMart',        desc: 'Khuyến mãi tháng 3 – Giảm 20% toàn bộ thực phẩm', revenue: 1500, color: '#0d2418' },
  { name: '🏦 Ngân hàng Việt Tín',       desc: 'Lãi suất vay ưu đãi chỉ từ 6.5%/năm',           revenue: 2000, color: '#0d1824' },
  { name: '📱 Viễn thông MobNet',        desc: 'Gói 4G 90GB chỉ 99.000đ/tháng',                 revenue: 1200, color: '#1a0d24' },
  { name: '🎓 Trung tâm Anh ngữ EduStar', desc: 'Học bổng 30% cho khóa IELTS 2025',             revenue: 800,  color: '#241a0d' },
];

// ─── APP STATE ─────────────────────────────────────────────
const STATE = {
  step: 1,
  name: '', memberId: '', unit: '',
  geoOk: false, geoLat: null, geoLng: null,
  adDone: false,
  attendanceList: [],
  totalAds: 0,
  totalRevenue: 0,
  qrSecret: '',
  qrInterval: null,
  qrCountdown: CONFIG.QR_REFRESH_SECONDS,
  adTimerInterval: null,
  currentAdIndex: 0,
  isAdmin: false,
  leafletMap: null,
  leafletUserMarker: null,
  leafletCircle: null,
  SESSION: {
    name:   'Họp chi bộ tháng 03/2025',
    lat:    21.0285,
    lng:    105.8542,
    radius: 300,
  },
};

// Demo data để trực quan hơn
const DEMO_ATTENDANCE = [
  { name:'Nguyễn Văn An',  id:'ĐV-001', unit:'Chi bộ 1', time:'08:15', date:'17/03/2025', code:'DD-A1B2C3', lat:21.029, lng:105.854 },
  { name:'Trần Thị Bích',  id:'ĐV-007', unit:'Chi bộ 2', time:'08:22', date:'17/03/2025', code:'DD-X9Y8Z7', lat:21.028, lng:105.853 },
  { name:'Lê Minh Đức',    id:'ĐV-015', unit:'Chi bộ 1', time:'08:30', date:'17/03/2025', code:'DD-P5Q6R7', lat:21.027, lng:105.855 },
];

// ══════════════════════════════════════════════════════════
// CLOCK
// ══════════════════════════════════════════════════════════
function updateClock() {
  const n = new Date();
  document.getElementById('live-time').innerHTML =
    `${n.toLocaleTimeString('vi-VN')}<br>
     <span style="font-size:10px;opacity:.8">${n.toLocaleDateString('vi-VN')}</span>`;
}
setInterval(updateClock, 1000);
updateClock();

// ══════════════════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════════════════
function switchTab(tab) {
  ['member','admin','fund'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', ['member','admin','fund'][i] === tab);
  });
  if (tab === 'fund') updateFundUI();
}

// ══════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════
let toastTimeout;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 3000);
}

// ══════════════════════════════════════════════════════════
// STEP MANAGEMENT
// ══════════════════════════════════════════════════════════
function setStep(n) {
  STATE.step = n;
  [1,2,3,4].forEach(i => {
    document.getElementById(`step${i}`).classList.toggle('hidden', i !== n);
    const s = document.getElementById(`s${i}`);
    s.classList.remove('active', 'done');
    if (i < n)      s.classList.add('done');
    else if (i === n) s.classList.add('active');
  });
}

// ── Step 1 → 2 ──
function goStep2() {
  const name = document.getElementById('inp-name').value.trim();
  const id   = document.getElementById('inp-id').value.trim();
  if (!name || !id) { toast('Vui lòng nhập đầy đủ thông tin', 'error'); return; }
  STATE.name     = name;
  STATE.memberId = id;
  STATE.unit     = document.getElementById('inp-unit').value || 'Chưa xác định';
  setStep(2);
  startGeoWithMap();
}

// ── Step 2 → 3 ──
function goStep3() {
  if (!STATE.geoOk) { toast('Chưa xác minh vị trí hợp lệ', 'error'); return; }
  setStep(3);
  startAd();
}

// ── Step 3 → 4 ──
function goStep4() {
  if (!STATE.adDone) { toast('Chưa xem xong quảng cáo', 'error'); return; }
  setStep(4);
  completeAttendance();
}

// ══════════════════════════════════════════════════════════
// GEOLOCATION + LEAFLET.JS / OPENSTREETMAP
// ✅ Miễn phí 100% – không cần API key – không cần thẻ
// ══════════════════════════════════════════════════════════

function startGeoWithMap() {
  setGeoStatus('checking', '🔍 Đang lấy tọa độ GPS...');

  if (!navigator.geolocation) {
    setGeoStatus('fail', '⚠️ Trình duyệt không hỗ trợ GPS');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      STATE.geoLat = lat;
      STATE.geoLng = lng;

      const dist = haversineDistance(lat, lng, STATE.SESSION.lat, STATE.SESSION.lng);
      updateMapInfoBox(lat, lng, dist, accuracy);
      renderLeafletMap(lat, lng, dist);

      if (dist <= STATE.SESSION.radius) {
        setGeoStatus('ok', `✅ Vị trí hợp lệ – Cách điểm họp ${Math.round(dist)}m`);
        STATE.geoOk = true;
        document.getElementById('geo-next-btn').disabled = false;
      } else {
        setGeoStatus('fail', `❌ Ngoài phạm vi – Cách ${Math.round(dist)}m (giới hạn ${STATE.SESSION.radius}m)`);
      }
    },
    (err) => {
      const MSGS = {
        1: 'Bạn đã từ chối quyền truy cập vị trí. Vui lòng cho phép GPS.',
        2: 'Không xác định được vị trí. Kiểm tra GPS và thử lại.',
        3: 'Hết thời gian chờ GPS. Thử lại.',
      };
      setGeoStatus('fail', '⚠️ ' + (MSGS[err.code] || err.message));
      // Vẫn render map tĩnh tại vị trí điểm họp
      renderLeafletMap(STATE.SESSION.lat, STATE.SESSION.lng, null);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function setGeoStatus(type, msg) {
  const el = document.getElementById('geo-status');
  el.className = `geo-status ${type}`;
  el.querySelector('#geo-msg').textContent = msg;
}

function updateMapInfoBox(lat, lng, dist, accuracy) {
  document.getElementById('info-lat').textContent = lat.toFixed(6);
  document.getElementById('info-lng').textContent = lng.toFixed(6);

  const distEl = document.getElementById('info-dist');
  distEl.textContent = Math.round(dist) + 'm';
  distEl.className   = 'val ' + (dist <= STATE.SESSION.radius ? 'ok' : 'fail');

  document.getElementById('info-acc').textContent = Math.round(accuracy || 0) + 'm';
}

/**
 * Render bản đồ bằng Leaflet.js + OpenStreetMap tile
 * dist = null nghĩa là không lấy được GPS, chỉ hiện điểm họp
 */
function renderLeafletMap(userLat, userLng, dist) {
  const container = document.getElementById('map-container');

  // Nếu map đã khởi tạo rồi thì destroy trước
  if (STATE.leafletMap) {
    STATE.leafletMap.remove();
    STATE.leafletMap = null;
  }
  container.innerHTML = '';
  container.style.background = 'transparent';

  // Tính center: giữa user và điểm họp (hoặc chỉ điểm họp nếu ko có GPS)
  const centerLat = dist !== null ? (userLat + STATE.SESSION.lat) / 2 : STATE.SESSION.lat;
  const centerLng = dist !== null ? (userLng + STATE.SESSION.lng) / 2 : STATE.SESSION.lng;

  // Khởi tạo Leaflet map
  const map = L.map(container, {
    center: [centerLat, centerLng],
    zoom: 15,
    zoomControl: true,
    attributionControl: true,
  });

  STATE.leafletMap = map;

  // Tile layer OpenStreetMap (miễn phí, không cần key)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  // ── Icon tùy chỉnh: Điểm họp (đỏ) ──
  const sessionIcon = L.divIcon({
    className: '',
    html: `<div style="
      width:36px; height:36px; border-radius:50%;
      background:#C8102E; border:3px solid #FFD700;
      display:flex; align-items:center; justify-content:center;
      font-size:16px; box-shadow:0 2px 8px rgba(200,16,46,0.6);
      transform:translate(-50%,-50%);
    ">📍</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  // ── Icon tùy chỉnh: Vị trí người dùng (vàng) ──
  const userIcon = L.divIcon({
    className: '',
    html: `<div style="
      width:30px; height:30px; border-radius:50%;
      background:#FFD700; border:3px solid #fff;
      display:flex; align-items:center; justify-content:center;
      font-size:13px; font-weight:700; color:#1a0a00;
      box-shadow:0 2px 8px rgba(255,215,0,0.6);
      transform:translate(-50%,-50%);
    ">★</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  // Marker điểm họp + popup
  L.marker([STATE.SESSION.lat, STATE.SESSION.lng], { icon: sessionIcon })
    .addTo(map)
    .bindPopup(`<b>${STATE.SESSION.name}</b><br>
      <span style="font-size:11px;color:#666;">Bán kính cho phép: ${STATE.SESSION.radius}m</span>`)
    .openPopup();

  // Vùng bán kính cho phép
  L.circle([STATE.SESSION.lat, STATE.SESSION.lng], {
    radius:      STATE.SESSION.radius,
    color:       '#C8102E',
    weight:      2,
    opacity:     0.7,
    fillColor:   '#C8102E',
    fillOpacity: 0.07,
  }).addTo(map);

  // Marker người dùng + đường nối (chỉ khi có GPS)
  if (dist !== null) {
    STATE.leafletUserMarker = L.marker([userLat, userLng], { icon: userIcon })
      .addTo(map)
      .bindPopup(`<b>${STATE.name || 'Bạn'}</b><br>
        <span style="font-size:11px;color:#666;">
          Cách điểm họp: ${Math.round(dist)}m
          ${dist <= STATE.SESSION.radius ? '✅' : '❌'}
        </span>`);

    // Đường nối xanh (hợp lệ) hoặc đỏ (ngoài phạm vi)
    L.polyline(
      [[STATE.SESSION.lat, STATE.SESSION.lng], [userLat, userLng]],
      {
        color:   dist <= STATE.SESSION.radius ? '#22C55E' : '#FF2A4A',
        weight:  2.5,
        opacity: 0.8,
        dashArray: '6, 4',
      }
    ).addTo(map);

    // Fit bounds để thấy cả 2 điểm
    const bounds = L.latLngBounds(
      [STATE.SESSION.lat, STATE.SESSION.lng],
      [userLat, userLng]
    ).pad(0.3);
    map.fitBounds(bounds);
  }
}

/** Bỏ qua kiểm tra vị trí (chế độ test) */
function bypassGeo() {
  STATE.geoOk  = true;
  STATE.geoLat = STATE.SESSION.lat;
  STATE.geoLng = STATE.SESSION.lng;
  setGeoStatus('ok', '✅ Test mode – Đã bỏ qua kiểm tra vị trí');
  updateMapInfoBox(STATE.SESSION.lat, STATE.SESSION.lng, 0, 5);
  renderLeafletMap(STATE.SESSION.lat, STATE.SESSION.lng, 0);
  document.getElementById('geo-next-btn').disabled = false;
}

/** Tính khoảng cách Haversine (mét) */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R    = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ══════════════════════════════════════════════════════════
// ADVERTISEMENT
// ══════════════════════════════════════════════════════════
function startAd() {
  const ad      = ADS[STATE.currentAdIndex % ADS.length];
  STATE.currentAdIndex++;

  document.getElementById('ad-name').textContent = ad.name;
  document.getElementById('ad-desc').textContent = ad.desc;
  document.getElementById('ad-display').style.background =
    `linear-gradient(135deg, ${ad.color}, #0a0a1e)`;

  let secs = CONFIG.AD_DURATION_SECONDS;
  const btn      = document.getElementById('ad-next-btn');
  const progEl   = document.getElementById('ad-progress');
  const timerEl  = document.getElementById('ad-timer');

  btn.disabled   = true;
  btn.textContent = `⏳ Vui lòng xem quảng cáo... (${secs}s)`;
  progEl.style.width = '0%';

  clearInterval(STATE.adTimerInterval);
  STATE.adTimerInterval = setInterval(() => {
    secs--;
    const pct = ((CONFIG.AD_DURATION_SECONDS - secs) / CONFIG.AD_DURATION_SECONDS) * 100;
    progEl.style.width = pct + '%';
    timerEl.textContent = secs > 0 ? `Còn: ${secs}s` : '✓ Đã xem xong';
    btn.textContent = secs > 0 ? `⏳ Vui lòng xem quảng cáo... (${secs}s)` : '✅ Xác nhận điểm danh';

    if (secs <= 0) {
      clearInterval(STATE.adTimerInterval);
      STATE.adDone   = true;
      STATE.totalAds++;
      STATE.totalRevenue += ad.revenue;
      btn.disabled = false;
      addFundLog(ad.name, ad.revenue);
    }
  }, 1000);
}

// ══════════════════════════════════════════════════════════
// COMPLETE ATTENDANCE
// ══════════════════════════════════════════════════════════
function completeAttendance() {
  const now  = new Date();
  const code = 'DD-' + Math.random().toString(36).substr(2,6).toUpperCase();
  const record = {
    name: STATE.name, id: STATE.memberId, unit: STATE.unit,
    time: now.toLocaleTimeString('vi-VN'),
    date: now.toLocaleDateString('vi-VN'),
    lat: STATE.geoLat, lng: STATE.geoLng, code,
  };
  STATE.attendanceList.unshift(record);

  document.getElementById('success-name').textContent = STATE.name;
  document.getElementById('suc-time').textContent = record.time;
  document.getElementById('suc-code').textContent = code;
  document.getElementById('suc-unit').textContent = STATE.unit;

  updateAdminStats();
  renderAttList();
}

function resetForm() {
  clearInterval(STATE.adTimerInterval);
  STATE.step = 1; STATE.name = ''; STATE.memberId = ''; STATE.unit = '';
  STATE.geoOk = false; STATE.adDone = false;
  document.getElementById('inp-name').value  = '';
  document.getElementById('inp-id').value    = '';
  document.getElementById('inp-unit').value  = '';
  document.getElementById('geo-next-btn').disabled = true;
  document.getElementById('ad-next-btn').disabled  = true;
  setStep(1);
}

// ══════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════
function adminLogin() {
  const pw = document.getElementById('admin-pw').value;
  if (pw === CONFIG.ADMIN_PASSWORD) {
    STATE.isAdmin = true;
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
    initQR();
    renderAttList();
    updateAdminStats();
  } else {
    toast('Sai mật khẩu!', 'error');
  }
}

// ── QR CODE ──
function initQR() {
  if (typeof QRCode === 'undefined') {
    document.getElementById('qrcode').innerHTML =
      '<p style="color:var(--text-muted);font-size:12px;padding:20px;">QRCode lib chưa tải</p>';
    return;
  }
  regenerateQR();
  clearInterval(STATE.qrInterval);
  STATE.qrCountdown = CONFIG.QR_REFRESH_SECONDS;
  STATE.qrInterval = setInterval(() => {
    STATE.qrCountdown--;
    const pct = ((CONFIG.QR_REFRESH_SECONDS - STATE.qrCountdown) / CONFIG.QR_REFRESH_SECONDS) * 100;
    const barEl = document.getElementById('qr-bar');
    if (barEl) barEl.style.width = pct + '%';
    const txtEl = document.getElementById('qr-timer-txt');
    if (txtEl) txtEl.textContent = `Làm mới sau: ${STATE.qrCountdown}s`;
    if (STATE.qrCountdown <= 0) {
      regenerateQR();
      STATE.qrCountdown = CONFIG.QR_REFRESH_SECONDS;
    }
  }, 1000);
}

function regenerateQR() {
  const el = document.getElementById('qrcode');
  if (!el) return;
  el.innerHTML = '';
  STATE.qrSecret =
    `DIEMDANH:${Date.now()}:${Math.random().toString(36).substr(2,8).toUpperCase()}`;
  new QRCode(el, {
    text: STATE.qrSecret,
    width: 180, height: 180,
    colorDark: '#000', colorLight: '#fff',
    correctLevel: QRCode.CorrectLevel.H,
  });
  STATE.qrCountdown = CONFIG.QR_REFRESH_SECONDS;
  const barEl = document.getElementById('qr-bar');
  if (barEl) barEl.style.width = '0%';
  const txtEl = document.getElementById('qr-timer-txt');
  if (txtEl) txtEl.textContent = `Làm mới sau: ${CONFIG.QR_REFRESH_SECONDS}s`;
}

// ── SESSION SETTINGS ──
function saveSession() {
  STATE.SESSION.name   = document.getElementById('session-name').value;
  const locParts       = document.getElementById('session-loc').value.split(',');
  STATE.SESSION.lat    = parseFloat(locParts[0]) || 21.0285;
  STATE.SESSION.lng    = parseFloat(locParts[1]) || 105.8542;
  STATE.SESSION.radius = parseInt(document.getElementById('session-radius').value) || 300;
  toast('✅ Đã lưu cài đặt buổi họp!');
}

// ── STATS ──
function updateAdminStats() {
  const total = STATE.attendanceList.length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-pct').textContent   =
    Math.min(100, Math.round(total / CONFIG.TOTAL_MEMBERS * 100)) + '%';
  document.getElementById('stat-ads').textContent   = STATE.totalAds;
  const rev = STATE.totalRevenue;
  document.getElementById('stat-rev').textContent   =
    rev >= 1_000_000 ? (rev/1_000_000).toFixed(1)+'M₫'
    : rev >= 1000    ? Math.round(rev/1000)+'k₫'
    : rev + '₫';
}

// ── ATTENDANCE LIST ──
function renderAttList() {
  const el = document.getElementById('att-list');
  if (!STATE.attendanceList.length) {
    el.innerHTML = '<p class="text-muted text-center" style="padding:20px;">Chưa có dữ liệu</p>';
    return;
  }
  el.innerHTML = STATE.attendanceList.map(r => `
    <div class="attendance-item">
      <div class="att-avatar">${r.name.split(' ').pop()[0]}</div>
      <div class="att-info">
        <div class="att-name">${r.name}</div>
        <div class="att-detail">${r.id} · ${r.unit}</div>
      </div>
      <div style="text-align:right;">
        <div class="att-time">${r.time}</div>
        <span class="badge-ok">✓ Hợp lệ</span>
      </div>
    </div>`).join('');
}

// ── EXPORT CSV ──
function exportData() {
  if (!STATE.attendanceList.length) { toast('Chưa có dữ liệu để xuất', 'error'); return; }
  const header = 'STT,Họ tên,Mã ĐV,Chi bộ,Thời gian,Mã xác nhận,Tọa độ\n';
  const rows   = STATE.attendanceList.map((r, i) =>
    `${i+1},"${r.name}","${r.id}","${r.unit}","${r.time} ${r.date}","${r.code}","${r.lat},${r.lng}"`
  ).join('\n');
  const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `diemdanh_${new Date().toLocaleDateString('vi-VN').replace(/\//g,'-')}.csv`;
  a.click();
  toast('✅ Đã xuất file CSV!');
}

// ══════════════════════════════════════════════════════════
// FUND
// ══════════════════════════════════════════════════════════
function addFundLog(adName, amount) {
  const log = document.getElementById('fund-log');
  if (log.querySelector('p')) log.innerHTML = '';
  const item = document.createElement('div');
  item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)';
  item.innerHTML = `
    <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,215,0,.15);
      display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">💰</div>
    <div style="flex:1;">
      <div style="font-size:13px;font-weight:600;">${adName}</div>
      <div style="font-size:11px;color:var(--text-muted);">${new Date().toLocaleString('vi-VN')}</div>
    </div>
    <div style="font-family:'Space Mono',monospace;font-size:13px;color:var(--success);font-weight:700;">
      +${amount.toLocaleString()}₫
    </div>`;
  log.prepend(item);
  updateFundUI();
}

function updateFundUI() {
  const total  = STATE.totalRevenue;
  const pct    = Math.min(100, (total / CONFIG.FUND_TARGET) * 100).toFixed(1);
  document.getElementById('fund-total').textContent   = total.toLocaleString('vi-VN') + ' ₫';
  document.getElementById('fund-bar').style.width     = pct + '%';
  document.getElementById('fund-pct-lbl').textContent = pct + '%';
}

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
(function init() {
  // Load demo data
  STATE.attendanceList = [...DEMO_ATTENDANCE];
  STATE.totalAds       = 3;
  STATE.totalRevenue   = 4500;
  setStep(1);
  updateFundUI();
})();