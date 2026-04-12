import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";

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

// ===== UTILS =====
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ===== TOAST (dùng đúng id="toast" trong HTML) =====
window.showToast = function(msg, type='success') {
  const wrap = document.getElementById('toast');
  if(!wrap) return;
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'error' ? 'error' : 'success');
  t.innerHTML = `<i class="fas fa-${type==='error'?'times-circle':'check-circle'}"></i>${msg}`;
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .3s';
    setTimeout(() => t.remove(), 300);
  }, 3000);
};

// ===== CONFIRM MODAL =====
window.closeModal = function() {
  const m = document.getElementById('confirm-modal');
  if(m) m.classList.remove('visible');
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

let _linksCache = [];
let _linksListening = false;
let _suppressLinksUpdate = false;

// ---- State ----
let _linkEditId = null;
let _linkCurrentTag = '';
let _linkFilterTag = 'all';
let _linkSortMode = false;
let _linkDragId = null;

// ---- Firebase listener ----
function initLinksListener() {
  if(_linksListening) return;
  _linksListening = true;
  onValue(ref(db, 'app_data/links'), snap => {
    if(_suppressLinksUpdate) return;
    const val = snap.val();
    _linksCache = Array.isArray(val) ? val : (val ? Object.values(val) : []);
    renderLinksGrid();
    hideLoadingScreen();
  });
}

async function saveLinksToFirebase(links) {
  _linksCache = links;
  _suppressLinksUpdate = true;
  // Render ngay lập tức, không chờ Firebase echo
  renderLinksGrid();
  try {
    await set(ref(db, 'app_data/links'), links);
  } catch(e) {
    console.warn('saveLinks FB err', e);
    showToast('Lỗi lưu dữ liệu!', 'error');
  }
  setTimeout(() => { _suppressLinksUpdate = false; }, 2000);
}

function loadLinks() { return _linksCache; }

// ---- Render ----
window.renderLinksGrid = function() {
  const allLinks = loadLinks();
  const grid = document.getElementById('links-grid');
  if(!grid) return;

  // Stats
  const doneCount = allLinks.filter(l => l.done).length;
  const totalEl = document.getElementById('links-total-count');
  const doneEl  = document.getElementById('links-done-count');
  if(totalEl) totalEl.textContent = allLinks.length;
  if(doneEl)  doneEl.textContent  = doneCount;

  const filtered = _linkFilterTag === 'all' ? allLinks : allLinks.filter(l => l.tag === _linkFilterTag);

  grid.innerHTML = '';

  if(filtered.length === 0) {
    grid.innerHTML = `
      <div class="links-empty-state">
        <i class="fas fa-link"></i>
        <h3>Chưa có đường link nào</h3>
        <p>Nhấn nút <strong>+</strong> bên dưới để thêm link đầu tiên</p>
      </div>`;
    return;
  }

  filtered.forEach(link => {
    const meta = LINK_TAGS_META[link.tag] || { color:'#90a4ae', icon:'fa-ellipsis-h' };
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
          <button class="link-action-btn link-action-edit" title="Chỉnh sửa"
            onclick="event.stopPropagation();editLinkItem('${link.id}')"><i class="fas fa-pen"></i></button>
          <button class="link-action-btn link-action-delete" title="Xóa"
            onclick="event.stopPropagation();deleteLinkItem('${link.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="link-card-url"><i class="fas fa-external-link-alt"></i>${escHtml(link.url)}</div>
      <div class="link-card-footer">
        ${link.tag
          ? `<span class="link-tag-chip ${link.tag}">${escHtml(link.tag.charAt(0).toUpperCase()+link.tag.slice(1))}</span>`
          : '<span></span>'}
        <button class="link-done-toggle-btn${isDone?' done':''}"
          onclick="event.stopPropagation();toggleLinkDone('${link.id}')">
          <i class="fas ${isDone?'fa-check-circle':'fa-circle'} done-icon"></i>
          ${isDone ? 'Đã làm xong' : 'Đánh dấu xong'}
        </button>
      </div>`;
    card.addEventListener('click', () => {
      if(!_linkSortMode) window.open(link.url, '_blank');
    });
    attachLinkDragSort(card, link.id);
    grid.appendChild(card);
  });

  if(_linkSortMode) grid.classList.add('link-sort-mode');
};

// ---- Toggle done ----
window.toggleLinkDone = function(id) {
  if(_linkSortMode) return;
  const links = [...loadLinks()];
  const idx = links.findIndex(l => l.id === id);
  if(idx === -1) return;
  links[idx] = { ...links[idx], done: !links[idx].done };
  showToast(links[idx].done ? '✅ Đã làm xong!' : 'Bỏ đánh dấu làm xong');
  saveLinksToFirebase(links); // render ngay bên trong saveLinksToFirebase
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
  const btn    = document.getElementById('links-drag-sort-btn');
  const grid   = document.getElementById('links-grid');
  if(banner) banner.classList.toggle('visible', _linkSortMode);
  if(btn)    btn.classList.toggle('active', _linkSortMode);
  if(grid)   grid.classList.toggle('link-sort-mode', _linkSortMode);
};

window.exitLinkSortMode = function() {
  _linkSortMode = false;
  const banner = document.getElementById('links-sort-mode-banner');
  const btn    = document.getElementById('links-drag-sort-btn');
  const grid   = document.getElementById('links-grid');
  if(banner) banner.classList.remove('visible');
  if(btn)    btn.classList.remove('active');
  if(grid)   grid.classList.remove('link-sort-mode');
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
  document.querySelectorAll('.link-tag-pick-btn').forEach(b =>
    b.classList.remove('selected', ...Object.keys(LINK_TAGS_META))
  );

  if(id) {
    const link = loadLinks().find(l => l.id === id);
    if(link) {
      document.getElementById('link-name-input').value = link.name;
      document.getElementById('link-url-input').value  = link.url;
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
  let url     = document.getElementById('link-url-input').value.trim();
  if(!name) { showToast('Vui lòng nhập tên đường link!', 'error'); return; }
  if(!url)  { showToast('Vui lòng nhập URL!', 'error'); return; }
  if(!/^https?:\/\//i.test(url)) url = 'https://' + url;

  const links = [...loadLinks()];
  if(_linkEditId) {
    const idx = links.findIndex(l => l.id === _linkEditId);
    if(idx !== -1) links[idx] = { ...links[idx], name, url, tag: _linkCurrentTag };
  } else {
    links.unshift({ id: 'lnk_' + Date.now(), name, url, tag: _linkCurrentTag, done: false, createdAt: Date.now() });
  }
  closeLinkModal();
  showToast(_linkEditId ? 'Đã cập nhật link!' : 'Đã thêm link!');
  saveLinksToFirebase(links); // render ngay lập tức
};

window.editLinkItem  = function(id) { openLinkModal(id); };

window.deleteLinkItem = function(id) {
  const link = loadLinks().find(l => l.id === id);
  if(!link) return;
  const overlay = document.getElementById('confirm-modal');
  if(overlay) {
    const h3 = overlay.querySelector('h3') || overlay.querySelector('.modal h3');
    const p  = overlay.querySelector('p')  || overlay.querySelector('.modal p');
    const btns = overlay.querySelector('.modal-btns');
    if(h3) h3.textContent = 'Xoá đường link';
    if(p)  p.textContent  = `Bạn có chắc muốn xoá "${link.name}"?`;
    if(btns) btns.innerHTML = `
      <button class="modal-btn" onclick="closeModal()">Huỷ</button>
      <button class="modal-btn danger" onclick="confirmDeleteLink('${link.id}')">Xoá</button>`;
    overlay.classList.add('visible');
  }
};

window.confirmDeleteLink = function(id) {
  const updated = loadLinks().filter(l => l.id !== id);
  closeModal();
  showToast('Đã xoá link!');
  saveLinksToFirebase(updated);
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
  initLinksListener();
  setTimeout(() => hideLoadingScreen(), 3000);
});