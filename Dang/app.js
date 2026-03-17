/* ═══════════════════════════════════════════════════════════
   HỆ THỐNG ĐIỂM DANH ĐẢNG BỘ - FIREBASE REALTIME + ADMIN MAP
══════════════════════════════════════════════════════════ */

// Đã import thêm module 'remove' để xóa dữ liệu
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, child, onValue, push, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBRKporXFmvJ_3BgD6Da0asgLySM4pAPnM",
  authDomain: "dang-33ff0.firebaseapp.com",
  projectId: "dang-33ff0",
  storageBucket: "dang-33ff0.firebasestorage.app",
  messagingSenderId: "907237414842",
  appId: "1:907237414842:web:df757184026f26d96eef83",
  measurementId: "G-VBT77MGGH4"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const CONFIG = {
  QR_REFRESH_SECONDS:  30,
  ADMIN_PASSWORD:      'admin123',
  TOTAL_MEMBERS:       250,
  SITE_URL: 'https://dinhthanhk.github.io/Haha/Dang/index.html',
};

const STATE = {
  step: 1, name: '', memberId: '', lop: '', geoOk: false, geoLat: null, geoLng: null,
  attendanceList: [], qrInterval: null, qrCountdown: CONFIG.QR_REFRESH_SECONDS,
  isAdmin: false, leafletMap: null,
  SESSION: { name: 'Họp chi bộ', lat: 21.0036, lng: 105.8412, radius: 300 }
};

let adminLeafletMap = null;
let adminMarker = null;
let adminRadiusCircle = null;

window.switchTab = switchTab; window.goStep2 = goStep2; window.completeAttendance = completeAttendance;
window.bypassGeo = bypassGeo; window.adminLogin = adminLogin; window.regenerateQR = regenerateQR;
window.saveSession = saveSession; window.exportData = exportData; window.resetForm = resetForm;
window.saveNewLocationToDB = saveNewLocationToDB; window.applySavedLocation = applySavedLocation;
window.deleteSavedLocation = deleteSavedLocation;
window.syncRadiusFromSlider = syncRadiusFromSlider;
window.syncRadiusFromInput = syncRadiusFromInput;
window.startGeoWithMap = startGeoWithMap;

function setSliderPct(v) {
  const slider = document.getElementById('session-radius-slider');
  if (!slider) return;
  const clamped = Math.min(500, Math.max(50, v));
  slider.value = clamped;
  const pct = ((clamped - 50) / 450 * 100).toFixed(1) + '%';
  slider.style.setProperty('--pct', pct);
}

function syncRadiusFromSlider(val, el) {
  const v = parseInt(val) || 300;
  document.getElementById('session-radius').value = v;
  document.getElementById('session-radius-display').textContent = v + 'm';
  if (adminRadiusCircle) adminRadiusCircle.setRadius(v);
  // Fix 2: cập nhật CSS variable --pct để thanh màu đỏ chạy theo đúng vị trí
  if (el) {
    const min = parseInt(el.min) || 50;
    const max = parseInt(el.max) || 500;
    const pct = ((v - min) / (max - min) * 100).toFixed(1) + '%';
    el.style.setProperty('--pct', pct);
  }
}

function syncRadiusFromInput(val) {
  const v = parseInt(val) || 300;
  document.getElementById('session-radius-display').textContent = v + 'm';
  if (adminRadiusCircle) adminRadiusCircle.setRadius(v);
  if (v >= 50 && v <= 500) setSliderPct(v);
}

const MEMBER_STORAGE_KEY = 'dangbo_member_info';

function saveMemberInfoIfChecked() {
  if (document.getElementById('inp-remember').checked) {
    localStorage.setItem(MEMBER_STORAGE_KEY, JSON.stringify({
      name: document.getElementById('inp-name').value.trim(),
      id:   document.getElementById('inp-id').value.trim(),
      lop:  document.getElementById('inp-lop').value.trim(),
    }));
  } else {
    localStorage.removeItem(MEMBER_STORAGE_KEY);
  }
}

function loadSavedMemberInfo() {
  try {
    const saved = localStorage.getItem(MEMBER_STORAGE_KEY);
    if (!saved) return;
    const info = JSON.parse(saved);
    if (info.name) document.getElementById('inp-name').value = info.name;
    if (info.id)   document.getElementById('inp-id').value   = info.id;
    if (info.lop)  document.getElementById('inp-lop').value  = info.lop;
    document.getElementById('inp-remember').checked = true;
    setTimeout(() => toast('💾 Đã tự điền thông tin đã lưu – Chỉ cần nhập mã QR!'), 500);
  } catch(e) { console.warn('Không đọc được thông tin đã lưu:', e); }
}


function updateClock() {
  const n = new Date();
  document.getElementById('live-time').innerHTML = `${n.toLocaleTimeString('vi-VN')}<br><span style="font-size:10px;opacity:.8">${n.toLocaleDateString('vi-VN')}</span>`;
}
setInterval(updateClock, 1000); updateClock();

// ─── KHỞI ĐỘNG SAU KHI DOM SẴN SÀNG ───
document.addEventListener('DOMContentLoaded', () => {
  setStep(1);

  // FIX 3: Load thông tin đã lưu SAU KHI DOM sẵn sàng
  loadSavedMemberInfo();

  // FIX 2: Đọc session/info NGAY LẬP TỨC khi load để STATE.SESSION luôn có giá trị mới nhất
  get(ref(db, 'session/info')).then(snapshot => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      STATE.SESSION.name   = data.name;
      STATE.SESSION.lat    = parseFloat(data.lat);
      STATE.SESSION.lng    = parseFloat(data.lng);
      STATE.SESSION.radius = parseInt(data.radius);
    }
  });

  // Lắng nghe thay đổi session/info realtime (khi admin phát điểm mới)
  onValue(ref(db, 'session/info'), (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.val();
    STATE.SESSION.name   = data.name;
    STATE.SESSION.lat    = parseFloat(data.lat);
    STATE.SESSION.lng    = parseFloat(data.lng);
    STATE.SESSION.radius = parseInt(data.radius);

    if (STATE.isAdmin) {
      document.getElementById('session-name').value  = data.name;
      document.getElementById('session-loc').value   = `${data.lat}, ${data.lng}`;
      document.getElementById('session-radius').value = data.radius;
      const dispEl = document.getElementById('session-radius-display');
      if (dispEl) dispEl.textContent = data.radius + 'm';
      setSliderPct(parseInt(data.radius));
      if (adminLeafletMap && adminMarker) {
        adminMarker.setLatLng([data.lat, data.lng]);
        adminLeafletMap.setView([data.lat, data.lng]);
        if (adminRadiusCircle) { adminRadiusCircle.setLatLng([data.lat, data.lng]); adminRadiusCircle.setRadius(parseInt(data.radius)); }
      }
    } else if (STATE.step === 2 && STATE.geoLat !== null) {
      // Tính lại ngay nếu user đang ở bước 2
      const dist = haversineDistance(STATE.geoLat, STATE.geoLng, STATE.SESSION.lat, STATE.SESSION.lng);
      updateMapInfoBox(STATE.geoLat, STATE.geoLng, dist, 0);
      renderLeafletMap(STATE.geoLat, STATE.geoLng, dist);
      if (dist <= STATE.SESSION.radius) {
        setGeoStatus('ok', `✅ Hợp lệ – Vị trí điểm họp vừa được Admin cập nhật. Cách ${Math.round(dist)}m`);
        STATE.geoOk = true; document.getElementById('geo-next-btn').disabled = false;
      } else {
        setGeoStatus('fail', `❌ Ngoài phạm vi – Bạn đang cách ${Math.round(dist)}m`);
        STATE.geoOk = false; document.getElementById('geo-next-btn').disabled = true;
      }
    }
  });

  // Lắng nghe attendance_list realtime – lưu TOÀN BỘ bản ghi vào STATE
  onValue(ref(db, 'attendance_list'), (snapshot) => {
    STATE.attendanceList = [];
    if (snapshot.exists()) {
      snapshot.forEach(childSnap => {
        STATE.attendanceList.push({ _key: childSnap.key, ...childSnap.val() });
      });
      STATE.attendanceList.reverse();
    }
    renderAttList();
    updateAdminStats();
  });

  // Auto-fill token từ QR
  const token = new URLSearchParams(window.location.search).get('token');
  if (token) {
    document.getElementById('inp-token').value = token;
    toast('✅ Đã quét QR – Vui lòng nhập thông tin để điểm danh');
    window.history.replaceState({}, '', window.location.pathname);
  }
});

function switchTab(tab) {
  ['member','admin'].forEach(t => document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab));
  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', ['member','admin'][i] === tab));
}

let toastTimeout;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast show ${type}`;
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('show'), 3000);
}

function setStep(n) {
  STATE.step = n;
  [1,2,3].forEach(i => {
    document.getElementById(`step${i}`).classList.toggle('hidden', i !== n);
    const s = document.getElementById(`s${i}`);
    s.classList.remove('active', 'done');
    if (i < n) s.classList.add('done'); else if (i === n) s.classList.add('active');
  });
}

async function goStep2() {
  const name  = document.getElementById('inp-name').value.trim();
  const id    = document.getElementById('inp-id').value.trim();
  const lop   = document.getElementById('inp-lop').value.trim();
  const token = document.getElementById('inp-token').value.trim().toUpperCase();

  if (!name || !id || !lop || !token) { toast('Vui lòng nhập đầy đủ thông tin và mã xác thực', 'error'); return; }

  const btn = document.getElementById('btn-verify');
  btn.disabled = true; btn.textContent = 'Đang kiểm tra mã...';

  try {
    const snapshot = await get(child(ref(db), 'session/current_token'));
    if (snapshot.exists() && snapshot.val() === token) {
      STATE.name = name; STATE.memberId = id; STATE.lop = lop;
      saveMemberInfoIfChecked();
      setStep(2); startGeoWithMap();
    } else {
      toast('Mã điểm danh không đúng hoặc đã hết hạn!', 'error');
    }
  } catch (error) { toast('Lỗi kết nối máy chủ', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Kiểm tra mã & Tiếp theo →'; }
}

function startGeoWithMap() {
  setGeoStatus('checking', '🔍 Đang lấy tọa độ GPS...');
  if (!navigator.geolocation) return setGeoStatus('fail', '⚠️ Trình duyệt không hỗ trợ GPS');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      STATE.geoLat = lat; STATE.geoLng = lng;
      const dist = haversineDistance(lat, lng, STATE.SESSION.lat, STATE.SESSION.lng);
      updateMapInfoBox(lat, lng, dist, accuracy);
      renderLeafletMap(lat, lng, dist);

      if (dist <= STATE.SESSION.radius) {
        setGeoStatus('ok', `✅ Hợp lệ – Cách điểm họp ${Math.round(dist)}m`);
        STATE.geoOk = true; document.getElementById('geo-next-btn').disabled = false;
      } else {
        setGeoStatus('fail', `❌ Ngoài phạm vi – Cách ${Math.round(dist)}m (cho phép ${STATE.SESSION.radius}m)`);
        STATE.geoOk = false; document.getElementById('geo-next-btn').disabled = true;
      }
    },
    (err) => {
      let errMsg = '⚠️ Lỗi GPS: Hãy cho phép quyền Vị trí trên trình duyệt.';
      if (err.code === 1) errMsg = '⚠️ Bạn đã từ chối quyền truy cập vị trí. Vui lòng cho phép trong cài đặt trình duyệt.';
      else if (err.code === 3) errMsg = '⚠️ Hết thời gian lấy GPS. Vui lòng thử lại.';
      setGeoStatus('fail', errMsg);
      // Chỉ hiện bản đồ điểm họp, KHÔNG giả lập vị trí user
      renderLeafletMap(null, null, null);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function setGeoStatus(type, msg) {
  const el = document.getElementById('geo-status');
  el.className = `geo-status ${type}`; el.querySelector('#geo-msg').textContent = msg;
}

function updateMapInfoBox(lat, lng, dist, accuracy) {
  document.getElementById('info-lat').textContent = lat.toFixed(6);
  document.getElementById('info-lng').textContent = lng.toFixed(6);
  const distEl = document.getElementById('info-dist');
  distEl.textContent = Math.round(dist) + 'm'; distEl.className = 'val ' + (dist <= STATE.SESSION.radius ? 'ok' : 'fail');
  document.getElementById('info-acc').textContent = Math.round(accuracy || 0) + 'm';
}

function renderLeafletMap(userLat, userLng, dist) {
  const container = document.getElementById('map-container');
  if (STATE.leafletMap) { STATE.leafletMap.remove(); STATE.leafletMap = null; }
  container.innerHTML = '';

  // Fix 7: Nút reload bản đồ
  const reloadBtn = document.createElement('button');
  reloadBtn.innerHTML = '🔄 Tải lại bản đồ';
  reloadBtn.title = 'Tải lại bản đồ nếu tiles bị trống';
  reloadBtn.style.cssText = 'position:absolute; top:8px; right:8px; z-index:999; background:rgba(28,28,40,0.92); color:#FFD700; border:1px solid rgba(200,16,46,0.5); border-radius:6px; padding:5px 10px; font-size:12px; cursor:pointer; font-family:inherit; backdrop-filter:blur(4px);';
  reloadBtn.onclick = () => { startGeoWithMap(); };
  container.style.position = 'relative';
  
  const map = L.map(container).setView([STATE.SESSION.lat, STATE.SESSION.lng], 16);
  STATE.leafletMap = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  container.appendChild(reloadBtn);

  const sessionIcon = L.divIcon({ html: `<div style="width:36px; height:36px; border-radius:50%; background:#C8102E; border:3px solid #FFD700; display:flex; align-items:center; justify-content:center; font-size:16px; transform:translate(-50%,-50%);">📍</div>`, iconSize: [0, 0] });
  L.marker([STATE.SESSION.lat, STATE.SESSION.lng], { icon: sessionIcon }).addTo(map).bindPopup(`<b>${STATE.SESSION.name}</b>`).openPopup();
  L.circle([STATE.SESSION.lat, STATE.SESSION.lng], { radius: STATE.SESSION.radius, color: '#C8102E', weight: 2, fillColor: '#C8102E', fillOpacity: 0.1 }).addTo(map);

  if (userLat !== null && userLng !== null && dist !== null) {
    const userIcon = L.divIcon({ html: `<div style="width:30px; height:30px; border-radius:50%; background:#FFD700; border:3px solid #fff; display:flex; align-items:center; justify-content:center; font-size:13px; transform:translate(-50%,-50%);">★</div>`, iconSize: [0, 0] });
    L.marker([userLat, userLng], { icon: userIcon }).addTo(map).bindPopup(`<b>${STATE.name}</b>`);
    L.polyline([[STATE.SESSION.lat, STATE.SESSION.lng], [userLat, userLng]], { color: dist <= STATE.SESSION.radius ? '#22C55E' : '#FF2A4A', weight: 2.5, dashArray: '6, 4' }).addTo(map);
    map.fitBounds(L.latLngBounds([STATE.SESSION.lat, STATE.SESSION.lng], [userLat, userLng]).pad(0.3));
  }
}

function bypassGeo() {
  STATE.geoOk = true; STATE.geoLat = STATE.SESSION.lat; STATE.geoLng = STATE.SESSION.lng;
  setGeoStatus('ok', '✅ Test mode – Đã bỏ qua kiểm tra vị trí');
  updateMapInfoBox(STATE.SESSION.lat, STATE.SESSION.lng, 0, 5);
  renderLeafletMap(STATE.SESSION.lat, STATE.SESSION.lng, 0);
  document.getElementById('geo-next-btn').disabled = false;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const a = Math.sin(toRad(lat2 - lat1)/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1)/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function completeAttendance() {
  const btn = document.getElementById('geo-next-btn');
  btn.disabled = true; btn.textContent = 'Đang lưu dữ liệu...';

  // Fix 5: Chống điểm danh 2 lần – kiểm tra cookie/localStorage theo memberId + ngày hiện tại
  const todayKey = `attended_${STATE.memberId}_${new Date().toLocaleDateString('vi-VN').replace(/\//g,'-')}`;
  if (localStorage.getItem(todayKey)) {
    toast('⚠️ Bạn đã điểm danh hôm nay rồi!', 'error');
    btn.disabled = false; btn.textContent = '✅ Vị trí hợp lệ – Xác nhận điểm danh';
    return;
  }

  const code = 'DD-' + Math.random().toString(36).substr(2,6).toUpperCase();
  const record = {
    name: STATE.name, id: STATE.memberId, unit: STATE.lop,
    time: new Date().toLocaleTimeString('vi-VN'), date: new Date().toLocaleDateString('vi-VN'),
    lat: STATE.geoLat, lng: STATE.geoLng, code, timestamp: Date.now()
  };

  push(ref(db, 'attendance_list'), record)
    .then(() => {
      // Lưu dấu đã điểm danh vào localStorage (hết hạn sau 24h thực tế dùng theo ngày)
      localStorage.setItem(todayKey, '1');
      document.getElementById('success-name').textContent = STATE.name;
      document.getElementById('suc-time').textContent = record.time;
      document.getElementById('suc-code').textContent = code;
      document.getElementById('suc-unit').textContent = STATE.lop;
      setStep(3);
    }).catch(e => { toast('Lỗi lưu dữ liệu!', 'error'); btn.disabled = false; btn.textContent = '✅ Vị trí hợp lệ – Xác nhận điểm danh'; });
}

function resetForm() {
  STATE.step = 1; STATE.name = ''; STATE.memberId = ''; STATE.lop = ''; STATE.geoOk = false;
  document.getElementById('inp-token').value = '';
  document.getElementById('geo-next-btn').disabled = true;
  if (!document.getElementById('inp-remember').checked) {
    document.getElementById('inp-name').value = '';
    document.getElementById('inp-id').value   = '';
    document.getElementById('inp-lop').value  = '';
  }
  setStep(1);
}

// ─── ADMIN PANEL ───
function adminLogin() {
  if (document.getElementById('admin-pw').value === CONFIG.ADMIN_PASSWORD) {
    STATE.isAdmin = true;
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
    initQR();
    // FIX 1: Panel vừa hiện → render ngay với dữ liệu đã có trong STATE
    renderAttList();
    updateAdminStats();
    setTimeout(() => { initAdminMap(); loadSavedLocationsDB(); }, 200);
  } else toast('Sai mật khẩu!', 'error');
}

function initAdminMap() {
  const container = document.getElementById('admin-map');
  if (adminLeafletMap) { adminLeafletMap.invalidateSize(); return; }

  adminLeafletMap = L.map(container).setView([STATE.SESSION.lat, STATE.SESSION.lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(adminLeafletMap);

  adminMarker = L.marker([STATE.SESSION.lat, STATE.SESSION.lng], {
    draggable: true,
    icon: L.divIcon({ html: `<div style="width:30px; height:30px; border-radius:50%; background:#FFD700; border:3px solid #C8102E; display:flex; align-items:center; justify-content:center; font-size:16px; transform:translate(-50%,-50%); box-shadow: 0 0 10px rgba(0,0,0,0.5);">📍</div>`, iconSize: [0,0] })
  }).addTo(adminLeafletMap);

  const initRadius = parseInt(document.getElementById('session-radius').value) || STATE.SESSION.radius;
  adminRadiusCircle = L.circle([STATE.SESSION.lat, STATE.SESSION.lng], {
    radius: initRadius, color: '#C8102E', weight: 2,
    fillColor: '#C8102E', fillOpacity: 0.12, dashArray: '6, 4'
  }).addTo(adminLeafletMap);
  // Khởi tạo --pct đúng ngay lần đầu load
  setSliderPct(initRadius);

  function updateAdminCircle() {
    const pos = adminMarker.getLatLng();
    const r = parseInt(document.getElementById('session-radius').value) || 300;
    adminRadiusCircle.setLatLng(pos);
    adminRadiusCircle.setRadius(r);
    document.getElementById('session-loc').value = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
  }

  adminMarker.on('dragend', updateAdminCircle);

  adminLeafletMap.on('click', function(e) {
    adminMarker.setLatLng(e.latlng);
    updateAdminCircle();
  });
}

function loadSavedLocationsDB() {
  onValue(ref(db, 'saved_locations'), (snapshot) => {
    const select = document.getElementById('saved-loc-select');
    select.innerHTML = '<option value="">-- Chọn điểm đã lưu --</option>';
    if (snapshot.exists()) {
      snapshot.forEach(childSnap => {
        const loc = childSnap.val();
        const opt = document.createElement('option');
        opt.value = childSnap.key; opt.text = loc.name;
        opt.dataset.lat = loc.lat; opt.dataset.lng = loc.lng; opt.dataset.radius = loc.radius;
        select.appendChild(opt);
      });
    }
  });
}

function applySavedLocation() {
  const select = document.getElementById('saved-loc-select');
  const opt = select.options[select.selectedIndex];
  if (!opt.value) return;

  document.getElementById('session-name').value = opt.text;
  document.getElementById('session-loc').value = `${opt.dataset.lat}, ${opt.dataset.lng}`;
  const r = parseInt(opt.dataset.radius) || 300;
  document.getElementById('session-radius').value = r;
  const dispEl = document.getElementById('session-radius-display');
  if (dispEl) dispEl.textContent = r + 'm';
  setSliderPct(r);

  if (adminLeafletMap && adminMarker) {
    const lat = parseFloat(opt.dataset.lat), lng = parseFloat(opt.dataset.lng);
    adminLeafletMap.setView([lat, lng], 15);
    adminMarker.setLatLng([lat, lng]);
    if (adminRadiusCircle) {
      adminRadiusCircle.setLatLng([lat, lng]);
      adminRadiusCircle.setRadius(parseInt(opt.dataset.radius) || 300);
    }
  }
}

// Hàm Xóa điểm lưu trên Firebase
function deleteSavedLocation() {
  const select = document.getElementById('saved-loc-select');
  const id = select.value;
  
  if (!id) {
    toast('Vui lòng chọn một điểm từ danh sách để xóa', 'error');
    return;
  }

  const locationName = select.options[select.selectedIndex].text;
  if (confirm(`Bạn có chắc chắn muốn xóa địa điểm "${locationName}" không?`)) {
    remove(ref(db, 'saved_locations/' + id))
      .then(() => {
        toast('✅ Đã xóa địa điểm thành công!');
        // Xóa thông tin input trên màn hình luôn cho sạch
        document.getElementById('session-name').value = '';
        document.getElementById('session-loc').value = '';
      })
      .catch((error) => {
        toast('Lỗi khi xóa địa điểm', 'error');
        console.error(error);
      });
  }
}

function saveNewLocationToDB() {
  const name = prompt("Nhập tên hiển thị (VD: Hội trường tầng 3, Trụ sở A...):");
  if (!name) return;
  const locParts = document.getElementById('session-loc').value.split(',');
  const lat = parseFloat(locParts[0]), lng = parseFloat(locParts[1]);
  const radius = parseInt(document.getElementById('session-radius').value) || 300;

  push(ref(db, 'saved_locations'), { name, lat, lng, radius })
    .then(() => toast('✅ Đã lưu vào danh sách rút gọn!'));
}

function saveSession() {
  const name = document.getElementById('session-name').value;
  const locParts = document.getElementById('session-loc').value.split(',');
  const lat = parseFloat(locParts[0]) || 21.0285;
  const lng = parseFloat(locParts[1]) || 105.8542;
  const radius = parseInt(document.getElementById('session-radius').value) || 300;

  set(ref(db, 'session/info'), { name, lat, lng, radius })
    .then(() => toast('✅ Cấu hình điểm họp đã được phát tới toàn bộ Đảng viên!'));
}

function initQR() {
  regenerateQR(); clearInterval(STATE.qrInterval); STATE.qrCountdown = CONFIG.QR_REFRESH_SECONDS;
  STATE.qrInterval = setInterval(() => {
    STATE.qrCountdown--;
    const pct = ((CONFIG.QR_REFRESH_SECONDS - STATE.qrCountdown) / CONFIG.QR_REFRESH_SECONDS) * 100;
    const barEl = document.getElementById('qr-bar'); if (barEl) barEl.style.width = pct + '%';
    const txtEl = document.getElementById('qr-timer-txt'); if (txtEl) txtEl.textContent = `Làm mới sau: ${STATE.qrCountdown}s`;
    if (STATE.qrCountdown <= 0) { regenerateQR(); STATE.qrCountdown = CONFIG.QR_REFRESH_SECONDS; }
  }, 1000);
}

function regenerateQR() {
  const el = document.getElementById('qrcode'); if (!el) return; el.innerHTML = '';
  const token = Math.random().toString(36).substr(2, 6).toUpperCase();
  set(ref(db, 'session/current_token'), token).catch(e => console.error(e));
  document.getElementById('qr-token-display').textContent = token;
  new QRCode(el, { text: `${CONFIG.SITE_URL}?token=${token}`, width: 180, height: 180, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });
  // Fix 6: reset cả đếm ngược, không chỉ thanh bar
  STATE.qrCountdown = CONFIG.QR_REFRESH_SECONDS;
  const barEl = document.getElementById('qr-bar'); if (barEl) barEl.style.width = '0%';
  const txtEl = document.getElementById('qr-timer-txt'); if (txtEl) txtEl.textContent = `Làm mới sau: ${CONFIG.QR_REFRESH_SECONDS}s`;
}

function updateAdminStats() {
  if (!STATE.isAdmin) return;
  const el = document.getElementById('stat-total');
  if (!el) return;
  const t = STATE.attendanceList.length;
  el.textContent = t;
  document.getElementById('stat-pct').textContent = Math.min(100, Math.round(t / CONFIG.TOTAL_MEMBERS * 100)) + '%';
}

function renderAttList() {
  if (!STATE.isAdmin) return;
  const el = document.getElementById('att-list');
  if (!el) return;
  if (!STATE.attendanceList.length) return el.innerHTML = '<p class="text-muted text-center" style="padding:20px;">Chưa có dữ liệu</p>';
  el.innerHTML = STATE.attendanceList.map(r => `
    <div class="attendance-item">
      <div class="att-avatar">${r.name.split(' ').pop()[0]}</div>
      <div class="att-info"><div class="att-name">${r.name}</div><div class="att-detail">${r.id} · ${r.unit || '—'}</div></div>
      <div style="text-align:right;"><div class="att-time">${r.time}</div><span class="badge-ok">✓ Hợp lệ</span></div>
    </div>`).join('');
}

function exportData() {
  if (!STATE.attendanceList.length) return toast('Chưa có dữ liệu để xuất', 'error');

  if (typeof XLSX === 'undefined') {
    toast('Đang tải thư viện XLSX, vui lòng thử lại sau 2 giây...', 'error');
    return;
  }

  // Fix 4: lọc theo ngày nếu admin chọn ngày cụ thể
  const filterDate = document.getElementById('export-date-filter')?.value;
  let list = STATE.attendanceList;
  if (filterDate) {
    // filterDate dạng YYYY-MM-DD, r.date dạng DD/MM/YYYY (vi-VN)
    const [y, m, d] = filterDate.split('-');
    const viDate = `${d}/${m}/${y}`;
    list = list.filter(r => r.date === viDate);
    if (!list.length) return toast(`Không có dữ liệu ngày ${d}/${m}/${y}`, 'error');
  }

  const rows = list.map((r, i) => ({
    'STT': i + 1,
    'Họ tên': r.name,
    'MSSV': r.id,
    'Lớp': r.unit || '',
    'Ngày': r.date || '',
    'Thời gian': r.time || '',
    'Mã xác nhận': r.code,
    'Vĩ độ': r.lat,
    'Kinh độ': r.lng,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 5 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
    { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Điểm danh');

  const suffix = filterDate ? filterDate : new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
  XLSX.writeFile(wb, `diemdanh_${suffix}.xlsx`);
  toast(`✅ Đã xuất ${list.length} bản ghi!`);
}