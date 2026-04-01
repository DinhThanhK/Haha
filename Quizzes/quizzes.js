import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push, remove, update, get } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyARyxrxmbNLaxSdDP14S5YQES5AJnLj-XU",
  authDomain: "mylife-ddd6a.firebaseapp.com",
  databaseURL: "https://mylife-ddd6a-default-rtdb.firebaseio.com",
  projectId: "mylife-ddd6a",
  storageBucket: "mylife-ddd6a.firebasestorage.app",
  messagingSenderId: "969759088030",
  appId: "1:969759088030:web:69155b992b0cea296e4a8f",
  measurementId: "G-V80ERR7KWQ"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ===== STATE =====
let quizzesCache = {};
let currentEditId = null;
let editQuestions = [];
let quizQuestions = []; // shuffled for current session
let currentQuizMeta = null;
let currentQIndex = 0;
let answers = {}; // {qIndex: {selected:[], correct:bool}}
let questionReactions = {}; // {qIndex: 'like'|'dislike'|null}
let timerInterval = null;
let timeLeft = 0;
let sidebarVisible = true;
let inlineEditQIndex = null;
let isReviewMode = false;
let _navigatingFromEdit = false;

// ===== USER MANAGEMENT (Firebase-backed) =====
let _usersCache = null;
let _currentUserCache = undefined;

function getUsers() {
  if(_usersCache) return _usersCache;
  // Fallback to localStorage until Firebase loads
  const saved = JSON.parse(localStorage.getItem('qm_users') || 'null');
  return saved || [{id:'user_noc',name:'Nóc'},{id:'user_chit',name:'Chịt'}];
}
async function saveUsers(users) {
  _usersCache = users;
  localStorage.setItem('qm_users', JSON.stringify(users)); // keep local as fallback
  try { await set(ref(db, 'app_data/users'), users); } catch(e) { console.warn('saveUsers FB err', e); }
}
function getCurrentUser() {
  if(_currentUserCache !== undefined) return _currentUserCache;
  return localStorage.getItem('qm_current_user') || null;
}
function setCurrentUser(id) {
  _currentUserCache = id;
  localStorage.setItem('qm_current_user', id);
  try { set(ref(db, 'app_data/current_user'), id || ''); } catch(e) {}
}

function subscribeUsers() {
  onValue(ref(db, 'app_data/users'), snap => {
    const val = snap.val();
    if(val && Array.isArray(val) && val.length > 0) {
      _usersCache = val;
      localStorage.setItem('qm_users', JSON.stringify(val));
    } else if(!_usersCache) {
      // First time: migrate from localStorage to Firebase
      const local = JSON.parse(localStorage.getItem('qm_users') || 'null');
      const defaults = [{id:'user_noc',name:'Nóc'},{id:'user_chit',name:'Chịt'}];
      _usersCache = local || defaults;
      set(ref(db, 'app_data/users'), _usersCache).catch(()=>{});
    }
    // Refresh UI that depends on users
    const cur = getCurrentUser();
    const curUser = (_usersCache||[]).find(u=>u.id===cur);
    const badge = document.getElementById('user-badge-name');
    if(badge) badge.textContent = curUser ? curUser.name : 'Tất cả';
    renderUsersSettings();
    renderUserAssignChips([]);
    updateHomeStats();
  });
}

function renderUserDropdown() {
  const dropdown = document.getElementById('user-dropdown');
  const users = getUsers();
  const cur = getCurrentUser();
  dropdown.innerHTML = users.map(u => `
    <div class="user-dropdown-item${u.id===cur?' active':''}" data-uid="${u.id}" onclick="selectUser('${u.id}',event)">
      <i class="fas fa-${u.id===cur?'check-circle':'user'}"></i> ${escHtml(u.name)}
    </div>`).join('') + `<div class="user-dropdown-divider"></div>
    <div class="user-dropdown-item${!cur?' active':''}" data-uid="" onclick="selectUser(null,event)">
      <i class="fas fa-${!cur?'check-circle':'users'}"></i> Tất cả
    </div>`;
}

window.toggleUserDropdown = function(e) {
  if(e) e.stopPropagation();
  const dd = document.getElementById('user-dropdown');
  const isOpen = dd.classList.contains('open');
  if(!isOpen) renderUserDropdown(); // only re-render when opening
  dd.classList.toggle('open', !isOpen);
};
window.selectUser = function(id, e) {
  if(e) e.stopPropagation();
  setCurrentUser(id);
  const users = getUsers();
  const u = users.find(u=>u.id===id);
  // Instantly update badge text
  document.getElementById('user-badge-name').textContent = u ? u.name : 'Tất cả';
  // Instantly update dropdown active states (no flicker)
  document.querySelectorAll('#user-dropdown .user-dropdown-item').forEach(el => {
    const uid = el.dataset.uid;
    const isActive = (id === null ? uid === '' : uid === id);
    el.classList.toggle('active', isActive);
    const icon = el.querySelector('i');
    if(icon) {
      if(isActive) icon.className = 'fas fa-check-circle';
      else icon.className = uid === '' ? 'fas fa-users' : 'fas fa-user';
    }
  });
  // Close dropdown
  document.getElementById('user-dropdown').classList.remove('open');
  // Update grid and stats
  renderQuizGrid();
  updateHomeStats();
};

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  const badge = document.getElementById('user-badge');
  if(badge && !badge.contains(e.target)) document.getElementById('user-dropdown').classList.remove('open');
});

function renderUserAssignChips(selectedUsers) {
  const wrap = document.getElementById('quiz-user-assign');
  if(!wrap) return;
  const users = getUsers();
  wrap.innerHTML = users.map(u => `
    <div class="user-assign-chip${(selectedUsers||[]).includes(u.id)?' selected':''}" onclick="toggleUserAssign('${u.id}',this)">
      <i class="fas fa-user" style="font-size:.7rem"></i> ${escHtml(u.name)}
    </div>`).join('') + `<div class="user-assign-chip${(!selectedUsers||selectedUsers.length===0)?' selected':''}" onclick="clearUserAssign()" style="font-style:italic">Tất cả</div>`;
}

window.toggleUserAssign = function(uid, el) {
  const chips = document.querySelectorAll('#quiz-user-assign .user-assign-chip');
  // Remove "all" selection
  chips[chips.length-1].classList.remove('selected');
  el.classList.toggle('selected');
};
window.clearUserAssign = function() {
  document.querySelectorAll('#quiz-user-assign .user-assign-chip').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('#quiz-user-assign .user-assign-chip:last-child')[0]?.classList.add('selected');
};

function getSelectedUserAssign() {
  const selected = [];
  document.querySelectorAll('#quiz-user-assign .user-assign-chip:not(:last-child)').forEach(c => {
    if(c.classList.contains('selected')) {
      // extract user id from onclick
      const m = c.getAttribute('onclick')?.match(/'([^']+)'/);
      if(m) selected.push(m[1]);
    }
  });
  return selected; // empty = all users
}

// ===== USER-AWARE SETTINGS PAGE =====
function renderUsersSettings() {
  const section = document.getElementById('users-settings-section');
  if(!section) return;
  const users = getUsers();
  section.innerHTML = users.map((u,i) => `
    <div class="toggle-row" id="user-row-${i}">
      <input type="text" class="form-input" style="flex:1;max-width:200px" value="${escHtml(u.name)}" oninput="renameUser(${i},this.value)">
      ${users.length>1?`<button class="reset-sessions-btn" style="margin-left:8px" onclick="deleteUser(${i})"><i class="fas fa-trash"></i> Xóa</button>`:''}
    </div>`).join('') + `
    <button class="add-answer-btn" style="margin-top:10px" onclick="addUser()"><i class="fas fa-plus"></i> Thêm user</button>`;
}
window.renameUser = async function(i, name) {
  const users = getUsers(); users[i].name = name; await saveUsers(users);
  renderUserDropdown(); renderUsersSettings();
  const cur = getCurrentUser();
  const u = users.find(u=>u.id===cur);
  if(u) document.getElementById('user-badge-name').textContent = u.name;
};
window.deleteUser = async function(i) {
  const users = getUsers();
  const removedId = users[i]?.id;
  users.splice(i,1); await saveUsers(users);
  if(getCurrentUser() === removedId) setCurrentUser(null);
  renderUsersSettings(); renderUserDropdown(); renderQuizGrid();
};
window.addUser = async function() {
  const users = getUsers();
  const id = 'user_' + Date.now();
  users.push({id, name:'User mới'});
  await saveUsers(users); renderUsersSettings(); renderUserDropdown();
};

// ===== SOUND ENGINE (Web Audio API) =====
let _audioCtx = null;
function getAudioCtx() {
  if(!_audioCtx) _audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  return _audioCtx;
}
function playTone(type) {
  const settings = getSoundSettings();
  if(type==='correct' && !settings.correctEnabled) return;
  if(type==='wrong' && !settings.wrongEnabled) return;
  const vol = type==='correct' ? settings.correctVol : settings.wrongVol;
  try {
    const ctx = getAudioCtx();
    if(ctx.state==='suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if(type==='correct') {
      // Happy ascending arpeggio
      osc.type = 'sine';
      gain.gain.setValueAtTime(vol*0.4, ctx.currentTime);
      osc.frequency.setValueAtTime(523, ctx.currentTime);      // C5
      osc.frequency.setValueAtTime(659, ctx.currentTime+0.1);  // E5
      osc.frequency.setValueAtTime(784, ctx.currentTime+0.2);  // G5
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime+0.5);
    } else {
      // Sad descending
      osc.type = 'triangle';
      gain.gain.setValueAtTime(vol*0.3, ctx.currentTime);
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(200, ctx.currentTime+0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime+0.35);
    }
  } catch(e) { console.warn('Audio error', e); }
}
function getSoundSettings() {
  const s = JSON.parse(localStorage.getItem('qm_sound')||'{}');
  return {
    correctEnabled: s.correctEnabled!==false,
    wrongEnabled: s.wrongEnabled!==false,
    correctVol: s.correctVol!==undefined ? s.correctVol : 0.7,
    wrongVol: s.wrongVol!==undefined ? s.wrongVol : 0.7,
  };
}
window.saveSoundSettings = function() {
  const s = {
    correctEnabled: document.getElementById('sound-correct-enabled')?.checked!==false,
    wrongEnabled: document.getElementById('sound-wrong-enabled')?.checked!==false,
    correctVol: parseFloat(document.getElementById('sound-correct-vol')?.value||0.7),
    wrongVol: parseFloat(document.getElementById('sound-wrong-vol')?.value||0.7),
  };
  localStorage.setItem('qm_sound', JSON.stringify(s));
};
window.previewSound = function(type) { playTone(type); };
function loadSoundSettings() {
  const s = getSoundSettings();
  const ce = document.getElementById('sound-correct-enabled');
  const we = document.getElementById('sound-wrong-enabled');
  const cv = document.getElementById('sound-correct-vol');
  const wv = document.getElementById('sound-wrong-vol');
  if(ce) ce.checked = s.correctEnabled;
  if(we) we.checked = s.wrongEnabled;
  if(cv) cv.value = s.correctVol;
  if(wv) wv.value = s.wrongVol;
}

// ===== SAMPLE IMAGES =====
const SAMPLE_IMGS = [
  {emoji:'📚',bg:'linear-gradient(135deg,#1a2a6c,#b21f1f)'},
  {emoji:'🧮',bg:'linear-gradient(135deg,#134e5e,#71b280)'},
  {emoji:'🌍',bg:'linear-gradient(135deg,#00416a,#e4e5e6)'},
  {emoji:'⚗️',bg:'linear-gradient(135deg,#5f2c82,#49a09d)'},
  {emoji:'🎵',bg:'linear-gradient(135deg,#f093fb,#f5576c)'},
  {emoji:'💻',bg:'linear-gradient(135deg,#4776e6,#8e54e9)'},
  {emoji:'📖',bg:'linear-gradient(135deg,#f7971e,#ffd200)'},
  {emoji:'🏆',bg:'linear-gradient(135deg,#e96c2c,#ffce00)'},
];
let selectedSampleImg = null;

// ===== COLOR SETTINGS =====
const COLOR_SETTINGS = [
  {key:'--q-bg', label:'Nền câu hỏi', default:'#1e2332'},
  {key:'--q-text', label:'Chữ câu hỏi', default:'#e8eaf2'},
  {key:'--ans-bg', label:'Nền đáp án', default:'#252a3a'},
  {key:'--ans-border', label:'Viền đáp án', default:'#3a4060'},
  {key:'--ans-hover', label:'Đáp án hover', default:'#2e3550'},
  {key:'--ans-correct-bg', label:'Nền đáp án đúng', default:'rgba(0,212,170,0.15)'},
  {key:'--ans-correct-border', label:'Viền đáp án đúng', default:'#00d4aa'},
  {key:'--ans-wrong-bg', label:'Nền đáp án sai', default:'rgba(255,107,107,0.15)'},
  {key:'--ans-wrong-border', label:'Viền đáp án sai', default:'#ff6b6b'},
  {key:'--praise-correct', label:'Màu khen đúng', default:'#00d4aa'},
  {key:'--praise-wrong', label:'Màu báo sai', default:'#ff6b6b'},
  {key:'--nav-bg', label:'Nền điều hướng', default:'#13161e'},
  {key:'--timer-color', label:'Màu đồng hồ', default:'#6c63ff'},
  {key:'--accent', label:'Màu chủ đạo', default:'#6c63ff'},
  {key:'--accent2', label:'Màu phụ', default:'#00d4aa'},
];

// ===== INIT =====
function init() {
  loadSettings();
  loadSoundSettings();
  renderSampleImages();
  renderColorSettings();
  renderUsersSettings();
  // Init user badge
  const users = getUsers();
  const cur = getCurrentUser();
  const curUser = users.find(u=>u.id===cur);
  document.getElementById('user-badge-name').textContent = curUser ? curUser.name : 'Tất cả';
  document.getElementById('user-badge').addEventListener('click', function(e) { toggleUserDropdown(e); });
  subscribeQuizzes();
  subscribeUsers();
  subscribeSessions();
  subscribeQuizOrder();
  subscribeLastPlayed();
  // keyboard arrow navigation
  document.addEventListener('keydown', e => {
    if(document.getElementById('page-quiz').classList.contains('active')) {
      if(e.key==='ArrowLeft') { e.preventDefault(); prevQuestion(); }
      if(e.key==='ArrowRight') { e.preventDefault(); nextOrSubmit(); }
    }
  });
  // Ẩn loading screen sau khi Firebase trả data lần đầu (max 3s fallback)
  window._hideLoadingScreen = function() {
    const ls = document.getElementById('loading-screen');
    if(!ls || ls._hidden) return;
    ls._hidden = true;
    ls.style.opacity = '0';
    setTimeout(() => { ls.style.display = 'none'; }, 500);
  };
  // Fallback: nếu sau 3s vẫn chưa có data thì cũng ẩn
  setTimeout(() => window._hideLoadingScreen(), 3000);
}

window.updateExplImgPreview = function(input, imgId) {
  const img = document.getElementById(imgId);
  if(!img) return;
  const url = input.value.trim();
  if(url) { img.src = url; img.style.display='block'; }
  else img.style.display='none';
};

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem('qm_settings') || '{}');
  COLOR_SETTINGS.forEach(({key, default:def}) => {
    const val = saved[key] || def;
    document.documentElement.style.setProperty(key, val);
  });
}

function saveSettings() {
  const saved = {};
  COLOR_SETTINGS.forEach(({key}) => {
    saved[key] = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  });
  localStorage.setItem('qm_settings', JSON.stringify(saved));
}

window.resetSettings = function() {
  localStorage.removeItem('qm_settings');
  localStorage.removeItem('qm_sound');
  loadSettings();
  loadSoundSettings();
  renderColorSettings();
  showToast('Đã đặt lại tất cả về mặc định', 'success');
};

// ===== FIREBASE SUBSCRIPTION (single listener, cached) =====
// Flag to suppress Firebase bounce-back after self-writes
let _suppressQuizzesUpdate = false;

function subscribeQuizzes() {
  const r = ref(db, 'quizzes');
  onValue(r, snap => {
    if(_suppressQuizzesUpdate) return; // skip our own write echo
    quizzesCache = snap.val() || {};
    renderQuizGrid();
    updateHomeStats();
    // Ẩn loading screen sau khi data đầu tiên từ Firebase về
    if(window._hideLoadingScreen) window._hideLoadingScreen();
  }, err => {
    showToast('Lỗi kết nối Firebase: ' + err.message, 'error');
    if(window._hideLoadingScreen) window._hideLoadingScreen();
  });
}

function updateHomeStats() {
  const cur = getCurrentUser();
  const users = getUsers();
  const curUser = users.find(u => u.id === cur);
  // Update h1
  const h1 = document.getElementById('home-h1');
  if(h1) {
    if(curUser) h1.innerHTML = `Bộ <span>Trắc Nghiệm</span> của <span style="color:var(--accent2)">${escHtml(curUser.name)}</span>`;
    else h1.innerHTML = `Bộ <span>Trắc Nghiệm</span> của bạn`;
  }
  // Count only visible quizzes for this user
  const allIds = Object.keys(quizzesCache);
  const visibleIds = allIds.filter(id => {
    const q = quizzesCache[id];
    const allowed = q.settings?.allowedUsers;
    if(!cur) return true;
    if(!allowed || allowed.length===0) return true;
    return allowed.includes(cur);
  });
  let totalQ = 0;
  visibleIds.forEach(id => { totalQ += (quizzesCache[id].questions||[]).length; });
  document.getElementById('total-sets').textContent = visibleIds.length;
  document.getElementById('total-questions').textContent = totalQ;
}

// ===== PAGES =====
window.showPage = function(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  const nb = document.getElementById('nav-'+name);
  if(nb) nb.classList.add('active');
  if(name === 'add' && !_navigatingFromEdit) resetForm();
  if(name === 'add') setTimeout(initBulkPreview, 50);
  if(name === 'home') { renderQuizGrid(); updateHomeStats(); }
  if(name === 'settings') { renderColorSettings(); renderUsersSettings(); }
  if(name === 'links') { initLinksListener(); renderLinksGrid(); }
  _navigatingFromEdit = false;
  window.scrollTo(0,0);
};

// ===== QUIZ GRID =====
window.filterQuizzes = function() {
  const q = document.getElementById('search-input').value.toLowerCase();
  document.querySelectorAll('.quiz-card').forEach(card => {
    const title = card.dataset.title || '';
    card.style.display = title.toLowerCase().includes(q) ? '' : 'none';
  });
};

let _renderGridTimer = null;
function renderQuizGrid() {
  clearTimeout(_renderGridTimer);
  _renderGridTimer = setTimeout(_doRenderQuizGrid, 60);
}

function _doRenderQuizGrid() {
  const grid = document.getElementById('quiz-grid');
  const empty = document.getElementById('empty-state');
  const cur = getCurrentUser();
  // Get ordered IDs
  const ordered = getQuizOrder();
  // Filter by user
  const ids = ordered.filter(id => {
    const q = quizzesCache[id];
    if(!q) return false;
    const allowed = q.settings?.allowedUsers;
    if(!cur) return true;
    if(!allowed || allowed.length===0) return true;
    return allowed.includes(cur);
  });
  // Remove old cards, keep empty state
  grid.querySelectorAll('.quiz-card').forEach(c => c.remove());
  if(ids.length === 0) { empty.style.display=''; return; }
  empty.style.display = 'none';
  ids.forEach((id, i) => {
    const q = quizzesCache[id];
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.dataset.title = q.name||'';
    card.style.animationDelay = (i*0.05)+'s';
    const imgHtml = q.imageUrl
      ? `<img class="quiz-card-img" src="${q.imageUrl}" onerror="this.style.display='none'" loading="lazy">`
      : (q.sampleEmoji ? `<div class="quiz-card-img-placeholder" style="background:${q.sampleBg||'var(--bg3)'}">${q.sampleEmoji}</div>` : `<div class="quiz-card-img-placeholder" style="background:var(--bg3)">📝</div>`);
    // NEW badge: controlled by author + clears after user plays
    const lastPlayed = getLastPlayedTime(id);
    const updatedAt = q.updatedAt || q.createdAt || 0;
    const authorWantsNew = q.settings?.showNewBadge === true;
    const isNew = authorWantsNew && (!lastPlayed || lastPlayed < updatedAt);
    const newBadge = isNew ? `<div class="new-badge"><i class="fas fa-star" style="font-size:.55rem;margin-right:2px"></i>Mới</div>` : '';
    const target = q.settings?.targetSessions||1;
    const done = getSessionCount(id);
    const pct = Math.min(100, Math.round(done/target*100));
    const progressHtml = target > 1 || done > 0 ? `
      <div class="quiz-card-progress">
        <div class="quiz-card-progress-label">
          <span><i class="fas fa-history"></i> Đã làm: ${done}/${target} lượt</span>
          <span>${pct}%</span>
        </div>
        <div class="quiz-card-progress-bar">
          <div class="quiz-card-progress-fill ${pct>=100?'complete':''}" style="width:${pct}%"></div>
        </div>
      </div>` : '';
    card.innerHTML = `
      ${imgHtml}
      ${newBadge}
      <div class="sort-handle"><i class="fas fa-grip-vertical"></i></div>
      <div class="quiz-card-body">
        <div class="quiz-card-title">${escHtml(q.name||'Không tên')}</div>
        <div class="quiz-card-meta">
          <span class="quiz-card-tag"><i class="fas fa-question-circle"></i>${(q.questions||[]).filter(qq=>!qq.hidden).length} câu</span>
          <span class="quiz-card-tag"><i class="fas fa-clock"></i>${q.settings?.timeLimit||30} phút</span>
          ${q.settings?.shuffleQ ? '<span class="quiz-card-tag"><i class="fas fa-random"></i>Đảo câu</span>':''}
        </div>
        ${progressHtml}
      </div>
      <div class="quiz-card-actions">
        <button class="icon-btn icon-btn-history" onclick="showQuizHistory('${id}',event)" title="Lịch sử làm bài"><i class="fas fa-eye"></i></button>
        <button class="icon-btn icon-btn-edit" onclick="editQuiz('${id}',event)" title="Chỉnh sửa"><i class="fas fa-edit"></i></button>
        <button class="icon-btn icon-btn-delete" onclick="confirmDeleteQuiz('${id}',event)" title="Xóa"><i class="fas fa-trash"></i></button>
      </div>
    `;
    card.addEventListener('click', e => { if(!_sortMode) startQuiz(id); });
    attachDragSort(card, id);
    grid.appendChild(card);
  });
  // Re-apply sort mode class if active
  if(_sortMode) grid.classList.add('sort-mode');
}

// ===== FORM - Add/Edit =====
function resetForm() {
  currentEditId = null;
  editQuestions = [];
  document.getElementById('form-title').textContent = 'Thêm bộ trắc nghiệm';
  document.getElementById('quiz-name').value = '';
  document.getElementById('quiz-image-url').value = '';
  document.getElementById('quiz-img-preview').style.display='none';
  document.getElementById('quiz-time').value = 30;
  document.getElementById('shuffle-questions').checked = true;
  document.getElementById('shuffle-answers').checked = true;
  document.getElementById('quiz-target-sessions').value = 1;
  document.getElementById('sessions-done-row').style.display = 'none';
  const dtSel = document.getElementById('quiz-default-type');
  if(dtSel) dtSel.value = 'single';
  const nbToggle = document.getElementById('quiz-show-new-badge');
  if(nbToggle) nbToggle.checked = false;
  selectedSampleImg = null;
  document.querySelectorAll('.sample-img-btn').forEach(b => b.classList.remove('selected'));
  // Always reset save button state in case it was left spinning
  const saveBtn = document.getElementById('save-btn');
  if(saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Lưu bộ đề'; }
  renderUserAssignChips([]);
  renderQuestions();
}

window.previewImage = function() {
  const url = document.getElementById('quiz-image-url').value.trim();
  const img = document.getElementById('quiz-img-preview');
  if(url){ img.src=url; img.style.display='block'; selectedSampleImg=null; document.querySelectorAll('.sample-img-btn').forEach(b=>b.classList.remove('selected')); }
  else img.style.display='none';
};

function renderSampleImages() {
  const container = document.getElementById('sample-images');
  SAMPLE_IMGS.forEach((s,i) => {
    const btn = document.createElement('button');
    btn.className = 'sample-img-btn';
    btn.type = 'button';
    btn.style.background = s.bg;
    btn.textContent = s.emoji;
    btn.onclick = () => {
      selectedSampleImg = i;
      document.querySelectorAll('.sample-img-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('quiz-image-url').value = '';
      document.getElementById('quiz-img-preview').style.display='none';
    };
    container.appendChild(btn);
  });
}

window.editQuiz = function(id, e) {
  if(e) e.stopPropagation();
  const q = quizzesCache[id];
  if(!q) return;
  currentEditId = id;
  editQuestions = JSON.parse(JSON.stringify(q.questions||[]));
  // FIX: Always reset save button state when opening edit form
  const btn = document.getElementById('save-btn');
  if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Lưu bộ đề'; }
  document.getElementById('form-title').textContent = 'Chỉnh sửa bộ trắc nghiệm';
  document.getElementById('quiz-name').value = q.name||'';
  document.getElementById('quiz-image-url').value = q.imageUrl||'';
  document.getElementById('quiz-time').value = q.settings?.timeLimit||30;
  document.getElementById('shuffle-questions').checked = q.settings?.shuffleQ!==false;
  document.getElementById('shuffle-answers').checked = q.settings?.shuffleA!==false;
  document.getElementById('quiz-target-sessions').value = q.settings?.targetSessions||1;
  // Default type
  const dtSel = document.getElementById('quiz-default-type');
  if(dtSel) dtSel.value = q.settings?.defaultType||'single';
  // New badge toggle
  const nbToggle = document.getElementById('quiz-show-new-badge');
  if(nbToggle) nbToggle.checked = q.settings?.showNewBadge||false;
  // Sessions done
  const doneCount = getSessionCount(id);
  document.getElementById('sessions-done-val').textContent = doneCount;
  document.getElementById('sessions-done-row').style.display = '';
  // User assign
  renderUserAssignChips(q.settings?.allowedUsers||[]);
  if(q.imageUrl){ document.getElementById('quiz-img-preview').src=q.imageUrl; document.getElementById('quiz-img-preview').style.display='block'; }
  else document.getElementById('quiz-img-preview').style.display='none';
  if(q.sampleImg!==undefined) {
    selectedSampleImg = q.sampleImg;
    document.querySelectorAll('.sample-img-btn').forEach((b,i)=>{ if(i===q.sampleImg) b.classList.add('selected'); else b.classList.remove('selected'); });
  }
  renderQuestions();
  _navigatingFromEdit = true;
  showPage('add');
};

window.confirmDeleteQuiz = function(id, e) {
  if(e) e.stopPropagation();
  const q = quizzesCache[id];
  openPwdModal(
    'Xóa bộ đề',
    `Xóa "${q?.name||'bộ đề này'}" và toàn bộ lịch sử? Không thể hoàn tác.`,
    () => { deleteQuiz(id); }
  );
};

async function deleteQuiz(id) {
  try {
    // Optimistic: remove from cache immediately and re-render
    delete quizzesCache[id];
    _suppressQuizzesUpdate = true;
    renderQuizGrid();
    updateHomeStats();
    await remove(ref(db, 'quizzes/'+id));
    // Also delete history
    try { await remove(ref(db, 'app_data/history/'+id)); } catch(e2) {}
    // Also clean localStorage history fallback
    const data = JSON.parse(localStorage.getItem('qm_history')||'{}');
    delete data[id];
    localStorage.setItem('qm_history', JSON.stringify(data));
    showToast('Đã xóa bộ đề và lịch sử', 'success');
    setTimeout(() => { _suppressQuizzesUpdate = false; }, 2000);
  } catch(e) {
    _suppressQuizzesUpdate = false;
    showToast('Lỗi: '+e.message,'error');
  }
}

window.closeModal = function() { document.getElementById('confirm-modal').classList.remove('visible'); };

// ===== PASSWORD MODAL =====
let _pwdCallback = null;

function openPwdModal(title, desc, onConfirm) {
  _pwdCallback = onConfirm;
  document.getElementById('pwd-modal-title').textContent = title;
  document.getElementById('pwd-modal-desc').textContent = desc;
  document.getElementById('pwd-input').value = '';
  document.getElementById('pwd-error').textContent = '';
  document.getElementById('pwd-input').classList.remove('error');
  document.getElementById('pwd-modal').classList.add('visible');
  setTimeout(() => document.getElementById('pwd-input').focus(), 100);
}

window.closePwdModal = function() {
  document.getElementById('pwd-modal').classList.remove('visible');
  _pwdCallback = null;
};

window.confirmPwd = function() {
  const val = document.getElementById('pwd-input').value;
  if(val === '321') {
    const cb = _pwdCallback;   // save ref BEFORE closePwdModal nulls it
    closePwdModal();
    if(cb) cb();
  } else {
    const inp = document.getElementById('pwd-input');
    const err = document.getElementById('pwd-error');
    inp.classList.add('error');
    err.textContent = 'Mật khẩu không đúng.';
    inp.value = '';
    setTimeout(() => inp.classList.remove('error'), 400);
    setTimeout(() => inp.focus(), 50);
  }
};

// ===== CLEAR HISTORY =====
let _currentHistoryQuizId = null;

window.promptClearHistory = function() {
  if(!_currentHistoryQuizId) return;
  const quiz = quizzesCache[_currentHistoryQuizId];
  openPwdModal(
    'Xóa lịch sử',
    `Xóa toàn bộ lịch sử của "${quiz?.name||'bộ đề này'}"? Không thể hoàn tác.`,
    async () => {
      await clearQuizHistory(_currentHistoryQuizId);
    }
  );
};

async function clearQuizHistory(quizId) {
  try {
    await remove(ref(db, 'app_data/history/'+quizId));
  } catch(e) {}
  const data = JSON.parse(localStorage.getItem('qm_history')||'{}');
  delete data[quizId];
  localStorage.setItem('qm_history', JSON.stringify(data));
  showToast('Đã xóa lịch sử', 'success');
  document.getElementById('history-modal-entries').innerHTML =
    '<div class="history-empty"><i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:8px"></i>Chưa có lần làm nào được ghi lại</div>';
}

window.promptDeleteHistoryEntry = function(quizId, entryKey) {
  openPwdModal(
    'Xóa lần làm này',
    'Nhập mật khẩu để xóa lần làm này.',
    async () => {
      try { await remove(ref(db, `app_data/history/${quizId}/${entryKey}`)); } catch(e2) {}
      // Remove from DOM immediately
      document.getElementById('hentry-'+entryKey)?.remove();
      if(!document.querySelector('#history-modal-entries .history-entry')) {
        document.getElementById('history-modal-entries').innerHTML =
          '<div class="history-empty"><i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:8px"></i>Chưa có lần làm nào được ghi lại</div>';
      }
      showToast('Đã xóa', 'success');
    }
  );
};

// ===== QUESTION EDITOR =====
// ===== BULK IMPORT =====
let _bulkOpen = false;

window.toggleBulkImport = function() {
  _bulkOpen = !_bulkOpen;
  const body = document.getElementById('bulk-import-body');
  const chevron = document.getElementById('bulk-chevron');
  if(body) body.classList.toggle('open', _bulkOpen);
  if(chevron) chevron.style.transform = _bulkOpen ? 'rotate(180deg)' : '';
};

window.clearBulkImport = function() {
  const ta = document.getElementById('bulk-import-ta');
  if(ta) ta.value = '';
  document.getElementById('bulk-preview-count').textContent = '';
  document.getElementById('bulk-import-error').textContent = '';
};

/** Parse toàn bộ raw text → mảng question objects */
function parseBulkText(raw) {
  if(!raw || !raw.trim()) return [];

  // Tách các câu hỏi: ưu tiên dấu --- (1 hoặc nhiều dòng ---) trước,
  // sau đó fallback: tách theo "Câu N:" ở đầu dòng
  let chunks = [];

  // Thử tách bằng --- (dấu phân cách rõ ràng)
  const byDash = raw.split(/\n\s*---+\s*\n/);
  if(byDash.length > 1) {
    chunks = byDash;
  } else {
    // Fallback: tách theo "Câu N:" hoặc "câu N:" ở đầu dòng
    // Giữ label "Câu N:" ở đầu mỗi chunk
    const parts = raw.split(/(?=^\s*[Cc][aâ][uù]\s*\d+\s*[:.)?\-])/m);
    chunks = parts.filter(p => p.trim());
    // Nếu không tách được gì hợp lệ, coi toàn bộ là 1 câu
    if(chunks.length === 0) chunks = [raw];
  }

  const questions = [];
  chunks.forEach((chunk, ci) => {
    const trimmed = chunk.trim();
    if(!trimmed) return;
    const q = textToQ(trimmed, ci, null);
    // Chỉ nhận câu có nội dung
    if(q.text || (q.answers && q.answers.some(a => a.text))) {
      // Đảm bảo có ít nhất 2 đáp án cho single/multi
      if((q.type === 'single' || q.type === 'multi') && (!q.answers || q.answers.length < 2)) {
        q.answers = (q.answers || []).concat([
          {text:'',correct:false},{text:'',correct:false}
        ]).slice(0,Math.max(2,(q.answers||[]).length));
      }
      questions.push(q);
    }
  });
  return questions;
}

window.doBulkImport = function(replace) {
  const ta = document.getElementById('bulk-import-ta');
  const errEl = document.getElementById('bulk-import-error');
  const cntEl = document.getElementById('bulk-preview-count');
  errEl.textContent = '';
  if(!ta || !ta.value.trim()) {
    errEl.textContent = '⚠ Chưa có nội dung để nhập.';
    return;
  }
  try {
    const parsed = parseBulkText(ta.value);
    if(parsed.length === 0) {
      errEl.textContent = '⚠ Không nhận diện được câu hỏi nào. Kiểm tra lại định dạng.';
      return;
    }
    if(replace) {
      editQuestions = parsed;
    } else {
      editQuestions = editQuestions.concat(parsed);
    }
    renderQuestions();
    // Scroll to question list
    setTimeout(() => {
      document.getElementById('question-list')?.scrollIntoView({behavior:'smooth', block:'start'});
    }, 120);
    // Clear + collapse
    ta.value = '';
    cntEl.textContent = '';
    _bulkOpen = false;
    const body = document.getElementById('bulk-import-body');
    const chevron = document.getElementById('bulk-chevron');
    if(body) body.classList.remove('open');
    if(chevron) chevron.style.transform = '';
    showToast(`✅ Đã nhập ${parsed.length} câu hỏi`, 'success');
  } catch(e) {
    errEl.textContent = '⚠ Lỗi: ' + e.message;
  }
};

// Live preview count while typing
function initBulkPreview() {
  const ta = document.getElementById('bulk-import-ta');
  const cntEl = document.getElementById('bulk-preview-count');
  const replaceBtn = document.getElementById('bulk-replace-btn');
  if(!ta) return;
  ta.addEventListener('input', () => {
    if(!ta.value.trim()) { cntEl.textContent = ''; return; }
    try {
      const n = parseBulkText(ta.value).length;
      cntEl.textContent = n > 0 ? `${n} câu được nhận diện` : '';
      // Chỉ hiện nút "Thay thế" khi đề đã có câu
      if(replaceBtn) replaceBtn.style.display = (editQuestions.length > 0 && n > 0) ? '' : 'none';
    } catch(e) { cntEl.textContent = ''; }
  });
}

window.addQuestion = function(data) {
  const defaultType = document.getElementById('quiz-default-type')?.value || 'single';
  editQuestions.push(data || {
    text:'', type:defaultType, answers:[
      {text:'',correct:false},{text:'',correct:false},{text:'',correct:false},{text:'',correct:false}
    ], explanation:'', imageUrl:'', audioUrl:''
  });
  renderQuestions();
  setTimeout(() => {
    const list = document.getElementById('question-list');
    list.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }, 100);
};

function renderQuestions() {
  const list = document.getElementById('question-list');
  list.innerHTML = '';
  editQuestions.forEach((q, qi) => renderQuestionItem(q, qi, list));
  document.getElementById('q-count').textContent = editQuestions.length;
  // Auto-resize tất cả textarea sau khi render
  setTimeout(() => {
    list.querySelectorAll('textarea.auto-resize-ta').forEach(ta => autoResize(ta));
  }, 0);
}

// ---- Text ↔ Form converter ----

/** Serialize question data → plain text */
function qToText(q, qi) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Câu hỏi nhiều dòng: dòng đầu có "Câu N:", các dòng sau indent 3 space
  const qLines = (q.text||'').split('\n');
  let lines = [`Câu ${qi+1}: ${qLines[0]}`];
  for(let i=1; i<qLines.length; i++) lines.push(`   ${qLines[i]}`);

  if(q.type==='fill') {
    const corrects = (q.answers||[]).filter(a=>a.correct).map(a=>a.text);
    lines.push(`=> [Điền] ${corrects.join(' | ')}`);
  } else if(q.type==='multifill') {
    const blanks = (q.answers||[]).map(a=>a.text);
    lines.push(`=> [Điền nhiều ô] ${blanks.join(' | ')}`);
  } else {
    (q.answers||[]).forEach((a,ai) => {
      const lbl = letters[ai]||String(ai+1);
      // Đáp án nhiều dòng: dòng đầu có "A.", các dòng sau indent 3 space
      const aLines = (a.text||'').split('\n');
      lines.push(`${lbl}${a.correct?'*':''}. ${aLines[0]}`);
      for(let i=1; i<aLines.length; i++) lines.push(`   ${aLines[i]}`);
    });
  }
  if(q.explanation) {
    const explLines = q.explanation.split('\n');
    lines.push(`=> ${explLines[0]}`);
    for(let i=1; i<explLines.length; i++) lines.push(`   ${explLines[i]}`);
  }
  return lines.join('\n');
}

/** Parse plain text → question data object (partial merge with existing q) */
function textToQ(raw, qi, existingQ) {
  const lines = raw.split('\n');
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const result = {
    text: existingQ?.text||'',
    type: existingQ?.type||'single',
    answers: existingQ?.answers ? JSON.parse(JSON.stringify(existingQ.answers)) : [],
    explanation: existingQ?.explanation||'',
    imageUrl: existingQ?.imageUrl||'',
    audioUrl: existingQ?.audioUrl||'',
  };

  // Regexes
  const ansRe = /^([A-Za-z])([*]?)\s*[.,):\-]\s*(.*)/;
  const qRe = /^[Cc][aâ]u\s*\d+\s*[:.)?\-]?\s*(.*)/;
  const explRe = /^(?:=>|#|giải thích:?)\s*(.*)/i;
  // Indent: dòng bắt đầu bằng ít nhất 2 space hoặc tab (continuation)
  const isIndent = (line) => line.startsWith('  ') || line.startsWith('\t');

  let parsedAnswers = [];
  let foundQ = false;
  // Trạng thái đang collect block nào: null | 'q' | 'ans' | 'expl'
  let mode = null;
  let explLines = null;

  for(let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const trimmed = line.trim();

    // --- Continuation dòng indent ---
    if(isIndent(line) || (!trimmed && (mode === 'q' || mode === 'ans' || mode === 'expl'))) {
      if(mode === 'expl' && explLines !== null) {
        explLines.push(trimmed);
        continue;
      }
      if(mode === 'q' && foundQ) {
        // Nối thêm dòng vào câu hỏi
        result.text += '\n' + trimmed;
        continue;
      }
      if(mode === 'ans' && parsedAnswers.length > 0) {
        // Nối thêm dòng vào đáp án cuối cùng
        const last = parsedAnswers[parsedAnswers.length - 1];
        last.text += '\n' + trimmed;
        continue;
      }
      if(!trimmed) continue; // dòng trống không thuộc block nào → skip
    }

    if(!trimmed) { mode = null; continue; } // dòng trống reset mode

    // --- Explanation ---
    const explM = trimmed.match(explRe);
    if(explM) {
      const fillM = explM[1].match(/^\[Điền\]\s*(.*)/);
      const mfM = explM[1].match(/^\[Điền nhiều ô\]\s*(.*)/);
      if(fillM) {
        const parts = fillM[1].split('|').map(s=>s.trim()).filter(Boolean);
        result.answers = parts.map(t=>({text:t,correct:true}));
        result.type = 'fill';
        mode = null;
      } else if(mfM) {
        const parts = mfM[1].split('|').map(s=>s.trim()).filter(Boolean);
        result.answers = parts.map(t=>({text:t,correct:true}));
        result.type = 'multifill';
        mode = null;
      } else {
        explLines = [explM[1]];
        mode = 'expl';
      }
      continue;
    }

    // --- Answer line ---
    const ansM = trimmed.match(ansRe);
    if(ansM) {
      parsedAnswers.push({text: ansM[3].trim(), correct: ansM[2]==='*'});
      mode = 'ans';
      continue;
    }

    // --- Question line ---
    const qM = trimmed.match(qRe);
    if(qM) {
      result.text = qM[1].trim();
      foundQ = true;
      mode = 'q';
      continue;
    }

    // --- Fallback: dòng đầu tiên không khớp pattern nào = nội dung câu hỏi ---
    if(!foundQ && parsedAnswers.length === 0 && explLines === null) {
      result.text = trimmed;
      foundQ = true;
      mode = 'q';
    }
  }

  // Gộp explanation
  if(explLines !== null) {
    result.explanation = explLines.join('\n').replace(/\n+$/, '');
  }
  if(parsedAnswers.length > 0) result.answers = parsedAnswers;

  return result;
}

/** Sync text panel → form fields (non-destructive re-render) */
window._syncingText = false; // prevent echo
window._syncingForm = false;

function syncTextToForm(qi) {
  if(window._syncingForm) return;
  window._syncingText = true;
  const ta = document.getElementById(`qtext-${qi}`);
  if(!ta) { window._syncingText=false; return; }
  const errEl = document.getElementById(`qtext-err-${qi}`);
  const raw = ta.value;
  try {
    const parsed = textToQ(raw, qi, editQuestions[qi]);
    editQuestions[qi] = parsed;
    // Refresh form fields without full re-render (keeps focus in textarea)
    refreshFormFields(qi, parsed);
    if(errEl) { errEl.classList.remove('visible'); errEl.textContent=''; }
  } catch(e) {
    if(errEl) { errEl.classList.add('visible'); errEl.textContent='⚠ Không thể phân tích: '+e.message; }
  }
  window._syncingText = false;
}

function syncFormToText(qi) {
  if(window._syncingText) return;
  window._syncingForm = true;
  const ta = document.getElementById(`qtext-${qi}`);
  if(ta && editQuestions[qi]) {
    const newText = qToText(editQuestions[qi], qi);
    // Only update if different to avoid cursor jump
    if(ta.value !== newText) ta.value = newText;
  }
  window._syncingForm = false;
}

/** Update form fields in-place after text parse (avoids full re-render losing focus) */
function refreshFormFields(qi, q) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Question text input
  const qInput = document.getElementById(`qinput-${qi}`);
  if(qInput && qInput !== document.activeElement) { qInput.value = q.text||''; autoResize(qInput); }
  // Type select
  const qType = document.getElementById(`qtype-${qi}`);
  if(qType) qType.value = q.type||'single';
  // Explanation
  const qExpl = document.getElementById(`qexpl-${qi}`);
  if(qExpl && qExpl !== document.activeElement) qExpl.value = q.explanation||'';

  // Answers: compare count first
  const container = document.getElementById(`answers-${qi}`);
  if(!container) return;
  // For fill/multifill types, just re-render the questions section entirely
  if(q.type==='fill' || q.type==='multifill') {
    renderQuestions();
    return;
  }
  const oldRows = container.querySelectorAll('.answer-row');
  if(oldRows.length !== (q.answers||[]).length) {
    // Re-render answers section only
    container.innerHTML = (q.answers||[]).map((a,ai) => `
      <div class="answer-row" id="ans-${qi}-${ai}">
        <div class="answer-letter">${letters[ai]||'?'}</div>
        <input type="checkbox" class="answer-check" ${a.correct?'checked':''} onchange="editAns(${qi},${ai},'correct',this.checked,${q.type==='single'?'true':'false'})">
        <textarea class="answer-input auto-resize-ta" placeholder="Đáp án ${letters[ai]||ai+1}..." id="ainput-${qi}-${ai}"
          style="resize:none;overflow:hidden;min-height:34px;padding:7px 10px"
          oninput="editAns(${qi},${ai},'text',this.value);autoResize(this)">${escHtml(a.text||'')}</textarea>
        ${(q.answers||[]).length>2?`<button class="answer-remove-btn" onclick="removeAnswer(${qi},${ai})" title="Xóa"><i class="fas fa-minus-circle"></i></button>`:''}
      </div>`).join('');
  } else {
    // Update each row in-place
    (q.answers||[]).forEach((a,ai) => {
      const row = document.getElementById(`ans-${qi}-${ai}`);
      if(!row) return;
      const cb = row.querySelector('.answer-check');
      const inp = row.querySelector('.answer-input');
      if(cb) cb.checked = a.correct;
      if(inp && inp!==document.activeElement) { inp.value = a.text||''; autoResize(inp); }
    });
  }
}

function renderQuestionItem(q, qi, container, isInline) {
  // Inline mode (modal edit) — unchanged simple render
  if(isInline) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    container.innerHTML = `
      <div class="q-header">
        <div class="q-num">Câu ${qi+1}</div>
        <textarea class="form-input auto-resize-ta" style="flex:1;resize:none;overflow:hidden;min-height:40px" placeholder="Nội dung câu hỏi..."
          oninput="editQ(${qi},'text',this.value);autoResize(this)">${escHtml(q.text||'')}</textarea>
        <select class="q-type-select" onchange="editQType(${qi},this.value)">
          <option value="single" ${q.type==='single'?'selected':''}>Chọn 1</option>
          <option value="multi" ${q.type==='multi'?'selected':''}>Nhiều đáp án</option>
          <option value="fill" ${q.type==='fill'?'selected':''}>Điền vào chỗ trống</option>
          <option value="multifill" ${q.type==='multifill'?'selected':''}>Điền nhiều ô</option>
        </select>
      </div>
      <div class="form-row" style="gap:8px">
        <input type="url" class="form-input" style="font-size:.8rem" placeholder="🖼 URL hình ảnh (tùy chọn)" value="${escHtml(q.imageUrl||'')}" oninput="editQ(${qi},'imageUrl',this.value)">
        <input type="url" class="form-input" style="font-size:.8rem" placeholder="🔊 URL âm thanh câu hỏi (tự phát)" value="${escHtml(q.audioUrl||'')}" oninput="editQ(${qi},'audioUrl',this.value)">
      </div>
      <div class="answers-grid" id="answers-${qi}">
        ${q.type==='fill' ? `
          <div style="margin-top:4px">
            <label style="font-size:.78rem;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px">Đáp án đúng (dùng | để phân cách)</label>
            <input type="text" class="form-input" placeholder="VD: Hà Nội | hà nội"
              value="${escHtml((q.answers||[]).filter(a=>a.correct).map(a=>a.text).join(' | '))}"
              oninput="editFillAnswer(${qi},this.value)">
          </div>` :
        q.type==='multifill' ? `
          <div style="margin-top:4px">
            <label style="font-size:.78rem;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px">Đáp án từng ô /? (theo thứ tự)</label>
            ${(q.answers&&q.answers.length?q.answers:[{text:'',correct:true}]).map((a,ai)=>`
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <span style="font-size:.72rem;color:var(--text3);white-space:nowrap">Ô ${ai+1}</span>
                <input type="text" class="form-input" style="font-size:.85rem" placeholder="Đáp án..." value="${escHtml(a.text||'')}" oninput="editMfAnswer(${qi},${ai},this.value)">
              </div>`).join('')}
            <button class="add-answer-btn" onclick="addMfAnswer(${qi})"><i class="fas fa-plus"></i> Thêm ô</button>
          </div>` :
        (q.answers||[]).map((a,ai)=>`
          <div class="answer-row" id="ans-${qi}-${ai}">
            <div class="answer-letter">${letters[ai]||'?'}</div>
            <input type="checkbox" class="answer-check" ${a.correct?'checked':''} onchange="editAns(${qi},${ai},'correct',this.checked,${q.type==='single'?'true':'false'})">
            <textarea class="answer-input auto-resize-ta" placeholder="Đáp án ${letters[ai]||ai+1}..."
              style="resize:none;overflow:hidden;min-height:34px;padding:7px 10px"
              oninput="editAns(${qi},${ai},'text',this.value);autoResize(this)">${escHtml(a.text||'')}</textarea>
            <input type="url" class="answer-input" style="max-width:120px;font-size:.75rem;min-height:34px" placeholder="🔊 audio..." value="${escHtml(a.audioUrl||'')}" oninput="editAns(${qi},${ai},'audioUrl',this.value)" title="URL âm thanh đáp án">
            ${(q.answers||[]).length>2?`<button class="answer-remove-btn" onclick="removeAnswer(${qi},${ai})" title="Xóa"><i class="fas fa-minus-circle"></i></button>`:''}
          </div>`).join('')}
      </div>
      ${(q.type!=='fill'&&q.type!=='multifill')?`<button class="add-answer-btn" onclick="addAnswer(${qi})"><i class="fas fa-plus"></i> Thêm đáp án</button>`:''}
      <div class="form-group" style="margin-top:10px;margin-bottom:0">
        <label>Giải thích (hiện sau khi trả lời)</label>
        <textarea class="form-textarea" style="min-height:52px" placeholder="Giải thích đáp án..." oninput="editQ(${qi},'explanation',this.value)">${escHtml(q.explanation||'')}</textarea>
        <input type="url" class="form-input" style="margin-top:6px;font-size:.8rem" placeholder="🖼 URL ảnh giải thích (tùy chọn)" value="${escHtml(q.explImageUrl||'')}" oninput="editQ(${qi},'explImageUrl',this.value);updateExplImgPreview(this,'expl-img-${qi}')">
        <input type="url" class="form-input" style="margin-top:6px;font-size:.8rem" placeholder="🔊 URL âm thanh giải thích (tự phát)" value="${escHtml(q.explAudioUrl||'')}" oninput="editQ(${qi},'explAudioUrl',this.value)">
        <img id="expl-img-${qi}" class="expl-img-preview" src="${escHtml(q.explImageUrl||'')}" ${q.explImageUrl?'style="display:block"':''}>
      </div>
      <div class="form-group" style="margin-top:8px;margin-bottom:0">
        <label>Gợi ý (hiện khi user nhấn 💡)</label>
        <input type="text" class="form-input" style="font-size:.85rem" placeholder="VD: Nhớ lại quy tắc..." value="${escHtml(q.hint||'')}" oninput="editQ(${qi},'hint',this.value)">
      </div>`;
    // Auto-resize textareas sau khi render inline
    setTimeout(() => container.querySelectorAll('textarea.auto-resize-ta').forEach(ta => autoResize(ta)), 0);
    return;
  }

  // Normal editor mode: split layout row
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const rowWrap = document.createElement('div');
  rowWrap.className = 'q-row-wrap';
  rowWrap.id = 'q-row-'+qi;

  // ---- LEFT: Form item ----
  const formItem = document.createElement('div');
  formItem.className = 'question-item' + (q.hidden ? ' is-hidden' : '');
  formItem.id = 'q-item-'+qi;
  formItem.innerHTML = `
    <button class="q-remove" onclick="removeQuestion(${qi})" title="Xóa câu"><i class="fas fa-times"></i></button>
    <div class="q-header">
      <div class="q-num">Câu ${qi+1}${q.hidden?'<span class="q-hidden-badge"><i class="fas fa-eye-slash"></i> Ẩn</span>':''}</div>
      <textarea class="form-input auto-resize-ta" id="qinput-${qi}" style="flex:1;resize:none;overflow:hidden;min-height:40px" placeholder="Nội dung câu hỏi..."
        oninput="editQ(${qi},'text',this.value);syncFormToText(${qi});autoResize(this)">${escHtml(q.text||'')}</textarea>
      <select class="q-type-select" id="qtype-${qi}" onchange="editQType(${qi},this.value);syncFormToText(${qi})">
        <option value="single" ${q.type==='single'?'selected':''}>Chọn 1</option>
        <option value="multi" ${q.type==='multi'?'selected':''}>Nhiều đáp án</option>
        <option value="fill" ${q.type==='fill'?'selected':''}>Điền vào chỗ trống</option>
        <option value="multifill" ${q.type==='multifill'?'selected':''}>Điền nhiều ô</option>
      </select>
    </div>
    <div class="form-row" style="gap:8px">
      <input type="url" class="form-input" style="font-size:.8rem" placeholder="🖼 URL hình ảnh (tùy chọn)" value="${escHtml(q.imageUrl||'')}" oninput="editQ(${qi},'imageUrl',this.value)">
      <input type="url" class="form-input" style="font-size:.8rem" placeholder="🔊 URL âm thanh câu hỏi (tự phát)" value="${escHtml(q.audioUrl||'')}" oninput="editQ(${qi},'audioUrl',this.value)">
    </div>
    <div class="answers-grid" id="answers-${qi}">
      ${q.type==='fill' ? `
        <div style="margin-top:4px">
          <label style="font-size:.78rem;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px">Đáp án đúng (dùng | để phân cách các đáp án chấp nhận được)</label>
          <input type="text" class="form-input fill-correct-input" id="fillanswer-${qi}"
            placeholder="VD: Mary said she was going to <finish> her homework."
            value="${escHtml((q.answers||[]).filter(a=>a.correct).map(a=>a.text).join(' | '))}"
            oninput="editFillAnswer(${qi},this.value);syncFormToText(${qi})">
          <div style="font-size:.72rem;color:var(--text3);margin-top:4px;line-height:1.6">
            <i class="fas fa-info-circle"></i> Dùng <code style="color:var(--accent2);background:rgba(0,212,170,.1);padding:1px 4px;border-radius:3px">&lt;từ_khoá&gt;</code> để đánh dấu từ quan trọng.<br>
            Dùng <code style="color:var(--accent4);background:rgba(255,217,61,.1);padding:1px 4px;border-radius:3px">|</code> để phân cách nhiều đáp án chấp nhận. Dùng <code style="color:var(--accent);background:rgba(108,99,255,.1);padding:1px 4px;border-radius:3px">&lt;*Prefix*&gt;</code> để điền sẵn vào ô trả lời.
          </div>
        </div>` :
      q.type==='multifill' ? `
        <div style="margin-top:4px">
          <label style="font-size:.78rem;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px">Đáp án cho từng ô /? (theo thứ tự xuất hiện)</label>
          <div id="mf-answers-${qi}" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            ${(q.answers&&q.answers.length?q.answers:[{text:'',correct:true}]).map((a,ai)=>`
              <div style="display:flex;align-items:center;gap:4px" id="mfans-${qi}-${ai}">
                <div style="font-size:.72rem;color:var(--text3);background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:2px 6px;flex-shrink:0">Ô ${ai+1}</div>
                <input type="text" class="form-input" style="width:110px;font-size:.85rem;padding:6px 8px" placeholder="Đáp án..." value="${escHtml(a.text||'')}" oninput="editMfAnswer(${qi},${ai},this.value)">
                ${q.answers&&q.answers.length>1?`<button class="answer-remove-btn" onclick="removeMfAnswer(${qi},${ai})" title="Xóa"><i class="fas fa-minus-circle"></i></button>`:''}
              </div>`).join('')}
          </div>
          <button class="add-answer-btn" onclick="addMfAnswer(${qi})"><i class="fas fa-plus"></i> Thêm ô</button>
          <div style="font-size:.72rem;color:var(--text3);margin-top:6px;line-height:1.6">
            <i class="fas fa-info-circle"></i> Dùng <code style="color:var(--accent);background:rgba(108,99,255,.1);padding:1px 4px;border-radius:3px">/?</code> trong nội dung câu để đánh dấu ô trống. Chấm không phân biệt hoa/thường.
          </div>
        </div>` :
      (q.answers||[]).map((a,ai)=>`
        <div class="answer-row" id="ans-${qi}-${ai}">
          <div class="answer-letter">${letters[ai]||'?'}</div>
          <input type="checkbox" class="answer-check" ${a.correct?'checked':''} onchange="editAns(${qi},${ai},'correct',this.checked,${q.type==='single'?'true':'false'});syncFormToText(${qi})">
          <textarea class="answer-input auto-resize-ta" id="ainput-${qi}-${ai}" placeholder="Đáp án ${letters[ai]||ai+1}..."
            style="resize:none;overflow:hidden;min-height:34px;padding:7px 10px"
            oninput="editAns(${qi},${ai},'text',this.value);syncFormToText(${qi});autoResize(this)">${escHtml(a.text||'')}</textarea>
          <input type="url" class="answer-input" style="max-width:130px;font-size:.75rem" placeholder="🔊 audio..." value="${escHtml(a.audioUrl||'')}" oninput="editAns(${qi},${ai},'audioUrl',this.value)" title="URL âm thanh đáp án (user click để nghe)">
          ${(q.answers||[]).length>2?`<button class="answer-remove-btn" onclick="removeAnswer(${qi},${ai})" title="Xóa"><i class="fas fa-minus-circle"></i></button>`:''}
        </div>`).join('')}
    </div>
    ${(q.type!=='fill'&&q.type!=='multifill')?`<button class="add-answer-btn" onclick="addAnswer(${qi})"><i class="fas fa-plus"></i> Thêm đáp án</button>`:''}
    <div class="form-group" style="margin-top:10px;margin-bottom:0">
      <label>Giải thích (hiện sau khi trả lời)</label>
      <textarea class="form-textarea" id="qexpl-${qi}" style="min-height:52px" placeholder="Giải thích đáp án..."
        oninput="editQ(${qi},'explanation',this.value);syncFormToText(${qi})">${escHtml(q.explanation||'')}</textarea>
      <input type="url" class="form-input" id="qexpl-img-${qi}" style="margin-top:6px;font-size:.8rem" placeholder="🖼 URL ảnh giải thích (tùy chọn)" value="${escHtml(q.explImageUrl||'')}" oninput="editQ(${qi},'explImageUrl',this.value);updateExplImgPreview(this,'expl-img-${qi}')">
      <input type="url" class="form-input" id="qexpl-audio-${qi}" style="margin-top:6px;font-size:.8rem" placeholder="🔊 URL âm thanh giải thích (tự phát khi hiện giải thích)" value="${escHtml(q.explAudioUrl||'')}" oninput="editQ(${qi},'explAudioUrl',this.value)">
      <img id="expl-img-${qi}" class="expl-img-preview" src="${escHtml(q.explImageUrl||'')}" ${q.explImageUrl?'style="display:block"':''}>
    </div>
    <div class="form-group" style="margin-top:8px;margin-bottom:0">
      <label>Gợi ý (hiện khi user nhấn 💡 trong lúc làm bài)</label>
      <input type="text" class="form-input" style="font-size:.85rem" placeholder="VD: Nhớ lại quy tắc..." value="${escHtml(q.hint||'')}" oninput="editQ(${qi},'hint',this.value)">
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
      <div>
        <div class="toggle-label" style="font-size:.82rem">Ẩn câu hỏi này</div>
        <div class="toggle-desc">Câu ẩn sẽ không xuất hiện khi làm bài</div>
      </div>
      <label class="toggle"><input type="checkbox" id="qhidden-${qi}" ${q.hidden?'checked':''} onchange="editQ(${qi},'hidden',this.checked);document.getElementById('q-item-${qi}').classList.toggle('is-hidden',this.checked)"><span class="toggle-slider"></span></label>
    </div>`;

  // ---- RIGHT: Text panel ----
  const placeholder = `Câu ${qi+1}: Nội dung câu hỏi\nA. Đáp án 1\nB*. Đáp án đúng\nC. Đáp án 3\nD. Đáp án 4\n=> Giải thích (tùy chọn)`;
  const textPanel = document.createElement('div');
  textPanel.className = 'q-text-panel';
  textPanel.id = 'q-panel-'+qi;
  textPanel.innerHTML = `
    <div class="q-text-panel-header">
      <span><i class="fas fa-align-left" style="color:var(--accent2)"></i> Soạn nhanh bằng văn bản</span>
      <span class="q-text-sync-badge"><i class="fas fa-sync-alt"></i> Đồng bộ 2 chiều</span>
    </div>
    <div class="q-text-panel-hint">
      Dùng <code style="color:var(--accent2);background:rgba(0,212,170,.1);padding:1px 4px;border-radius:3px">A*.</code> để đánh dấu đáp án đúng &nbsp;|&nbsp;
      <code style="color:var(--accent2);background:rgba(0,212,170,.1);padding:1px 4px;border-radius:3px">=></code> cho giải thích &nbsp;|&nbsp;
      <code style="color:var(--accent2);background:rgba(0,212,170,.1);padding:1px 4px;border-radius:3px">x^2</code> mũ 1 ký tự &nbsp;
      <code style="color:var(--accent2);background:rgba(0,212,170,.1);padding:1px 4px;border-radius:3px">x^{2a}</code> mũ nhóm &nbsp;
      <code style="color:var(--accent2);background:rgba(0,212,170,.1);padding:1px 4px;border-radius:3px">H_2O</code> chỉ số dưới &nbsp;
      <code style="color:var(--accent2);background:rgba(0,212,170,.1);padding:1px 4px;border-radius:3px">H_{2SO4}</code> nhóm dưới &nbsp;
      <code style="color:var(--accent2);background:rgba(0,212,170,.1);padding:1px 4px;border-radius:3px">/rho /ell</code> ký hiệu
    </div>
    <div class="q-math-ref-toggle" id="q-math-ref-toggle-${qi}" onclick="toggleMathRef(${qi})" style="cursor:pointer;padding:4px 12px 4px;font-size:.7rem;color:var(--accent2);display:flex;align-items:center;gap:5px;user-select:none;border-bottom:1px solid var(--border)">
      <i class="fas fa-flask"></i> Ký hiệu Toán/Hoá học <i class="fas fa-chevron-down" id="q-math-ref-icon-${qi}" style="font-size:.6rem;margin-left:auto;transition:transform .2s"></i>
    </div>
    <div class="q-math-ref-wrap" id="q-math-ref-${qi}" style="display:none;padding:0 12px 8px;"></div>
    <textarea class="q-text-area" id="qtext-${qi}" spellcheck="false"
      placeholder="${placeholder}"
      oninput="syncTextToForm(${qi})">${escHtml(qToText(q, qi))}</textarea>
    <div class="q-text-parse-error" id="qtext-err-${qi}"></div>`;

  rowWrap.appendChild(formItem);
  rowWrap.appendChild(textPanel);
  container.appendChild(rowWrap);
}

window.toggleMathRef = function(qi) {
  const wrap = document.getElementById('q-math-ref-'+qi);
  const icon = document.getElementById('q-math-ref-icon-'+qi);
  if(!wrap) return;
  const open = wrap.style.display === 'none';
  wrap.style.display = open ? '' : 'none';
  if(icon) icon.style.transform = open ? 'rotate(180deg)' : '';
  if(open && !wrap.innerHTML) wrap.innerHTML = buildMathRefPanel();
};

window.editQ = function(qi, field, val) { if(editQuestions[qi]) editQuestions[qi][field]=val; };
window.editMfAnswer = function(qi, ai, val) {
  if(!editQuestions[qi]) return;
  if(!editQuestions[qi].answers) editQuestions[qi].answers = [];
  while(editQuestions[qi].answers.length<=ai) editQuestions[qi].answers.push({text:'',correct:true});
  editQuestions[qi].answers[ai].text = val;
  editQuestions[qi].answers[ai].correct = true;
};
window.addMfAnswer = function(qi) {
  if(!editQuestions[qi]) return;
  if(!editQuestions[qi].answers) editQuestions[qi].answers=[];
  editQuestions[qi].answers.push({text:'',correct:true});
  renderQuestions();
};
window.removeMfAnswer = function(qi, ai) {
  if(!editQuestions[qi]?.answers) return;
  editQuestions[qi].answers.splice(ai,1);
  renderQuestions();
};

// Live preview: update /? blank span as user types
window.updateMfPreview = function(qi, ai, val) {
  const span = document.getElementById('mf-preview-'+qi+'-'+ai);
  if(span) {
    span.textContent = val || '?';
    span.classList.toggle('empty', !val);
  }
};

// Submit multifill — check each blank case-insensitively
window.submitMultiFill = function(qi) {
  const q = quizQuestions[qi];
  const correctAnswers = q.answers||[];
  const blankCount = (q.text||'').match(/\/\?/g)?.length||0;
  const count = Math.max(blankCount, correctAnswers.length||1);
  const userAnswers = Array.from({length:count},(_,ai)=>{
    return (document.getElementById('mf-inp-'+qi+'-'+ai)?.value||'').trim();
  });
  // Check all blanks
  const allCorrect = userAnswers.every((ua,ai)=>{
    const ca = correctAnswers[ai]?.text||'';
    return normFill(ua)===normFill(ca);
  });
  answers[qi] = { selected:[], correct:allCorrect, userAnswers };
  playTone(allCorrect?'correct':'wrong');
  showQuestion(qi);
  if(allCorrect) spawnConfetti();
  updateSidebarStats();
};

// Play answer audio on click
let _answerAudioEl = null;
window.playAnswerAudio = function(btn, encodedUrl) {
  // Stop previous
  if(_answerAudioEl) { _answerAudioEl.pause(); _answerAudioEl=null; }
  document.querySelectorAll('.answer-audio-btn.playing').forEach(b=>b.classList.remove('playing'));
  const url = decodeURIComponent(encodedUrl);
  const audio = new Audio(url);
  _answerAudioEl = audio;
  btn.classList.add('playing');
  audio.play().catch(()=>{});
  audio.onended = ()=>{ btn.classList.remove('playing'); _answerAudioEl=null; };
  audio.onerror = ()=>{ btn.classList.remove('playing'); _answerAudioEl=null; };
};

// Apply renderMath to element innerHTML
function applyMathInner(el) {
  el.innerHTML = renderMath(el.innerHTML);
}

window.editFillAnswer = function(qi, val) {
  if(!editQuestions[qi]) return;
  const parts = val.split('|').map(s=>s.trim()).filter(Boolean);
  editQuestions[qi].answers = parts.map((t)=>({text:t,correct:true}));
  if(editQuestions[qi].answers.length===0) editQuestions[qi].answers=[{text:'',correct:true}];
};
window.syncFormToText = syncFormToText;
window.syncTextToForm = syncTextToForm;
window.editQType = function(qi, type) {
  if(editQuestions[qi]){
    editQuestions[qi].type=type;
    renderQuestions();
    setTimeout(() => syncFormToText(qi), 0);
  }
};
window.editAns = function(qi, ai, field, val, single) {
  if(!editQuestions[qi]?.answers) return;
  if(field==='correct' && single==='true') {
    editQuestions[qi].answers.forEach((a,i)=>{ a.correct = i===ai && val; });
    // update checkboxes
    editQuestions[qi].answers.forEach((a,i)=>{
      const cb = document.getElementById('ans-'+qi+'-'+i)?.querySelector('.answer-check');
      if(cb) cb.checked = a.correct;
    });
  } else {
    editQuestions[qi].answers[ai][field]=val;
  }
};
window.addAnswer = function(qi) {
  if(!editQuestions[qi]) return;
  editQuestions[qi].answers.push({text:'',correct:false});
  renderQuestions();
  // After re-render, re-sync text panel
  setTimeout(() => syncFormToText(qi), 0);
};
window.removeAnswer = function(qi, ai) {
  if(!editQuestions[qi]) return;
  editQuestions[qi].answers.splice(ai,1);
  renderQuestions();
  setTimeout(() => syncFormToText(qi), 0);
};
window.removeQuestion = function(qi) {
  editQuestions.splice(qi,1);
  renderQuestions();
};

window.resetCurrentSessions = async function() {
  if(!currentEditId) return;
  _sessionsCache[currentEditId] = 0;
  try { await set(ref(db, 'app_data/sessions/'+currentEditId), 0); } catch(e) {}
  // Also clear localStorage fallback
  const data = JSON.parse(localStorage.getItem('qm_sessions')||'{}');
  data[currentEditId] = 0;
  localStorage.setItem('qm_sessions', JSON.stringify(data));
  document.getElementById('sessions-done-val').textContent = '0';
  showToast('Đã reset số lần đã làm về 0', 'success');
  renderQuizGrid();
};
window.saveQuiz = async function() {
  const name = document.getElementById('quiz-name').value.trim();
  if(!name) { showToast('Vui lòng nhập tên chủ đề','error'); return; }
  if(editQuestions.length===0) { showToast('Vui lòng thêm ít nhất 1 câu hỏi','error'); return; }
  // validate
  for(let i=0; i<editQuestions.length; i++){
    const q = editQuestions[i];
    if(!q.text.trim()){ showToast(`Câu ${i+1}: Chưa có nội dung câu hỏi`,'error'); return; }
    if(q.type==='fill'){
      if(!q.answers||q.answers.length===0||!q.answers[0].text.trim()){ showToast(`Câu ${i+1}: Chưa nhập đáp án điền vào chỗ trống`,'error'); return; }
    } else {
      if(!q.answers.some(a=>a.correct)){ showToast(`Câu ${i+1}: Chưa chọn đáp án đúng`,'error'); return; }
      if(!q.answers.some(a=>a.text.trim())){ showToast(`Câu ${i+1}: Chưa có nội dung đáp án`,'error'); return; }
    }
  }
  const btn = document.getElementById('save-btn');
  const setBtns = (disabled, html) => {
    if(btn) { btn.disabled = disabled; btn.innerHTML = html; }
  };
  setBtns(true, '<div class="spinner"></div> Đang lưu...');
  const data = {
    name,
    imageUrl: document.getElementById('quiz-image-url').value.trim() || null,
    sampleImg: selectedSampleImg,
    sampleEmoji: selectedSampleImg!==null ? SAMPLE_IMGS[selectedSampleImg]?.emoji : null,
    sampleBg: selectedSampleImg!==null ? SAMPLE_IMGS[selectedSampleImg]?.bg : null,
    settings: {
      timeLimit: parseInt(document.getElementById('quiz-time').value)||30,
      shuffleQ: document.getElementById('shuffle-questions').checked,
      shuffleA: document.getElementById('shuffle-answers').checked,
      targetSessions: parseInt(document.getElementById('quiz-target-sessions').value)||1,
      allowedUsers: getSelectedUserAssign(),
      defaultType: document.getElementById('quiz-default-type')?.value||'single',
      showNewBadge: document.getElementById('quiz-show-new-badge')?.checked||false,
    },
    questions: editQuestions,
    updatedAt: Date.now()
  };
  try {
    if(currentEditId) {
      // Optimistic update: patch cache immediately
      quizzesCache[currentEditId] = { ...(quizzesCache[currentEditId]||{}), ...data };
      _suppressQuizzesUpdate = true;
      await update(ref(db,'quizzes/'+currentEditId), data);
      showToast('Đã cập nhật bộ đề!','success');
    } else {
      // For new quiz, push and get the new key
      _suppressQuizzesUpdate = true;
      const newRef = await push(ref(db,'quizzes'), {...data, createdAt:Date.now()});
      quizzesCache[newRef.key] = {...data, createdAt:Date.now()};
      showToast('Đã thêm bộ đề mới!','success');
    }
    // Navigate immediately with fresh data already in cache
    showPage('home');
    setBtns(false, '<i class="fas fa-save"></i> Lưu bộ đề');
    // Re-enable listener after a short delay (Firebase echo window)
    setTimeout(() => { _suppressQuizzesUpdate = false; }, 2000);
  } catch(e) {
    _suppressQuizzesUpdate = false;
    showToast('Lỗi lưu dữ liệu: '+e.message,'error');
    setBtns(false, '<i class="fas fa-save"></i> Lưu bộ đề');
  }
};

// ===== START QUIZ =====
window.startQuiz = function(id) {
  const q = quizzesCache[id];
  if(!q){ showToast('Không tìm thấy bộ đề','error'); return; }
  if(!q.questions||q.questions.length===0){ showToast('Bộ đề chưa có câu hỏi','error'); return; }
  currentQuizMeta = {...q, id, questions: JSON.parse(JSON.stringify(q.questions||[]))};
  isReviewMode = false;
  answers = {};
  questionReactions = {};
  currentQIndex = 0;
  // shuffle questions — filter hidden first
  let qs = JSON.parse(JSON.stringify(q.questions)).filter(qq => !qq.hidden);
  if(q.settings?.shuffleQ!==false) qs = shuffle(qs);
  // shuffle answers per question
  if(q.settings?.shuffleA!==false) {
    qs = qs.map(question => {
      const ans = shuffle([...question.answers]);
      return {...question, answers:ans};
    });
  }
  quizQuestions = qs;
  // timer
  clearInterval(timerInterval);
  timeLeft = (q.settings?.timeLimit||30)*60;
  startTimer();
  // ui
  document.getElementById('quiz-playing-title').textContent = q.name;
  showPage('quiz');
  renderNavGrid();
  showQuestion(0);
  // sidebar default
  sidebarVisible = window.innerWidth > 768;
  updateSidebarVisibility();
};

function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if(timeLeft<=0){ clearInterval(timerInterval); doFinishQuiz(); }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft/60), s = timeLeft%60;
  document.getElementById('timer-text').textContent = `${pad(m)}:${pad(s)}`;
  const el = document.getElementById('timer-display');
  el.classList.toggle('urgent', timeLeft<=60);
}
function pad(n){ return n<10?'0'+n:n; }

// ===== SHOW QUESTION =====
function showQuestion(idx) {
  currentQIndex = idx;
  const q = quizQuestions[idx];
  const state = answers[idx];
  const done = !!state;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const display = document.getElementById('question-display');

  let mediaHtml = '';
  if(q.imageUrl) mediaHtml += `<div class="question-media"><img class="question-img" src="${escHtml(q.imageUrl)}" loading="lazy"></div>`;
  if(q.audioUrl) mediaHtml += `<div class="question-media"><audio class="question-audio" id="q-audio-${idx}" controls ${!done?'autoplay':''} src="${escHtml(q.audioUrl)}"></audio></div>`;

  const typeLabel = q.type==='multi' ? '<i class="fas fa-check-double"></i> Chọn nhiều đáp án' 
    : q.type==='fill' ? '<i class="fas fa-keyboard"></i> Điền vào chỗ trống'
    : q.type==='multifill' ? '<i class="fas fa-th-list"></i> Điền nhiều ô'
    : '<i class="fas fa-dot-circle"></i> Chọn một đáp án';

  let answersHtml = '';
  if(q.type==='multifill') {
    const correctAnswers = q.answers||[];
    const st = answers[idx];
    if(st) {
      answersHtml = `<div class="multifill-question-display" id="mf-qdisplay-${idx}"></div>
        <div class="multifill-inputs" style="margin-top:10px">
          ${correctAnswers.map((a,ai)=>{
            const ua=st.userAnswers?.[ai]||'';
            const ok=normFill(ua)===normFill(a.text||'');
            return `<div class="mf-input-group">
              <div class="mf-input-label">Ô ${ai+1}</div>
              <input class="mf-input ${ok?'correct':'wrong'}" value="${escHtml(ua)}" disabled>
              ${!ok?`<div style="font-size:.68rem;color:var(--correct);margin-top:2px;text-align:center">✓ ${escHtml(a.text)}</div>`:''}
            </div>`;
          }).join('')}
        </div>`;
    } else {
      const blankCount = Math.max((q.text||'').match(/\/\?/g)?.length||0, correctAnswers.length||1);
      answersHtml = `<div class="multifill-question-display" id="mf-qdisplay-${idx}"></div>
        <div class="multifill-inputs">
          ${Array.from({length:blankCount},(_,ai)=>`
            <div class="mf-input-group">
              <div class="mf-input-label">Ô ${ai+1}</div>
              <input class="mf-input" id="mf-inp-${idx}-${ai}" placeholder="..." oninput="updateMfPreview(${idx},${ai},this.value)" onkeydown="if(event.key==='Enter'){var nx=document.getElementById('mf-inp-${idx}-${ai+1}');nx?nx.focus():submitMultiFill(${idx})}">
            </div>`).join('')}
          <button class="fill-submit-btn" style="align-self:flex-end;margin-left:4px" onclick="submitMultiFill(${idx})"><i class="fas fa-check"></i> Trả lời</button>
        </div>`;
    }
  } else if(q.type==='fill') {
    const st = answers[idx];
    if(st) {
      // Answered: show diff result
      const userAns = st.userText||'';
      const correctAnswers = q.answers.filter(a=>a.correct).map(a=>a.text);
      const diffResult = st.diffHtml || '';
      const pct = st.pct !== undefined ? st.pct : (st.correct ? 100 : 0);
      const pctColor = pct>=80 ? 'var(--correct)' : pct>=50 ? 'var(--accent4)' : 'var(--wrong)';
      answersHtml = `<div class="fill-answer-wrap">
        <div class="fill-diff-wrap">
          <div class="fill-diff-display">${diffResult || escHtml(userAns)}</div>
          <div class="fill-pct-bar-wrap">
            <div class="fill-pct-bar"><div class="fill-pct-fill" style="width:${pct}%;background:${pctColor}"></div></div>
            <div class="fill-pct-label" style="color:${pctColor}">${pct}%</div>
          </div>
          ${pct<100 ? `<div class="fill-expected" style="margin-top:6px"><i class="fas fa-key"></i> Đáp án mẫu: <strong>${correctAnswers.map(a=>escHtml(a.replace(/<\*([^*>]+)\*>/g,'$1').replace(/<([^>]+)>/g,'$1'))).join('</strong> &nbsp;|&nbsp; <strong>')}</strong></div>` : ''}
        </div>
      </div>`;
    } else {
      const firstCorrect = q.answers.find(a=>a.correct);
      const { prefill } = firstCorrect ? parseAnswerTemplate(firstCorrect.text) : { prefill:'' };
      const prefillAttr = prefill ? ` data-prefill="${escHtml(prefill)}"` : '';
      answersHtml = `<div class="fill-answer-wrap">
        <div class="fill-input-row">
          <input type="text" class="fill-input" id="fill-input-${idx}" placeholder="Nhập câu trả lời của bạn..." onkeydown="if(event.key==='Enter')submitFill(${idx})"${prefillAttr}>
          <button class="fill-submit-btn" onclick="submitFill(${idx})"><i class="fas fa-check"></i> Trả lời</button>
        </div>
      </div>`;
    }
  } else {
  let answersHtml_mc = q.answers.map((a, ai) => {
    let cls = 'answer-option';
    let icon = '';
    if(done) {
      cls += ' disabled';
      const sel = state.selected.includes(ai);
      if(a.correct && sel){ cls+=' selected-correct'; icon='<i class="fas fa-check-circle answer-icon" style="color:var(--correct)"></i>'; }
      else if(a.correct && !sel){ cls+=' correct'; icon='<i class="fas fa-check-circle answer-icon" style="color:var(--correct)"></i>'; }
      else if(!a.correct && sel){ cls+=' selected-wrong'; icon='<i class="fas fa-times-circle answer-icon" style="color:var(--wrong)"></i>'; }
    }
    return `<div class="${cls}" onclick="${done?'':'selectAnswer('+idx+','+ai+')'}" id="opt-${idx}-${ai}">
      <div class="answer-key">${letters[ai]||ai+1}</div>
      <div class="answer-text" data-text="${encodeURIComponent(a.text||'(Chưa có nội dung)')}"></div>
      ${a.audioUrl?`<button class="answer-audio-btn" onclick="event.stopPropagation();playAnswerAudio(this,'${encodeURIComponent(a.audioUrl)}')" title="Nghe"><i class="fas fa-volume-up"></i></button>`:''}
      ${icon}
    </div>`;
  }).join('');
  answersHtml = answersHtml_mc;
  }

  let praiseHtml = '';
  if(done) {
    if(state.correct) praiseHtml = `<div class="praise-box praise-correct">${getCorrectPraise()}</div>`;
    else praiseHtml = `<div class="praise-box praise-wrong">${getWrongPraise()}</div>`;
  }

  // Like/Dislike reaction (always visible after question loads)
  const qReaction = questionReactions[idx];
  const likedCls = qReaction === 'like' ? ' liked' : '';
  const dislikedCls = qReaction === 'dislike' ? ' disliked' : '';
  const reactionHtml = `<div class="q-reaction-row">
    <span class="q-reaction-label"><i class="fas fa-tag" style="margin-right:4px"></i>Đánh dấu câu này:</span>
    <button class="q-react-btn${likedCls}" id="react-like-${idx}" onclick="reactQuestion(${idx},'like')"><i class="fas fa-thumbs-up"></i> Hay</button>
    <button class="q-react-btn${dislikedCls}" id="react-dislike-${idx}" onclick="reactQuestion(${idx},'dislike')"><i class="fas fa-thumbs-down"></i> Dở</button>
  </div>`;

  let explanHtml = '';
  if(done && q.explanation) explanHtml = `<div class="explanation-box" id="expl-display-${idx}" data-expl="${encodeURIComponent(q.explanation)}">${q.explImageUrl?`<br><img src="${escHtml(q.explImageUrl)}" style="max-width:100%;max-height:220px;object-fit:contain;margin-top:8px;border-radius:8px" onerror="this.style.display='none'">`:''}</div>${q.explAudioUrl?`<audio id="expl-audio-${idx}" src="${escHtml(q.explAudioUrl)}" style="display:none" autoplay></audio>`:''}`;

  display.innerHTML = `
    <div class="question-card">
      <div class="question-header">
        <span class="question-num-badge">Câu ${idx+1}/${quizQuestions.length}</span>
        <div style="flex:1"></div>
        <div class="question-actions">
          <button class="q-action-btn" onclick="openInlineEdit(${idx})" title="Chỉnh sửa câu hỏi"><i class="fas fa-edit"></i></button>
          <button class="q-action-btn" onclick="undoAnswer(${idx})" title="Làm lại câu này" ${!done?'disabled style="opacity:.4;cursor:not-allowed"':''}><i class="fas fa-undo"></i></button>
        </div>
      </div>
      <div class="question-type-badge">${typeLabel}</div>
      <div class="question-text" id="qtext-display-${idx}"></div>
      ${mediaHtml}
      ${q.hint ? `<div id="hint-area-${idx}"><button class="hint-btn" onclick="toggleHint(${idx})"><i class="fas fa-lightbulb"></i> Gợi ý</button><div class="hint-box" id="hint-box-${idx}" style="display:none"><i class="fas fa-lightbulb"></i><span data-hint="${encodeURIComponent(q.hint||'')}"></span></div></div>` : ''}
      <div class="answers-list">${answersHtml}</div>
      ${praiseHtml}
      ${explanHtml}
      ${reactionHtml}
    </div>
  `;

  // update nav
  updateNavItem(idx);
  updateProgress();
  updateNavButtons(idx);

  // Set text content after render — áp dụng renderMath cho ký hiệu đặc biệt
  const qtd = document.getElementById('qtext-display-'+idx);
  if(qtd) {
    // For multifill: hide the plain text (display is inside the answers section)
    if(q.type==='multifill') qtd.style.display='none';
    else applyMath(qtd, q.text || '');
  }
  if(q.type==='multifill') {
    const mfDisp = document.getElementById('mf-qdisplay-'+idx);
    if(mfDisp) {
      const st = answers[idx];
      let bi=0;
      let rendered = renderMath(q.text||'');
      rendered = rendered.replace(/\/\?/g, () => {
        const ai2 = bi++;
        if(st) {
          const ca = q.answers?.[ai2]?.text||'';
          const ua = st.userAnswers?.[ai2]||'';
          const ok = normFill(ua)===normFill(ca);
          const display = escHtml(ua)||'&nbsp;';
          return `<span class="mf-blank ${ok?'correct':'wrong'}" title="${ok?'✓ Đúng':'✗ Đáp án: '+escHtml(ca)}">${display}</span>`;
        } else {
          return `<span class="mf-blank empty" id="mf-preview-${idx}-${ai2}">?</span>`;
        }
      });
      mfDisp.innerHTML = rendered;
    }
    if(!answers[idx]) setTimeout(()=>document.getElementById('mf-inp-'+idx+'-0')?.focus(), 50);
  }
  if(q.type!=='fill'&&q.type!=='multifill') {
  display.querySelectorAll('.answer-text[data-text]').forEach(el => {
    applyMath(el, decodeURIComponent(el.dataset.text));
  });
  }
  // Auto focus fill input + set prefill value
  if(q.type==='fill' && !answers[idx]) {
    setTimeout(()=>{
      const inp = document.getElementById('fill-input-'+idx);
      if(!inp) return;
      const pf = inp.dataset.prefill;
      if(pf) { inp.value = pf + ' '; inp.setSelectionRange(inp.value.length, inp.value.length); }
      inp.focus();
    }, 50);
  }
  // Render hint text
  const hintSpan = display.querySelector(`#hint-box-${idx} span[data-hint]`);
  if(hintSpan) applyMath(hintSpan, decodeURIComponent(hintSpan.dataset.hint));
  const explEl = document.getElementById('expl-display-'+idx);
  if(explEl) {
    const prefix = '<strong><i class="fas fa-lightbulb"></i> Giải thích:</strong> ';
    const imgSuffix = explEl.querySelector('img') ? '<br>' + explEl.querySelector('img').outerHTML : '';
    const explText = decodeURIComponent(explEl.dataset.expl);
    // Preserve newlines: split by \n, render each line, join with <br>
    const renderedExpl = explText.split('\n').map(line => renderMath(line)).join('<br>');
    explEl.innerHTML = prefix + renderedExpl + imgSuffix;
  }
}

function updateNavButtons(idx) {
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const isLast = idx === quizQuestions.length-1;
  btnPrev.disabled = idx===0;
  if(isLast) {
    btnNext.disabled = false;
    btnNext.className = 'quiz-nav-btn submit';
    btnNext.innerHTML = '<i class="fas fa-flag-checkered"></i> Nộp bài';
    btnNext.onclick = finishQuiz;
  } else {
    btnNext.className = 'quiz-nav-btn next';
    btnNext.innerHTML = 'Câu tiếp <i class="fas fa-chevron-right"></i>';
    btnNext.onclick = nextQuestion;
    const q = quizQuestions[idx];
    const answered = !!answers[idx];
    if(!answered && (q.type==='fill' || q.type==='multi' || q.type==='multifill')) {
      btnNext.classList.add('needs-confirm');
    }
  }
}

window.selectAnswer = function(qi, ai) {
  const q = quizQuestions[qi];
  if(answers[qi]) return;
  if(q.type==='fill') return; // fill uses submitFill()
  if(q.type==='single') {
    const correct = q.answers[ai].correct;
    answers[qi] = { selected:[ai], correct };
    playTone(correct?'correct':'wrong');
    showQuestion(qi);
    if(correct) spawnConfetti();
    updateSidebarStats();
  } else {
    // multi: highlight selection, user must confirm
    const opt = document.getElementById('opt-'+qi+'-'+ai);
    if(!opt) return;
    if(!window._multiSel) window._multiSel = {};
    if(!window._multiSel[qi]) window._multiSel[qi]=new Set();
    if(window._multiSel[qi].has(ai)) window._multiSel[qi].delete(ai);
    else window._multiSel[qi].add(ai);
    // toggle highlight
    opt.style.borderColor = window._multiSel[qi].has(ai) ? 'var(--accent)' : '';
    opt.style.background = window._multiSel[qi].has(ai) ? 'rgba(108,99,255,.1)' : '';
    // show confirm btn if not already
    if(!document.getElementById('confirm-multi-'+qi)){
      const confirmBtn = document.createElement('button');
      confirmBtn.id='confirm-multi-'+qi;
      confirmBtn.className='save-btn';
      confirmBtn.style.marginTop='10px';
      confirmBtn.style.padding='10px';
      confirmBtn.innerHTML='<i class="fas fa-check"></i> Xác nhận đáp án';
      confirmBtn.onclick=()=>confirmMulti(qi);
      document.querySelector('.question-card').appendChild(confirmBtn);
    }
  }
};

// ===== FILL ANSWER SMART COMPARE ENGINE =====

// Normalize: lowercase, strip Vietnamese accents, strip punctuation, collapse spaces
function normFill(s) {
  if(!s) return '';
  let r = s.toLowerCase();
  r = r.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/\u0111/g,'d');
  r = r.replace(/[.,!?;:'"()\[\]{}\-–—\/\\]/g,' ');
  r = r.replace(/\s+/g,' ').trim();
  return r;
}

// Tokenize preserving original form for display
function tokenize(s) {
  return s.trim().split(/\s+/).filter(Boolean);
}

// Edit distance (Levenshtein) between two strings — for fuzzy token matching
function editDist(a, b) {
  if(a===b) return 0;
  const la=a.length, lb=b.length;
  if(la===0) return lb; if(lb===0) return la;
  const prev=Array.from({length:lb+1},(_,i)=>i);
  for(let i=1;i<=la;i++){
    const cur=[i];
    for(let j=1;j<=lb;j++){
      cur[j]=a[i-1]===b[j-1]?prev[j-1]:1+Math.min(prev[j-1],prev[j],cur[j-1]);
    }
    prev.splice(0,prev.length,...cur);
  }
  return prev[lb];
}

// Fuzzy match: returns similarity 0..1 between two normalized tokens
// Uses edit distance ratio; threshold: ≤30% of longer string's length = match
function fuzzyMatch(na, nb) {
  if(na===nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if(maxLen===0) return 1;
  const dist = editDist(na, nb);
  const sim = 1 - dist/maxLen;
  return sim; // 1=perfect, 0=totally different
}

// Fuzzy token similarity score (0..1): 1 if exact, partial if close enough
function tokenSim(na, nb) {
  const sim = fuzzyMatch(na, nb);
  // Accept as "correct" if sim >= 0.7 (e.g. "woulds"→"would" = 5/6 = 0.83 ✓)
  return sim;
}

// Parse answer template:
//   <keyword>   → keyword for scoring (weight 70%)
//   <*prefix*>  → pre-filled text shown IN the input (user continues typing after it)
//   plain text  → non-keyword (weight 30%)
// Returns { template, keywords, prefill, hasKeywords }
function parseAnswerTemplate(raw) {
  const keywords = new Set();
  let prefill = '';

  // Extract <*...*> pre-fill text (first one wins, stripped from scoring template)
  const withoutPrefill = raw.replace(/<\*([^*>]+)\*>/g, (_, txt) => {
    if(!prefill) prefill = txt; // only first <*...*> is prefill
    return txt; // keep text in template for scoring alignment
  });

  // Build template (strip <> markers, keep text) and collect keywords
  const template = withoutPrefill.replace(/<([^>]+)>/g, (_, kw) => {
    keywords.add(normFill(kw));
    return kw;
  });

  return { template, keywords, hasKeywords: keywords.size > 0, prefill };
}

// Intra-word diff: highlight correct chars green, wrong chars red
// e.g. "woulds" vs "would" → <green>would</green><red>s</red>
function intraWordDiff(userWord, expWord) {
  const u = userWord, e = expWord;
  // Find common prefix
  let pLen = 0;
  while(pLen < u.length && pLen < e.length && u[pLen].toLowerCase()===e[pLen].toLowerCase()) pLen++;
  // Find common suffix (from end, not overlapping prefix)
  let sLen = 0;
  while(sLen < u.length-pLen && sLen < e.length-pLen &&
        u[u.length-1-sLen].toLowerCase()===e[e.length-1-sLen].toLowerCase()) sLen++;

  const prefix  = escHtml(u.slice(0, pLen));
  const uMid    = escHtml(u.slice(pLen, sLen>0 ? u.length-sLen : undefined));
  const eMid    = escHtml(e.slice(pLen, sLen>0 ? e.length-sLen : undefined));
  const suffix  = sLen>0 ? escHtml(u.slice(u.length-sLen)) : '';

  let html = '';
  if(prefix)  html += `<span class="tok-ok">${prefix}</span>`;
  if(uMid)    html += `<span class="tok-err">${uMid}</span>`;
  if(eMid)    html += `<span class="tok-missing">${eMid}</span>`; // expected chars shown faded
  if(suffix)  html += `<span class="tok-ok">${suffix}</span>`;
  return html || `<span class="tok-err">${escHtml(u)}</span>`;
}

// Build hint HTML for display: buildHintHtml is no longer used for visual box,
// prefill is injected directly into the input value instead.
// Keep function for backward compat but return empty.
function buildHintHtml(raw) { return ''; }

// Compute token-level diff between user tokens and expected tokens.
// Returns { html, pct, correct }
// Scoring: keywords worth 70%, non-keywords worth 30% (when hasKeywords)
function computeFillDiff(userText, expectedText, hasKeywords, keywords) {
  const userToks = tokenize(userText);
  const expToks  = tokenize(expectedText);

  const nu = userToks.map(normFill);
  const ne = expToks.map(normFill);

  // Build LCS table using fuzzy equality (sim >= 0.65 = match)
  const U = nu.length, E = ne.length;
  const dp = Array.from({length:U+1}, ()=>new Array(E+1).fill(0));
  for(let i=U-1;i>=0;i--) for(let j=E-1;j>=0;j--) {
    if(tokenSim(nu[i],ne[j])>=0.65) dp[i][j]=dp[i+1][j+1]+1;
    else dp[i][j]=Math.max(dp[i+1][j],dp[i][j+1]);
  }

  // Trace back alignment
  const ops = [];
  let i=0,j=0;
  while(i<U||j<E){
    if(i<U&&j<E&&tokenSim(nu[i],ne[j])>=0.65){
      const sim = tokenSim(nu[i],ne[j]);
      ops.push({type:'ok', tok:userToks[i], expTok:expToks[j], sim});
      i++;j++;
    } else if(j<E&&(i>=U||dp[i][j+1]>=dp[i+1][j])){
      const isKw = !hasKeywords || keywords.has(ne[j]);
      ops.push({type: isKw?'missing':'soft_missing', tok:expToks[j]});
      j++;
    } else {
      const isKw = !hasKeywords;
      ops.push({type: isKw?'extra':'soft', tok:userToks[i]});
      i++;
    }
  }

  // Build HTML and compute score
  let html = '';
  let kwScore=0, kwTotal=0;
  let nonKwScore=0, nonKwTotal=0;

  ops.forEach(op => {
    const t = escHtml(op.tok);
    const isKw = !hasKeywords || keywords.has(normFill(op.expTok||op.tok));
    if(op.type==='ok'){
      const sim = op.sim||1;
      const isPerfect = sim >= 0.99;
      if(isPerfect) {
        html += `<span class="tok-ok">${t}</span> `;
      } else {
        // Near-match: show intra-word diff (green correct part, red wrong part)
        html += intraWordDiff(op.tok, op.expTok) + ' ';
      }
      if(isKw){ kwTotal++; kwScore+=sim; }
      else { nonKwTotal++; nonKwScore+=sim; }
    } else if(op.type==='extra'){
      html += `<span class="tok-extra" title="thừa từ này">${t}</span> `;
      if(isKw) kwTotal++;
      else nonKwTotal++;
    } else if(op.type==='soft'){
      html += `<span class="tok-soft" title="từ thừa (không ảnh hưởng điểm)">${t}</span> `;
    } else if(op.type==='missing'){
      html += `<span class="tok-err" title="thiếu từ này">${t}</span> `;
      if(isKw) kwTotal++;
      else nonKwTotal++;
    } else if(op.type==='soft_missing'){
      html += `<span class="tok-soft" style="opacity:.45" title="thiếu (không quan trọng)">${t}</span> `;
    }
  });

  let pct;
  if(hasKeywords) {
    const kwPct  = kwTotal>0  ? (kwScore/kwTotal)   : 1;
    const nkPct  = nonKwTotal>0 ? (nonKwScore/nonKwTotal) : 1;
    pct = Math.round((kwPct*0.7 + nkPct*0.3) * 100);
  } else {
    const total = kwTotal + nonKwTotal;
    const score = kwScore + nonKwScore;
    pct = total>0 ? Math.round(score/total*100) : 0;
  }
  pct = Math.min(100, Math.max(0, pct));
  const correct = pct >= 100;
  return { html: html.trim(), pct, correct };
}

window.submitFill = function(qi) {
  const input = document.getElementById('fill-input-'+qi);
  if(!input) return;
  const typedText = input.value.trim();
  // prefill is already inside input.value — no need to prepend again
  const userText = typedText;
  if(!userText) { input.focus(); input.style.borderColor='var(--accent)'; return; }

  const q = quizQuestions[qi];
  const correctAnswers = (q.answers||[]).filter(a=>a.correct).map(a=>a.text);

  // Try each accepted answer, pick best score
  let bestPct = 0, bestHtml = '', bestCorrect = false;
  correctAnswers.forEach(raw => {
    const { template, keywords, hasKeywords } = parseAnswerTemplate(raw);
    const { html, pct, correct } = computeFillDiff(userText, template, hasKeywords, keywords);
    if(pct > bestPct || (pct===bestPct && correct)) {
      bestPct = pct; bestHtml = html; bestCorrect = correct || pct >= 100;
    }
  });
  // 100% = correct for scoring
  const finalCorrect = bestPct >= 100;
  answers[qi] = { selected:[], correct: finalCorrect, userText, diffHtml: bestHtml, pct: bestPct };
  playTone(finalCorrect ? 'correct' : 'wrong');
  showQuestion(qi);
  if(finalCorrect) spawnConfetti();
  updateSidebarStats();
};

window.confirmMulti = function(qi) {
  const q = quizQuestions[qi];
  const sel = window._multiSel?.[qi] ? [...window._multiSel[qi]] : [];
  const correctIdxs = q.answers.map((a,i)=>a.correct?i:-1).filter(i=>i>=0);
  const correct = sel.length===correctIdxs.length && correctIdxs.every(i=>sel.includes(i));
  answers[qi] = { selected:sel, correct };
  if(window._multiSel) delete window._multiSel[qi];
  playTone(correct?'correct':'wrong');
  showQuestion(qi);
  if(correct) spawnConfetti();
  updateSidebarStats();
};

window.undoAnswer = function(qi) {
  if(!answers[qi]) return;
  delete answers[qi];
  if(window._multiSel) delete window._multiSel[qi];
  showQuestion(qi);
  updateSidebarStats();
  updateNavItem(qi);
};

// ===== LIKE / DISLIKE REACTIONS =====
window.reactQuestion = function(qi, type) {
  const prev = questionReactions[qi];
  // Toggle off if same
  questionReactions[qi] = (prev === type) ? null : type;
  // Update buttons in-place without re-rendering whole question
  const likeBtn = document.getElementById('react-like-'+qi);
  const dislikeBtn = document.getElementById('react-dislike-'+qi);
  if(likeBtn) likeBtn.className = 'q-react-btn' + (questionReactions[qi]==='like' ? ' liked' : '');
  if(dislikeBtn) dislikeBtn.className = 'q-react-btn' + (questionReactions[qi]==='dislike' ? ' disliked' : '');
};

// ===== RATING SYSTEM =====
let _currentRatingVal = 0;

function openRatingModal(quizId, likedQs) {
  _currentRatingVal = 0;
  const quiz = quizzesCache[quizId];
  document.getElementById('rating-quiz-name').textContent = quiz?.name || 'Bộ đề này';
  document.getElementById('rating-comment').value = '';
  // Reset stars
  document.querySelectorAll('.rating-star').forEach(s => { s.classList.remove('active'); s.style.color = ''; });
  // Liked/disliked summary
  const summaryEl = document.getElementById('rating-liked-summary');
  const likes = likedQs.filter(r => r.reaction === 'like');
  const dislikes = likedQs.filter(r => r.reaction === 'dislike');
  let summaryHtml = '';
  if(likes.length > 0 || dislikes.length > 0) {
    summaryHtml = '<div class="liked-qs-section">';
    if(likes.length > 0) {
      summaryHtml += `<div class="liked-qs-title"><i class="fas fa-thumbs-up" style="color:var(--accent2)"></i> Câu hay (${likes.length}):</div>`;
      likes.forEach(r => {
        summaryHtml += `<div class="liked-q-item like"><i class="fas fa-check" style="color:var(--accent2);flex-shrink:0;margin-top:2px"></i><span>${escHtml(r.text)}</span></div>`;
      });
    }
    if(dislikes.length > 0) {
      summaryHtml += `<div class="liked-qs-title" style="margin-top:6px"><i class="fas fa-thumbs-down" style="color:var(--wrong)"></i> Câu Dở (${dislikes.length}):</div>`;
      dislikes.forEach(r => {
        summaryHtml += `<div class="liked-q-item dislike"><i class="fas fa-exclamation" style="color:var(--wrong);flex-shrink:0;margin-top:2px"></i><span>${escHtml(r.text)}</span></div>`;
      });
    }
    summaryHtml += '</div>';
  }
  summaryEl.innerHTML = summaryHtml;
  // Show the panel
  document.getElementById('rating-panel').classList.remove('hidden');
  // Star click handlers
  document.querySelectorAll('.rating-star').forEach(star => {
    star.onclick = () => {
      _currentRatingVal = parseInt(star.dataset.val);
      document.querySelectorAll('.rating-star').forEach((s, i) => {
        s.classList.toggle('active', i < _currentRatingVal);
        s.style.color = i < _currentRatingVal ? 'var(--accent4)' : '';
      });
    };
    star.onmouseenter = () => {
      const v = parseInt(star.dataset.val);
      document.querySelectorAll('.rating-star').forEach((s, i) => {
        s.style.color = i < v ? 'var(--accent4)' : (i < _currentRatingVal ? 'var(--accent4)' : '');
      });
    };
    star.onmouseleave = () => {
      document.querySelectorAll('.rating-star').forEach((s, i) => {
        s.style.color = i < _currentRatingVal ? 'var(--accent4)' : '';
      });
    };
  });
}

window.skipRating = function() {
  document.getElementById('rating-panel').classList.add('hidden');
};

window.submitRating = async function() {
  const quizId = currentQuizMeta?.id;
  if(!quizId) return;
  const stars = _currentRatingVal;
  const comment = document.getElementById('rating-comment').value.trim();
  if(stars === 0) {
    showToast('Hãy chọn số sao đánh giá!', 'error');
    return;
  }
  // Build liked questions list
  const likedQs = buildReactionList();
  const entry = {
    stars,
    comment,
    likedQs,
    ts: Date.now(),
    user: getCurrentUser() || 'anonymous'
  };
  try {
    await push(ref(db, 'app_data/ratings/'+quizId), entry);
  } catch(e) {
    const data = JSON.parse(localStorage.getItem('qm_ratings')||'{}');
    if(!data[quizId]) data[quizId] = [];
    data[quizId].push(entry);
    localStorage.setItem('qm_ratings', JSON.stringify(data));
  }
  document.getElementById('rating-panel').classList.add('hidden');
  showToast('Cảm ơn bạn đã đánh giá! ⭐', 'success');
};

function buildReactionList() {
  return Object.entries(questionReactions)
    .filter(([, r]) => r !== null)
    .map(([qi, reaction]) => {
      const q = quizQuestions[parseInt(qi)];
      const text = (q?.text||'').substring(0, 80);
      // Try to find the original index in the unshuffled quiz for reliable edit navigation
      const origQuestions = currentQuizMeta ? (quizzesCache[currentQuizMeta.id]?.questions || []) : [];
      const origIdx = origQuestions.findIndex(oq => oq.text === q?.text);
      return {
        qi: origIdx >= 0 ? origIdx : parseInt(qi), // prefer original index
        text,
        reaction
      };
    });
}

async function showRatingsForQuiz(quizId) {
  let entries = [];
  try {
    const snap = await get(ref(db, 'app_data/ratings/'+quizId));
    const val = snap.val();
    if(val && typeof val === 'object') {
      entries = Object.entries(val).map(([k,v])=>({key:k, data:v})).sort((a,b)=>b.data.ts-a.data.ts);
    }
  } catch(e) {
    const data = JSON.parse(localStorage.getItem('qm_ratings')||'{}');
    entries = (data[quizId]||[]).slice().reverse().map((v,i)=>({key:String(i),data:v}));
  }
  return entries;
}

window.switchHistoryTab = function(tab) {
  const tabHistory = document.getElementById('history-tab-history');
  const tabRatings = document.getElementById('history-tab-ratings');
  const btnHistory = document.getElementById('htab-history');
  const btnRatings = document.getElementById('htab-ratings');
  if(tab === 'history') {
    tabHistory.style.display = ''; tabRatings.style.display = 'none';
    btnHistory.style.cssText = 'padding:5px 14px;border-radius:var(--radius-sm);border:1px solid var(--accent);background:rgba(108,99,255,.12);color:var(--accent);font-size:.82rem;cursor:pointer;font-family:\'DM Sans\',sans-serif;transition:all .2s';
    btnRatings.style.cssText = 'padding:5px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);background:transparent;color:var(--text2);font-size:.82rem;cursor:pointer;font-family:\'DM Sans\',sans-serif;transition:all .2s';
  } else {
    tabHistory.style.display = 'none'; tabRatings.style.display = '';
    btnRatings.style.cssText = 'padding:5px 14px;border-radius:var(--radius-sm);border:1px solid var(--accent);background:rgba(108,99,255,.12);color:var(--accent);font-size:.82rem;cursor:pointer;font-family:\'DM Sans\',sans-serif;transition:all .2s';
    btnHistory.style.cssText = 'padding:5px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);background:transparent;color:var(--text2);font-size:.82rem;cursor:pointer;font-family:\'DM Sans\',sans-serif;transition:all .2s';
    // Lazy load ratings
    loadRatingsTab(_currentHistoryQuizId);
  }
};

async function loadRatingsTab(quizId) {
  const el = document.getElementById('ratings-modal-entries');
  el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';
  const entries = await showRatingsForQuiz(quizId);
  if(entries.length === 0) {
    el.innerHTML = '<div class="history-empty"><i class="fas fa-star" style="font-size:2rem;display:block;margin-bottom:8px"></i>Chưa có đánh giá nào</div>';
    return;
  }
  // Tổng hợp sao
  const avg = entries.reduce((s, e) => s + (e.data.stars||0), 0) / entries.length;
  const starsStr = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));
  el.innerHTML = `<div style="text-align:center;padding:10px 0 16px;border-bottom:1px solid var(--border);margin-bottom:12px">
    <div style="font-size:1.5rem;color:var(--accent4);letter-spacing:4px">${starsStr}</div>
    <div style="font-size:.85rem;color:var(--text2);margin-top:4px">${avg.toFixed(1)} / 5 &nbsp;·&nbsp; ${entries.length} đánh giá</div>
  </div>` + entries.map(item => {
    const en = item.data;
    const date = new Date(en.ts);
    const dateStr = date.toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit', year:'numeric'});
    const starsHtml = '★'.repeat(en.stars||0) + '☆'.repeat(5-(en.stars||0));
    const likes = (en.likedQs||[]).filter(r=>r.reaction==='like');
    const dislikes = (en.likedQs||[]).filter(r=>r.reaction==='dislike');
    let reactSummary = '';
    if(likes.length > 0) reactSummary += `<div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:4px;align-items:center"><span style="font-size:.7rem;color:var(--accent2);flex-shrink:0"><i class="fas fa-thumbs-up"></i></span>${likes.map(r=>`<span onclick="openQuizEditAtQuestion('${quizId}',${r.qi})" title="Nhấn để chỉnh sửa câu này" style="font-size:.7rem;padding:2px 8px;border-radius:12px;background:rgba(0,212,170,.1);border:1px solid var(--accent2);color:var(--accent2);cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(0,212,170,.25)'" onmouseout="this.style.background='rgba(0,212,170,.1)'">${escHtml((r.text||'').substring(0,40)+((r.text||'').length>40?'…':''))}</span>`).join('')}</div>`;
    if(dislikes.length > 0) reactSummary += `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;align-items:center"><span style="font-size:.7rem;color:var(--wrong);flex-shrink:0"><i class="fas fa-thumbs-down"></i></span>${dislikes.map(r=>`<span onclick="openQuizEditAtQuestion('${quizId}',${r.qi})" title="Nhấn để chỉnh sửa câu này" style="font-size:.7rem;padding:2px 8px;border-radius:12px;background:rgba(255,107,107,.1);border:1px solid var(--wrong);color:var(--wrong);cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(255,107,107,.25)'" onmouseout="this.style.background='rgba(255,107,107,.1)'">${escHtml((r.text||'').substring(0,40)+((r.text||'').length>40?'…':''))}</span>`).join('')}</div>`;
    return `<div class="history-entry" id="rating-entry-${item.key}" style="align-items:flex-start">
      <div style="flex:1">
        <div style="color:var(--accent4);font-size:1rem;letter-spacing:2px">${starsHtml}</div>
        ${en.comment ? `<div style="margin-top:4px;font-size:.85rem;color:var(--text);font-style:italic">"${escHtml(en.comment)}"</div>` : ''}
        ${reactSummary}
        <div style="margin-top:5px;font-size:.72rem;color:var(--text3)"><i class="fas fa-calendar-alt"></i> ${dateStr}</div>
      </div>
      <button onclick="promptDeleteRatingEntry('${quizId}','${item.key}')" style="width:22px;height:22px;border-radius:50%;border:1px solid var(--border);background:var(--bg3);color:var(--text3);cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;margin-left:8px" title="Xóa đánh giá này" onmouseover="this.style.background='var(--wrong)';this.style.color='#fff'" onmouseout="this.style.background='var(--bg3)';this.style.color='var(--text3)'"><i class="fas fa-times"></i></button>
    </div>`;
  }).join('');
}

window.promptDeleteRatingEntry = function(quizId, entryKey) {
  openPwdModal(
    'Xóa đánh giá này',
    'Nhập mật khẩu để xóa đánh giá này.',
    async () => {
      try { await remove(ref(db, `app_data/ratings/${quizId}/${entryKey}`)); } catch(e2) {}
      document.getElementById('rating-entry-'+entryKey)?.remove();
      const remaining = document.querySelectorAll('#ratings-modal-entries .history-entry');
      if(!remaining.length) {
        document.getElementById('ratings-modal-entries').innerHTML =
          '<div class="history-empty"><i class="fas fa-star" style="font-size:2rem;display:block;margin-bottom:8px"></i>Chưa có đánh giá nào</div>';
      }
      showToast('Đã xóa đánh giá', 'success');
    }
  );
};

window.promptClearRatings = function() {
  if(!_currentHistoryQuizId) return;
  const quiz = quizzesCache[_currentHistoryQuizId];
  openPwdModal(
    'Xóa tất cả đánh giá',
    `Xóa toàn bộ đánh giá của "${quiz?.name||'bộ đề này'}"? Không thể hoàn tác.`,
    async () => {
      try { await remove(ref(db, 'app_data/ratings/'+_currentHistoryQuizId)); } catch(e) {}
      const data = JSON.parse(localStorage.getItem('qm_ratings')||'{}');
      delete data[_currentHistoryQuizId];
      localStorage.setItem('qm_ratings', JSON.stringify(data));
      showToast('Đã xóa tất cả đánh giá', 'success');
      document.getElementById('ratings-modal-entries').innerHTML =
        '<div class="history-empty"><i class="fas fa-star" style="font-size:2rem;display:block;margin-bottom:8px"></i>Chưa có đánh giá nào</div>';
    }
  );
};

// ===== JUMP TO QUESTION IN EDIT FORM =====
// qi here is the shuffled session index stored in reactions — we match by question text
// against the original (unshuffled) quiz questions array
window.openQuizEditAtQuestion = function(quizId, sessionQi) {
  const quiz = quizzesCache[quizId];
  if(!quiz) { showToast('Không tìm thấy bộ đề', 'error'); return; }

  // The sessionQi is the index in quizQuestions (shuffled during play).
  // We need to find the matching question in the original array via text match.
  // quizQuestions may no longer exist (different session), so we rely on
  // the text stored in the reaction entry — but we don't have it here.
  // Instead: open the quiz in edit mode, then scroll to the question whose
  // index in the ORIGINAL array matches. If qi < original length, use it directly.
  const origQuestions = quiz.questions || [];
  const targetOrigIdx = Math.min(sessionQi, origQuestions.length - 1);

  // Close history modal
  document.getElementById('history-modal').classList.remove('visible');

  // Open edit form (reuses editQuiz)
  editQuiz(quizId);

  // After render, scroll to and highlight the target question
  setTimeout(() => {
    const rowEl = document.getElementById('q-row-' + targetOrigIdx) ||
                  document.getElementById('q-item-' + targetOrigIdx);
    if(rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flash highlight
      const item = document.getElementById('q-item-' + targetOrigIdx);
      if(item) {
        item.style.transition = 'box-shadow .3s, border-color .3s';
        item.style.boxShadow = '0 0 0 3px var(--accent)';
        item.style.borderColor = 'var(--accent)';
        setTimeout(() => {
          item.style.boxShadow = '';
          item.style.borderColor = '';
        }, 2200);
      }
    } else {
      showToast('Không tìm thấy câu hỏi (có thể đã được sắp xếp lại)', 'error');
    }
  }, 320);
};

// ===== HINT =====
window.toggleHint = function(idx) {
  const box = document.getElementById('hint-box-'+idx);
  const btn = document.querySelector(`#hint-area-${idx} .hint-btn`);
  if(!box) return;
  const open = box.style.display !== 'none';
  box.style.display = open ? 'none' : '';
  if(btn) btn.innerHTML = open
    ? '<i class="fas fa-lightbulb"></i> Gợi ý'
    : '<i class="fas fa-lightbulb"></i> Ẩn gợi ý';
};

// ===== SORT MODE =====
let _sortMode = false;
let _sortDragId = null;
let _quizOrder = []; // array of firebase IDs in display order

function getQuizOrder() {
  // Use stored order or fall back to Object.keys order
  const stored = JSON.parse(localStorage.getItem('qm_quiz_order')||'null');
  const allIds = Object.keys(quizzesCache);
  if(stored && Array.isArray(stored)) {
    // Merge: keep stored order for existing ids, append any new ones
    const ordered = stored.filter(id => allIds.includes(id));
    allIds.forEach(id => { if(!ordered.includes(id)) ordered.push(id); });
    return ordered;
  }
  return allIds;
}

let _suppressOrderUpdate = false;

async function saveQuizOrder(order) {
  _quizOrder = order;
  localStorage.setItem('qm_quiz_order', JSON.stringify(order));
  _suppressOrderUpdate = true;
  try { await set(ref(db, 'app_data/quiz_order'), order); } catch(e) { console.warn('saveOrder err', e); }
  setTimeout(() => { _suppressOrderUpdate = false; }, 2000);
}

function subscribeQuizOrder() {
  onValue(ref(db, 'app_data/quiz_order'), snap => {
    if(_suppressOrderUpdate) return;
    const val = snap.val();
    if(val && Array.isArray(val)) {
      localStorage.setItem('qm_quiz_order', JSON.stringify(val));
      _quizOrder = val;
    }
    renderQuizGrid();
  });
}

window.toggleSortMode = function() {
  _sortMode = !_sortMode;
  const banner = document.getElementById('sort-mode-banner');
  const btn = document.getElementById('drag-sort-btn');
  const grid = document.getElementById('quiz-grid');
  if(banner) banner.classList.toggle('visible', _sortMode);
  if(btn) btn.classList.toggle('active', _sortMode);
  if(grid) grid.classList.toggle('sort-mode', _sortMode);
  // add/remove drag handles visibility already handled by CSS .sort-mode .sort-handle
};

window.exitSortMode = function() {
  _sortMode = false;
  const banner = document.getElementById('sort-mode-banner');
  const btn = document.getElementById('drag-sort-btn');
  const grid = document.getElementById('quiz-grid');
  if(banner) banner.classList.remove('visible');
  if(btn) btn.classList.remove('active');
  if(grid) grid.classList.remove('sort-mode');
};

// Attach drag events to a card
function attachDragSort(card, id) {
  card.setAttribute('draggable','true');
  card.addEventListener('dragstart', e => {
    _sortDragId = id;
    card.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.style.opacity = '';
    document.querySelectorAll('.quiz-card').forEach(c => c.classList.remove('drag-over'));
  });
  card.addEventListener('dragover', e => {
    if(!_sortMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.quiz-card').forEach(c => c.classList.remove('drag-over'));
    card.classList.add('drag-over');
  });
  card.addEventListener('drop', async e => {
    e.preventDefault();
    if(!_sortDragId || _sortDragId === id) return;
    card.classList.remove('drag-over');
    // Reorder
    const order = getQuizOrder();
    const fromIdx = order.indexOf(_sortDragId);
    const toIdx   = order.indexOf(id);
    if(fromIdx === -1 || toIdx === -1) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, _sortDragId);
    // Optimistic local re-order without waiting for Firebase onValue
    _quizOrder = order;
    localStorage.setItem('qm_quiz_order', JSON.stringify(order));
    _doRenderQuizGrid(); // immediate local render
    saveQuizOrder(order); // fire-and-forget to Firebase (onValue won't double-render since debounced)
  });
}

window.prevQuestion = function() { if(currentQIndex>0){ showQuestion(currentQIndex-1); } };
// Fix 5+6: called by arrow key right
window.nextOrSubmit = function() {
  if(currentQIndex===quizQuestions.length-1) finishQuiz();
  else nextQuestion();
};
window.nextQuestion = function() { if(currentQIndex<quizQuestions.length-1){ showQuestion(currentQIndex+1); } };

function updateProgress() {
  const done = Object.keys(answers).length;
  const total = quizQuestions.length;
  document.getElementById('q-progress-text').textContent = `${done}/${total}`;
  document.getElementById('q-progress-bar').style.width = (done/total*100)+'%';
}

// ===== NAV GRID =====
function renderNavGrid() {
  const grid = document.getElementById('nav-grid');
  grid.innerHTML = '';
  quizQuestions.forEach((_, i) => {
    const item = document.createElement('div');
    item.className = 'nav-item unseen';
    item.id = 'nav-'+i;
    item.textContent = i+1;
    item.title = `Câu ${i+1}`;
    item.onclick = () => showQuestion(i);
    grid.appendChild(item);
  });
}

function updateNavItem(i) {
  const item = document.getElementById('nav-'+i);
  if(!item) return;
  item.classList.remove('unseen','current','correct','wrong');
  if(answers[i]) item.classList.add(answers[i].correct?'correct':'wrong');
  else item.classList.add('current');
}

function updateSidebarStats() {
  let correct=0, wrong=0;
  Object.values(answers).forEach(a=>{
    if(a.correct) correct++;
    else if(a.pct !== undefined) {
      // fill question: count as partial — show in correct proportionally (visual only)
      correct += a.pct/100;
      if(a.pct < 100) wrong += 1 - a.pct/100;
    } else wrong++;
  });
  document.getElementById('s-correct').textContent = Number.isInteger(correct) ? correct : correct.toFixed(1);
  document.getElementById('s-wrong').textContent = Number.isInteger(wrong) ? wrong : wrong.toFixed(1);
  document.getElementById('s-unseen').textContent = quizQuestions.length - Object.keys(answers).length;
}

// ===== SIDEBAR TOGGLE =====
window.toggleSidebar = function() {
  sidebarVisible = !sidebarVisible;
  updateSidebarVisibility();
};
window.toggleMobileSidebar = function() {
  const sb = document.getElementById('quiz-sidebar');
  sb.classList.toggle('mobile-visible');
};
// Unified close: on mobile closes mobile panel, on desktop hides sidebar
window.closeSidebar = function() {
  const isMobile = window.innerWidth <= 768;
  if(isMobile) {
    document.getElementById('quiz-sidebar').classList.remove('mobile-visible');
  } else {
    sidebarVisible = false;
    updateSidebarVisibility();
  }
};
function updateSidebarVisibility() {
  const sb = document.getElementById('quiz-sidebar');
  if(sidebarVisible) sb.classList.remove('hidden');
  else sb.classList.add('hidden');
}

// ===== SESSION TRACKING (Firebase-backed) =====
let _sessionsCache = {};
let _suppressSessionsUpdate = false;

function subscribeSessions() {
  onValue(ref(db, 'app_data/sessions'), snap => {
    if(_suppressSessionsUpdate) return;
    const val = snap.val();
    if(val && typeof val === 'object') {
      _sessionsCache = val;
      // Migrate old localStorage data on first load
      const local = JSON.parse(localStorage.getItem('qm_sessions') || '{}');
      let needMigrate = false;
      Object.entries(local).forEach(([id, cnt]) => {
        if(!_sessionsCache[id] && cnt > 0) { _sessionsCache[id] = cnt; needMigrate = true; }
      });
      if(needMigrate) set(ref(db, 'app_data/sessions'), _sessionsCache).catch(()=>{});
    } else {
      // Migrate from localStorage
      const local = JSON.parse(localStorage.getItem('qm_sessions') || '{}');
      if(Object.keys(local).length > 0) {
        _sessionsCache = local;
        set(ref(db, 'app_data/sessions'), local).catch(()=>{});
      }
    }
    renderQuizGrid();
  });
}

function getSessionCount(quizId) {
  return _sessionsCache[quizId] || 0;
}

// Track last played timestamp per quiz (for NEW badge) — Firebase backed
let _lastPlayedCache = {};
let _suppressLastPlayedUpdate = false;

function subscribeLastPlayed() {
  onValue(ref(db, 'app_data/last_played'), snap => {
    if(_suppressLastPlayedUpdate) return;
    const val = snap.val();
    if(val && typeof val === 'object') {
      _lastPlayedCache = val;
      // Migrate old localStorage data
      const local = JSON.parse(localStorage.getItem('qm_last_played')||'{}');
      let needMigrate = false;
      Object.entries(local).forEach(([id, ts]) => {
        if(!_lastPlayedCache[id] && ts > 0) { _lastPlayedCache[id] = ts; needMigrate = true; }
      });
      if(needMigrate) set(ref(db, 'app_data/last_played'), _lastPlayedCache).catch(()=>{});
      renderQuizGrid();
    } else {
      const local = JSON.parse(localStorage.getItem('qm_last_played')||'{}');
      if(Object.keys(local).length > 0) {
        _lastPlayedCache = local;
        set(ref(db, 'app_data/last_played'), local).catch(()=>{});
      }
    }
  });
}
function getLastPlayedTime(quizId) {
  return _lastPlayedCache[quizId] || 0;
}
function setLastPlayedTime(quizId) {
  _lastPlayedCache[quizId] = Date.now();
  localStorage.setItem('qm_last_played', JSON.stringify(_lastPlayedCache));
  _suppressLastPlayedUpdate = true;
  set(ref(db, 'app_data/last_played/'+quizId), _lastPlayedCache[quizId]).catch(()=>{});
  setTimeout(() => { _suppressLastPlayedUpdate = false; }, 2000);
}
async function incrementSession(quizId) {
  _sessionsCache[quizId] = (_sessionsCache[quizId] || 0) + 1;
  _suppressSessionsUpdate = true;
  try { await set(ref(db, 'app_data/sessions/'+quizId), _sessionsCache[quizId]); } catch(e) {
    // fallback localStorage
    const data = JSON.parse(localStorage.getItem('qm_sessions')||'{}');
    data[quizId] = _sessionsCache[quizId];
    localStorage.setItem('qm_sessions', JSON.stringify(data));
  }
  setTimeout(() => { _suppressSessionsUpdate = false; }, 2000);
}

// ===== QUIZ HISTORY =====
async function saveQuizHistory(quizId, entry) {
  try {
    await push(ref(db, 'app_data/history/'+quizId), entry);
  } catch(e) {
    // fallback localStorage
    const data = JSON.parse(localStorage.getItem('qm_history')||'{}');
    if(!data[quizId]) data[quizId] = [];
    data[quizId].push(entry);
    localStorage.setItem('qm_history', JSON.stringify(data));
  }
}

window.showQuizHistory = async function(quizId, e) {
  if(e) e.stopPropagation();
  _currentHistoryQuizId = quizId;
  const quiz = quizzesCache[quizId];
  const modal = document.getElementById('history-modal');
  const nameEl = document.getElementById('history-modal-quiz-name');
  const entriesEl = document.getElementById('history-modal-entries');
  nameEl.textContent = quiz?.name || 'Bộ đề';
  entriesEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';
  modal.classList.add('visible');
  // Always reset to history tab
  switchHistoryTab('history');

  let entries = []; // [{key, data}]
  try {
    const snap = await get(ref(db, 'app_data/history/'+quizId));
    const val = snap.val();
    if(val && typeof val === 'object') {
      entries = Object.entries(val)
        .map(([k, v]) => ({key: k, data: v}))
        .sort((a,b) => b.data.ts - a.data.ts);
    }
  } catch(e) {
    const data = JSON.parse(localStorage.getItem('qm_history')||'{}');
    entries = (data[quizId]||[]).slice().reverse().map((v, i) => ({key: String(i), data: v}));
  }

  renderHistoryEntries(quizId, entries);
};

function renderHistoryEntries(quizId, entries) {
  const entriesEl = document.getElementById('history-modal-entries');
  if(entries.length === 0) {
    entriesEl.innerHTML = '<div class="history-empty"><i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:8px"></i>Chưa có lần làm nào được ghi lại</div>';
    return;
  }

  entriesEl.innerHTML = entries.map((item) => {
    const en = item.data;
    const date = new Date(en.ts);
    const dateStr = date.toLocaleDateString('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric'});
    const timeStr = date.toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'});
    const m = Math.floor((en.timeUsedSec||0)/60), s = (en.timeUsedSec||0)%60;
    const durStr = `${m} phút ${s} giây`;
    const scoreClass = en.pct>=70 ? 'good' : en.pct>=50 ? 'ok' : 'bad';
    const passClass = en.pct>=50 ? 'pass' : 'fail';
    const passLabel = en.pct>=50 ? 'Đạt' : 'Chưa đạt';
    // Liked/disliked questions summary
    const likedQs = en.likedQs || [];
    const likes = likedQs.filter(r => r.reaction === 'like');
    const dislikes = likedQs.filter(r => r.reaction === 'dislike');
    let reactSummary = '';
    if(likes.length > 0) reactSummary += `<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center"><span style="font-size:.7rem;color:var(--accent2);flex-shrink:0"><i class="fas fa-thumbs-up"></i></span>${likes.map(r=>`<span onclick="openQuizEditAtQuestion('${quizId}',${r.qi})" title="Nhấn để chỉnh sửa câu này" style="font-size:.7rem;padding:2px 7px;border-radius:12px;background:rgba(0,212,170,.1);border:1px solid var(--accent2);color:var(--accent2);cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(0,212,170,.25)'" onmouseout="this.style.background='rgba(0,212,170,.1)'">${escHtml((r.text||'').substring(0,35)+((r.text||'').length>35?'…':''))}</span>`).join('')}</div>`;
    if(dislikes.length > 0) reactSummary += `<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center"><span style="font-size:.7rem;color:var(--wrong);flex-shrink:0"><i class="fas fa-thumbs-down"></i></span>${dislikes.map(r=>`<span onclick="openQuizEditAtQuestion('${quizId}',${r.qi})" title="Nhấn để chỉnh sửa câu này" style="font-size:.7rem;padding:2px 7px;border-radius:12px;background:rgba(255,107,107,.1);border:1px solid var(--wrong);color:var(--wrong);cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(255,107,107,.25)'" onmouseout="this.style.background='rgba(255,107,107,.1)'">${escHtml((r.text||'').substring(0,35)+((r.text||'').length>35?'…':''))}</span>`).join('')}</div>`;
    return `<div class="history-entry" id="hentry-${item.key}">
      <div style="flex:1">
        <div class="history-entry-time"><i class="fas fa-calendar-alt"></i>${dateStr} &nbsp;<i class="fas fa-clock"></i>${timeStr}</div>
        <div class="history-entry-meta"><i class="fas fa-check-circle" style="color:var(--correct)"></i> ${en.correct} đúng &nbsp; <i class="fas fa-times-circle" style="color:var(--wrong)"></i> ${en.wrong} sai &nbsp; / ${en.total} câu</div>
        <div class="history-entry-duration"><i class="fas fa-stopwatch"></i> ${durStr}</div>
        ${reactSummary ? `<div style="margin-top:5px;display:flex;flex-direction:column;gap:3px">${reactSummary}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <button onclick="promptDeleteHistoryEntry('${quizId}','${item.key}')" style="width:22px;height:22px;border-radius:50%;border:1px solid var(--border);background:var(--bg3);color:var(--text3);cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s" title="Xóa lần này" onmouseover="this.style.background='var(--wrong)';this.style.color='#fff'" onmouseout="this.style.background='var(--bg3)';this.style.color='var(--text3)'"><i class="fas fa-times"></i></button>
        <div class="history-entry-score ${scoreClass}">${en.pct}%</div>
        <div class="history-badge ${passClass}">${passLabel}</div>
      </div>
    </div>`;
  }).join('');
}

window.finishQuiz = function() {
  const total = quizQuestions.length;
  const done = Object.keys(answers).length;
  const unanswered = total - done;
  const descEl = document.getElementById('submit-confirm-desc');
  if(unanswered > 0) {
    descEl.innerHTML = `Bạn còn <strong style="color:var(--accent4)">${unanswered}</strong> câu chưa trả lời. Bạn có chắc muốn nộp bài không?`;
  } else {
    descEl.innerHTML = `Bạn đã trả lời hết <strong style="color:var(--correct)">${total}</strong> câu. Xác nhận nộp bài?`;
  }
  document.getElementById('submit-confirm-modal').classList.add('visible');
};

window.doFinishQuiz = async function() {
  document.getElementById('submit-confirm-modal').classList.remove('visible');
  clearInterval(timerInterval);

  const total = quizQuestions.length;
  let scoreSum = 0; // sum of per-question scores (0..1 each)
  let correctCount = 0, wrongCount = 0, partialCount = 0;

  Object.entries(answers).forEach(([idx, a]) => {
    const q = quizQuestions[parseInt(idx)];
    if(q && q.type === 'fill' && a.pct !== undefined) {
      const s = a.pct / 100;
      scoreSum += s;
      if(a.pct >= 100) correctCount++;
      else if(a.pct > 0) { partialCount++; wrongCount++; } // partial = wrong for count but adds to score
      else wrongCount++;
    } else {
      if(a.correct) { scoreSum += 1; correctCount++; }
      else wrongCount++;
    }
  });

  const pct = total > 0 ? Math.round(scoreSum / total * 100) : 0;
  const timeLimitSec = (currentQuizMeta?.settings?.timeLimit||30)*60;
  const timeUsedSec = timeLimitSec - timeLeft;

  document.getElementById('result-score').textContent = pct+'%';
  document.getElementById('r-correct').textContent = correctCount + (partialCount > 0 ? ` (+${partialCount} gần đúng)` : '');
  document.getElementById('r-wrong').textContent = wrongCount;
  document.getElementById('r-total').textContent = total;

  let emoji='😐', grade='Cần cố gắng thêm';
  if(pct>=90){ emoji='🏆'; grade='Xuất sắc!'; }
  else if(pct>=70){ emoji='🎉'; grade='Giỏi!'; }
  else if(pct>=50){ emoji='👍'; grade='Khá!'; }
  document.getElementById('result-emoji').textContent=emoji;
  document.getElementById('result-grade').textContent=grade;
  document.getElementById('result-overlay').classList.add('visible');
  if(pct>=70) spawnConfetti(30);

  if(currentQuizMeta?.id) {
    await incrementSession(currentQuizMeta.id);
    setLastPlayedTime(currentQuizMeta.id);
    const likedQs = buildReactionList();
    await saveQuizHistory(currentQuizMeta.id, {
      correct: correctCount, wrong: wrongCount, total, pct, timeUsedSec, ts: Date.now(),
      likedQs
    });
    renderQuizGrid();
    // Show rating modal after a short delay
    setTimeout(() => openRatingModal(currentQuizMeta.id, likedQs), 600);
  }
};

window.retryQuiz = function() {
  document.getElementById('result-overlay').classList.remove('visible');
  document.getElementById('rating-panel').classList.add('hidden');
  if(currentQuizMeta?.id) startQuiz(currentQuizMeta.id);
};
window.reviewQuiz = function() {
  document.getElementById('result-overlay').classList.remove('visible');
  document.getElementById('rating-panel').classList.add('hidden');
  isReviewMode = true;
  showQuestion(0);
};
window.exitQuiz = function() {
  clearInterval(timerInterval);
  document.getElementById('result-overlay').classList.remove('visible');
  document.getElementById('rating-panel').classList.add('hidden');
  document.getElementById('quiz-sidebar').classList.remove('mobile-visible');
  showPage('home');
};

// ===== INLINE EDIT =====
window.openInlineEdit = function(qi) {
  // find original question in the quiz
  const q = quizQuestions[qi];
  inlineEditQIndex = qi;
  // create temp edit copy
  editQuestions = [JSON.parse(JSON.stringify(q))];
  const content = document.getElementById('inline-edit-content');
  content.innerHTML = '';
  renderQuestionItem(editQuestions[0], 0, content, true);
  // Reset button state
  const inlineBtn = document.getElementById('inline-save-btn');
  if(inlineBtn) {
    inlineBtn.disabled = false;
    inlineBtn.innerHTML = '<i class="fas fa-save"></i> Lưu thay đổi';
  }
  document.getElementById('inline-edit-overlay').classList.add('visible');
};
window.closeInlineEdit = function() {
  document.getElementById('inline-edit-overlay').classList.remove('visible');
  inlineEditQIndex = null;
  editQuestions = [];
};
window.saveInlineEdit = async function() {
  const qi = inlineEditQIndex;
  if(qi===null||!editQuestions[0]) return;
  const inlineBtn = document.getElementById('inline-save-btn');
  const setInlineBtn = (disabled, html) => { if(inlineBtn){ inlineBtn.disabled=disabled; inlineBtn.innerHTML=html; } };
  setInlineBtn(true, '<div class="spinner"></div> Đang lưu...');
  const updated = editQuestions[0];
  const meta = currentQuizMeta;

  // Update locally in quizQuestions (shuffled session copy)
  quizQuestions[qi] = updated;

  // Reset UI after 0.5s
  const uiResetTimer = setTimeout(() => {
    console.log('🔔 UI reset timer fired at:', new Date().toLocaleTimeString());
    try {
      setInlineBtn(false, '<i class="fas fa-save"></i> Lưu thay đổi');
      delete answers[qi];
      closeInlineEdit();
      showQuestion(qi);
      updateSidebarStats();
      console.log('✅ UI reset completed');
    } catch(err) {
      console.error('❌ UI reset error:', err);
    }
  }, 500);

  // Persist to Firebase: find the original question by matching text,
  // then update the full questions array
  if(meta?.id) {
    try {
      const snap = await get(ref(db, 'quizzes/'+meta.id+'/questions'));
      const origQuestions = snap.val();
      if(origQuestions && Array.isArray(origQuestions)) {
        // Try to match by original question text (before edit)
        const origText = meta.questions ? meta.questions.find(q => q.text === updated.text || quizQuestions[qi].text === q.text) : null;
        // Best approach: find index in original array by matching text of the pre-edit version
        // Use quizzesCache which has the original unshuffled questions
        const cachedQuiz = quizzesCache[meta.id];
        const origArr = cachedQuiz?.questions || [];
        // Find original index by matching question text (pre-edit stored in quizQuestions before update)
        let origIdx = -1;
        // We saved updated already into quizQuestions[qi], so match by old text from DB
        // Best: match by all answers to find unique question
        origIdx = origArr.findIndex(q =>
          q.text === updated.text ||
          (q.answers && updated.answers && JSON.stringify(q.answers) === JSON.stringify(updated.answers))
        );
        // Fallback: if no match, use position qi directly
        if(origIdx === -1) origIdx = Math.min(qi, origArr.length - 1);

        if(origIdx >= 0) {
          await update(ref(db, 'quizzes/'+meta.id+'/questions/'+origIdx), updated);
          if(quizzesCache[meta.id]?.questions) quizzesCache[meta.id].questions[origIdx] = updated;
          showToast('Đã lưu thay đổi vào bộ đề!', 'success');
        } else {
          showToast('Đã cập nhật câu hỏi (phiên này)', 'success');
        }
      } else {
        showToast('Đã cập nhật câu hỏi (phiên này)', 'success');
      }
    } catch(e) {
      clearTimeout(uiResetTimer);
      showToast('Lỗi lưu: '+e.message, 'error');
      setInlineBtn(false, '<i class="fas fa-save"></i> Lưu thay đổi');
      return; // Dừng lại, không đóng modal khi lỗi
    }
  }
};


// ===== MATH / FORMULA RENDERER =====
// Quy ước ký hiệu đặc biệt:
//   x^2       → x²  (superscript)
//   H_2O      → H₂O (subscript)
//   _t^o      → t° (nhiệt độ hoá học)  
//   ->        → →  (mũi tên phương trình)
//   <->       → ⇌  (cân bằng thuận nghịch)
//   =>        → ⇒  (suy ra / điều kiện)
//   +-        → ±
//   *         → ×  (nhân, chỉ khi giữa số/chữ)
//   /frac{a}{b} → phân số a/b đẹp
//   /sqrt{x}  → √x đẹp
//   !=        → ≠
//   <=        → ≤
//   >=        → ≥
//   ~=        → ≈
//   inf       → ∞ (khi đứng riêng)
//   alpha beta gamma delta pi omega theta → ký tự Hy Lạp
//   CO_2, H_2O, H_2SO_4, ... → chỉ số dưới hoá học tự động

const MATH_SYMBOLS = [
  // ── Mũ / Superscript ────────────────────────────────────────────
  { input:'x^2',         output:'x<sup class="math-sup">2</sup>',              label:'Mũ 1 ký tự — x²' },
  { input:'x^{2a}',      output:'x<sup class="math-sup">2a</sup>',             label:'Mũ nhóm — x^(2a)' },
  { input:'U^2/I',       output:'U<sup class="math-sup">2</sup>/I',            label:'Chỉ ^ lên 1 ký tự' },
  { input:'U^{2/I}',     output:'U<sup class="math-sup">2/I</sup>',            label:'^ lên cả nhóm' },
  // ── Chỉ số dưới / Subscript ──────────────────────────────────────
  { input:'H_2O',        output:'H<sub class="math-sub">2</sub>O',             label:'Chỉ số 1 ký tự' },
  { input:'C_3O_4',      output:'C<sub class="math-sub">3</sub>O<sub class="math-sub">4</sub>', label:'Nhiều chỉ số đơn' },
  { input:'H_{2SO4}',    output:'H<sub class="math-sub">2SO4</sub>',           label:'Chỉ số dưới nhóm' },
  { input:'_t^o',        output:'<sup class="math-sup">t°</sup>',              label:'Điều kiện nhiệt độ' },
  // ── Mũi tên ─────────────────────────────────────────────────────
  { input:'->',          output:'→',   label:'Mũi tên phương trình' },
  { input:'<->',         output:'⇌',  label:'Cân bằng thuận nghịch' },
  { input:'=>',          output:'⇒',   label:'Suy ra / điều kiện' },
  // ── Toán học ────────────────────────────────────────────────────
  { input:'+-',          output:'±',   label:'Cộng trừ ±' },
  { input:'!=',          output:'≠',   label:'Không bằng ≠' },
  { input:'<=',          output:'≤',   label:'Nhỏ hơn hoặc bằng ≤' },
  { input:'>=',          output:'≥',   label:'Lớn hơn hoặc bằng ≥' },
  { input:'~=',          output:'≈',   label:'Xấp xỉ ≈' },
  { input:'/sqrt{x}',   output:'√x',  label:'Căn bậc hai' },
  { input:'/frac{a}{b}',output:'a/b', label:'Phân số đẹp' },
  // ── Ký tự Hy Lạp (dùng / làm tiền tố) ──────────────────────────
  { input:'/alpha',  output:'α',  label:'Alpha α' },
  { input:'/beta',   output:'β',  label:'Beta β' },
  { input:'/gamma',  output:'γ',  label:'Gamma γ' },
  { input:'/delta',  output:'δ',  label:'Delta δ' },
  { input:'/Delta',  output:'Δ',  label:'Delta hoa Δ' },
  { input:'/theta',  output:'θ',  label:'Theta θ' },
  { input:'/lambda', output:'λ',  label:'Lambda λ' },
  { input:'/mu',     output:'μ',  label:'Mu μ (micro)' },
  { input:'/pi',     output:'π',  label:'Pi π' },
  { input:'/rho',    output:'ρ',  label:'Rho ρ — điện trở suất' },
  { input:'/sigma',  output:'σ',  label:'Sigma σ' },
  { input:'/Sigma',  output:'Σ',  label:'Sigma hoa Σ (tổng)' },
  { input:'/phi',    output:'φ',  label:'Phi φ' },
  { input:'/omega',  output:'ω',  label:'Omega ω' },
  { input:'/Omega',  output:'Ω',  label:'Omega hoa Ω' },
  { input:'/ell',    output:'ℓ',  label:'ℓ — L viết tay' },
  { input:'/inf',    output:'∞',  label:'Vô cực ∞' },
  { input:'/deg',    output:'°',  label:'Độ ° (góc / nhiệt độ)' },
];

function renderMath(text) {
  if (!text) return text;
  let s = text;

  // 1. /frac{a}{b} → phân số đẹp (xử lý trước để tránh nhầm {})
  s = s.replace(/\/frac\{([^}]*)\}\{([^}]*)\}/g, (_, num, den) =>
    `<span class="math-frac"><span class="math-frac-num">${renderMath(num)}</span><span class="math-frac-den">${renderMath(den)}</span></span>`
  );

  // 2. /sqrt{x} → √x đẹp
  s = s.replace(/\/sqrt\{([^}]*)\}/g, (_, body) =>
    `<span class="math-sqrt"><span class="math-sqrt-sym">√</span><span class="math-sqrt-body">${renderMath(body)}</span></span>`
  );

  // 3. _t^o → nhiệt độ hoá học (điều kiện phản ứng) — xử lý trước _ chung
  s = s.replace(/_t\^o\b/g, '<sup class="math-sup">t°</sup>');
  s = s.replace(/_to\^o\b/g, '<sup class="math-sup">t°</sup>');

  // 4. SUPERSCRIPT
  // 4a. ^{nhóm} → toàn bộ nhóm nâng lên: U^{2/I} → U^(2/I)
  s = s.replace(/\^\{([^}]*)\}/g, (_, exp) =>
    `<sup class="math-sup">${exp}</sup>`
  );
  // 4b. ^x → chỉ 1 ký tự đơn: U^2/I → U²/I  (chữ, số, hoặc ký tự đặc biệt đơn)
  s = s.replace(/\^([A-Za-z0-9°])/g, (_, exp) =>
    `<sup class="math-sup">${exp}</sup>`
  );

  // 5. SUBSCRIPT
  // 5a. _{nhóm} → toàn bộ nhóm thu nhỏ: H_{2SO4} → H₍₂ₛₒ₄₎
  s = s.replace(/_\{([^}]*)\}/g, (_, sub) =>
    `<sub class="math-sub">${sub}</sub>`
  );
  // 5b. _x → chỉ 1 ký tự đơn: H_2O → H₂O, C_3O_4 → C₃O₄
  s = s.replace(/_([A-Za-z0-9])/g, (_, sub) =>
    `<sub class="math-sub">${sub}</sub>`
  );

  // 6. Mũi tên & ký hiệu toán
  s = s.replace(/<->/g, '⇌');
  s = s.replace(/->/g, '→');
  s = s.replace(/=>/g, '⇒');
  s = s.replace(/([^!<>~])!=([^=])/g, '$1≠$2');
  s = s.replace(/([^<])<=([^>])/g, '$1≤$2');
  s = s.replace(/([^>])>=([^=])/g, '$1≥$2');
  s = s.replace(/~=/g, '≈');
  s = s.replace(/\+-/g, '±');

  // 6b. Inline code: `code` → <code>code</code> (như GitHub README)
  s = s.replace(/`([^`\n]+)`/g, (_, inner) =>
    `<code class="inline-code">${inner.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code>`
  );

  // 7. Ký tự Hy Lạp — BẮT BUỘC có tiền tố / để tránh nhầm hóa học
  const greekMap = {
    '/alpha':'α','/beta':'β','/gamma':'γ','/delta':'δ','/epsilon':'ε',
    '/zeta':'ζ','/eta':'η','/theta':'θ','/lambda':'λ','/mu':'μ',
    '/nu':'ν','/xi':'ξ','/pi':'π','/rho':'ρ','/sigma':'σ',
    '/tau':'τ','/phi':'φ','/chi':'χ','/psi':'ψ','/omega':'ω',
    '/Delta':'Δ','/Sigma':'Σ','/Omega':'Ω','/Pi':'Π','/Phi':'Φ',
    '/inf':'∞','/deg':'°','/sum':'Σ','/ell':'<span class="math-ell">ℓ</span>',
  };
  // Thay thế dài trước để tránh /Delta bị match thành /delta + a
  const greekKeys = Object.keys(greekMap).sort((a,b) => b.length - a.length);
  greekKeys.forEach(k => { s = s.split(k).join(greekMap[k]); });

  return s;
}

// Áp dụng renderMath cho một element innerHTML, hỗ trợ xuống dòng \n → <br>
function applyMath(el, rawText) {
  if (!el) return;
  // Tách theo \n, render từng dòng, nối bằng <br>
  el.innerHTML = (rawText || '').split('\n').map(line => renderMath(line)).join('<br>');
}

// Bảng tham khảo ký hiệu (HTML) để nhúng vào panel soạn thảo
function buildMathRefPanel() {
  const rows = MATH_SYMBOLS.map(s =>
    `<div class="math-ref-row">
      <span class="math-ref-code">${escHtml(s.input)}</span>
      <span class="math-ref-arrow">→</span>
      <span class="math-ref-result">${s.output}</span>
      <span style="color:var(--text3);font-size:.68rem">${s.label}</span>
    </div>`
  ).join('');
  return `<div class="math-ref-panel">
    <div class="math-ref-title"><i class="fas fa-flask"></i> Ký hiệu đặc biệt — gõ vào câu hỏi/đáp án/giải thích</div>
    <div class="math-ref-grid">${rows}</div>
  </div>`;
}

// ===== SETTINGS PAGE =====
function renderColorSettings() {
  const grid = document.getElementById('color-settings-grid');
  grid.innerHTML = '';
  COLOR_SETTINGS.forEach(({key, label, default:def}) => {
    const cur = getComputedStyle(document.documentElement).getPropertyValue(key).trim() || def;
    const safeHex = cur.startsWith('#') ? cur : rgbaToHex(cur) || def;
    const div = document.createElement('div');
    div.className = 'color-group';
    div.innerHTML = `
      <div style="flex:1"><div class="toggle-label">${label}</div><div class="toggle-desc">${key}</div></div>
      <input type="color" class="color-input" value="${safeHex}" data-key="${key}">
    `;
    div.querySelector('input').addEventListener('input', function() {
      document.documentElement.style.setProperty(this.dataset.key, this.value);
      saveSettings();
    });
    grid.appendChild(div);
  });
}

function rgbaToHex(rgba) {
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if(!m) return null;
  return '#'+[m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
}

// ===== UTILS =====
function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/** Auto-resize a textarea to fit its content */
function autoResize(el) {
  if(!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
window.autoResize = autoResize;
/** Attach auto-resize to a textarea by id (after DOM insert) */
function attachAutoResize(id) {
  const el = document.getElementById(id);
  if(!el || el.tagName !== 'TEXTAREA') return;
  autoResize(el);
  el.addEventListener('input', () => autoResize(el));
}

function getCorrectPraise(){
  const p=['🎉 Xuất sắc! Đúng rồi!','✅ Chính xác! Tuyệt vời!','🌟 Quá giỏi! Đúng!','💯 Hoàn hảo!','🔥 Xuất sắc!','👏 Chuẩn không cần chỉnh!','🚀 Quá nhanh quá nguy hiểm!','🎯 Trúng đích!','😎 Đỉnh đấy!','🥳 Làm tốt lắm!','✨ Chính xác luôn!','🧠 Não chạy nhanh ghê!','🏆 Điểm tuyệt đối!','👍 Chuẩn bài!','💡 Chuẩn xác!','📚 Học tốt lắm!','🎊 Tuyệt cú mèo!','💥 Chính xác 100%!','🔔 Đúng rồi đó!','😄 Chuẩn luôn!'];
  return p[Math.floor(Math.random()*p.length)];
}

function getWrongPraise(){
  const p=['❌ Chời ơi chời, sai rồi','😛 Chưa đúng, lêu lêu!','😝 Đồ gà, học thêm đi!','🤔 Sai rồi chế ơi!','😅 Suýt đúng rồi!','🙃 Sai mất tiêu!','📉 Trật rồi nha!','😵 Không đúng rồi!','😬 Gần đúng thôi!','🤨 Nghĩ lại xem!','🔄 Thử lại nào!','📚 Ôn lại chút nhé!','😶 Sai rồi đó!','😑 Không ổn rồi!','😓 Hơi lệch rồi!','😏 Chưa chuẩn đâu!','🧐 Xem kỹ lại nào!','😮 Sai nhẹ rồi!','😬 Lệch hướng rồi!','😜 Sai rồi nha!'];
  return p[Math.floor(Math.random()*p.length)];
}

function spawnConfetti(n=20) {
  const colors=['#6c63ff','#00d4aa','#ffd93d','#ff6b6b','#fff'];
  for(let i=0;i<n;i++){
    const el=document.createElement('div');
    el.className='confetti-piece';
    el.style.cssText=`left:${Math.random()*100}vw;top:-10px;background:${colors[Math.floor(Math.random()*colors.length)]};width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;animation-duration:${1.5+Math.random()*2}s;animation-delay:${Math.random()*.5}s;border-radius:${Math.random()>0.5?'50%':'2px'}`;
    document.body.appendChild(el);
    setTimeout(()=>el.remove(),3500);
  }
}

window.showToast = function(msg, type='success') {
  let tc = document.getElementById('toast-container');
  if(!tc) {
    tc = document.createElement('div');
    tc.id = 'toast-container';
    tc.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;';
    document.body.appendChild(tc);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'error' ? 'error' : 'success');
  t.innerHTML = `<i class="fas fa-${type === 'error' ? 'times-circle' : 'check-circle'}"></i>${msg}`;
  tc.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); },3000);
};

init();