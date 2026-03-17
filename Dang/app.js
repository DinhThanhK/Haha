/* ═══════════════════════════════════════════════════════════
   HỆ THỐNG ĐIỂM DANH ĐẢNG BỘ - TÍCH HỢP FIREBASE REALTIME
══════════════════════════════════════════════════════════ */

// Import Firebase (phiên bản chuẩn module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, child, onValue, push } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Cấu hình Firebase của bạn
const firebaseConfig = {
  apiKey: "AIzaSyBRKporXFmvJ_3BgD6Da0asgLySM4pAPnM",
  authDomain: "dang-33ff0.firebaseapp.com",
  projectId: "dang-33ff0",
  storageBucket: "dang-33ff0.firebasestorage.app",
  messagingSenderId: "907237414842",
  appId: "1:907237414842:web:df757184026f26d96eef83",
  measurementId: "G-VBT77MGGH4"
};

// Khởi tạo Firebase & Database
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ─── CONFIG ───────────────────
const CONFIG = {
  QR_REFRESH_SECONDS:  30,
  ADMIN_PASSWORD:      'admin123',
  TOTAL_MEMBERS:       250,
  // Đổi thành URL trang web sau khi bạn đưa lên host (ví dụ Github Pages)
  SITE_URL: 'https://dinhthanhk.github.io/Haha/Dang/index.html',
};

// ─── APP STATE ─────────────────────────────────────────────
const STATE = {
  step: 1,
  name: '', memberId: '', unit: '',
  geoOk: false, geoLat: null, geoLng: null,
  attendanceList: [],
  qrInterval: null,
  qrCountdown: CONFIG.QR_REFRESH_SECONDS,
  isAdmin: false,
  leafletMap: null,
  leafletUserMarker: null,
  SESSION: {
    name:   'Họp chi bộ',
    lat:    21.0036,
    lng:    105.8412,
    radius: 300,
  },
};

// ══════════════════════════════════════════════════════════
// GẮN HÀM VÀO WINDOW ĐỂ HTML GỌI ĐƯỢC KHI DÙNG TYPE="MODULE"
// ══════════════════════════════════════════════════════════
window.switchTab = switchTab;
window.goStep2 = goStep2;
window.completeAttendance = completeAttendance;
window.bypassGeo = bypassGeo;
window.adminLogin = adminLogin;
window.regenerateQR = regenerateQR;
window.saveSession = saveSession;
window.exportData = exportData;
window.resetForm = resetForm;

// ══════════════════════════════════════════════════════════
// INIT & CLOCK
// ══════════════════════════════════════════════════════════
function updateClock() {
  const n = new Date();
  document.getElementById('live-time').innerHTML =
    `${n.toLocaleTimeString('vi-VN')}<br>
     <span style="font-size:10px;opacity:.8">${n.toLocaleDateString('vi-VN')}</span>`;
}
setInterval(updateClock, 1000);
updateClock();

(function init() {
  // Đọc token từ URL nếu người dùng quét QR
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  if (token) {
    document.getElementById('inp-token').value = token;
    toast('✅ Đã quét QR - Vui lòng nhập thông tin để điểm danh');
    window.history.replaceState({}, '', window.location.pathname);
  }

  setStep(1);

  // Lắng nghe dữ liệu điểm danh realtime từ Firebase
  onValue(ref(db, 'attendance_list'), (snapshot) => {
    STATE.attendanceList = [];
    snapshot.forEach(childSnapshot => {
      STATE.attendanceList.push(childSnapshot.val());
    });
    // Đảo ngược mảng để người mới nhất lên đầu
    STATE.attendanceList.reverse();
    
    if (STATE.isAdmin) {
      renderAttList();
      updateAdminStats();
    }
  });

})();

// ══════════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════════
function switchTab(tab) {
  ['member','admin'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', ['member','admin'][i] === tab);
  });
}

let toastTimeout;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 3000);
}

function setStep(n) {
  STATE.step = n;
  [1,2,3].forEach(i => {
    document.getElementById(`step${i}`).classList.toggle('hidden', i !== n);
    const s = document.getElementById(`s${i}`);
    s.classList.remove('active', 'done');
    if (i < n)      s.classList.add('done');
    else if (i === n) s.classList.add('active');
  });
}

// ══════════════════════════════════════════════════════════
// STEP 1 -> STEP 2 (XÁC THỰC FIREBASE TOKEN)
// ══════════════════════════════════════════════════════════
async function goStep2() {
  const name  = document.getElementById('inp-name').value.trim();
  const id    = document.getElementById('inp-id').value.trim();
  const token = document.getElementById('inp-token').value.trim().toUpperCase();

  if (!name || !id || !token) { 
    toast('Vui lòng nhập đầy đủ thông tin và mã xác thực', 'error'); 
    return; 
  }

  const btn = document.getElementById('btn-verify');
  btn.disabled = true;
  btn.textContent = 'Đang kiểm tra mã...';

  try {
    // Đọc mã token hiện tại trên Firebase
    const snapshot = await get(child(ref(db), 'session/current_token'));
    if (snapshot.exists() && snapshot.val() === token) {
      STATE.name     = name;
      STATE.memberId = id;
      STATE.unit     = document.getElementById('inp-unit').value || 'Chưa xác định';
      setStep(2);
      startGeoWithMap();
    } else {
      toast('Mã điểm danh không đúng hoặc đã hết hạn!', 'error');
    }
  } catch (error) {
    toast('Lỗi kết nối máy chủ', 'error');
    console.error(error);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kiểm tra mã & Tiếp theo →';
  }
}

// ══════════════════════════════════════════════════════════
// GEOLOCATION (MAP)
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
      const MSGS = { 1: 'Bạn đã từ chối quyền GPS.', 2: 'Không xác định được vị trí.', 3: 'Hết thời gian chờ GPS.' };
      setGeoStatus('fail', '⚠️ ' + (MSGS[err.code] || err.message));
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

function renderLeafletMap(userLat, userLng, dist) {
  const container = document.getElementById('map-container');
  if (STATE.leafletMap) { STATE.leafletMap.remove(); STATE.leafletMap = null; }
  container.innerHTML = '';
  
  const centerLat = dist !== null ? (userLat + STATE.SESSION.lat) / 2 : STATE.SESSION.lat;
  const centerLng = dist !== null ? (userLng + STATE.SESSION.lng) / 2 : STATE.SESSION.lng;
  const map = L.map(container, { center: [centerLat, centerLng], zoom: 15 });
  STATE.leafletMap = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  const sessionIcon = L.divIcon({
    html: `<div style="width:36px; height:36px; border-radius:50%; background:#C8102E; border:3px solid #FFD700; display:flex; align-items:center; justify-content:center; font-size:16px; transform:translate(-50%,-50%);">📍</div>`,
    iconSize: [0, 0]
  });

  L.marker([STATE.SESSION.lat, STATE.SESSION.lng], { icon: sessionIcon })
    .addTo(map).bindPopup(`<b>${STATE.SESSION.name}</b>`).openPopup();

  L.circle([STATE.SESSION.lat, STATE.SESSION.lng], {
    radius: STATE.SESSION.radius, color: '#C8102E', weight: 2, fillColor: '#C8102E', fillOpacity: 0.07
  }).addTo(map);

  if (dist !== null) {
    const userIcon = L.divIcon({
      html: `<div style="width:30px; height:30px; border-radius:50%; background:#FFD700; border:3px solid #fff; display:flex; align-items:center; justify-content:center; font-size:13px; transform:translate(-50%,-50%);">★</div>`,
      iconSize: [0, 0]
    });
    L.marker([userLat, userLng], { icon: userIcon }).addTo(map).bindPopup(`<b>${STATE.name}</b>`);
    L.polyline([[STATE.SESSION.lat, STATE.SESSION.lng], [userLat, userLng]], {
      color: dist <= STATE.SESSION.radius ? '#22C55E' : '#FF2A4A', weight: 2.5, dashArray: '6, 4'
    }).addTo(map);
    map.fitBounds(L.latLngBounds([STATE.SESSION.lat, STATE.SESSION.lng], [userLat, userLng]).pad(0.3));
  }
}

function bypassGeo() {
  STATE.geoOk  = true;
  STATE.geoLat = STATE.SESSION.lat;
  STATE.geoLng = STATE.SESSION.lng;
  setGeoStatus('ok', '✅ Test mode – Đã bỏ qua kiểm tra vị trí');
  updateMapInfoBox(STATE.SESSION.lat, STATE.SESSION.lng, 0, 5);
  renderLeafletMap(STATE.SESSION.lat, STATE.SESSION.lng, 0);
  document.getElementById('geo-next-btn').disabled = false;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ══════════════════════════════════════════════════════════
// STEP 2 -> STEP 3 (HOÀN TẤT & LƯU LÊN FIREBASE)
// ══════════════════════════════════════════════════════════
function completeAttendance() {
  const btn = document.getElementById('geo-next-btn');
  btn.disabled = true;
  btn.textContent = 'Đang lưu dữ liệu...';

  const now  = new Date();
  const code = 'DD-' + Math.random().toString(36).substr(2,6).toUpperCase();
  
  const record = {
    name: STATE.name, id: STATE.memberId, unit: STATE.unit,
    time: now.toLocaleTimeString('vi-VN'),
    date: now.toLocaleDateString('vi-VN'),
    lat: STATE.geoLat, lng: STATE.geoLng, code,
    timestamp: Date.now()
  };

  // PUSH LÊN FIREBASE
  push(ref(db, 'attendance_list'), record)
    .then(() => {
      document.getElementById('success-name').textContent = STATE.name;
      document.getElementById('suc-time').textContent = record.time;
      document.getElementById('suc-code').textContent = code;
      document.getElementById('suc-unit').textContent = STATE.unit;
      setStep(3);
    })
    .catch((error) => {
      toast('Lỗi khi lưu dữ liệu, vui lòng thử lại!', 'error');
      btn.disabled = false;
      btn.textContent = '✅ Vị trí hợp lệ – Xác nhận điểm danh';
      console.error(error);
    });
}

function resetForm() {
  STATE.step = 1; STATE.name = ''; STATE.memberId = ''; STATE.unit = '';
  STATE.geoOk = false;
  document.getElementById('inp-name').value  = '';
  document.getElementById('inp-id').value    = '';
  document.getElementById('inp-unit').value  = '';
  document.getElementById('inp-token').value = '';
  document.getElementById('geo-next-btn').disabled = true;
  setStep(1);
}

// ══════════════════════════════════════════════════════════
// ADMIN PANEL
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

// ── ADMIN QR CODE & TẠO TOKEN ĐẨY LÊN FIREBASE ──
function initQR() {
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

  // Tạo token ngẫu nhiên 6 ký tự
  const token = Math.random().toString(36).substr(2, 6).toUpperCase();

  // Đẩy token mới lên Firebase để người dùng xác thực
  set(ref(db, 'session/current_token'), token).catch(e => console.error("Lỗi cập nhật token:", e));

  // Hiện mã bự trên màn hình
  document.getElementById('qr-token-display').textContent = token;

  // Tạo QR Code
  const qrUrl = `${CONFIG.SITE_URL}?token=${token}`;
  new QRCode(el, { text: qrUrl, width: 180, height: 180, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });

  STATE.qrCountdown = CONFIG.QR_REFRESH_SECONDS;
  const barEl = document.getElementById('qr-bar');
  if (barEl) barEl.style.width = '0%';
}

function saveSession() {
  STATE.SESSION.name   = document.getElementById('session-name').value;
  const locParts       = document.getElementById('session-loc').value.split(',');
  STATE.SESSION.lat    = parseFloat(locParts[0]) || 21.0285;
  STATE.SESSION.lng    = parseFloat(locParts[1]) || 105.8542;
  STATE.SESSION.radius = parseInt(document.getElementById('session-radius').value) || 300;
  toast('✅ Đã lưu cài đặt buổi họp!');
}

function updateAdminStats() {
  const total = STATE.attendanceList.length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-pct').textContent   =
    Math.min(100, Math.round(total / CONFIG.TOTAL_MEMBERS * 100)) + '%';
}

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
