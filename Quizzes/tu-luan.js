// ========================================
// QuizMaster — tu-luan.js
// ========================================

const STORAGE_KEY = 'qm_tu_luan_docs';
const HISTORY_KEY = 'qm_tu_luan_history';

// ─── DATA ────────────────────────────────
function loadDocs()  { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function saveDocs(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }
function getDoc(id)  { return loadDocs().find(d => d.id === id) || null; }

function loadHistory()  { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch { return {}; } }
function saveHistory(h) { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }
function addHistoryEntry(docId, entry) {
  const h = loadHistory();
  if (!h[docId]) h[docId] = [];
  h[docId].unshift(entry);
  if (h[docId].length > 50) h[docId].length = 50;
  saveHistory(h);
}
function getBestScore(docId) {
  const e = (loadHistory()[docId] || []);
  return e.length ? Math.max(...e.map(x => x.score)) : null;
}

// ─── STATE ───────────────────────────────
let currentDocId      = null;
let autoSaveTimer     = null;
let hasUnsavedChanges = false;
let testFromEditor    = false;
let historyTargetId   = null;
let refPanelOpen      = false;
let testSubmitted     = false;

// Hint state
let hintTimer       = null;
let currentHintStr  = '';
let hintPopupOpen   = false;

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
  document.getElementById('tl-hero').style.display  = name === 'list'   ? '' : 'none';
  document.getElementById('view-list').style.display = name === 'list'   ? '' : 'none';
  document.getElementById('view-editor').style.display = name === 'editor' ? 'flex' : 'none';
  document.getElementById('view-test').style.display   = name === 'test'   ? 'flex' : 'none';
}

// ─── RENDER LIST ─────────────────────────
function renderList(filterText = '') {
  const grid  = document.getElementById('tl-grid');
  const empty = document.getElementById('tl-empty');
  const query = filterText.trim().toLowerCase();
  const sorted = [...loadDocs()].sort((a, b) => b.updatedAt - a.updatedAt);
  const filtered = query
    ? sorted.filter(d => (d.title||'').toLowerCase().includes(query) || stripHTML(d.content||'').toLowerCase().includes(query))
    : sorted;

  if (!filtered.length) { grid.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  grid.innerHTML = filtered.map(doc => {
    const preview   = stripHTML(doc.content || '').slice(0,160) || 'Chưa có nội dung...';
    const best      = getBestScore(doc.id);
    const titleHtml = doc.title ? escapeHTML(doc.title) : '<em style="color:var(--text3)">Không có tiêu đề</em>';
    const scoreBadge = best !== null
      ? `<span class="doc-card-score ${best>=80?'good':best>=50?'mid':'bad'}">⭐ ${best}%</span>`
      : '';
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
window.openNew = function() {
  const doc = { id:'doc_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), title:'', content:'', createdAt:Date.now(), updatedAt:Date.now() };
  const docs = loadDocs(); docs.unshift(doc); saveDocs(docs);
  openDoc(doc.id);
};
window.openDoc = function(id) {
  const doc = getDoc(id);
  if (!doc) { showToast('Không tìm thấy văn bản','error'); return; }
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
window.saveDoc = function(silent=false) {
  if (!currentDocId) return;
  const docs = loadDocs(), idx = docs.findIndex(d => d.id === currentDocId);
  if (idx===-1) return;
  docs[idx].title   = document.getElementById('doc-title').value.trim();
  docs[idx].content = document.getElementById('doc-editor').innerHTML;
  docs[idx].updatedAt = Date.now();
  saveDocs(docs); hasUnsavedChanges = false; updateStatus('Đã lưu');
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
window.deleteDocCard = (e,id) => { e.stopPropagation(); openDeleteModal(id,false); };
window.confirmDelete = () => { if (currentDocId) openDeleteModal(currentDocId,true); };
function openDeleteModal(id,fromEditor) {
  document.getElementById('tl-modal').classList.add('visible');
  const old = document.getElementById('tl-modal-confirm-btn');
  const nb  = old.cloneNode(true); old.parentNode.replaceChild(nb,old);
  nb.addEventListener('click', () => { doDelete(id,fromEditor); closeModal(); });
}
function doDelete(id,fromEditor) {
  saveDocs(loadDocs().filter(d=>d.id!==id));
  const h=loadHistory(); delete h[id]; saveHistory(h);
  showToast('Đã xóa văn bản','error');
  if (fromEditor) { currentDocId=null; clearTimeout(autoSaveTimer); showView('list'); }
  renderList(document.getElementById('tl-search').value);
}
window.closeModal = () => document.getElementById('tl-modal').classList.remove('visible');

// ─── EDITOR COMMANDS ─────────────────────
window.execCmd      = cmd => { document.getElementById('doc-editor').focus(); document.execCommand(cmd,false,null); updateToolbarState(); };
window.removeFormat = () => { const ed=document.getElementById('doc-editor'); ed.focus(); document.execCommand('removeFormat',false,null); document.execCommand('formatBlock',false,'p'); updateToolbarState(); };
window.changeFontSize = val => {
  if (!val) return;
  document.getElementById('doc-editor').focus(); document.execCommand('fontSize',false,val);
  setTimeout(()=>{ document.getElementById('font-size-sel').value=''; },50);
};
function updateToolbarState() {
  [['bold','btn-bold'],['italic','btn-italic'],['underline','btn-underline']].forEach(([cmd,id])=>{
    const b=document.getElementById(id); if(b) b.classList.toggle('active', document.queryCommandState(cmd));
  });
}
function updateWordCount() {
  const el=document.getElementById('word-count');
  if (el) el.textContent = countWords(stripHTML(document.getElementById('doc-editor').innerHTML))+' từ';
}
function updateStatus(msg) {
  const el=document.getElementById('editor-status'); if(!el) return;
  el.innerHTML = msg==='Đã lưu'
    ? '<i class="fas fa-cloud" style="color:var(--accent2)"></i> Đã lưu'
    : '<i class="fas fa-circle" style="color:var(--accent4);font-size:.45rem;vertical-align:middle"></i> '+msg;
}

// ════════════════════════════════════════
//  NORMALIZE & TOKENIZE
//
//  Quy tắc:
//  - Bỏ dấu tiếng Việt, lowercase
//  - GIỮ LẠI: + - * / = ( ) { } [ ] và dấu chấm x.x (kẹp giữa 2 ký tự)
//  - Bỏ: dấu , ; : ! ? " ' và dấu chấm đứng đầu/cuối word
// ════════════════════════════════════════
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/đ/g,'d')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    // Bỏ các dấu không cần: , ; : ! ? " ' ` ~ @ # $ % ^ & _ \ | < >
    .replace(/[,;:!?"'`~@#$%^&_\\|<>]/g,'')
    .replace(/\s+/g,' ').trim();
}

// Tách văn bản thành tokens — mỗi token là 1 "từ" (có thể chứa math ký tự)
function tokenize(str) {
  return normalize(str).split(' ').filter(w=>w.length>0);
}

// ─── Tách văn bản thành DÒNG ─────────────
// Dùng DOM walker để đảm bảo đúng với mọi cấu trúc contenteditable:
//   <div>line1</div><div>line2</div>  ← Chrome style
//   line1<br>line2                    ← Firefox style  
//   <p>line1</p><p>line2</p>          ← pasted content
function splitLines(html) {
  if (!html || !html.trim()) return [];

  // Parse thành DOM để walk chính xác
  const root = document.createElement('div');
  root.innerHTML = html;

  const lines = [];
  let currentLine = '';

  function flushLine() {
    const t = currentLine.replace(/\u00a0/g, ' ').trim(); // decode &nbsp;
    if (t) lines.push(t);
    currentLine = '';
  }

  // Block-level tags — khi gặp opening sẽ flush dòng hiện tại
  const BLOCK = new Set(['DIV','P','LI','H1','H2','H3','H4','H5','H6',
                         'BLOCKQUOTE','TR','TD','TH']);

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      currentLine += node.textContent;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toUpperCase();

    if (tag === 'BR') {
      flushLine();
      return;
    }

    const isBlock = BLOCK.has(tag);
    // Nếu là block và đang có nội dung → flush trước khi vào
    if (isBlock && currentLine.trim()) flushLine();

    for (const child of node.childNodes) walk(child);

    // Sau khi hết block → flush
    if (isBlock) flushLine();
  }

  walk(root);
  flushLine(); // flush phần còn lại

  return lines.filter(l => l.length > 0);
}

// ════════════════════════════════════════
//  TEST MODE
// ════════════════════════════════════════
window.quickTest = function(e,id) {
  e.stopPropagation();
  const doc=getDoc(id); if(!doc) return;
  if (!splitLines(doc.content||'').length) { showToast('Văn bản chưa có nội dung!','error'); return; }
  currentDocId=id; testFromEditor=false; _enterTestMode(doc);
};
window.openTestMode = function() {
  if (!currentDocId) return;
  saveDoc(true);
  const doc=getDoc(currentDocId);
  if (!doc||!splitLines(doc.content||'').length) { showToast('Hãy soạn nội dung trước!','error'); return; }
  testFromEditor=true; _enterTestMode(doc);
};

function _enterTestMode(doc) {
  testSubmitted=false;
  clearTimeout(hintTimer);
  _hideHintUI();

  const testEd=document.getElementById('test-editor');
  const diffView=document.getElementById('test-diff-view');
  testEd.innerHTML=''; testEd.contentEditable='true'; testEd.style.display='';
  diffView.innerHTML=''; diffView.style.display='none';
  document.getElementById('test-doc-title-display').textContent = doc.title||'Không có tiêu đề';
  document.getElementById('btn-submit-test').style.display='';
  document.getElementById('btn-retry-test').style.display='none';
  document.getElementById('test-instruction-bar').style.display='';
  document.getElementById('test-result-bar').style.display='none';
  document.getElementById('test-word-count').innerHTML='<i class="fas fa-file-word" style="color:var(--text3)"></i> 0 từ';
  showView('test'); testEd.focus();
}

window.backFromTest = function() {
  if (refPanelOpen) toggleRefPanel();
  clearTimeout(hintTimer);
  _hideHintUI();
  if (testFromEditor && currentDocId) openDoc(currentDocId);
  else { currentDocId=null; showView('list'); renderList(document.getElementById('tl-search').value); }
};
window.retryTest = function() { const doc=getDoc(currentDocId); if(doc) _enterTestMode(doc); };

// ─── NỘP BÀI ─────────────────────────────
window.submitTest = function() {
  const doc=getDoc(currentDocId); if(!doc) return;
  if (refPanelOpen) toggleRefPanel();
  clearTimeout(hintTimer);
  _hideHintUI();

  const userHTML = document.getElementById('test-editor').innerHTML;
  const userText = stripHTML(userHTML);
  if (!userText.trim()) { showToast('Hãy gõ nội dung trước!','error'); return; }

  // ── Tính điểm theo DÒNG ──
  const refLines  = splitLines(doc.content||'');
  const userLines = splitLines(userHTML);
  const result    = scoreByLines(refLines, userLines);

  addHistoryEntry(currentDocId, { score:result.score, correct:result.correct, wrong:result.wrong, total:result.total, ts:Date.now() });
  testSubmitted=true;

  // Result bar
  const pctEl=document.getElementById('trb-pct'), gradeEl=document.getElementById('trb-grade');
  pctEl.textContent=result.score+'%';
  if (result.score>=90)      { pctEl.style.color='var(--correct)'; gradeEl.textContent='🏆 Xuất sắc!';    gradeEl.style.color='var(--correct)'; }
  else if (result.score>=75) { pctEl.style.color='var(--correct)'; gradeEl.textContent='🎉 Tốt lắm!';    gradeEl.style.color='var(--correct)'; }
  else if (result.score>=50) { pctEl.style.color='var(--accent4)'; gradeEl.textContent='💪 Cần cố thêm'; gradeEl.style.color='var(--accent4)'; }
  else                        { pctEl.style.color='var(--wrong)';   gradeEl.textContent='📖 Ôn lại nhé!'; gradeEl.style.color='var(--wrong)'; }
  document.getElementById('trb-correct').textContent=result.correct;
  document.getElementById('trb-wrong').textContent=result.wrong;
  document.getElementById('trb-total').textContent=result.total;
  document.getElementById('test-instruction-bar').style.display='none';
  document.getElementById('test-result-bar').style.display='';

  // Inline diff — theo từng DÒNG
  const diffView=document.getElementById('test-diff-view');
  diffView.innerHTML=buildLineDiff(result.lineDiffs);
  diffView.style.display='';
  document.getElementById('test-editor').style.display='none';
  document.getElementById('btn-submit-test').style.display='none';
  document.getElementById('btn-retry-test').style.display='';
  renderList(document.getElementById('tl-search').value);
};

// ─── SCORE BY LINES ───────────────────────
function scoreByLines(refLines, userLines) {
  let totalCorrect=0, totalWrong=0, totalRef=0;
  const lineDiffs=[];

  const maxLines=Math.max(refLines.length, userLines.length);
  for (let i=0; i<maxLines; i++) {
    const refLine  = refLines[i]  || '';
    const userLine = userLines[i] || '';
    const refToks  = tokenize(refLine);
    const userToks = tokenize(userLine);
    totalRef += refToks.length;

    if (!refToks.length && !userToks.length) continue;

    const diff = lcsWordDiff(refToks, userToks);
    const ok   = diff.filter(t=>t.type==='ok').length;
    const miss = diff.filter(t=>t.type==='miss').length;
    totalCorrect += ok;
    totalWrong   += miss;

    lineDiffs.push({ lineNum:i+1, refLine, diff });
  }

  const score = totalRef>0 ? Math.round((totalCorrect/totalRef)*100) : 100;
  return { score, correct:totalCorrect, wrong:totalWrong, total:totalRef, lineDiffs };
}

// LCS diff giống cũ nhưng tái sử dụng
function lcsWordDiff(refWords, userWords) {
  const R=refWords.length, U=userWords.length;
  if (!R && !U) return [];
  const dp=Array.from({length:R+1},()=>new Int32Array(U+1));
  for (let i=1;i<=R;i++) for (let j=1;j<=U;j++)
    dp[i][j] = refWords[i-1]===userWords[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j],dp[i][j-1]);
  const ops=[]; let i=R,j=U;
  while (i>0||j>0) {
    if (i>0&&j>0&&refWords[i-1]===userWords[j-1]) { ops.push({type:'ok',   word:refWords[i-1]}); i--;j--; }
    else if (j>0&&(i===0||dp[i][j-1]>=dp[i-1][j])){ ops.push({type:'extra',word:userWords[j-1]}); j--; }
    else                                             { ops.push({type:'miss', word:refWords[i-1]}); i--; }
  }
  return ops.reverse();
}

// ─── BUILD LINE DIFF HTML ─────────────────
// Mỗi dòng gốc = 1 `diff-line`, có số dòng ở lề
function buildLineDiff(lineDiffs) {
  if (!lineDiffs.length) return '<em style="color:var(--text3)">Không có dữ liệu</em>';
  return lineDiffs.map(({lineNum, refLine, diff}) => {
    const inner = diff.map(t => {
      if (t.type==='ok')    return `<span class="dw-ok">${escapeHTML(t.word)}</span>`;
      if (t.type==='miss')  return `<span class="dw-miss">${escapeHTML(t.word)}</span>`;
      if (t.type==='extra') return `<span class="dw-extra">${escapeHTML(t.word)}</span>`;
      return '';
    }).join(' ');

    // Nếu diff trống (cả 2 dòng trống) thì skip
    if (!inner.trim() && !refLine.trim()) return '';

    // Nếu dòng người dùng không tồn tại → cả dòng đều miss
    const lineClass = diff.every(t=>t.type==='miss') ? ' diff-line-all-miss'
                    : diff.every(t=>t.type==='ok')   ? ' diff-line-all-ok' : '';

    return `<div class="diff-line${lineClass}"><span class="diff-line-num">${lineNum}</span><span class="diff-line-content">${inner||'<span class="dw-miss">(trống)</span>'}</span></div>`;
  }).join('');
}

// ─── XEM GỐC PANEL ────────────────────────
window.toggleRefPanel = function() {
  const panel=document.getElementById('ref-panel'), overlay=document.getElementById('ref-panel-overlay');
  refPanelOpen=!refPanelOpen;
  if (refPanelOpen) {
    const doc=getDoc(currentDocId);
    document.getElementById('ref-panel-body').innerHTML = doc?(doc.content||'<em style="color:var(--text3)">Trống</em>'):'';
    panel.classList.add('open'); overlay.classList.add('show');
  } else { panel.classList.remove('open'); overlay.classList.remove('show'); }
};

function updateTestWordCount() {
  const words=countWords(stripHTML(document.getElementById('test-editor').innerHTML));
  document.getElementById('test-word-count').innerHTML=`<i class="fas fa-file-word" style="color:var(--text3)"></i> ${words} từ`;
}

// ════════════════════════════════════════
//  GỢI Ý THÔNG MINH — icon 💡 theo dòng cursor
//
//  Flow:
//  1. Khi cursor di chuyển (input/click/arrow) → tính hint text + đặt vị trí icon 💡
//  2. Icon 💡 xuất hiện ở lề trái, thẳng hàng với dòng cursor
//  3. Click 💡 → mở popup bên trái hiện gợi ý
//  4. Click "Chèn (Tab)" hoặc nhấn Tab → chèn text vào editor
// ════════════════════════════════════════

const HINT_WORDS = 3;

// ─── Tính hint cho dòng hiện tại ─────────
function computeHint() {
  if (testSubmitted) { _hideHintUI(); return; }
  const doc = getDoc(currentDocId); if (!doc) { _hideHintUI(); return; }
  const refLines = splitLines(doc.content || '');
  if (!refLines.length) { _hideHintUI(); return; }

  const testEd = document.getElementById('test-editor');
  // Nếu editor không có focus → ẩn bulb nhưng KHÔNG đóng popup nếu đang mở
  if (document.activeElement !== testEd) {
    const bulb = document.getElementById('hint-bulb');
    if (bulb && !hintPopupOpen) bulb.style.display = 'none';
    return;
  }

  const cursorLineIdx = getCursorLineIndex(testEd);
  const refLine      = refLines[cursorLineIdx] || '';
  const refToks      = tokenize(refLine);
  if (!refToks.length) { _hideHintUI(); return; }

  const userLines   = getEditorLines(testEd);
  const userLineRaw = userLines[cursorLineIdx] || '';
  const userToks    = tokenize(userLineRaw);

  let hint = '';

  if (userToks.length === 0) {
    hint = refToks.slice(0, HINT_WORDS).join(' ') + (refToks.length > HINT_WORDS ? ' ...' : '');
  } else {
    // Tìm prefix match dài nhất (userToks khớp đầu refToks)
    let matchLen = 0;
    for (let k = Math.min(userToks.length, refToks.length); k >= 1; k--) {
      if (userToks.slice(0, k).join('|') === refToks.slice(0, k).join('|')) { matchLen = k; break; }
    }

    if (matchLen > 0) {
      const nextIdx = matchLen;
      if (nextIdx >= refToks.length) {
        hint = '✓ Dòng đã hoàn chỉnh!';
      } else {
        hint = refToks.slice(nextIdx, nextIdx + HINT_WORDS).join(' ') + (refToks.length - nextIdx > HINT_WORDS ? ' ...' : '');
      }
    } else {
      const lastTok      = userToks[userToks.length - 1];
      const lastMatchIdx = refToks.indexOf(lastTok);
      if (lastMatchIdx >= 0 && lastMatchIdx + 1 < refToks.length) {
        hint = refToks.slice(lastMatchIdx + 1, lastMatchIdx + 1 + HINT_WORDS).join(' ')
             + (refToks.length - lastMatchIdx - 1 > HINT_WORDS ? ' ...' : '');
      } else {
        hint = refToks.slice(0, HINT_WORDS).join(' ') + (refToks.length > HINT_WORDS ? ' ...' : '');
      }
    }
  }

  currentHintStr = hint;
  placeBulbAtCursorLine(testEd);

  // Nếu popup đang mở → cập nhật nội dung
  if (hintPopupOpen) updatePopupContent();
}

// Helper: ẩn bulb VÀ đóng popup
function _hideHintUI() {
  currentHintStr = '';
  const bulb = document.getElementById('hint-bulb');
  if (bulb) bulb.style.display = 'none';
  closeHintPopup();
}

// ─── Đặt icon bóng đèn thẳng hàng dòng cursor ─
function placeBulbAtCursorLine(editorEl) {
  const bulb = document.getElementById('hint-bulb');
  if (!bulb) return;

  // Lấy bounding rect của cursor
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) { bulb.style.display = 'none'; return; }

  const range     = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  let rect;
  try { rect = range.getBoundingClientRect(); } catch { bulb.style.display = 'none'; return; }

  if (!rect || rect.height === 0) { bulb.style.display = 'none'; return; }

  // Vị trí relative so với editor-body (parent = .editor-body[style="position:relative"])
  const editorBody = editorEl.closest('.editor-body') || editorEl.parentElement;
  const bodyRect   = editorBody.getBoundingClientRect();

  // scrollTop của editorBody
  const scrollTop  = editorBody.scrollTop;

  const topPx = (rect.top - bodyRect.top) + scrollTop + (rect.height / 2) - 13; // 13 = half bulb height

  bulb.style.top     = topPx + 'px';
  bulb.style.display = 'flex';

  // Nếu popup đang mở, reposition nó cũng
  if (hintPopupOpen) positionPopup(bulb, topPx);
}



// ─── Click bóng đèn → mở popup ────────────
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

  const topPx = parseFloat(bulb.style.top || '0');
  positionPopup(bulb, topPx);

  popup.style.display = 'block';
  // Re-trigger animation
  popup.style.animation = 'none';
  requestAnimationFrame(() => { popup.style.animation = ''; });

  // Bulb sáng hơn khi popup mở
  bulb.classList.add('active');
}

function positionPopup(bulb, topPx) {
  const popup = document.getElementById('hint-popup');
  if (!popup) return;
  // Popup nằm ở top = topPx, right = calc(100% + 12px) — đã handle bởi CSS position:absolute
  popup.style.top = topPx + 'px';
}

function updatePopupContent() {
  const textEl = document.getElementById('hint-popup-text');
  const isDone = currentHintStr.startsWith('✓');
  textEl.textContent = currentHintStr || '...';
  textEl.className   = 'hint-popup-text' + (isDone ? ' is-done' : '');

  // Ẩn nút Chèn nếu dòng hoàn chỉnh
  const acceptBtn = document.querySelector('.hint-accept-btn');
  if (acceptBtn) acceptBtn.style.display = isDone ? 'none' : '';
}

window.closeHintPopup = function() {
  hintPopupOpen = false;
  const popup = document.getElementById('hint-popup');
  const bulb  = document.getElementById('hint-bulb');
  if (popup) popup.style.display = 'none';
  if (bulb)  bulb.classList.remove('active');
};

// ─── Chèn gợi ý vào editor ────────────────
window.acceptHintFromPopup = function() {
  insertHintText();
  closeHintPopup();
};

function insertHintText() {
  if (!currentHintStr || currentHintStr.startsWith('✓')) return;
  const hint   = currentHintStr.replace(/ \.\.\.$/,'');
  const testEd = document.getElementById('test-editor');
  testEd.focus();

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.collapse(false);

  const before   = getCharBeforeCursor(testEd);
  const preSpace = (before === ' ' || before === '') ? '' : ' ';
  const node     = document.createTextNode(preSpace + hint + ' ');
  range.insertNode(node);
  range.setStartAfter(node); range.collapse(true);
  sel.removeAllRanges(); sel.addRange(range);

  testEd.dispatchEvent(new Event('input', { bubbles: true }));
  clearTimeout(hintTimer);
  hintTimer = setTimeout(computeHint, 200);
}

// Tab key shortcut
function handleHintTab(e) {
  if (e.key !== 'Tab') return;
  const bulb = document.getElementById('hint-bulb');
  if (!bulb || bulb.style.display === 'none') return;
  e.preventDefault();
  if (hintPopupOpen) {
    insertHintText();
    closeHintPopup();
  } else {
    // Tab khi popup chưa mở → mở popup trước
    openHintPopup();
  }
}

// ─── Cursor helpers ───────────────────────

function getCursorLineIndex(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const range    = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const preRange = document.createRange();
  preRange.setStart(el, 0);
  try { preRange.setEnd(range.startContainer, range.startOffset); } catch { return 0; }
  const tmpDiv    = document.createElement('div');
  tmpDiv.appendChild(preRange.cloneContents());
  const preHtml   = tmpDiv.innerHTML
    .replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n')
    .replace(/<\/div>/gi,'\n').replace(/<\/li>/gi,'\n');
  const lines     = preHtml.split('\n');
  return Math.max(0, lines.length - 1);
}

function getEditorLines(el) {
  // Dùng lại splitLines với innerHTML của editor
  return splitLines(el.innerHTML);
}

function getCharBeforeCursor(el) {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return '';
  const r   = sel.getRangeAt(0).cloneRange(); r.collapse(true);
  if (r.startOffset === 0) return '';
  r.setStart(r.startContainer, r.startOffset - 1);
  return r.toString();
}

// ─── HISTORY MODAL ────────────────────────
window.openHistoryModal = function(e,id) {
  e.stopPropagation(); historyTargetId=id;
  const doc=getDoc(id), entries=loadHistory()[id]||[];
  document.getElementById('history-modal-doc-name').textContent = doc?(doc.title||'Không có tiêu đề'):'Văn bản đã xóa';
  const wrap=document.getElementById('history-modal-entries');
  if (!entries.length) {
    wrap.innerHTML='<div class="history-empty"><i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:10px"></i>Chưa có lịch sử kiểm tra</div>';
  } else {
    wrap.innerHTML=entries.map((e,idx)=>{
      const cls  = e.score>=80?'s-good':e.score>=50?'s-mid':'s-bad';
      const grade= e.score>=90?'Xuất sắc':e.score>=75?'Tốt':e.score>=50?'Trung bình':'Cần cố gắng';
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
window.clearHistory = () => {
  if (!historyTargetId) return;
  const h=loadHistory(); delete h[historyTargetId]; saveHistory(h);
  showToast('Đã xóa lịch sử','error'); closeHistoryModal();
  renderList(document.getElementById('tl-search').value);
};

// ─── UTILS ───────────────────────────────
function stripHTML(html) { const d=document.createElement('div'); d.innerHTML=html; return d.textContent||d.innerText||''; }
function escapeHTML(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function countWords(t) { if(!t||!t.trim()) return 0; return t.trim().split(/\s+/).filter(w=>w.length>0).length; }
function formatDate(ts) {
  if (!ts) return '';
  const d=new Date(ts), diff=Date.now()-d;
  const m=Math.floor(diff/60000), h=Math.floor(diff/3600000);
  if (m<1) return 'Vừa xong'; if (m<60) return m+' phút trước'; if (h<24) return h+' giờ trước';
  return d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function placeCursorAtEnd(el) {
  const sel=window.getSelection(), r=document.createRange();
  r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
}

// ─── KEYBOARD SHORTCUTS ──────────────────
document.addEventListener('keydown', e => {
  const active = document.activeElement;

  // Tab → handle hint in test mode
  if (active === document.getElementById('test-editor')) {
    handleHintTab(e);
  }

  if ((active === document.getElementById('doc-editor') || active === document.getElementById('doc-title'))
      && (e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault(); saveDoc();
  }
  if (e.key === 'Escape') {
    if (refPanelOpen) toggleRefPanel();
    if (hintPopupOpen) closeHintPopup();
    document.getElementById('history-modal').classList.remove('visible');
    closeModal();
  }
});

// ─── INIT ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const ls=document.getElementById('loading-screen');
  if (ls) setTimeout(()=>{ ls.style.opacity='0'; setTimeout(()=>{ls.style.display='none';},500); },300);

  renderList();

  const docEd=document.getElementById('doc-editor');
  if (docEd) {
    docEd.addEventListener('input', ()=>{ updateWordCount(); scheduleAutoSave(); });
    docEd.addEventListener('keyup',   updateToolbarState);
    docEd.addEventListener('mouseup', updateToolbarState);
  }
  const docTitle=document.getElementById('doc-title');
  if (docTitle) docTitle.addEventListener('input', scheduleAutoSave);

  // Test editor: word count + hint bulb
  const testEd = document.getElementById('test-editor');
  if (testEd) {
    testEd.addEventListener('input', () => {
      updateTestWordCount();
      clearTimeout(hintTimer);
      hintTimer = setTimeout(computeHint, 350);
    });
    testEd.addEventListener('click', () => {
      // Close popup if cursor moved to different line
      if (hintPopupOpen) closeHintPopup();
      clearTimeout(hintTimer);
      hintTimer = setTimeout(computeHint, 150);
    });
    testEd.addEventListener('keyup', e => {
      const navKeys = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Home','End'];
      if (navKeys.includes(e.key)) {
        if (hintPopupOpen) closeHintPopup();
        clearTimeout(hintTimer);
        hintTimer = setTimeout(computeHint, 150);
      }
    });
    // Scroll trong editor-body → reposition bulb
    const editorBody = testEd.closest('.editor-body') || testEd.parentElement;
    if (editorBody) {
      editorBody.addEventListener('scroll', () => {
        if (document.activeElement === testEd) {
          clearTimeout(hintTimer);
          hintTimer = setTimeout(computeHint, 100);
        }
      });
    }
  }

  ['tl-modal','history-modal'].forEach(id=>{
    const el=document.getElementById(id);
    if (el) el.addEventListener('click', function(e){
      if (e.target===this) { this.classList.remove('visible'); if(id==='history-modal') historyTargetId=null; }
    });
  });
});