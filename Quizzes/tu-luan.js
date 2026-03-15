// ========================================
// QuizMaster — tu-luan.js
// Lưu trữ: Firebase Realtime Database
// Path: app_data/tu_luan_docs  |  app_data/tu_luan_history
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push, remove, get } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyARyxrxmbNLaxSdDP14S5YQES5AJnLj-XU",
  authDomain: "mylife-ddd6a.firebaseapp.com",
  databaseURL: "https://mylife-ddd6a-default-rtdb.firebaseio.com",
  projectId: "mylife-ddd6a",
  storageBucket: "mylife-ddd6a.firebasestorage.app",
  messagingSenderId: "969759088030",
  appId: "1:969759088030:web:69155b992b0cea296e4a8f",
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ─── Firebase paths ───────────────────────
const DOCS_PATH = 'app_data/tu_luan_docs';
const HIST_PATH = 'app_data/tu_luan_history';

// ─── In-memory cache (realtime sync từ Firebase) ──
let _docsCache    = {};  // { id: doc }
let _historyCache = {};  // { docId: { entryKey: entry } }
let _dbReady      = false;

// ─── STATE ───────────────────────────────
let currentDocId      = null;
let autoSaveTimer     = null;
let hasUnsavedChanges = false;
let testFromEditor    = false;
let historyTargetId   = null;
let refPanelOpen      = false;
let testSubmitted     = false;

// Hint state
let hintTimer      = null;
let currentHintStr = '';
let hintPopupOpen  = false;

// ─── FIREBASE SUBSCRIBE ──────────────────
function subscribeFirebase() {
  // Docs
  onValue(ref(db, DOCS_PATH), snap => {
    _docsCache = snap.val() || {};
    _dbReady   = true;
    // Re-render nếu đang ở list view
    if (document.getElementById('view-list').style.display !== 'none') {
      renderList(document.getElementById('tl-search').value);
    }
  });

  // History
  onValue(ref(db, HIST_PATH), snap => {
    _historyCache = snap.val() || {};
    if (document.getElementById('view-list').style.display !== 'none') {
      renderList(document.getElementById('tl-search').value);
    }
  });
}

// ─── DATA HELPERS ────────────────────────
function getAllDocs() {
  return Object.entries(_docsCache)
    .map(([id, doc]) => ({ ...doc, id }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function getDoc(id) {
  return _docsCache[id] ? { ..._docsCache[id], id } : null;
}

async function saveDocToFB(id, data) {
  try {
    await set(ref(db, `${DOCS_PATH}/${id}`), data);
  } catch (e) { console.warn('saveDoc err', e); }
}

async function deleteDocFromFB(id) {
  try {
    await remove(ref(db, `${DOCS_PATH}/${id}`));
    await remove(ref(db, `${HIST_PATH}/${id}`));
  } catch (e) { console.warn('deleteDoc err', e); }
}

function getBestScore(docId) {
  const entries = _historyCache[docId] || {};
  const scores  = Object.values(entries).map(e => e.score);
  return scores.length ? Math.max(...scores) : null;
}

async function addHistoryEntryFB(docId, entry) {
  try {
    await push(ref(db, `${HIST_PATH}/${docId}`), entry);
  } catch (e) { console.warn('addHistory err', e); }
}

async function clearHistoryFB(docId) {
  try {
    await remove(ref(db, `${HIST_PATH}/${docId}`));
  } catch (e) { console.warn('clearHistory err', e); }
}

// ─── TOAST ───────────────────────────────
window.showToast = function(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = (type === 'success' ? '✓ ' : '✕ ') + msg;
  t.className = 'show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 2800);
};

// ─── VIEW SWITCHING ──────────────────────
function showView(name) {
  document.getElementById('tl-hero').style.display     = name === 'list'   ? '' : 'none';
  document.getElementById('view-list').style.display   = name === 'list'   ? '' : 'none';
  document.getElementById('view-editor').style.display = name === 'editor' ? 'flex' : 'none';
  document.getElementById('view-test').style.display   = name === 'test'   ? 'flex' : 'none';
}

// ─── RENDER LIST ─────────────────────────
function renderList(filterText = '') {
  const grid  = document.getElementById('tl-grid');
  const empty = document.getElementById('tl-empty');

  if (!_dbReady) {
    grid.innerHTML = '<div class="tl-loading"><i class="fas fa-spinner"></i> Đang tải...</div>';
    empty.style.display = 'none';
    return;
  }

  const query  = filterText.trim().toLowerCase();
  const docs   = getAllDocs();
  const filtered = query
    ? docs.filter(d => (d.title || '').toLowerCase().includes(query) || stripHTML(d.content || '').toLowerCase().includes(query))
    : docs;

  if (!filtered.length) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = filtered.map(doc => {
    const preview   = stripHTML(doc.content || '').slice(0, 160) || 'Chưa có nội dung...';
    const best      = getBestScore(doc.id);
    const titleHtml = doc.title ? escapeHTML(doc.title) : '<em style="color:var(--text3)">Không có tiêu đề</em>';
    const scoreBadge = best !== null
      ? `<span class="doc-card-score ${best>=80?'good':best>=50?'mid':'bad'}">⭐ ${best}%</span>` : '';
    return `
      <div class="doc-card" onclick="openDoc('${doc.id}')">
        <div class="doc-card-title">${titleHtml}</div>
        <div class="doc-card-preview">${escapeHTML(preview)}</div>
        <div class="doc-card-footer">
          <span class="doc-card-date"><i class="fas fa-clock"></i> ${formatDate(doc.updatedAt)}</span>
          <span class="doc-card-words"><i class="fas fa-file-word"></i> ${countWords(stripHTML(doc.content||''))} từ</span>
          ${scoreBadge}
          <div class="doc-card-actions">
            <button class="doc-card-icon-btn test" onclick="quickTest(event,'${doc.id}')" title="Kiểm tra"><i class="fas fa-brain"></i></button>
            <button class="doc-card-icon-btn hist" onclick="openHistoryModal(event,'${doc.id}')" title="Lịch sử"><i class="fas fa-history"></i></button>
            <button class="doc-card-icon-btn del"  onclick="deleteDocCard(event,'${doc.id}')" title="Xóa"><i class="fas fa-trash-alt"></i></button>
          </div>
        </div>
      </div>`;
  }).join('');
}
window.filterDocs = () => renderList(document.getElementById('tl-search').value);

// ─── EDITOR ──────────────────────────────
window.openNew = async function() {
  const id  = 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const doc = { title:'', content:'', createdAt:Date.now(), updatedAt:Date.now() };
  await saveDocToFB(id, doc);
  openDoc(id);
};

window.openDoc = function(id) {
  const doc = getDoc(id);
  if (!doc) { showToast('Không tìm thấy văn bản', 'error'); return; }
  currentDocId = id; hasUnsavedChanges = false;
  document.getElementById('doc-title').value = doc.title || '';
  const ed = document.getElementById('doc-editor');
  ed.innerHTML = doc.content || '';
  showView('editor'); updateWordCount(); updateStatus('Đã lưu');
  ed.focus(); placeCursorAtEnd(ed);
};

window.backToList = function() {
  if (hasUnsavedChanges) saveDoc(true);
  currentDocId = null; clearTimeout(autoSaveTimer);
  showView('list'); renderList(document.getElementById('tl-search').value);
};

window.saveDoc = async function(silent = false) {
  if (!currentDocId) return;
  const existing = getDoc(currentDocId);
  if (!existing) return;
  const data = {
    title:     document.getElementById('doc-title').value.trim(),
    content:   document.getElementById('doc-editor').innerHTML,
    createdAt: existing.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  await saveDocToFB(currentDocId, data);
  hasUnsavedChanges = false; updateStatus('Đã lưu');
  const btn = document.getElementById('save-btn');
  if (btn) {
    btn.classList.add('saved');
    btn.innerHTML = '<i class="fas fa-check"></i><span class="btn-label"> Đã lưu</span>';
    setTimeout(() => { btn.classList.remove('saved'); btn.innerHTML = '<i class="fas fa-save"></i><span class="btn-label"> Lưu</span>'; }, 1800);
  }
  if (!silent) showToast('Đã lưu văn bản!');
};

function scheduleAutoSave() {
  hasUnsavedChanges = true; updateStatus('Chưa lưu...');
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => { saveDoc(true); showToast('Tự động lưu ✓'); }, 3000);
}

// ─── DELETE ──────────────────────────────
window.deleteDocCard = (e, id) => { e.stopPropagation(); openDeleteModal(id, false); };
window.confirmDelete = () => { if (currentDocId) openDeleteModal(currentDocId, true); };

function openDeleteModal(id, fromEditor) {
  document.getElementById('tl-modal').classList.add('visible');
  const old = document.getElementById('tl-modal-confirm-btn');
  const nb  = old.cloneNode(true); old.parentNode.replaceChild(nb, old);
  nb.addEventListener('click', () => { doDelete(id, fromEditor); closeModal(); });
}
async function doDelete(id, fromEditor) {
  await deleteDocFromFB(id);
  showToast('Đã xóa văn bản', 'error');
  if (fromEditor) { currentDocId = null; clearTimeout(autoSaveTimer); showView('list'); }
  renderList(document.getElementById('tl-search').value);
}
window.closeModal = () => document.getElementById('tl-modal').classList.remove('visible');

// ─── EDITOR COMMANDS ─────────────────────
window.execCmd      = cmd  => { document.getElementById('doc-editor').focus(); document.execCommand(cmd, false, null); updateToolbarState(); };
window.removeFormat = ()   => { const ed=document.getElementById('doc-editor'); ed.focus(); document.execCommand('removeFormat',false,null); document.execCommand('formatBlock',false,'p'); updateToolbarState(); };
window.changeFontSize = v  => { if(!v) return; document.getElementById('doc-editor').focus(); document.execCommand('fontSize',false,v); setTimeout(()=>{document.getElementById('font-size-sel').value='';},50); };

function updateToolbarState() {
  [['bold','btn-bold'],['italic','btn-italic'],['underline','btn-underline']].forEach(([cmd,id])=>{
    const b=document.getElementById(id); if(b) b.classList.toggle('active',document.queryCommandState(cmd));
  });
}
function updateWordCount() {
  const el=document.getElementById('word-count');
  if(el) el.textContent=countWords(stripHTML(document.getElementById('doc-editor').innerHTML))+' từ';
}
function updateStatus(msg) {
  const el=document.getElementById('editor-status'); if(!el) return;
  el.innerHTML = msg==='Đã lưu'
    ? '<i class="fas fa-cloud" style="color:var(--accent2)"></i> Đã lưu'
    : '<i class="fas fa-circle" style="color:var(--accent4);font-size:.45rem;vertical-align:middle"></i> '+msg;
}

// ════════════════════════════════════════
//  TÁCH DÒNG — DOM walker (chính xác nhất)
// ════════════════════════════════════════
const BLOCK_TAGS = new Set(['DIV','P','LI','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','TR','TD','TH']);

function splitLines(html) {
  if (!html || !html.trim()) return [];
  const root = document.createElement('div');
  root.innerHTML = html;
  const lines = [];
  let cur = '';

  function flush() {
    const t = cur.replace(/\u00a0/g, ' ').trim();
    if (t) lines.push(t);
    cur = '';
  }
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) { cur += node.textContent; return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (tag === 'BR') { flush(); return; }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock && cur.trim()) flush();
    for (const child of node.childNodes) walk(child);
    if (isBlock) flush();
  }
  walk(root);
  flush();
  return lines.filter(l => l.length > 0);
}

function getEditorLines(el) { return splitLines(el.innerHTML); }

// ════════════════════════════════════════
//  TEST MODE
// ════════════════════════════════════════
window.quickTest = function(e, id) {
  e.stopPropagation();
  const doc = getDoc(id); if (!doc) return;
  if (!splitLines(doc.content||'').length) { showToast('Văn bản chưa có nội dung!','error'); return; }
  currentDocId = id; testFromEditor = false; _enterTestMode(doc);
};
window.openTestMode = function() {
  if (!currentDocId) return;
  saveDoc(true);
  const doc = getDoc(currentDocId);
  if (!doc || !splitLines(doc.content||'').length) { showToast('Hãy soạn nội dung trước!','error'); return; }
  testFromEditor = true; _enterTestMode(doc);
};

function _enterTestMode(doc) {
  testSubmitted = false;
  clearTimeout(hintTimer); _hideHintUI();
  const testEd   = document.getElementById('test-editor');
  const diffView = document.getElementById('test-diff-view');
  testEd.innerHTML = ''; testEd.contentEditable = 'true'; testEd.style.display = '';
  diffView.innerHTML = ''; diffView.style.display = 'none';
  document.getElementById('test-doc-title-display').textContent = doc.title || 'Không có tiêu đề';
  document.getElementById('btn-submit-test').style.display = '';
  document.getElementById('btn-retry-test').style.display  = 'none';
  document.getElementById('test-instruction-bar').style.display = '';
  document.getElementById('test-result-bar').style.display      = 'none';
  document.getElementById('test-word-count').innerHTML = '<i class="fas fa-file-word" style="color:var(--text3)"></i> 0 từ';
  showView('test'); testEd.focus();
}

window.backFromTest = function() {
  if (refPanelOpen) toggleRefPanel();
  clearTimeout(hintTimer); _hideHintUI();
  if (testFromEditor && currentDocId) openDoc(currentDocId);
  else { currentDocId = null; showView('list'); renderList(document.getElementById('tl-search').value); }
};
window.retryTest = function() { const doc=getDoc(currentDocId); if(doc) _enterTestMode(doc); };

// ─── NỘP BÀI ─────────────────────────────
window.submitTest = async function() {
  const doc = getDoc(currentDocId); if (!doc) return;
  if (refPanelOpen) toggleRefPanel();
  clearTimeout(hintTimer); _hideHintUI();

  const userHTML = document.getElementById('test-editor').innerHTML;
  if (!stripHTML(userHTML).trim()) { showToast('Hãy gõ nội dung trước!','error'); return; }

  const refLines  = splitLines(doc.content || '');
  const userLines = splitLines(userHTML);
  const result    = scoreByLines(refLines, userLines);

  await addHistoryEntryFB(currentDocId, { score:result.score, correct:result.correct, wrong:result.wrong, total:result.total, ts:Date.now() });
  testSubmitted = true;

  // Result bar
  const pctEl=document.getElementById('trb-pct'), gradeEl=document.getElementById('trb-grade');
  pctEl.textContent = result.score+'%';
  if      (result.score>=90) { pctEl.style.color='var(--correct)'; gradeEl.textContent='🏆 Xuất sắc!';    gradeEl.style.color='var(--correct)'; }
  else if (result.score>=75) { pctEl.style.color='var(--correct)'; gradeEl.textContent='🎉 Tốt lắm!';    gradeEl.style.color='var(--correct)'; }
  else if (result.score>=50) { pctEl.style.color='var(--accent4)'; gradeEl.textContent='💪 Cần cố thêm'; gradeEl.style.color='var(--accent4)'; }
  else                        { pctEl.style.color='var(--wrong)';   gradeEl.textContent='📖 Ôn lại nhé!'; gradeEl.style.color='var(--wrong)'; }
  document.getElementById('trb-correct').textContent = result.correct;
  document.getElementById('trb-wrong').textContent   = result.wrong;
  document.getElementById('trb-total').textContent   = result.total;
  document.getElementById('test-instruction-bar').style.display = 'none';
  document.getElementById('test-result-bar').style.display      = '';

  const diffView = document.getElementById('test-diff-view');
  diffView.innerHTML = buildLineDiff(result.lineDiffs);
  diffView.style.display = '';
  document.getElementById('test-editor').style.display   = 'none';
  document.getElementById('btn-submit-test').style.display = 'none';
  document.getElementById('btn-retry-test').style.display  = '';
};

// ─── SCORING ─────────────────────────────
function normalize(str) {
  return str
    .toLowerCase().replace(/đ/g,'d')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[,;:!?"'`~@#$%^&_\\|<>]/g,'')
    .replace(/\s+/g,' ').trim();
}
function tokenize(str) { return normalize(str).split(' ').filter(w=>w.length>0); }

// lcsWordDiff nhận thêm refOrigWords và userOrigWords (chữ gốc có dấu)
// để hiển thị đẹp, nhưng so sánh bằng normalized tokens
function lcsWordDiff(refToks, userToks, refOrig, userOrig) {
  const R=refToks.length, U=userToks.length;
  if (!R&&!U) return [];
  const dp=Array.from({length:R+1},()=>new Int32Array(U+1));
  for(let i=1;i<=R;i++) for(let j=1;j<=U;j++)
    dp[i][j]=refToks[i-1]===userToks[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);
  const ops=[]; let i=R,j=U;
  while(i>0||j>0){
    if(i>0&&j>0&&refToks[i-1]===userToks[j-1]){
      ops.push({type:'ok',   word:refOrig[i-1]});  // chữ gốc có dấu
      i--;j--;
    } else if(j>0&&(i===0||dp[i][j-1]>=dp[i-1][j])){
      ops.push({type:'extra',word:userOrig[j-1]}); // chữ user gõ
      j--;
    } else {
      ops.push({type:'miss', word:refOrig[i-1]});  // chữ gốc bị thiếu
      i--;
    }
  }
  return ops.reverse();
}

// Tách từ gốc (giữ nguyên dấu, chỉ split khoảng trắng)
function tokenizeOrig(str) {
  // Bỏ các dấu câu không cần giống normalize nhưng GIỮ dấu tiếng Việt
  return str
    .replace(/[,;:!?"'`~@#$%^&_\\|<>]/g,'')
    .replace(/\s+/g,' ').trim()
    .split(' ').filter(w=>w.length>0);
}

function scoreByLines(refLines, userLines) {
  let totalCorrect=0, totalWrong=0, totalRef=0;
  const lineDiffs=[];
  const maxLines=Math.max(refLines.length, userLines.length);
  for(let i=0;i<maxLines;i++){
    const refLine  = refLines[i]  || '';
    const userLine = userLines[i] || '';
    const refToks  = tokenize(refLine);       // normalized để so sánh
    const userToks = tokenize(userLine);
    const refOrig  = tokenizeOrig(refLine);   // gốc có dấu để hiển thị
    const userOrig = tokenizeOrig(userLine);
    totalRef += refToks.length;
    if(!refToks.length && !userToks.length) continue;
    const diff = lcsWordDiff(refToks, userToks, refOrig, userOrig);
    totalCorrect += diff.filter(t=>t.type==='ok').length;
    totalWrong   += diff.filter(t=>t.type==='miss').length;
    lineDiffs.push({ lineNum:i+1, refLine, diff });
  }
  const score = totalRef>0 ? Math.round((totalCorrect/totalRef)*100) : 100;
  return { score, correct:totalCorrect, wrong:totalWrong, total:totalRef, lineDiffs };
}

function buildLineDiff(lineDiffs) {
  if (!lineDiffs.length) return '<em style="color:var(--text3)">Không có dữ liệu</em>';
  return lineDiffs.map(({lineNum, refLine, diff}) => {
    if (!diff.length) return '';
    const inner = diff.map(t => {
      if(t.type==='ok')    return `<span class="dw-ok">${escapeHTML(t.word)}</span>`;
      if(t.type==='miss')  return `<span class="dw-miss">${escapeHTML(t.word)}</span>`;
      if(t.type==='extra') return `<span class="dw-extra">${escapeHTML(t.word)}</span>`;
      return '';
    }).join(' ');
    return `<div class="diff-line"><span class="diff-line-num">${lineNum}</span><span class="diff-line-content">${inner}</span></div>`;
  }).join('');
}

// ─── XEM GỐC PANEL ────────────────────────
window.toggleRefPanel = function() {
  const panel=document.getElementById('ref-panel'), overlay=document.getElementById('ref-panel-overlay');
  refPanelOpen=!refPanelOpen;
  if(refPanelOpen){
    const doc=getDoc(currentDocId);
    document.getElementById('ref-panel-body').innerHTML=doc?(doc.content||'<em style="color:var(--text3)">Trống</em>'):'';
    panel.classList.add('open'); overlay.classList.add('show');
  } else { panel.classList.remove('open'); overlay.classList.remove('show'); }
};

function updateTestWordCount() {
  const w=countWords(stripHTML(document.getElementById('test-editor').innerHTML));
  document.getElementById('test-word-count').innerHTML=`<i class="fas fa-file-word" style="color:var(--text3)"></i> ${w} từ`;
}

// ════════════════════════════════════════
//  GỢI Ý THÔNG MINH — icon 💡 fixed theo cursor
// ════════════════════════════════════════
const HINT_WORDS = 3;

function computeHint() {
  if (testSubmitted) { _hideHintUI(); return; }
  const doc = getDoc(currentDocId); if (!doc) { _hideHintUI(); return; }
  const refLines = splitLines(doc.content || '');
  if (!refLines.length) { _hideHintUI(); return; }

  const testEd = document.getElementById('test-editor');
  // Editor phải đang focus
  if (document.activeElement !== testEd) {
    // Ẩn bulb nhưng không đóng popup (user đang hover)
    if (!hintPopupOpen) {
      const bulb=document.getElementById('hint-bulb');
      if(bulb) bulb.style.display='none';
    }
    return;
  }

  const cursorLineIdx = getCursorLineIndex(testEd);
  const refLine = refLines[cursorLineIdx] || '';
  const refToks = tokenize(refLine);
  if (!refToks.length) { _hideHintUI(); return; }

  const userLines   = getEditorLines(testEd);
  const userLineRaw = userLines[cursorLineIdx] || '';
  const userToks    = tokenize(userLineRaw);

  let hint = '';
  if (userToks.length === 0) {
    hint = refToks.slice(0, HINT_WORDS).join(' ') + (refToks.length > HINT_WORDS ? ' ...' : '');
  } else {
    let matchLen = 0;
    for (let k=Math.min(userToks.length,refToks.length); k>=1; k--) {
      if (userToks.slice(0,k).join('|') === refToks.slice(0,k).join('|')) { matchLen=k; break; }
    }
    if (matchLen > 0) {
      const next = matchLen;
      hint = next >= refToks.length
        ? '✓ Dòng đã hoàn chỉnh!'
        : refToks.slice(next, next+HINT_WORDS).join(' ') + (refToks.length-next>HINT_WORDS?' ...':'');
    } else {
      const lastIdx = refToks.indexOf(userToks[userToks.length-1]);
      if (lastIdx>=0 && lastIdx+1<refToks.length) {
        hint = refToks.slice(lastIdx+1, lastIdx+1+HINT_WORDS).join(' ') + (refToks.length-lastIdx-1>HINT_WORDS?' ...':'');
      } else {
        hint = refToks.slice(0,HINT_WORDS).join(' ') + (refToks.length>HINT_WORDS?' ...':'');
      }
    }
  }

  currentHintStr = hint;
  placeBulbFixed();
  if (hintPopupOpen) updatePopupContent();
}

// ─── Đặt bulb cố định ở lề trái editor, chỉ thay đổi top theo dòng cursor ─
function placeBulbFixed() {
  const bulb   = document.getElementById('hint-bulb');
  const testEd = document.getElementById('test-editor');
  if (!bulb || !testEd) return;

  // Lấy vị trí cursor để biết top
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) { bulb.style.display='none'; return; }
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  let cursorRect;
  try { cursorRect = range.getBoundingClientRect(); } catch { bulb.style.display='none'; return; }
  if (!cursorRect || cursorRect.height === 0) { bulb.style.display='none'; return; }

  // Left = lề trái của test-editor trên viewport - 34px (ngoài lề)
  const edRect    = testEd.getBoundingClientRect();
  const BULB_W    = 28;
  const GAP       = 6;
  const fixedLeft = Math.max(2, edRect.left - BULB_W - GAP);
  const topPx     = cursorRect.top + (cursorRect.height / 2) - (BULB_W / 2);

  bulb.style.left    = fixedLeft + 'px';
  bulb.style.top     = topPx + 'px';
  bulb.style.display = 'flex';

  if (hintPopupOpen) _positionPopup(fixedLeft, topPx);
}

function _hideHintUI() {
  currentHintStr = '';
  const bulb=document.getElementById('hint-bulb'); if(bulb) bulb.style.display='none';
  closeHintPopup();
}

// ─── Click bulb ────────────────────────
window.clickHintBulb = function() {
  if (hintPopupOpen) { closeHintPopup(); return; }
  openHintPopup();
};

function openHintPopup() {
  const popup = document.getElementById('hint-popup');
  const bulb  = document.getElementById('hint-bulb');
  if (!popup || !bulb) return;

  updatePopupContent();
  hintPopupOpen = true;

  const leftPx = parseFloat(bulb.style.left || '0');
  const topPx  = parseFloat(bulb.style.top  || '0');
  _positionPopup(leftPx, topPx);

  popup.style.display = 'block';
  // Reset animation
  popup.classList.remove('visible');
  requestAnimationFrame(() => popup.classList.add('visible'));

  bulb.classList.add('active');
}

// Popup luôn bên PHẢI bulb (bulb ở lề trái → popup vào phía trong editor)
function _positionPopup(bulbLeft, bulbTop) {
  const popup   = document.getElementById('hint-popup');
  if (!popup) return;
  const BULB_W  = 28, GAP = 8;
  const popupW  = 220;
  const viewW   = window.innerWidth;

  let left = bulbLeft + BULB_W + GAP;
  // Nếu popup tràn phải màn hình → đẩy lại
  if (left + popupW > viewW - 8) left = Math.max(4, viewW - popupW - 8);

  popup.style.left = left + 'px';
  popup.style.top  = Math.max(68, bulbTop - 8) + 'px';
}
// alias cũ (compat)
function positionPopupFixed(l, t) { _positionPopup(l, t); }

function updatePopupContent() {
  const textEl=document.getElementById('hint-popup-text'); if(!textEl) return;
  const isDone = currentHintStr.startsWith('✓');
  textEl.textContent = currentHintStr || '...';
  textEl.className   = 'hint-popup-text' + (isDone?' is-done':'');
  const acceptBtn=document.querySelector('.hint-accept-btn');
  if(acceptBtn) acceptBtn.style.display = isDone?'none':'';
}

window.closeHintPopup = function() {
  hintPopupOpen=false;
  const popup=document.getElementById('hint-popup'); if(popup) popup.style.display='none';
  const bulb=document.getElementById('hint-bulb');  if(bulb) bulb.classList.remove('active');
};

window.acceptHintFromPopup = function() { insertHintText(); closeHintPopup(); };

function insertHintText() {
  if (!currentHintStr || currentHintStr.startsWith('✓')) return;
  const hint   = currentHintStr.replace(/ \.\.\.$/,'');
  const testEd = document.getElementById('test-editor');
  testEd.focus();
  const sel=window.getSelection(); if(!sel||!sel.rangeCount) return;
  const range=sel.getRangeAt(0); range.collapse(false);
  const before=getCharBeforeCursor(testEd);
  const pre = (before===' '||before==='') ? '' : ' ';
  const node=document.createTextNode(pre+hint+' ');
  range.insertNode(node); range.setStartAfter(node); range.collapse(true);
  sel.removeAllRanges(); sel.addRange(range);
  testEd.dispatchEvent(new Event('input',{bubbles:true}));
  clearTimeout(hintTimer); hintTimer=setTimeout(computeHint,200);
}

function handleHintTab(e) {
  if (e.key!=='Tab') return;
  const bulb=document.getElementById('hint-bulb');
  if (!bulb||bulb.style.display==='none') return;
  e.preventDefault();
  if (hintPopupOpen) { insertHintText(); closeHintPopup(); }
  else openHintPopup();
}

// ─── Cursor helpers ───────────────────────
function getCursorLineIndex(el) {
  const sel=window.getSelection(); if(!sel||!sel.rangeCount) return 0;
  const range=sel.getRangeAt(0).cloneRange(); range.collapse(true);
  const pre=document.createRange(); pre.setStart(el,0);
  try { pre.setEnd(range.startContainer,range.startOffset); } catch { return 0; }
  const tmp=document.createElement('div'); tmp.appendChild(pre.cloneContents());
  const html=tmp.innerHTML
    .replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n')
    .replace(/<\/div>/gi,'\n').replace(/<\/li>/gi,'\n');
  return Math.max(0, html.split('\n').length-1);
}

function getCharBeforeCursor(el) {
  const sel=window.getSelection(); if(!sel||!sel.rangeCount) return '';
  const r=sel.getRangeAt(0).cloneRange(); r.collapse(true);
  if(r.startOffset===0) return '';
  r.setStart(r.startContainer,r.startOffset-1);
  return r.toString();
}

// ─── HISTORY MODAL ────────────────────────
window.openHistoryModal = function(e, id) {
  e.stopPropagation(); historyTargetId=id;
  const doc=getDoc(id);
  document.getElementById('history-modal-doc-name').textContent = doc?(doc.title||'Không có tiêu đề'):'Văn bản đã xóa';
  const entries = Object.values(_historyCache[id]||{}).sort((a,b)=>b.ts-a.ts);
  const wrap=document.getElementById('history-modal-entries');
  if(!entries.length){
    wrap.innerHTML='<div class="history-empty"><i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:10px"></i>Chưa có lịch sử kiểm tra</div>';
  } else {
    wrap.innerHTML=entries.map((e,idx)=>{
      const cls  =e.score>=80?'s-good':e.score>=50?'s-mid':'s-bad';
      const grade=e.score>=90?'Xuất sắc':e.score>=75?'Tốt':e.score>=50?'Trung bình':'Cần cố gắng';
      return `<div class="history-entry">
        <div class="history-entry-score ${cls}">${e.score}%</div>
        <div class="history-entry-info">
          <div class="history-entry-grade">${grade} ${idx===0?'<span style="font-size:.7rem;color:var(--accent);background:rgba(108,99,255,.12);padding:2px 8px;border-radius:10px;margin-left:4px">Mới nhất</span>':''}</div>
          <div class="history-entry-meta">
            <span><i class="fas fa-check" style="color:var(--correct)"></i> ${e.correct} đúng</span>
            <span><i class="fas fa-times" style="color:var(--wrong)"></i> ${e.wrong} sai</span>
            <span><i class="fas fa-file-word"></i> ${e.total} từ</span>
            <span><i class="fas fa-clock"></i> ${formatDate(e.ts)}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }
  document.getElementById('history-modal').classList.add('visible');
};
window.closeHistoryModal = () => { document.getElementById('history-modal').classList.remove('visible'); historyTargetId=null; };
window.clearHistory = async () => {
  if(!historyTargetId) return;
  await clearHistoryFB(historyTargetId);
  showToast('Đã xóa lịch sử','error'); closeHistoryModal();
};

// ─── UTILS ───────────────────────────────
function stripHTML(html) { const d=document.createElement('div'); d.innerHTML=html; return d.textContent||d.innerText||''; }
function escapeHTML(s)   { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function countWords(t)   { if(!t||!t.trim()) return 0; return t.trim().split(/\s+/).filter(w=>w.length>0).length; }
function formatDate(ts)  {
  if(!ts) return '';
  const d=new Date(ts), diff=Date.now()-d;
  const m=Math.floor(diff/60000), h=Math.floor(diff/3600000);
  if(m<1) return 'Vừa xong'; if(m<60) return m+' phút trước'; if(h<24) return h+' giờ trước';
  return d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function placeCursorAtEnd(el) {
  const sel=window.getSelection(), r=document.createRange();
  r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
}

// ─── KEYBOARD SHORTCUTS ──────────────────
document.addEventListener('keydown', e => {
  const active=document.activeElement;
  if (active===document.getElementById('test-editor')) handleHintTab(e);
  if ((active===document.getElementById('doc-editor')||active===document.getElementById('doc-title'))
      &&(e.ctrlKey||e.metaKey)&&e.key==='s') { e.preventDefault(); saveDoc(); }
  if (e.key==='Escape') {
    if(refPanelOpen) toggleRefPanel();
    if(hintPopupOpen) closeHintPopup();
    document.getElementById('history-modal').classList.remove('visible');
    closeModal();
  }
});

// ─── INIT ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const ls=document.getElementById('loading-screen');
  if(ls) setTimeout(()=>{ ls.style.opacity='0'; setTimeout(()=>{ls.style.display='none';},500); },300);

  // Hiển thị spinner ngay
  renderList();

  // Subscribe Firebase
  subscribeFirebase();

  const docEd=document.getElementById('doc-editor');
  if(docEd){
    docEd.addEventListener('input',()=>{ updateWordCount(); scheduleAutoSave(); });
    docEd.addEventListener('keyup',  updateToolbarState);
    docEd.addEventListener('mouseup',updateToolbarState);
  }
  const docTitle=document.getElementById('doc-title');
  if(docTitle) docTitle.addEventListener('input',scheduleAutoSave);

  const testEd=document.getElementById('test-editor');
  if(testEd){
    testEd.addEventListener('input',()=>{
      updateTestWordCount();
      clearTimeout(hintTimer); hintTimer=setTimeout(computeHint,350);
    });
    testEd.addEventListener('click',()=>{
      if(hintPopupOpen) closeHintPopup();
      clearTimeout(hintTimer); hintTimer=setTimeout(computeHint,150);
    });
    testEd.addEventListener('keyup', e=>{
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Home','End'].includes(e.key)){
        if(hintPopupOpen) closeHintPopup();
        clearTimeout(hintTimer); hintTimer=setTimeout(computeHint,150);
      }
    });
  }

  ['tl-modal','history-modal'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('click',function(e){
      if(e.target===this){ this.classList.remove('visible'); if(id==='history-modal') historyTargetId=null; }
    });
  });
});
