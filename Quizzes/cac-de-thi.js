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

// ===== UTILS =====
function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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
  const tc=document.getElementById('toast-container');
  const t=document.createElement('div');
  t.className='toast '+(type==='error'?'error':'success');
  t.innerHTML=`<i class="fas fa-${type==='error'?'times-circle':'check-circle'}"></i>${msg}`;
  tc.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); },3000);
};


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

// ===== PAGE NAV (cross-file) =====
window.showPage = function(page) {
  const map = {
    'home':     'quizzes.html',
    'tu-luan':  'tu-luan.html',
    'links':    'cac-de-thi.html',
    'add':      'quizzes.html',
    'settings': 'quizzes.html',
  };
  if(map[page]) window.location.href = map[page];
};

// ===== LINKS PAGE =====
const LINK_TAGS_META = {
  toán:  { color:'#a89fff', icon:'fa-square-root-alt' },
  lý:    { color:'#00d4aa', icon:'fa-atom' },
  hóa:   { color:'#ff9090', icon:'fa-flask' },
  anh:   { color:'#ffd93d', icon:'fa-language' },
  sinh:  { color:'#00e676', icon:'fa-leaf' },
  văn:   { color:'#ff9800', icon:'fa-feather-alt' },
  khác:  { color:'#90a4ae', icon:'fa-ellipsis-h' },
};

// ---- Storage: Firebase app_data/links ----
let _linksCache = []; // array, maintains order
let _linksListening = false;
let _suppressLinksUpdate = false; // suppress self-write echo

function initLinksListener() {
  if(_linksListening) return;
  _linksListening = true;
  onValue(ref(db, 'app_data/links'), snap => {
    if(_suppressLinksUpdate) return; // skip our own write echo
    const val = snap.val();
    _linksCache = Array.isArray(val) ? val : (val ? Object.values(val) : []);
    renderLinksGrid();
    // Ẩn loading screen sau khi data đầu tiên về
    hideLoadingScreen();
  });
}

async function saveLinksToFirebase(links) {
  _linksCache = links;
  _suppressLinksUpdate = true;
  try {
    await set(ref(db, 'app_data/links'), links);
  } catch(e) {
    console.warn('saveLinks FB err', e);
    showToast('Lỗi lưu dữ liệu!', 'error');
  }
  // Re-enable listener after echo window
  setTimeout(() => { _suppressLinksUpdate = false; }, 2000);
}

function loadLinks() { return _linksCache; }

// ---- State ----
let _linkEditId = null;
let _linkCurrentTag = '';
let _linkFilterTag = 'all';
let _linkSortMode = false;
let _linkDragId = null;

window.renderLinksGrid = function() {
  const allLinks = loadLinks();
  const grid = document.getElementById('links-grid');
  if(!grid) return;
  const empty = document.getElementById('links-empty-state');

  // Stats
  const doneCount = allLinks.filter(l => l.done).length;
  document.getElementById('links-total-count').textContent = allLinks.length;
  document.getElementById('links-done-count').textContent = doneCount;

  const filtered = _linkFilterTag === 'all' ? allLinks : allLinks.filter(l => l.tag === _linkFilterTag);

  if(filtered.length === 0) {
    grid.innerHTML = '';
    grid.appendChild(empty);
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = '';

  filtered.forEach(link => {
    const meta = LINK_TAGS_META[link.tag] || LINK_TAGS_META['khác'];
    const isDone = !!link.done;
    const card = document.createElement('div');
    card.className = 'link-card' + (isDone ? ' is-done' : '');
    card.dataset.id = link.id;
    card.innerHTML = `
      <div class="link-sort-handle"><i class="fas fa-grip-lines"></i></div>
      <div class="link-card-top">
        <div class="link-card-icon" style="background:${meta.color}22;color:${meta.color}">
          <i class="fas ${meta.icon}"></i>
        </div>
        <div class="link-card-title">${escHtml(link.name)}</div>
        <div class="link-card-actions">
          <button class="link-action-btn link-action-edit" title="Chỉnh sửa" onclick="event.stopPropagation();editLinkItem('${link.id}')"><i class="fas fa-pen"></i></button>
          <button class="link-action-btn link-action-delete" title="Xóa" onclick="event.stopPropagation();deleteLinkItem('${link.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="link-card-url"><i class="fas fa-external-link-alt"></i>${escHtml(link.url)}</div>
      <div class="link-card-footer">
        ${link.tag ? `<span class="link-tag-chip ${link.tag}">${escHtml(link.tag.charAt(0).toUpperCase()+link.tag.slice(1))}</span>` : '<span></span>'}
        <button class="link-done-toggle-btn${isDone ? ' done' : ''}" title="${isDone ? 'Bỏ đánh dấu' : 'Đánh dấu đã làm xong'}"
          onclick="event.stopPropagation();toggleLinkDone('${link.id}')">
          <i class="fas ${isDone ? 'fa-check-circle' : 'fa-circle'} done-icon"></i>
          ${isDone ? 'Đã làm xong' : 'Đánh dấu xong'}
        </button>
      </div>
    `;
    // Click to open link (only when not in sort mode)
    card.addEventListener('click', () => {
      if(!_linkSortMode) window.open(link.url, '_blank');
    });
    // Drag sort
    attachLinkDragSort(card, link.id);
    grid.appendChild(card);
  });

  if(_linkSortMode) grid.classList.add('link-sort-mode');
};

// ---- Toggle done (saves to Firebase) ----
window.toggleLinkDone = function(id) {
  if(_linkSortMode) return;
  const links = loadLinks();
  const idx = links.findIndex(l => l.id === id);
  if(idx === -1) return;
  links[idx].done = !links[idx].done;
  saveLinksToFirebase(links);
  // Optimistic local re-render
  _linksCache = links;
  renderLinksGrid();
  showToast(links[idx].done ? '✅ Đã làm xong!' : 'Bỏ đánh dấu làm xong');
};

// ---- Filter ----
window.filterLinks = function(tag) {
  _linkFilterTag = tag;
  document.querySelectorAll('.link-tag-filter').forEach(b => {
    b.classList.toggle('active', b.dataset.tag === tag);
  });
  renderLinksGrid();
};

// ---- Drag sort ----
window.toggleLinkSortMode = function() {
  _linkSortMode = !_linkSortMode;
  const banner = document.getElementById('links-sort-mode-banner');
  const btn = document.getElementById('links-drag-sort-btn');
  const grid = document.getElementById('links-grid');
  if(banner) banner.classList.toggle('visible', _linkSortMode);
  if(btn) btn.classList.toggle('active', _linkSortMode);
  if(grid) grid.classList.toggle('link-sort-mode', _linkSortMode);
};

window.exitLinkSortMode = function() {
  _linkSortMode = false;
  const banner = document.getElementById('links-sort-mode-banner');
  const btn = document.getElementById('links-drag-sort-btn');
  const grid = document.getElementById('links-grid');
  if(banner) banner.classList.remove('visible');
  if(btn) btn.classList.remove('active');
  if(grid) grid.classList.remove('link-sort-mode');
};

function attachLinkDragSort(card, id) {
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', e => {
    if(!_linkSortMode) { e.preventDefault(); return; }
    _linkDragId = id;
    card.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.style.opacity = '';
    document.querySelectorAll('.link-card').forEach(c => c.classList.remove('link-drag-over'));
  });
  card.addEventListener('dragover', e => {
    if(!_linkSortMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.link-card').forEach(c => c.classList.remove('link-drag-over'));
    card.classList.add('link-drag-over');
  });
  card.addEventListener('drop', e => {
    e.preventDefault();
    if(!_linkDragId || _linkDragId === id) return;
    card.classList.remove('link-drag-over');
    const fresh = [...loadLinks()];
    const fromIdx = fresh.findIndex(l => l.id === _linkDragId);
    const toIdx   = fresh.findIndex(l => l.id === id);
    if(fromIdx === -1 || toIdx === -1) return;
    const [item] = fresh.splice(fromIdx, 1);
    fresh.splice(toIdx, 0, item);
    _linksCache = fresh;
    renderLinksGrid(); // optimistic
    saveLinksToFirebase(fresh);
  });
}

// ---- Modal ----
window.openLinkModal = function(id) {
  _linkEditId = id || null;
  _linkCurrentTag = '';
  const overlay = document.getElementById('link-modal-overlay');
  const titleEl = document.getElementById('link-modal-title');
  document.getElementById('link-name-input').value = '';
  document.getElementById('link-url-input').value = '';
  document.querySelectorAll('.link-tag-pick-btn').forEach(b => b.classList.remove('selected', ...Object.keys(LINK_TAGS_META)));

  if(id) {
    const link = loadLinks().find(l => l.id === id);
    if(link) {
      document.getElementById('link-name-input').value = link.name;
      document.getElementById('link-url-input').value = link.url;
      _linkCurrentTag = link.tag || '';
      if(link.tag) selectLinkTag(link.tag);
    }
    titleEl.innerHTML = '<i class="fas fa-pen"></i> Chỉnh sửa link';
  } else {
    titleEl.innerHTML = '<i class="fas fa-link"></i> Thêm đường link';
  }
  overlay.classList.add('visible');
  setTimeout(() => document.getElementById('link-name-input').focus(), 100);
};

window.closeLinkModal = function() {
  document.getElementById('link-modal-overlay').classList.remove('visible');
};

window.closeLinkModalOutside = function(e) {
  if(e.target === document.getElementById('link-modal-overlay')) closeLinkModal();
};

window.selectLinkTag = function(tag) {
  _linkCurrentTag = tag;
  document.querySelectorAll('.link-tag-pick-btn').forEach(b => {
    b.classList.remove('selected', ...Object.keys(LINK_TAGS_META));
    if(b.dataset.tag === tag) b.classList.add('selected', tag);
  });
};

window.saveLinkItem = function() {
  const name = document.getElementById('link-name-input').value.trim();
  let url = document.getElementById('link-url-input').value.trim();
  if(!name) { showToast('Vui lòng nhập tên đường link!', 'error'); return; }
  if(!url)  { showToast('Vui lòng nhập URL!', 'error'); return; }
  if(!/^https?:\/\//i.test(url)) url = 'https://' + url;

  const links = loadLinks();
  if(_linkEditId) {
    const idx = links.findIndex(l => l.id === _linkEditId);
    if(idx !== -1) links[idx] = { ...links[idx], name, url, tag: _linkCurrentTag };
  } else {
    links.unshift({ id: 'lnk_' + Date.now(), name, url, tag: _linkCurrentTag, done: false, createdAt: Date.now() });
  }
  _linksCache = links;
  saveLinksToFirebase(links);
  closeLinkModal();
  renderLinksGrid();
  showToast(_linkEditId ? 'Đã cập nhật link!' : 'Đã thêm link!');
};

window.editLinkItem = function(id) { openLinkModal(id); };

window.deleteLinkItem = function(id) {
  const link = loadLinks().find(l => l.id === id);
  if(!link) return;
  const overlay = document.getElementById('confirm-modal');
  const modal = overlay ? overlay.querySelector('.modal') : null;
  if(overlay && modal) {
    modal.querySelector('h3').textContent = 'Xoá đường link';
    modal.querySelector('p').textContent = `Bạn có chắc muốn xoá "${link.name}"?`;
    modal.querySelector('.modal-btns').innerHTML = `
      <button class="modal-btn" onclick="closeModal()">Huỷ</button>
      <button class="modal-btn danger" onclick="confirmDeleteLink('${link.id}')">Xoá</button>
    `;
    overlay.classList.add('visible');
  } else {
    if(confirm(`Xoá link "${link.name}"?`)) {
      const updated = loadLinks().filter(l => l.id !== id);
      _linksCache = updated;
      saveLinksToFirebase(updated);
      renderLinksGrid();
      showToast('Đã xoá link!');
    }
  }
};

window.confirmDeleteLink = function(id) {
  const updated = loadLinks().filter(l => l.id !== id);
  _linksCache = updated;
  saveLinksToFirebase(updated);
  renderLinksGrid();
  closeModal();
  showToast('Đã xoá link!');
};

// ===== INIT =====
function hideLoadingScreen() {
  const ls = document.getElementById('loading-screen');
  if(!ls || ls._hidden) return;
  ls._hidden = true;
  ls.style.opacity = '0';
  setTimeout(() => { ls.style.display = 'none'; }, 500);
}

document.addEventListener('DOMContentLoaded', () => {
  loadSoundSettings();
  initLinksListener();
  // Fallback: ẩn loading sau 3s nếu Firebase chưa phản hồi
  setTimeout(() => hideLoadingScreen(), 3000);
});