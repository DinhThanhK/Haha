/* ═══════════════════════════════════════════════════════════
   HỆ THỐNG ĐIỂM DANH ĐẢNG BỘ - FIREBASE REALTIME + ADMIN MAP
══════════════════════════════════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, child, onValue, push, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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
  TOTAL_MEMBERS:       250,
  SITE_URL: 'https://diemdanh-chibo-huce.vercel.app',
  // Cài đặt form đảng viên (true = hiển thị, false = ẩn)
  FIELD_NAME:  true,
  FIELD_ID:    true,
  FIELD_LOP:   true,
  FIELD_TOKEN: true,
  FIELD_ZALO:  true,
  // Cài đặt file xuất
  XLSX_SHEET_NAME:  'Điểm danh',
  XLSX_FILE_PREFIX: 'diemdanh',
};

// Load settings từ localStorage vào CONFIG khi khởi động
(function loadSettings() {
  const saved = localStorage.getItem('dangbo_settings');
  if (!saved) return;
  try {
    const s = JSON.parse(saved);
    Object.assign(CONFIG, s);
  } catch(e) {}
})();

window.saveSettings = function() {
  const qr = parseInt(document.getElementById('set-qr-seconds')?.value) || 30;
  const totalMembers = parseInt(document.getElementById('set-total-members')?.value) || 300;
  const fieldName  = document.getElementById('set-field-name')?.checked ?? true;
  const fieldId    = document.getElementById('set-field-id')?.checked ?? true;
  const fieldLop   = document.getElementById('set-field-lop')?.checked ?? true;
  const fieldToken = document.getElementById('set-field-token')?.checked ?? true;
  const fieldZalo  = document.getElementById('set-field-zalo')?.checked ?? true;
  const sheetName  = document.getElementById('set-sheet-name')?.value?.trim() || 'Điểm danh';
  const filePrefix = document.getElementById('set-file-prefix')?.value?.trim() || 'diemdanh';

  CONFIG.QR_REFRESH_SECONDS = qr;
  CONFIG.TOTAL_MEMBERS = totalMembers;
  CONFIG.FIELD_NAME  = fieldName;
  CONFIG.FIELD_ID    = fieldId;
  CONFIG.FIELD_LOP   = fieldLop;
  CONFIG.FIELD_TOKEN = fieldToken;
  CONFIG.FIELD_ZALO  = fieldZalo;
  CONFIG.XLSX_SHEET_NAME  = sheetName;
  CONFIG.XLSX_FILE_PREFIX = filePrefix;

  localStorage.setItem('dangbo_settings', JSON.stringify({
    QR_REFRESH_SECONDS: qr,
    TOTAL_MEMBERS: totalMembers,
    FIELD_NAME: fieldName, FIELD_ID: fieldId, FIELD_LOP: fieldLop, FIELD_TOKEN: fieldToken, FIELD_ZALO: fieldZalo,
    XLSX_SHEET_NAME: sheetName, XLSX_FILE_PREFIX: filePrefix,
  }));

  // Lưu 5 trường field lên Firebase để đồng bộ cho tất cả người dùng
  set(ref(db, 'settings/fields'), {
    FIELD_NAME: fieldName,
    FIELD_ID:   fieldId,
    FIELD_LOP:  fieldLop,
    FIELD_TOKEN: fieldToken,
    FIELD_ZALO:  fieldZalo,
  }).catch(e => console.warn('Lưu settings Firebase thất bại:', e));

  // Cập nhật thống kê ngay với tổng số mới
  updateAdminStats();

  // Áp dụng ngay: reset QR interval với thời gian mới
  CONFIG.QR_REFRESH_SECONDS = qr;
  // Cập nhật text mô tả thời gian làm mới QR
  const qrDescEl = document.getElementById('qr-refresh-desc');
  if (qrDescEl) qrDescEl.textContent = qr + ' giây';
  if (STATE.qrActive) {
    clearInterval(STATE.qrInterval);
    STATE.qrInterval = null;
    STATE.qrCountdown = qr;
    regenerateQR();
    STATE.qrInterval = setInterval(() => {
      STATE.qrCountdown--;
      const pct = ((CONFIG.QR_REFRESH_SECONDS - STATE.qrCountdown) / CONFIG.QR_REFRESH_SECONDS) * 100;
      const barEl = document.getElementById('qr-bar'); if (barEl) barEl.style.width = pct + '%';
      const txtEl = document.getElementById('qr-timer-txt'); if (txtEl) txtEl.textContent = `Làm mới sau: ${STATE.qrCountdown}s`;
      if (STATE.qrCountdown <= 0) { regenerateQR(); STATE.qrCountdown = CONFIG.QR_REFRESH_SECONDS; }
    }, 1000);
  }

  // Ẩn/hiện form fields
  const fieldMap = {
    'group-name': fieldName, 'group-id': fieldId,
    'group-lop': fieldLop, 'group-token': fieldToken,
  };
  Object.entries(fieldMap).forEach(([id, show]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
  // Ẩn/hiện ô Zalo
  const zaloBox = document.getElementById('verify-zalo-box');
  if (zaloBox) zaloBox.style.display = fieldZalo ? '' : 'none';
  // Nếu bỏ Zalo thì reset state để không bị kẹt
  if (!fieldZalo) { STATE.zaloId = null; STATE.zaloName = null; }
  // Cập nhật lại trạng thái nút Kiểm tra mã
  checkVerifyReady();

  toast('✅ Đã lưu cài đặt!');
  // Đóng panel
  const panel = document.getElementById('settings-panel');
  if (panel) panel.style.display = 'none';
  const arrow = document.getElementById('settings-arrow');
  if (arrow) arrow.textContent = '▼';
};

window.toggleSettings = function() {
  const panel = document.getElementById('settings-panel');
  const arrow = document.getElementById('settings-arrow');
  if (!panel) return;
  const open = panel.style.display === 'block';
  panel.style.display = open ? 'none' : 'block';
  if (arrow) arrow.textContent = open ? '▼' : '▲';
  if (!open) {
    // Điền giá trị hiện tại vào form
    const setEl = id => document.getElementById(id);
    if (setEl('set-qr-seconds'))   setEl('set-qr-seconds').value   = CONFIG.QR_REFRESH_SECONDS;
    // Sync text-muted description
    const qrDesc = document.getElementById('qr-refresh-desc');
    if (qrDesc) qrDesc.textContent = CONFIG.QR_REFRESH_SECONDS + ' giây';
    if (setEl('set-total-members')) setEl('set-total-members').value = CONFIG.TOTAL_MEMBERS;
    if (setEl('set-qr-range')) {
      setEl('set-qr-range').value = CONFIG.QR_REFRESH_SECONDS;
      const pct = (((CONFIG.QR_REFRESH_SECONDS - 10) / (120 - 10)) * 100).toFixed(1) + '%';
      setEl('set-qr-range').style.setProperty('--range-pct', pct);
    }
    if (setEl('set-field-name'))   setEl('set-field-name').checked  = CONFIG.FIELD_NAME;
    if (setEl('set-field-id'))     setEl('set-field-id').checked    = CONFIG.FIELD_ID;
    if (setEl('set-field-lop'))    setEl('set-field-lop').checked   = CONFIG.FIELD_LOP;
    if (setEl('set-field-token'))  setEl('set-field-token').checked = CONFIG.FIELD_TOKEN;
    if (setEl('set-field-zalo'))   setEl('set-field-zalo').checked  = CONFIG.FIELD_ZALO;
    if (setEl('set-sheet-name'))   setEl('set-sheet-name').value    = CONFIG.XLSX_SHEET_NAME;
    if (setEl('set-file-prefix'))  setEl('set-file-prefix').value   = CONFIG.XLSX_FILE_PREFIX;
  }
};

const STATE = {
  step: 1, name: '', memberId: '', lop: '', geoOk: false, geoLat: null, geoLng: null,
  attendanceList: [], qrInterval: null, qrCountdown: CONFIG.QR_REFRESH_SECONDS,
  isAdmin: false, leafletMap: null, deviceFingerprint: null, zaloId: null, zaloName: null,
  SESSION: { name: 'Họp chi bộ', lat: 21.0036, lng: 105.8412, radius: 300 }
};

// ─── ZALO LOGIN ───
const ZALO_APP_ID = '563672230994960830';
const ZALO_REDIRECT_URI = 'https://diemdanh-chibo-huce.vercel.app';

function generateCodeVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function startZaloLogin() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem('zalo_code_verifier', verifier);

  const params = new URLSearchParams({
    app_id:                ZALO_APP_ID,
    redirect_uri:          ZALO_REDIRECT_URI,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state:                 'diemdanh',
    scope:                 'openid,profile',
  });

  const webUrl = `https://oauth.zaloapp.com/v4/permission?${params}`;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    // Thử deep link vào app Zalo trước
    const appUrl = `zalosdk://app/open?url=${encodeURIComponent(webUrl)}`;
    const start = Date.now();
    window.location.href = appUrl;
    // Nếu 1.5s vẫn còn ở trang → không có app → fallback web
    setTimeout(() => {
      if (Date.now() - start < 2500) {
        window.location.href = webUrl;
      }
    }, 1500);
  } else {
    window.location.href = webUrl;
  }
}

async function handleZaloCallback(code) {
  const verifier = sessionStorage.getItem('zalo_code_verifier') || '';
  try {
    // Bước 1: Server đổi code → access_token
    const res = await fetch('/api/zalo-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier }),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error(data.error || 'Không lấy được access_token');

    // Bước 2: Client tự gọi graph.zalo.me (IP Việt Nam)
    const userRes = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
      headers: { 'access_token': data.access_token },
    });
    const userData = await userRes.json();
    if (!userData.id) throw new Error('Zalo không trả về ID: ' + JSON.stringify(userData));

    STATE.zaloId   = userData.id;
    STATE.zaloName = userData.name || null;
    sessionStorage.setItem('zalo_id',   userData.id);
    sessionStorage.setItem('zalo_name', userData.name || '');
    sessionStorage.removeItem('zalo_code_verifier');

    // Tự điền tên nếu chưa có
    const nameInput = document.getElementById('inp-name');
    if (nameInput && !nameInput.value.trim()) nameInput.value = STATE.zaloName || '';

    // Bước 3: Kiểm tra ngay hôm nay đã điểm danh chưa
    const now = new Date();
    const dd  = String(now.getDate()).padStart(2,'0');
    const mm  = String(now.getMonth()+1).padStart(2,'0');
    const todayKey = `${dd}-${mm}-${now.getFullYear()}`;
    const alreadyDone = await checkZaloAttended(STATE.zaloId, todayKey);

    if (alreadyDone) {
      updateZaloUI(true, true);
      toast('⚠️ Tài khoản Zalo này đã điểm danh hôm nay rồi!', 'error');
      const btnVerify = document.getElementById('btn-verify');
      if (btnVerify) {
        btnVerify.disabled = true;
        btnVerify.textContent = '✓ Đã điểm danh hôm nay';
        btnVerify.style.cssText = 'background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#86efac;cursor:default;';
      }
    } else {
      updateZaloUI(true, false);
      checkVerifyReady();
      toast('Xác thực Zalo thành công!');
    }
  } catch(e) {
    toast('Lỗi xác thực, vui lòng thử lại!', 'error');
    updateZaloUI(false, false);
  }
}

function updateZaloUI(loggedIn, alreadyAttended = false, checking = false) {
  const box     = document.getElementById('verify-zalo-box');
  const subText = document.getElementById('zalo-box-sub');
  const iconEmpty = document.getElementById('zalo-icon-empty');
  const iconDone  = document.getElementById('zalo-icon-done');

  if (!box) return;

  // Trạng thái đang kiểm tra
  if (checking) {
    box.classList.remove('done');
    if (iconEmpty) iconEmpty.style.display = 'block';
    if (iconDone)  iconDone.style.display  = 'none';
    if (subText) {
      subText.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;">'
        + '<span style="display:inline-block;width:10px;height:10px;border:2px solid rgba(10,132,255,0.4);border-top-color:#0a84ff;border-radius:50%;animation:zalo-spin .7s linear infinite;"></span>'
        + 'Đang kiểm tra Zalo...</span>';
      subText.style.color = '#60a5fa';
    }
    // Inject spinner keyframes nếu chưa có
    if (!document.getElementById('zalo-spin-style')) {
      const s = document.createElement('style');
      s.id = 'zalo-spin-style';
      s.textContent = '@keyframes zalo-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
    return;
  }

  if (loggedIn) {
    box.classList.add('done');
    if (iconEmpty) iconEmpty.style.display = 'none';
    if (iconDone)  iconDone.style.display  = 'block';
    if (subText) {
      if (alreadyAttended) {
        subText.textContent = '⚠️ ' + (STATE.zaloName || 'Đã xác thực') + ' · Đã điểm danh hôm nay';
        subText.style.color = '#fca5a5';
      } else {
        subText.textContent = '✓ ' + (STATE.zaloName || 'Đã xác thực');
        subText.style.color = '#86efac';
      }
    }
  } else {
    box.classList.remove('done');
    if (iconEmpty) iconEmpty.style.display = 'block';
    if (iconDone)  iconDone.style.display  = 'none';
    if (subText) {
      subText.textContent = 'Bấm để đăng nhập Zalo';
      subText.style.color = '';
    }
  }
}

async function checkZaloAttended(zaloId, todayKey) {
  if (!zaloId) return false;
  // todayKey format: dd-mm-yyyy
  const key = todayKey.includes('/') ? todayKey.replace(/\//g, '-') : todayKey;
  try {
    const snap = await get(ref(db, `zalo_attendance/${zaloId}/${key}`));
    return snap.exists();
  } catch(e) { return false; }
}

async function markZaloAttended(zaloId, todayKey) {
  if (!zaloId) return;
  const key = todayKey.includes('/') ? todayKey.replace(/\//g, '-') : todayKey;
  try {
    await set(ref(db, `zalo_attendance/${zaloId}/${key}`), true);
  } catch(e) { console.warn('markZaloAttended error:', e); }
}

// ─── DEVICE FINGERPRINT ───
async function initFingerprint() {
  try {
    if (typeof FingerprintJS === 'undefined') return;
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    STATE.deviceFingerprint = result.visitorId;
  } catch(e) {
    console.warn('Fingerprint init failed:', e);
  }
}

async function checkDeviceAttended(todayVi) {
  if (!STATE.deviceFingerprint) return false;
  try {
    const snap = await get(ref(db, `device_attendance/${STATE.deviceFingerprint}/${todayVi.replace(/\//g, '-')}`));
    return snap.exists();
  } catch(e) { return false; }
}

async function markDeviceAttended(todayVi) {
  if (!STATE.deviceFingerprint) return;
  try {
    await set(ref(db, `device_attendance/${STATE.deviceFingerprint}/${todayVi.replace(/\//g, '-')}`), true);
  } catch(e) { console.warn('markDeviceAttended error:', e); }
}

let adminLeafletMap = null;
let adminMarker = null;
let adminRadiusCircle = null;

// ─── ADMIN SESSION TRACKING ───
let MY_ADMIN_SESSION_KEY = null;

function registerAdminSession() {
  const sessionId = 'admin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  MY_ADMIN_SESSION_KEY = sessionId;
  const sessionRef = ref(db, 'admin_sessions/' + sessionId);
  set(sessionRef, { joinedAt: Date.now(), active: true });
  // Tự xóa khi mất kết nối / đóng tab
  onDisconnect(sessionRef).remove();
  return sessionId;
}

function unregisterAdminSession() {
  if (MY_ADMIN_SESSION_KEY) {
    remove(ref(db, 'admin_sessions/' + MY_ADMIN_SESSION_KEY));
    MY_ADMIN_SESSION_KEY = null;
  }
}

function watchAdminSessions() {
  onValue(ref(db, 'admin_sessions'), (snapshot) => {
    if (!STATE.isAdmin) return;
    const sessions = snapshot.val() || {};
    const count = Object.keys(sessions).length;
    const banner = document.getElementById('multi-admin-banner');
    if (!banner) return;
    if (count > 1) {
      banner.style.display = 'flex';
      banner.querySelector('#multi-admin-count').textContent = count;
    } else {
      banner.style.display = 'none';
    }
  });
}

window.switchTab = switchTab; window.goStep2 = goStep2; window.completeAttendance = completeAttendance;
window.startZaloLogin = startZaloLogin;
window.bypassGeo = bypassGeo; window.adminLogin = adminLogin; window.regenerateQR = regenerateQR;
window.saveSession = saveSession; window.exportData = exportData; window.resetForm = resetForm;
window.saveNewLocationToDB = saveNewLocationToDB; window.applySavedLocation = applySavedLocation;
window.deleteSavedLocation = deleteSavedLocation;
window.syncRadiusFromSlider = syncRadiusFromSlider;
window.syncRadiusFromInput = syncRadiusFromInput;
window.startGeoWithMap = startGeoWithMap;
window.updateExportCount = updateExportCount;
window.reloadAdminMap = reloadAdminMap;
window.checkVerifyReady = checkVerifyReady;

// ─── KIỂM TRA SẴN SÀNG XÁC THỰC ───
// Gọi mỗi khi người dùng nhập mã QR — bật/tắt nút "Kiểm tra mã"
function checkVerifyReady() {
  const token = document.getElementById('inp-token')?.value.trim() || '';
  const btn   = document.getElementById('btn-verify');
  if (!btn) return;

  const hasToken = token.length >= 4;
  // Nếu setting bắt buộc Zalo thì phải xác thực, nếu không thì bỏ qua
  const hasZalo  = !CONFIG.FIELD_ZALO || !!STATE.zaloId;
  const ready    = hasToken && hasZalo;

  btn.disabled          = !ready;
  btn.style.opacity     = ready ? '1'       : '0.45';
  btn.style.cursor      = ready ? 'pointer' : 'not-allowed';

  // Cập nhật icon tick cho ô QR
  const qrDot = document.getElementById('qr-status-dot');
  const qrBox = document.getElementById('verify-qr-box');
  if (qrBox) {
    if (hasToken) qrBox.classList.add('done');
    else qrBox.classList.remove('done');
  }
  if (qrDot) {
    qrDot.innerHTML = hasToken
      ? `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
           <circle cx="11" cy="11" r="10" fill="rgba(34,197,94,0.2)" stroke="rgba(34,197,94,0.6)" stroke-width="1.5"/>
           <polyline points="6.5,11 9.5,14 15.5,8" stroke="#86efac" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
         </svg>`
      : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
           <circle cx="10" cy="10" r="9" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
         </svg>`;
  }
}

function reloadAdminMap() {
  if (adminLeafletMap) {
    adminLeafletMap.remove();
    adminLeafletMap = null; adminMarker = null; adminRadiusCircle = null;
  }
  setTimeout(() => initAdminMap(), 100);
}

function normalizeViDate(dateStr) {
  // Chuẩn hóa date về "d/m/yyyy" không có số 0 đệm để so sánh nhất quán
  // Xử lý: "19/03/2026", "19/3/2026", "2026-03-19" → "19/3/2026"
  if (!dateStr) return '';
  dateStr = dateStr.trim();
  if (dateStr.includes('-')) {
    // ISO format yyyy-mm-dd
    const [y, m, d] = dateStr.split('-');
    return `${parseInt(d)}/${parseInt(m)}/${y}`;
  }
  if (dateStr.includes('/')) {
    // vi format d/m/yyyy hoặc dd/mm/yyyy
    const parts = dateStr.split('/');
    return `${parseInt(parts[0])}/${parseInt(parts[1])}/${parts[2]}`;
  }
  return dateStr;
}

function getFilteredList() {
  const filterDate = document.getElementById('export-date-filter')?.value;
  if (!filterDate) return STATE.attendanceList;
  const targetDate = normalizeViDate(filterDate);
  const result = STATE.attendanceList.filter(r => {
    return normalizeViDate(r.date || '') === targetDate;
  });
  return result;
}

function updateExportCount() {
  const badge = document.getElementById('export-count-badge');
  if (!badge) return;
  badge.textContent = getFilteredList().length + ' người';
}

function updateAdminStats() {
  const el = document.getElementById('stat-total');
  if (!el) return;
  // Thống kê theo ngày đang lọc
  const t = getFilteredList().length;
  el.textContent = t;
  document.getElementById('stat-pct').textContent = Math.min(100, Math.round(t / CONFIG.TOTAL_MEMBERS * 100)) + '%';
}

// ─── KIỂM TRA TÊN HỢP LỆ VỚI ZALO ───
// Hợp lệ khi: ít nhất 1 từ của họ và tên (bỏ dấu) khớp với tên Zalo (bỏ dấu)
function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function isNameValid(recordName, zaloName) {
  if (!zaloName) return null; // Không có Zalo → không xác định
  const normZalo = removeAccents(zaloName);
  const normName = removeAccents(recordName || '');
  // Lấy từng từ của họ tên đăng ký
  const nameWords = normName.split(/\s+/).filter(w => w.length > 0);
  // Lấy từng từ của tên Zalo
  const zaloWords = normZalo.split(/\s+/).filter(w => w.length > 0);
  // Hợp lệ nếu có ít nhất 1 từ bất kỳ trùng nhau
  return nameWords.some(nw => zaloWords.includes(nw));
}

function renderAttList() {
  const el = document.getElementById('att-list');
  if (!el) return;
  const list = getFilteredList();
  if (!list.length) return el.innerHTML = '<p class="text-muted text-center" style="padding:20px;">Chưa có dữ liệu cho ngày này</p>';
  el.innerHTML = list.map(r => {
    const valid = isNameValid(r.name, r.zaloName);
    // valid===null: không có Zalo → hiện badge "Hợp lệ" bình thường
    // valid===true: tên khớp → Hợp lệ (xanh)
    // valid===false: tên không khớp → Không chính chủ (vàng)
    const badge = (valid === false)
      ? `<span style="color:#FCD34D;font-size:11px;font-weight:700;">⚠ Không chính chủ</span>`
      : `<span class="badge-ok">✓ Hợp lệ</span>`;
    return `
    <div class="attendance-item">
      <div class="att-avatar">${(r.name||'?').split(' ').pop()[0]}</div>
      <div class="att-info"><div class="att-name">${r.name}</div><div class="att-detail">${r.id} · ${r.unit || '—'}</div></div>
      <div style="text-align:right;"><div class="att-time">${r.time}</div>${badge}</div>
    </div>`;
  }).join('');
}

function exportData() {
  if (typeof XLSX === 'undefined') { toast('Đang tải thư viện XLSX, vui lòng thử lại...', 'error'); return; }
  const list = getFilteredList();
  if (!list.length) return toast('Không có dữ liệu để xuất', 'error');

  const rows = list.map((r, i) => {
    const valid = isNameValid(r.name, r.zaloName);
    const trangThai = (valid === false) ? 'Không chính chủ' : 'Hợp lệ';
    return {
      'STT': i + 1, 'Họ tên': r.name, 'MSSV': r.id, 'Lớp': r.unit || '',
      'Ngày': r.date || '', 'Thời gian': r.time || '',
      'Mã xác nhận': r.code, 'Vĩ độ': r.lat, 'Kinh độ': r.lng,
      'Trạng thái': trangThai,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch:5},{wch:25},{wch:15},{wch:15},{wch:14},{wch:12},{wch:16},{wch:14},{wch:14},{wch:14}];
  const wb = XLSX.utils.book_new();
  const sheetName = CONFIG.XLSX_SHEET_NAME || 'Điểm danh';
  const filePrefix = CONFIG.XLSX_FILE_PREFIX || 'diemdanh';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const filterDate = document.getElementById('export-date-filter')?.value;
  const suffix = filterDate || new Date().toLocaleDateString('vi-VN').replace(/\//g,'-');
  XLSX.writeFile(wb, `${filePrefix}_${suffix}.xlsx`);
  toast(`Đã xuất ${list.length} bản ghi!`);
}

function setSliderPct(v) {
  const slider = document.getElementById('session-radius-slider');
  if (!slider) return;
  const min = parseInt(slider.min) || 50;
  const max = parseInt(slider.max) || 500;
  const clamped = Math.min(max, Math.max(min, v));
  slider.value = clamped;
  const pct = ((clamped - min) / (max - min) * 100).toFixed(2) + '%';
  slider.style.setProperty('--range-pct', pct);
}

function syncRadiusFromSlider(val, el) {
  const v = parseInt(val) || 300;
  document.getElementById('session-radius').value = v;
  document.getElementById('session-radius-display').textContent = v + 'm';
  if (adminRadiusCircle) adminRadiusCircle.setRadius(v);
  if (el) {
    const min = parseInt(el.min) || 50;
    const max = parseInt(el.max) || 500;
    const pct = ((v - min) / (max - min) * 100).toFixed(2) + '%';
    el.style.setProperty('--range-pct', pct);
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
    setTimeout(() => toast('Đã tự điền thông tin đã lưu – Chỉ cần nhập mã QR!'), 500);
  } catch(e) { console.warn('Không đọc được thông tin đã lưu:', e); }
}


function updateClock() {
  const n = new Date();
  document.getElementById('live-time').innerHTML = `${n.toLocaleTimeString('vi-VN')}<br><span style="font-size:10px;opacity:.8">${n.toLocaleDateString('vi-VN')}</span>`;
}
setInterval(updateClock, 1000); updateClock();

window.addEventListener('beforeunload', () => {
  if (STATE.isAdmin) {
    // Đổi current_token thành mã ngẫu nhiên 9 ký tự khi admin thoát
    const invalidToken = Math.random().toString(36).substr(2, 5).toUpperCase()
                       + Math.random().toString(36).substr(2, 4).toUpperCase();
    set(ref(db, 'session/current_token'), invalidToken).catch(() => {});
  }
  unregisterAdminSession();
});

// ─── ÁP DỤNG FIELD SETTINGS VÀO UI ───
function applyFieldSettings() {
  const fieldMap = {
    'group-name':  CONFIG.FIELD_NAME,
    'group-id':    CONFIG.FIELD_ID,
    'group-lop':   CONFIG.FIELD_LOP,
    'group-token': CONFIG.FIELD_TOKEN,
  };
  Object.entries(fieldMap).forEach(([id, show]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
  const zaloBoxEl = document.getElementById('verify-zalo-box');
  if (zaloBoxEl) zaloBoxEl.style.display = CONFIG.FIELD_ZALO ? '' : 'none';
  if (!CONFIG.FIELD_ZALO) { STATE.zaloId = null; STATE.zaloName = null; }
  checkVerifyReady();
}

// ─── KHỞI ĐỘNG SAU KHI DOM SẴN SÀNG ───
document.addEventListener('DOMContentLoaded', () => {
  setStep(1);
  initFingerprint();

  // 1) Áp dụng ngay từ localStorage (nhanh, tránh flash layout)
  applyFieldSettings();

  // 2) Đọc settings từ Firebase — đồng bộ cài đặt admin cho mọi người dùng
  get(ref(db, 'settings/fields')).then(snap => {
    if (!snap.exists()) return;
    const remote = snap.val();
    let changed = false;
    ['FIELD_NAME','FIELD_ID','FIELD_LOP','FIELD_TOKEN','FIELD_ZALO'].forEach(key => {
      if (typeof remote[key] === 'boolean' && CONFIG[key] !== remote[key]) {
        CONFIG[key] = remote[key];
        changed = true;
      }
    });
    if (changed) applyFieldSettings();
  }).catch(e => console.warn('Đọc settings Firebase thất bại:', e));

  // Gắn onclick cho Zalo box sau khi module load xong (tránh STATE not defined)
  const zaloBox = document.getElementById('verify-zalo-box');
  if (zaloBox) zaloBox.addEventListener('click', () => {
    // Reset session cũ, luôn cho xác thực lại
    sessionStorage.removeItem('zalo_id');
    sessionStorage.removeItem('zalo_name');
    STATE.zaloId = null;
    STATE.zaloName = null;
    updateZaloUI(false);
    startZaloLogin();
  });

  // Xử lý Zalo OAuth callback
  const urlParams = new URLSearchParams(window.location.search);
  const zaloCode  = urlParams.get('code');
  const zaloState = urlParams.get('state');
  if (zaloCode && zaloState === 'diemdanh') {
    window.history.replaceState({}, '', window.location.pathname);
    // Hiển thị trạng thái đang kiểm tra ngay khi redirect về
    updateZaloUI(false, false, true);
    handleZaloCallback(zaloCode);
  }

  // Khởi tạo fill cho range inputs
  document.querySelectorAll('input[type="range"].styled-range').forEach(el => {
    const pct = (((el.value - el.min) / (el.max - el.min)) * 100) + '%';
    el.style.setProperty('--range-pct', pct);
  });

  // Khôi phục trạng thái đăng nhập admin nếu còn trong session
  if (sessionStorage.getItem('dangbo_admin_logged_in') === '1') {
    STATE.isAdmin = true;
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
    switchTab('admin');
    registerAdminSession();
    watchAdminSessions();
    initQR();
    setTimeout(() => {
      initAdminMap();
      loadSavedLocationsDB();
      const r = parseInt(document.getElementById('session-radius').value) || STATE.SESSION.radius;
      setSliderPct(r);
    }, 200);
  }

  // Lấy ngày hiện tại theo giờ Việt Nam (UTC+7), tránh lệch múi giờ
  const todayVN = new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
  const dateFilterEl = document.getElementById('export-date-filter');
  if (dateFilterEl) dateFilterEl.value = todayVN;

  // Khôi phục Zalo session khi reload trang (trong cùng phiên trình duyệt)
  const savedZaloId = sessionStorage.getItem('zalo_id');
  if (savedZaloId) {
    STATE.zaloId   = savedZaloId;
    STATE.zaloName = sessionStorage.getItem('zalo_name') || null;
    // Hiển thị spinner trong khi kiểm tra Firebase
    updateZaloUI(false, false, true);
    // Kiểm tra đã điểm danh hôm nay chưa
    const _now2 = new Date();
    const _dd2  = String(_now2.getDate()).padStart(2,'0');
    const _mm2  = String(_now2.getMonth()+1).padStart(2,'0');
    const _key2 = `${_dd2}-${_mm2}-${_now2.getFullYear()}`;
    checkZaloAttended(savedZaloId, _key2).then(done => {
      updateZaloUI(true, done);
      if (done) {
        const btnVerify = document.getElementById('btn-verify');
        if (btnVerify) {
          btnVerify.disabled = true;
          btnVerify.textContent = '✓ Đã điểm danh hôm nay';
          btnVerify.style.cssText = 'background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#86efac;cursor:default;';
        }
      }
    });
  }

  loadSavedMemberInfo();

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
      const dist = haversineDistance(STATE.geoLat, STATE.geoLng, STATE.SESSION.lat, STATE.SESSION.lng);
      const inRange = dist <= STATE.SESSION.radius;
      showDistCard(dist, inRange, 0);
      if (inRange) {
        setGeoStatus('ok', `Vị trí điểm họp vừa cập nhật. Cách ${Math.round(dist)}m`);
        STATE.geoOk = true; document.getElementById('geo-next-btn').disabled = false;
      } else {
        setGeoStatus('fail', `Ngoài phạm vi – Bạn đang cách ${Math.round(dist)}m`);
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
    updateExportCount();
  });

  const dateFilterListener = document.getElementById('export-date-filter');
  if (dateFilterListener) {
    dateFilterListener.addEventListener('change', () => {
      renderAttList();
      updateAdminStats();
      updateExportCount();
    });
  }

  // Auto-fill token từ QR
  const token = new URLSearchParams(window.location.search).get('token');
  if (token) {
    document.getElementById('inp-token').value = token;
    checkVerifyReady();
    toast('Đã quét QR – Vui lòng nhập thông tin để điểm danh');
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
  // Bước 2: cho phép click vào bước 1 để quay lại
  const s1 = document.getElementById('s1');
  if (n === 2) {
    s1.style.cursor = 'pointer';
    s1.title = 'Quay lại bước 1';
    s1.onclick = () => setStep(1);
  } else {
    s1.style.cursor = '';
    s1.title = '';
    s1.onclick = null;
  }
}

async function goStep2() {
  const name  = document.getElementById('inp-name').value.trim();
  const id    = document.getElementById('inp-id').value.trim();
  const lop   = document.getElementById('inp-lop').value.trim();
  const token = document.getElementById('inp-token').value.trim().toUpperCase();

  // Chỉ kiểm tra những field đang hiển thị (không bị ẩn bởi admin settings)
  const nameRequired  = CONFIG.FIELD_NAME  && document.getElementById('group-name')?.style.display !== 'none';
  const idRequired    = CONFIG.FIELD_ID    && document.getElementById('group-id')?.style.display   !== 'none';
  const lopRequired   = CONFIG.FIELD_LOP   && document.getElementById('group-lop')?.style.display  !== 'none';
  const tokenRequired = CONFIG.FIELD_TOKEN && document.getElementById('group-token')?.style.display !== 'none';

  if ((nameRequired && !name) || (idRequired && !id) || (lopRequired && !lop) || (tokenRequired && !token)) {
    toast('Vui lòng nhập đầy đủ thông tin và mã xác thực', 'error'); return;
  }

  const btn = document.getElementById('btn-verify');
  btn.disabled = true; btn.textContent = 'Đang kiểm tra mã...';
  try {
    const snapshot = await get(child(ref(db), 'session/current_token'));
    if (snapshot.exists() && snapshot.val() === token) {
      STATE.name = name; STATE.memberId = id; STATE.lop = lop;
      saveMemberInfoIfChecked();
      setStep(2);
      // Kiểm tra đã điểm danh chưa – check cả localStorage, Firebase MSSV, và device fingerprint
      const _n = new Date();
      const _dd2 = String(_n.getDate()).padStart(2,'0');
      const _mm2 = String(_n.getMonth()+1).padStart(2,'0');
      const todayVi2 = `${_dd2}/${_mm2}/${_n.getFullYear()}`;
      const _tk2 = `attended_${id}_${_dd2}-${_mm2}-${_n.getFullYear()}`;
      setGeoStatus('checking', 'Đang kiểm tra trạng thái điểm danh...');
      Promise.all([
        checkAlreadyAttended(id, todayVi2),
        checkDeviceAttended(todayVi2),
        checkZaloAttended(STATE.zaloId, todayVi2),
      ]).then(([byId, byDevice, byZalo]) => {
        if (byId || byDevice || byZalo || localStorage.getItem(_tk2)) {
          const btn2 = document.getElementById('geo-next-btn');
          if (btn2) {
            btn2.disabled = true;
            btn2.textContent = '✓ Bạn đã điểm danh hôm nay rồi';
            btn2.style.cssText = 'background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#86efac;cursor:default;';
          }
          setGeoStatus('ok', '');
        } else {
          startGeoWithMap();
        }
      });
    } else {
      toast('Mã điểm danh không đúng hoặc đã hết hạn!', 'error');
    }
  } catch (error) { toast('Lỗi kết nối máy chủ', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Kiểm tra mã'; }
}

function startGeoWithMap() {
  setGeoStatus('checking', 'Đang lấy tọa độ GPS...');
  const distCard = document.getElementById('dist-card');
  if (distCard) distCard.style.display = 'none';
  if (!navigator.geolocation) return setGeoStatus('fail', '⚠️ Trình duyệt không hỗ trợ GPS');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      STATE.geoLat = lat; STATE.geoLng = lng;
      const dist = haversineDistance(lat, lng, STATE.SESSION.lat, STATE.SESSION.lng);
      const inRange = dist <= STATE.SESSION.radius;
      showDistCard(dist, inRange, accuracy);
      if (inRange) {
        setGeoStatus('ok', `Hợp lệ – Độ chính xác GPS: ~${Math.round(accuracy)}m`);
        STATE.geoOk = true; document.getElementById('geo-next-btn').disabled = false;
      } else {
        setGeoStatus('fail', `Ngoài phạm vi – Cách ${Math.round(dist)}m`);
        STATE.geoOk = false; document.getElementById('geo-next-btn').disabled = true;
      }
    },
    (err) => {
      let msg = '⚠️ Lỗi GPS: Hãy cho phép quyền Vị trí trên trình duyệt.';
      if (err.code === 1) msg = '⚠️ Bạn đã từ chối quyền truy cập vị trí.';
      else if (err.code === 3) msg = '⚠️ Hết thời gian lấy GPS. Vui lòng thử lại.';
      setGeoStatus('fail', msg);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function showDistCard(dist, inRange, accuracy) {
  const distCard = document.getElementById('dist-card');
  const distBig  = document.getElementById('dist-big');
  const distSub  = document.getElementById('dist-sub');
  if (!distCard) return;
  distCard.style.display = 'block';
  distBig.textContent = Math.round(dist) + 'm';
  distBig.style.color = inRange ? '#22C55E' : '#FF2A4A';
  distSub.textContent = inRange
    ? `Trong phạm vi cho phép (${STATE.SESSION.radius}m)`
    : `Ngoài phạm vi – Cho phép tối đa ${STATE.SESSION.radius}m`;
  distSub.style.color = inRange ? '#86efac' : '#fca5a5';
  distCard.style.borderColor = inRange ? 'rgba(34,197,94,0.3)' : 'rgba(255,42,74,0.3)';
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

  const reloadBtn = document.createElement('button');
  reloadBtn.innerHTML = 'Tải lại bản đồ';
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
  // Đọc trực tiếp từ input nếu STATE chưa được set (test trước khi qua goStep2)
  const nameVal = STATE.name || document.getElementById('inp-name')?.value.trim() || '';
  const idVal   = STATE.memberId || document.getElementById('inp-id')?.value.trim() || 'test_user';
  const lopVal  = STATE.lop || document.getElementById('inp-lop')?.value.trim() || '';
  if (nameVal) STATE.name = nameVal;
  if (idVal)   STATE.memberId = idVal;
  if (lopVal)  STATE.lop = lopVal;

  STATE.geoOk = true;
  STATE.geoLat = STATE.SESSION.lat;
  STATE.geoLng = STATE.SESSION.lng;

  // Tạo todayKey đúng format padded dd-mm-yyyy
  const now = new Date();
  const dd = String(now.getDate()).padStart(2,'0');
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const todayKey = `attended_${STATE.memberId}_${dd}-${mm}-${now.getFullYear()}`;
  const hadKey = !!localStorage.getItem(todayKey);
  localStorage.removeItem(todayKey);

  setGeoStatus('ok', 'Test mode – Đã bỏ qua kiểm tra vị trí');
  updateMapInfoBox(STATE.SESSION.lat, STATE.SESSION.lng, 0, 5);
  renderLeafletMap(STATE.SESSION.lat, STATE.SESSION.lng, 0);
  const btn = document.getElementById('geo-next-btn');
  if (btn) btn.disabled = false;
  
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const a = Math.sin(toRad(lat2 - lat1)/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1)/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Kiểm tra đã điểm danh chưa trực tiếp trên Firebase (chống bypass localStorage)
async function checkAlreadyAttended(memberId, todayVi) {
  try {
    const snap = await get(ref(db, 'attendance_list'));
    if (!snap.exists()) return false;
    let found = false;
    snap.forEach(child => {
      const r = child.val();
      if (r.id === memberId && normalizeViDate(r.date || '') === normalizeViDate(todayVi)) {
        found = true;
      }
    });
    return found;
  } catch(e) { return false; }
}

async function completeAttendance() {
  const btn = document.getElementById('geo-next-btn');
  btn.disabled = true; btn.textContent = 'Đang kiểm tra...';

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const todayVi = `${dd}/${mm}/${yyyy}`;
  const todayKey = `attended_${STATE.memberId}_${dd}-${mm}-${yyyy}`;

  // Kiểm tra 3 lớp: localStorage + Firebase theo MSSV + Firebase theo device fingerprint
  const [byId, byDevice, byZalo] = await Promise.all([
    checkAlreadyAttended(STATE.memberId, todayVi),
    checkDeviceAttended(todayVi),
    checkZaloAttended(STATE.zaloId, todayVi),
  ]);

  if (localStorage.getItem(todayKey) || byId || byDevice || byZalo) {
    localStorage.setItem(todayKey, '1');
    btn.disabled = true;
    btn.textContent = '✓ Bạn đã điểm danh hôm nay rồi';
    btn.style.background = 'rgba(34,197,94,0.15)';
    btn.style.border = '1px solid rgba(34,197,94,0.4)';
    btn.style.color = '#86efac';
    toast('✅ Bạn đã điểm danh hôm nay rồi!');
    return;
  }

  btn.textContent = 'Đang lưu dữ liệu...';
  btn.style.background = ''; btn.style.border = ''; btn.style.color = '';

  const code = 'DD-' + Math.random().toString(36).substr(2,6).toUpperCase();
  const record = {
    name: STATE.name, id: STATE.memberId, unit: STATE.lop,
    time: now.toLocaleTimeString('vi-VN'),
    date: todayVi,
    lat: STATE.geoLat, lng: STATE.geoLng, code, timestamp: Date.now(),
    zaloId: STATE.zaloId || null,
    zaloName: STATE.zaloName || null,
  };

  push(ref(db, 'attendance_list'), record)
    .then(async () => {
      localStorage.setItem(todayKey, '1');
      await markDeviceAttended(todayVi); // Ghi fingerprint lên Firebase
      await markZaloAttended(STATE.zaloId, todayVi); // Ghi Zalo ID lên Firebase
      document.getElementById('success-name').textContent = STATE.name;
      document.getElementById('suc-time').textContent = record.time;
      document.getElementById('suc-code').textContent = code;
      document.getElementById('suc-unit').textContent = STATE.lop;
      // Hien thi trang thai hop le / chua hop le o buoc 3
      const sucStatusEl = document.getElementById('suc-status');
      if (sucStatusEl) {
        const valid = isNameValid(STATE.name, STATE.zaloName);
        if (valid === false) {
          sucStatusEl.innerHTML = '<span style="color:#FCD34D;font-size:12px;font-weight:700;">⚠ Không chính chủ</span>';
        } else {
          sucStatusEl.innerHTML = '<span class="badge-ok">✓ Hợp lệ</span>';
        }
      }
      setStep(3);
    }).catch(e => {
      toast('Lỗi lưu dữ liệu!', 'error'); btn.disabled = false; btn.textContent = 'Vị trí hợp lệ – Xác nhận điểm danh';
    });
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
async function adminLogin() {
  const pwInput = document.getElementById('admin-pw');
  const enteredPw = pwInput.value;
  if (!enteredPw) { toast('Vui lòng nhập mật khẩu!', 'error'); return; }

  const loginBtn = document.querySelector('#admin-login .btn-primary');
  if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'Đang kiểm tra...'; }

  try {
    // Bước 1: Lấy mật khẩu từ Firebase (config/admin_password)
    const pwSnap = await get(ref(db, 'config/admin_password'));
    if (!pwSnap.exists()) {
      toast('Chưa cấu hình mật khẩu admin trong hệ thống!', 'error');
      return;
    }
    const correctPw = pwSnap.val();

    // Bước 2: So sánh mật khẩu
    if (enteredPw !== correctPw) {
      toast('Sai mật khẩu!', 'error');
      return;
    }

    // Bước 3: Kiểm tra admin_sessions có tồn tại không (node phải tồn tại)
    const sessSnap = await get(ref(db, 'admin_sessions'));
    // sessSnap.exists() sẽ true nếu có ít nhất 1 session — chỉ dùng để watchAdminSessions cảnh báo đa đăng nhập

    // Đăng nhập thành công
    STATE.isAdmin = true;
    sessionStorage.setItem('dangbo_admin_logged_in', '1');
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
    registerAdminSession();
    watchAdminSessions();
    initQR();
    renderAttList();
    updateAdminStats();
    updateExportCount();
    setTimeout(() => {
      initAdminMap();
      loadSavedLocationsDB();
      const r = parseInt(document.getElementById('session-radius').value) || STATE.SESSION.radius;
      setSliderPct(r);
    }, 200);
  } catch(e) {
    toast('Lỗi kết nối máy chủ: ' + e.message, 'error');
  } finally {
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Đăng nhập'; }
  }
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
        toast('Đã xóa địa điểm thành công!');
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
    .then(() => toast('Đã lưu vào danh sách rút gọn!'));
}

function saveSession() {
  const name = document.getElementById('session-name').value;
  const locParts = document.getElementById('session-loc').value.split(',');
  const lat = parseFloat(locParts[0]) || 21.0285;
  const lng = parseFloat(locParts[1]) || 105.8542;
  const radius = parseInt(document.getElementById('session-radius').value) || 300;

  set(ref(db, 'session/info'), { name, lat, lng, radius })
    .then(() => {
      toast('Cấu hình điểm họp đã được phát tới toàn bộ Đảng viên!');
      // Kích hoạt QR thật ngay khi phát địa điểm (nếu chưa active)
      if (!STATE.qrActive) {
        STATE.qrActive = true;
        clearInterval(STATE.qrInterval);
        STATE.qrInterval = null;
        regenerateQR();
        // Bật nút "Cấp mã mới ngay"
        const btnRegen = document.getElementById('btn-regen-qr');
        if (btnRegen) { btnRegen.disabled = false; btnRegen.style.opacity = ''; btnRegen.style.cursor = ''; }
        STATE.qrInterval = setInterval(() => {
          STATE.qrCountdown--;
          const pct = ((CONFIG.QR_REFRESH_SECONDS - STATE.qrCountdown) / CONFIG.QR_REFRESH_SECONDS) * 100;
          const barEl = document.getElementById('qr-bar'); if (barEl) barEl.style.width = pct + '%';
          const txtEl = document.getElementById('qr-timer-txt'); if (txtEl) txtEl.textContent = `Làm mới sau: ${STATE.qrCountdown}s`;
          if (STATE.qrCountdown <= 0) { regenerateQR(); STATE.qrCountdown = CONFIG.QR_REFRESH_SECONDS; }
        }, 1000);
      }
    });
}

function setQRWaitingState() {
  // Hiển thị trạng thái chờ: GIF ngẫu nhiên thay vì ô trắng
  const el = document.getElementById('qrcode');
  if (el) {
    const gifUrl = (typeof window.getRandomWaitingGif === 'function')
      ? window.getRandomWaitingGif()
      : '';
    if (gifUrl) {
      el.innerHTML = `<div style="width:220px;height:220px;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#111;">
        <img src="${gifUrl}" alt="Đang chờ..." style="width:100%;height:100%;object-fit:cover;"
          onerror="this.parentElement.innerHTML='<span style=\\'font-size:56px;opacity:0.25;\\'>🇻🇳</span>'">
      </div>`;
    } else {
      el.innerHTML = '<div style="width:220px;height:220px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);border-radius:8px;border:1px dashed rgba(255,215,0,0.2);"><span style=\'font-size:56px;opacity:0.3;\'>🇻🇳</span></div>';
    }
  }
  const tokenEl = document.getElementById('qr-token-display');
  if (tokenEl) tokenEl.textContent = '------';
  const txtEl = document.getElementById('qr-timer-txt');
  if (txtEl) txtEl.textContent = 'Đang chờ cấp phát';
  const barEl = document.getElementById('qr-bar');
  if (barEl) barEl.style.width = '0%';
  // Ghi token ngẫu nhiên ẩn vào DB (người dùng không thể đọc từ màn hình)
  const hiddenToken = Math.random().toString(36).substr(2, 6).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
  set(ref(db, 'session/current_token'), hiddenToken).catch(e => console.error(e));
}

function initQR() {
  clearInterval(STATE.qrInterval);
  STATE.qrInterval = null;
  // Luôn bắt đầu ở trạng thái chờ; QR thật chỉ khởi động sau khi "Phát địa điểm"
  setQRWaitingState();
  STATE.qrActive = false;
  const btnRegen = document.getElementById('btn-regen-qr');
  if (btnRegen) { btnRegen.disabled = true; btnRegen.style.opacity = '0.4'; btnRegen.style.cursor = 'not-allowed'; }
}

function regenerateQR() {
  const el = document.getElementById('qrcode'); if (!el) return; el.innerHTML = '';
  const token = Math.random().toString(36).substr(2, 6).toUpperCase();
  set(ref(db, 'session/current_token'), token).catch(e => console.error(e));
  document.getElementById('qr-token-display').textContent = token;
  new QRCode(el, { text: `${CONFIG.SITE_URL}?token=${token}`, width: 220, height: 220, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });
  STATE.qrCountdown = CONFIG.QR_REFRESH_SECONDS;
  const barEl = document.getElementById('qr-bar'); if (barEl) barEl.style.width = '0%';
  const txtEl = document.getElementById('qr-timer-txt'); if (txtEl) txtEl.textContent = `Làm mới sau: ${CONFIG.QR_REFRESH_SECONDS}s`;
}


// ─── FIX 5: QR SCANNER (dùng jsQR + camera) ───
let qrScanStream = null;
let qrScanAnimId = null;

window.openQrScanner = openQrScanner;
window.closeQrScanner = closeQrScanner;

function openQrScanner() {
  const overlay = document.getElementById('qr-scanner-overlay');
  const video   = document.getElementById('qr-video');
  const status  = document.getElementById('qr-scanner-status');
  if (!overlay || !video) return;

  // Kiểm tra jsQR đã load chưa
  if (typeof jsQR === 'undefined') {
    toast('Đang tải thư viện quét QR, thử lại sau 1 giây...', 'error');
    return;
  }

  overlay.classList.add('active');
  status.textContent = '';

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      qrScanStream = stream;
      video.srcObject = stream;
      video.play();
      video.addEventListener('loadedmetadata', () => scanFrame(video, status));
    })
    .catch(err => {
      status.textContent = '⚠️ Không truy cập được camera';
      console.error(err);
    });
}

function scanFrame(video, status) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });
      if (code) {
        // Tìm được mã – lấy token từ URL hoặc dùng thẳng
        let token = code.data;
        const urlMatch = token.match(/[?&]token=([A-Z0-9]{4,10})/i);
        if (urlMatch) token = urlMatch[1].toUpperCase();
        else token = token.trim().toUpperCase();

        status.textContent = 'Đã quét: ' + token;
        document.getElementById('inp-token').value = token;
        checkVerifyReady();
        toast('Quét QR thành công: ' + token);

        setTimeout(() => closeQrScanner(), 600);
        return; // dừng vòng lặp
      }
    }
    qrScanAnimId = requestAnimationFrame(tick);
  }
  qrScanAnimId = requestAnimationFrame(tick);
}


// ─── SEED TEST DATA ───
const VIET_NAMES = [
  'Nguyễn Văn An','Trần Thị Bình','Lê Hoàng Cường','Phạm Thị Dung','Hoàng Văn Em',
  'Vũ Thị Fang','Đặng Văn Giang','Bùi Thị Hà','Đỗ Văn Inh','Ngô Thị Khanh',
  'Dương Văn Long','Lý Thị Mai','Trịnh Văn Nam','Đinh Thị Oanh','Phan Văn Phong',
  'Hà Thị Quỳnh','Võ Văn Rồng','Tô Thị Sen','Cao Văn Thắng','Lưu Thị Uyên',
  'Mai Văn Vinh','Kiều Thị Xuân','Chu Văn Yên','Tạ Thị Zung','Trương Văn Bảo',
  'Nguyễn Thị Chi','Phùng Văn Dũng','Lương Thị Ế','Tống Văn Phát','Quách Thị Giao',
  'Hứa Văn Hải','Mạc Thị Hoa','Từ Văn Hùng','Âu Thị Hương','Đoàn Văn Khải',
];
const CLASSES = ['70IT1','70IT2','70IT3','71XD1','71XD2','70KT1','70KT2','71MT1','70TK1','71HH2'];

window.seedTestData = async function(count = 30) {
  const btn = document.getElementById('btn-seed');
  if (btn) { btn.disabled = true; btn.textContent = `⏳ Đang thêm 0/${count}...`; }

  const now = new Date();
  const dd = String(now.getDate()).padStart(2,'0');
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const yyyy = now.getFullYear();
  const todayDate = `${dd}/${mm}/${yyyy}`;

  // Phân tán thời gian điểm danh trong 2 giờ vừa qua
  const promises = [];
  for (let i = 0; i < count; i++) {
    const name = VIET_NAMES[i % VIET_NAMES.length] + (i >= VIET_NAMES.length ? ` ${Math.floor(i/VIET_NAMES.length)+1}` : '');
    const mssv = `019${String(1000 + i).slice(1)}${Math.floor(Math.random()*9)+1}`;
    const lop  = CLASSES[i % CLASSES.length];
    const minsAgo = Math.floor(Math.random() * 120);
    const t = new Date(now - minsAgo * 60000);
    const hh = String(t.getHours()).padStart(2,'0');
    const mi = String(t.getMinutes()).padStart(2,'0');
    const ss = String(t.getSeconds()).padStart(2,'0');
    const code = 'DD-' + Math.random().toString(36).substr(2,6).toUpperCase();
    // Tọa độ ngẫu nhiên gần điểm họp ±100m
    const lat = STATE.SESSION.lat + (Math.random()-0.5)*0.002;
    const lng = STATE.SESSION.lng + (Math.random()-0.5)*0.002;
    const record = { name, id: mssv, unit: lop, time: `${hh}:${mi}:${ss}`, date: todayDate, lat, lng, code, timestamp: t.getTime() };
    promises.push(push(ref(db, 'attendance_list'), record));
    if (btn && i % 5 === 4) { btn.textContent = `⏳ Đang thêm ${i+1}/${count}...`; await new Promise(r=>setTimeout(r,0)); }
  }

  try {
    await Promise.all(promises);
    toast(`Đã thêm ${count} đảng viên test!`);
    if (btn) { btn.disabled = false; btn.textContent = `➕ Thêm ${count} đảng viên test`; }
  } catch(e) {
    toast('Lỗi seed data: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = `➕ Thêm ${count} đảng viên test`; }
  }
};

window.clearTestData = async function() {
  const filterDate = document.getElementById('export-date-filter')?.value;
  const btn = document.getElementById('btn-clear-seed');

  if (!filterDate) {
    toast('Vui lòng chọn ngày cần xóa trước!', 'error');
    return;
  }

  const [y, m, d] = filterDate.split('-');
  const viDate = `${d}/${m}/${y}`;
  const toDelete = STATE.attendanceList.filter(r => normalizeViDate(r.date||'') === normalizeViDate(viDate));

  if (!toDelete.length) {
    toast(`Không có dữ liệu ngày ${viDate} để xóa`, 'error');
    return;
  }

  if (!confirm(`Xóa ${toDelete.length} bản ghi ngày ${viDate}? Không thể hoàn tác!`)) return;

  if (btn) { btn.disabled = true; btn.textContent = `⏳ Đang xóa ${toDelete.length} bản ghi...`; }
  try {
    await Promise.all(toDelete.map(r => remove(ref(db, 'attendance_list/' + r._key))));
    toast(`🗑 Đã xóa ${toDelete.length} bản ghi ngày ${viDate}!`);
  } catch(e) {
    toast('Lỗi xóa: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🗑 Xóa ngày này'; }
  }
};

// Export seed functions
window.seedTestData = window.seedTestData;
window.clearTestData = window.clearTestData;

function closeQrScanner() {
  if (qrScanAnimId) { cancelAnimationFrame(qrScanAnimId); qrScanAnimId = null; }
  if (qrScanStream) { qrScanStream.getTracks().forEach(t => t.stop()); qrScanStream = null; }
  const overlay = document.getElementById('qr-scanner-overlay');
  if (overlay) overlay.classList.remove('active');
  const video = document.getElementById('qr-video');
  if (video) { video.srcObject = null; }
}