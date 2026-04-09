import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc,
  updateDoc, deleteDoc, query, getCountFromServer, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const fbApp = initializeApp({
  apiKey:"AIzaSyCnlgJEFCEOk0e6oeMS4wXOyQv1kCG5ikU",
  authDomain:"wordlist-b2f44.firebaseapp.com",
  projectId:"wordlist-b2f44",
  storageBucket:"wordlist-b2f44.firebasestorage.app",
  messagingSenderId:"76634142406",
  appId:"1:76634142406:web:041b9c4ec1a673414c49c7",
  measurementId:"G-L1BCD1XWJR"
});
const db = getFirestore(fbApp);

/* ═══════════════ CONSTANTS ═══════════════ */
const PAGE = 30;

const PAL = [
  '#4a9eff','#3ecf8e','#f5a623','#e879a8','#a78bfa','#ffd700',
  '#64d8cb','#f06060','#60d4f0','#b0e060','#ff7f50','#c792ea',
  '#82aaff','#ffcb6b','#f07178','#89ddff'
];

const WT_COLORS = {
  'n':      {bg:'#1e3a5f',border:'#4a9eff',text:'#7ec8ff'},
  'v':      {bg:'#1a3d2b',border:'#3ecf8e',text:'#6de8b0'},
  'adj':    {bg:'#3d2e14',border:'#f5a623',text:'#ffc96b'},
  'adv':    {bg:'#3d1a30',border:'#e879a8',text:'#f5a0ca'},
  'prep':   {bg:'#281e45',border:'#a78bfa',text:'#c4aff9'},
  'conj':   {bg:'#1e3535',border:'#64d8cb',text:'#96e8e0'},
  'phrase': {bg:'#2e1e3d',border:'#c792ea',text:'#dbb8f5'},
  'phr.v':  {bg:'#3a2010',border:'#ff7f50',text:'#ffaa88'},
};
const WT_PAL_CYCLE = [
  {bg:'#1a2e3d',border:'#60d4f0',text:'#90e4f8'},
  {bg:'#2e3a10',border:'#b0e060',text:'#d0f090'},
  {bg:'#3a1a1a',border:'#f07178',text:'#f8a0a6'},
  {bg:'#1a1a3a',border:'#89ddff',text:'#b8eeff'},
];
function wtColor(type){
  const lc = type.toLowerCase();
  if(WT_COLORS[lc]) return WT_COLORS[lc];
  let h = 0; for(const c of lc) h = (h*31 + c.charCodeAt(0)) % WT_PAL_CYCLE.length;
  return WT_PAL_CYCLE[h];
}

function hlText(text, q){
  if(!q || !text) return esc(text);
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re = new RegExp(`(${safeQ})`,'gi');
  return esc(text).replace(re,'<mark class="hl">$1</mark>');
}

const DEF_LEVELS = [
  {id:'D', name:'Cấp D', color:'#4a9eff'},
  {id:'C', name:'Cấp C', color:'#3ecf8e'},
  {id:'B', name:'Cấp B', color:'#f5a623'},
  {id:'A', name:'Cấp A', color:'#e879a8'},
  {id:'S', name:'Cấp S', color:'#a78bfa'},
  {id:'SS',name:'Cấp SS',color:'#ffd700'},
  {id:'CT',name:'Cụm Từ',color:'#64d8cb'},
];

const DEF_WTYPES = ['n','v','adj','adv','prep','conj','phrase','phr.v'];

/* ═══════════════ STATE (OFFLINE FIRST) ═══════════════ */
const S = {
  levels:    JSON.parse(localStorage.getItem('vv_levels')||'null') || DEF_LEVELS,
  wtypes:    JSON.parse(localStorage.getItem('vv_wtypes')||'null') || DEF_WTYPES,
  localDB:   JSON.parse(localStorage.getItem('vv_localDB')||'{}'),
  counts:    JSON.parse(localStorage.getItem('vv_counts')||'{}'),
  activeLevel: null,
  shown: [],
  shownLimit: PAGE,
  searchMode: false,
  searchQ: '',
  sortBy: 'newest',
  editWord: null,
  editLevel: null
};

function saveLocalDB(){
  try {
    localStorage.setItem('vv_localDB', JSON.stringify(S.localDB));
  } catch(e){
    console.error("Local Storage is full!", e);
    toast('Cảnh báo: Bộ nhớ cache trình duyệt đầy', 'err');
  }
}

function getLevelData(lid){
  let arr = [...(S.localDB[lid] || [])];
  if(S.sortBy === 'newest') arr.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  if(S.sortBy === 'oldest') arr.sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
  if(S.sortBy === 'alpha')  arr.sort((a,b) => (a.content||'').localeCompare(b.content||''));
  return arr;
}

const col = id => 'vocab_' + id;

/* ═══════════════ SYNC ═══════════════ */
async function syncLevel(lid){
  try {
    const fbCount = (await getCountFromServer(collection(db, col(lid)))).data().count;
    const localCount = S.localDB[lid] ? S.localDB[lid].length : 0;
    S.counts[lid] = fbCount;
    localStorage.setItem('vv_counts', JSON.stringify(S.counts));
    updateTotalUI();
    const el = document.getElementById('cnt_'+lid);
    if(el) el.textContent = fbCount;
    if(fbCount !== localCount){
      if(!S.localDB[lid]) toast(`Đang đồng bộ ${ln(lid)} lần đầu...`, 'ok');
      const snap = await getDocs(query(collection(db, col(lid))));
      S.localDB[lid] = snap.docs.map(d => ({id: d.id, ...d.data(), _lid: lid}));
      saveLocalDB();
      if(S.activeLevel === lid && !S.searchMode){
        S.shown = getLevelData(lid).slice(0, S.shownLimit);
        rMain();
      }
    }
  } catch(e){ console.error("Sync fail", e); }
}

function updateTotalUI(){
  const total = Object.values(S.counts).reduce((a,b) => a+(typeof b==='number'?b:0), 0);
  const t0 = new Date(); t0.setHours(0,0,0,0);
  let nNew = 0;
  for(const l of S.levels)
    for(const w of (S.localDB[l.id]||[]))
      if(w.createdAt && w.createdAt >= t0.getTime()) nNew++;
  const txt = total.toLocaleString();
  ['totalVal','drawerTotalVal'].forEach(id => {
    const el = document.getElementById(id); if(!el) return;
    let textNode = el.childNodes[0];
    if(!textNode || textNode.nodeType !== Node.TEXT_NODE){
      el.innerHTML = '';
      textNode = document.createTextNode(txt);
      el.appendChild(textNode);
    } else {
      textNode.textContent = txt;
    }
    let badge = el.querySelector('.rb-badge');
    if(nNew >= 1){
      if(!badge){
        badge = document.createElement('span');
        badge.className = 'rb-txt rb-badge';
        badge.style.cssText = 'font-size:11px;white-space:nowrap;margin-left:3px';
        el.appendChild(badge);
      }
      badge.textContent = '(+' + nNew + ')';
    } else {
      if(badge) badge.remove();
    }
  });
}

/* ═══════════════ LOCAL SEARCH ═══════════════ */
function doGlobalSearch(qStr){
  const q = qStr.toLowerCase().trim();
  let res = [];
  for(const l of S.levels){
    const wds = (S.localDB[l.id] || []).filter(w => (w.content||'').toLowerCase().includes(q));
    res.push(...wds);
  }
  res.sort((a,b) => {
    const ai = (a.content||'').toLowerCase().indexOf(q);
    const bi = (b.content||'').toLowerCase().indexOf(q);
    if(ai !== bi) return ai - bi;
    return (b.createdAt||0) - (a.createdAt||0);
  });
  return res.slice(0, 100);
}

/* ═══════════════ FRESHNESS ═══════════════ */
function lerpHex(a,b,t){
  const p = c => [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
  const [ar,ag,ab] = p(a), [br,bg,bb] = p(b);
  return '#'+[ar+(br-ar)*t,ag+(bg-ag)*t,ab+(bb-ab)*t].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}
function freshInfo(ts){
  if(!ts) return {color:'#8892a4',label:'?',w:'4%'};
  const VN_OFFSET = 7 * 60 * 60 * 1000;
  const nowVN = Date.now() + VN_OFFSET;
  const tsVN  = ts        + VN_OFFSET;
  const todayMidnightVN = Math.floor(nowVN / 86400000) * 86400000;
  const wordMidnightVN  = Math.floor(tsVN  / 86400000) * 86400000;
  const d = (todayMidnightVN - wordMidnightVN) / 86400000;
  let color,label,pct;
  if(d === 0)      { color='rainbow'; label='New'; pct=100; }
  else if(d<=10)   { color=lerpHex('#3ecf8e','#a8e63a',d/10);       label=Math.round(d)+'d'; pct=95-d*5; }
  else if(d<=20)   { color=lerpHex('#a8e63a','#f5a623',(d-10)/10);  label=Math.round(d)+'d'; pct=80-(d-10)*2; }
  else if(d<=40)   { color=lerpHex('#f5a623','#f07030',(d-20)/20);  label=Math.round(d)+'d'; pct=60-(d-20)*1; }
  else if(d<=90)   { color=lerpHex('#f07030','#f06060',(d-40)/50);  label=Math.round(d)+'d'; pct=40-(d-40)*.4; }
  else             { color='#f06060'; label=Math.floor(d/30)+'m'; pct=8; }
  return {color, label, w: Math.max(5, Math.round(pct))+'%'};
}

/* ═══════════════ UTILS ═══════════════ */
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function getContrastColor(hex){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return (r*299+g*587+b*114)/1000 > 140 ? '#1a1a2e' : '#ffffff';
}
const lc     = id => { const l=S.levels.find(l=>l.id===id); return l?.color||'#5b8dee'; };
const lcGrad = id => { const l=S.levels.find(l=>l.id===id); return l?.color2 ? `linear-gradient(135deg,${l.color},${l.color2})` : (l?.color||'#5b8dee'); };
const lcText = id => { const l=S.levels.find(l=>l.id===id); return l?.textColor||(l?.color2?getContrastColor(l.color):'#ffffff'); };
const ln     = id => S.levels.find(l=>l.id===id)?.name||id;

function setLevelColor(c, c2){
  document.documentElement.style.setProperty('--level-color', c);
  const vc = document.querySelector('.vc');
  const mixC = c2||c;
  if(vc) vc.style.background = `linear-gradient(160deg,color-mix(in srgb,${mixC} 17%,var(--bg)) 0%,var(--bg) 65%)`;
}

function debounce(fn,ms){ let t; return(...a) => {clearTimeout(t); t=setTimeout(()=>fn(...a),ms)}; }

/* ═══════════════ RENDER SIDEBAR ═══════════════ */
function rSidebar(){
  document.getElementById('lvlNav').innerHTML = S.levels.map(l => {
    const cnt = S.counts[l.id] !== undefined ? S.counts[l.id] : '…';
    const active = S.activeLevel === l.id && !S.searchMode;
    const dotStyle = l.color2 ? `background:linear-gradient(135deg,${l.color},${l.color2})` : `background:${l.color}`;
    return `<button class="lvl-btn ${active?'active':''}" onclick="selLevel('${l.id}')">
      <span class="dot" style="${dotStyle}"></span>
      <span>${esc(l.name)}</span>
      <span class="cnt" id="cnt_${l.id}">${cnt}</span>
    </button>`;
  }).join('');
  updateTotalUI();
  if(typeof rDrawer === 'function') rDrawer();
}

/* ═══════════════ RENDER MAIN ═══════════════ */
function rMain(){
  const main = document.getElementById('mainC');
  const al = S.levels.find(l => l.id === S.activeLevel);
  const lcolor = al?.color || '#5b8dee';

  if(!S.activeLevel && !S.searchMode){
    setLevelColor('#5b8dee');
    main.innerHTML = `<div class="empty" style="margin:auto;padding:80px 20px"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg><h3>Chọn một cấp độ</h3></div>`;
    return;
  }

  setLevelColor(lcolor, al?.color2);
  const title = S.searchMode ? '🔍 Kết quả tìm kiếm' : (al?.name||'');
  const cnt2  = S.searchMode
    ? `Tìm thấy: <strong>${S.shown.length}</strong>`
    : `Tổng: <strong>${S.counts[S.activeLevel]??'?'}</strong> • Hiển thị: <strong>${S.shown.length}</strong>`;
  const hasMoreLocal = !S.searchMode && S.localDB[S.activeLevel] && (S.shownLimit < S.localDB[S.activeLevel].length);
  const mixC = al?.color2 || lcolor;

  const existingHeader = document.getElementById('mainHeader');
  const headerHTML = `
  <div class="header" id="mainHeader">
    <button class="mob-menu-btn" onclick="openDrawer()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <div class="mob-search-wrap">
      <svg class="s-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="gSearchMob" type="text" placeholder="Tìm từ vựng…" oninput="syncMobSearch(this)" autocomplete="off"/>
      <button class="s-clear" id="gSearchMobClear" onclick="clearSearch(true,'gSearchMob')" title="Xóa">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="h-title">${esc(title)}</div>
    <div class="h-actions">
      <button class="btn btn-primary btn-sm" onclick="openAdd()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Thêm từ
      </button>
    </div>
  </div>
  <div class="toolbar" id="mainToolbar">
    <select class="sort-sel" onchange="handleSort(this.value)">
      <option value="newest" ${S.sortBy==='newest'?'selected':''}>Mới nhất</option>
      <option value="oldest" ${S.sortBy==='oldest'?'selected':''}>Cũ nhất</option>
      <option value="alpha"  ${S.sortBy==='alpha' ?'selected':''}>A → Z</option>
    </select>
    <span class="cb">${cnt2}</span>
  </div>`;

  if(!existingHeader){
    main.innerHTML = headerHTML + '<div class="vc" id="vocabC"></div>';
  } else {
    // Thay thế cả header lẫn toolbar (tránh duplicate toolbar)
    const existingToolbar = document.getElementById('mainToolbar');
    existingHeader.outerHTML = headerHTML;
    // Xóa toolbar cũ nếu chưa được replace (trường hợp id chưa tồn tại)
    if(existingToolbar && document.getElementById('mainToolbar') !== existingToolbar){
      existingToolbar.remove();
    }
  }

  // Sync mobile search value
  const mobInp = document.getElementById('gSearchMob');
  const desInp = document.getElementById('gSearch');
  if(mobInp && desInp && mobInp.value !== desInp.value) mobInp.value = desInp.value;

  const vc = document.getElementById('vocabC') || (() => {
    const d = document.createElement('div'); d.className='vc'; d.id='vocabC';
    main.appendChild(d); return d;
  })();

  if(!S.shown.length){
    vc.innerHTML = `<div class="empty"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><h3>${S.searchMode?'Không tìm thấy kết quả':'Chưa có từ vựng'}</h3></div>`;
    return;
  }

  let html = '';
  if(S.searchMode){
    html += `<div class="s-banner">🔍 Kết quả cho <strong>${esc(S.searchQ)}</strong><button onclick="clearSearch()">✕ Xóa tìm kiếm</button></div>`;
    html += renderWordTree(S.shown);
  } else {
    html += renderWordTree(S.shown);
  }
  if(hasMoreLocal){
    html += `<button class="lm-btn" onclick="loadMore()">Xem thêm (còn ${S.localDB[S.activeLevel].length - S.shownLimit} từ)…</button>`;
  }
  vc.innerHTML = html;
}

/* ═══════════════ WORD TREE RENDERER ═══════════════ */
function renderWordTree(words){
  const childrenMap = {};
  const wordById    = {};
  for(const w of words){
    wordById[w.id] = w;
    if(!childrenMap[w.id]) childrenMap[w.id] = [];
  }
  for(const w of words){
    if(w.parentId && wordById[w.parentId]){
      childrenMap[w.parentId].push(w);
    }
  }
  const roots    = words.filter(w => !w.parentId || !wordById[w.parentId]);
  const shownIds = new Set(words.map(w => w.id));

  function renderNode(w, depth){
    const card = rCard(w, depth);
    let children = (childrenMap[w.id]||[]);
    children = children.filter(c => shownIds.has(c.id) || shownIds.has(w.id));
    if(!children.length){
      if(depth === 0) return `<div style="margin-bottom:0">${card}</div>`;
      return card;
    }
    const indent = 12 + depth * 3;
    const childrenHTML = `<div class="${depth>=1?'wf-mobile-child':''}" style="margin-left:${indent}px;margin-top:5px;display:flex;flex-direction:column;gap:5px;padding-left:8px">`
      + children.map(c => renderNode(c, depth+1)).join('')
      + `</div>`;
    return `<div>${card}${childrenHTML}</div>`;
  }

  let out = '<div style="display:flex;flex-direction:column;gap:8px">';
  const rendered = new Set();
  function collectIds(w){ rendered.add(w.id); (childrenMap[w.id]||[]).forEach(c=>collectIds(c)); }
  for(const r of roots){ out += renderNode(r,0); collectIds(r); }
  for(const w of words){ if(!rendered.has(w.id)) out += renderNode(w,0); }
  out += '</div>';
  return out;
}

/* ═══════════════ CARD RENDERER ═══════════════ */
function rCard(w, depth=0){
  const lid    = w._lid || S.activeLevel;
  const lgrad  = lcGrad(lid);
  const ltxt   = lcText(lid);
  const lname  = ln(lid).replace('Cấp ','').replace('Cụm Từ','CT');
  let wd = w.content||'', mng = '';
  const ci = wd.indexOf(':');
  if(ci > -1){ mng = wd.slice(ci+1).trim(); wd = wd.slice(0,ci).trim(); }
  const types = Array.isArray(w.wordTypes) ? w.wordTypes : (w.wordType ? [w.wordType] : []);
  const q     = S.searchMode ? S.searchQ : '';
  const ttags = types.map(t => {
    const c = wtColor(t);
    return `<span class="tag" style="background:${c.bg};border:1px solid ${c.border};color:${c.text}">${esc(t)}</span>`;
  }).join('');
  const ctags    = (w.tags||[]).map(t => `<span class="tag tag-custom">${esc(t)}</span>`).join('');
  const dt       = w.createdAt ? new Date(w.createdAt).toLocaleDateString('vi-VN') : '';
  const fr       = freshInfo(w.createdAt);
  const wdHl     = q ? hlText(wd,q) : esc(wd);
  const mngHl    = q ? hlText(mng,q) : esc(mng);
  const phonetic = w.phonetic ? `<span class="phonetic">${esc(w.phonetic)}</span>` : '';

  // Mọi từ đều có nút phát âm TTS
  const spkBtn = `<button class="spk-btn" title="Phát âm" data-word="${esc(wd)}" onclick="playAudio(event,this.dataset.word)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
    </button>`;

  const depthClass = depth > 0 ? ` depth-${Math.min(depth,3)}` : '';
  let hasChildren = false;
  for(const l of S.levels){ if((S.localDB[l.id]||[]).some(x=>x.parentId===w.id)){hasChildren=true;break;} }
  const familyIcon = hasChildren
    ? `<span title="Word Family" style="font-size:10px;color:var(--accent);opacity:0.7;margin-left:4px">🌿</span>` : '';
  const parentInfo = w.parentId ? (() => {
    let par = null;
    for(const l of S.levels){ par=(S.localDB[l.id]||[]).find(x=>x.id===w.parentId); if(par) break; }
    if(!par) return '';
    const pw = par.content?.split(':')[0]?.trim()||'';
    return `<span style="font-size:10px;color:var(--text2);opacity:.7;margin-left:6px">↳ ${esc(pw)}</span>`;
  })() : '';

  return `<div class="vcard${depthClass}">
    <div class="vcard-bar" style="background:${lgrad}"></div>
    <div class="vcard-badge" style="background:${lgrad};color:${ltxt}">${esc(lname)}</div>
    <div class="vcard-body">
      <div class="vcard-title">
        <span class="word">${wdHl}</span>${mng?`<span class="meaning"> — ${mngHl}</span>`:''}${familyIcon}${depth===0&&w.parentId?parentInfo:''}
      </div>
      ${(phonetic||spkBtn)?`<div style="display:flex;align-items:center;gap:7px;margin-top:3px">${phonetic}${spkBtn}</div>`:''}
      <div class="vcard-meta">${ttags}${ctags}${dt?`<span class="dtxt">${dt}</span>`:''}</div>
      ${w.createdAt?`<div class="fbar-wrap">${fr.color==='rainbow'?`<div class="fbar rb-bg" style="width:${fr.w};max-width:80px"></div><span class="flbl rb-txt">${fr.label}</span>`:`<div class="fbar" style="background:${fr.color};width:${fr.w};max-width:80px"></div><span class="flbl" style="color:${fr.color}">${fr.label}</span>`}</div>`:''}
    </div>
    <div class="cactions">
      <button class="iBtn" title="Thêm từ cha mới (Word Family)" onclick="openAddParent('${w.id}','${lid}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
      </button>
      <button class="iBtn ${w.parentId?'wf-has-parent':''}" title="Gắn từ cha có sẵn (Word Family)" onclick="openSetParentModal('${w.id}','${lid}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </button>
      <button class="iBtn" title="Sửa" onclick="openEdit('${w.id}','${lid}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="iBtn del" title="Xóa" onclick="confirmDel('${w.id}','${lid}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  </div>`;
}

/* ═══════════════ LEVEL SELECT & PAGINATION ═══════════════ */
window.selLevel = function(id){
  S.searchMode = false; S.searchQ = '';
  if(_autoPlayTimer){ clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
  if(_historyTimer){ clearTimeout(_historyTimer); _historyTimer = null; }
  document.getElementById('gSearch').value = '';
  S.activeLevel = id;
  S.shownLimit  = PAGE;
  const lvl = S.levels.find(l => l.id === id);
  setLevelColor(lc(id), lvl?.color2);
  S.shown = getLevelData(id).slice(0, S.shownLimit);
  rMain(); rSidebar();
};

window.loadMore = function(){
  if(!S.activeLevel) return;
  S.shownLimit += PAGE;
  S.shown = getLevelData(S.activeLevel).slice(0, S.shownLimit);
  rMain();
};

window.handleSort = function(v){
  S.sortBy = v;
  if(!S.activeLevel) return;
  S.shownLimit = PAGE;
  S.shown = getLevelData(S.activeLevel).slice(0, S.shownLimit);
  rMain();
};

/* ═══════════════ SEARCH ═══════════════ */
function toggleClearBtn(inp, btnId){
  const b = document.getElementById(btnId);
  if(b) b.classList.toggle('vis', inp.value.length > 0);
}
window.onSbSearch = function(inp){
  toggleClearBtn(inp, 'gSearchClear');
  dbSearch(inp.value, 'gSearch');
};
window.syncMobSearch = function(inp){
  const v  = inp.value;
  const ds = document.getElementById('gSearch');
  if(ds){ ds.value = v; toggleClearBtn(ds, 'gSearchClear'); }
  toggleClearBtn(inp, 'gSearchMobClear');
  dbSearch(v, 'gSearchMob');
};

let tempSearchHistory = [];
function updateHistoryUI(){
  let dl = document.getElementById('searchHistoryList');
  if(!dl){
    dl = document.createElement('datalist');
    dl.id = 'searchHistoryList';
    document.body.appendChild(dl);
  }
  dl.innerHTML = tempSearchHistory.map(w => `<option value="${esc(w)}"></option>`).join('');
}

let _autoPlayTimer = null;
let _historyTimer  = null;

const dbSearch = debounce((v, srcId) => {
  if(!v.trim()){ clearSearch(true, srcId||'gSearchMob'); return; }
  S.searchQ = v; S.searchMode = true;
  S.shown = doGlobalSearch(v);
  rMain(); rSidebar();
  requestAnimationFrame(() => {
    ['gSearchMob','gSearch'].forEach(id => {
      const e = document.getElementById(id);
      const b = document.getElementById(id==='gSearchMob'?'gSearchMobClear':'gSearchClear');
      if(e && b) b.classList.toggle('vis', e.value.length > 0);
    });
  });

  if(_autoPlayTimer) clearTimeout(_autoPlayTimer);
  if(_historyTimer)  clearTimeout(_historyTimer);

  // Tự phát TTS của từ đầu tiên sau 1.2s
  _autoPlayTimer = setTimeout(() => {
    const first = S.shown[0];
    if(first && first.content){
      window.speechSynthesis.cancel();
      const word = (first.content||'').split(':')[0].trim();
      const utt = new SpeechSynthesisUtterance(word);
      utt.lang = 'en-US'; utt.rate = 0.85;
      const voices = window.speechSynthesis.getVoices();
      const enVoice = voices.find(v => v.lang.startsWith('en') && v.localService) || voices.find(v => v.lang.startsWith('en'));
      if(enVoice) utt.voice = enVoice;
      window.speechSynthesis.speak(utt);
    }
  }, 1200);
  // Lưu lịch sử tìm kiếm
  _historyTimer = setTimeout(() => {
    const q = S.searchQ.trim();
    if(q && !tempSearchHistory.includes(q)){
      tempSearchHistory.unshift(q);
      if(tempSearchHistory.length > 3) tempSearchHistory.pop();
      updateHistoryUI();
    }
  }, 1700);
}, 300);

window.clearSearch = function(keepFocus, focusId){
  if(_autoPlayTimer){ clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
  if(_historyTimer){  clearTimeout(_historyTimer);  _historyTimer  = null; }
  S.searchMode = false; S.searchQ = '';
  ['gSearch','gSearchMob'].forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
  ['gSearchClear','gSearchMobClear'].forEach(id => { const b=document.getElementById(id); if(b) b.classList.remove('vis'); });
  if(S.activeLevel){ S.shownLimit=PAGE; S.shown=getLevelData(S.activeLevel).slice(0,S.shownLimit); }
  rMain(); rSidebar();
  if(keepFocus !== false) requestAnimationFrame(() => {
    const el = document.getElementById(focusId||'gSearch');
    if(el){ el.focus(); const n=el.value.length; el.setSelectionRange(n,n); }
  });
};

/* ═══════════════ AUDIO (TTS) ═══════════════ */
let _currentUtt = null;

function htmlDecode(str){ const ta=document.createElement('textarea'); ta.innerHTML=str; return ta.value; }

window.playAudio = function(e, word){
  e.stopPropagation();
  const btn = e.currentTarget;
  if(!word){ return; }

  // Nếu đang phát từ này rồi thì dừng lại
  if(btn.classList.contains('playing')){
    window.speechSynthesis.cancel();
    btn.classList.remove('playing');
    _currentUtt = null;
    return;
  }

  // Dừng bất kỳ TTS nào đang chạy
  window.speechSynthesis.cancel();
  document.querySelectorAll('.spk-btn.playing').forEach(b => b.classList.remove('playing'));

  const utt = new SpeechSynthesisUtterance(htmlDecode(word));
  utt.lang = 'en-US';
  utt.rate = 0.85;
  utt.pitch = 1;

  // Chọn giọng tiếng Anh nếu có
  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith('en') && v.localService) || voices.find(v => v.lang.startsWith('en'));
  if(enVoice) utt.voice = enVoice;

  btn.classList.add('playing');
  _currentUtt = utt;
  utt.onend = () => { btn.classList.remove('playing'); _currentUtt = null; };
  utt.onerror = () => { btn.classList.remove('playing'); _currentUtt = null; };
  window.speechSynthesis.speak(utt);
};

// Đảm bảo voices đã load (Chrome cần event này)
if(window.speechSynthesis.onvoiceschanged !== undefined){
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}
/* ═══════════════ ADD / EDIT MODAL ═══════════════ */
let mWT = [], mTags = [], mColor = '';

window.openAdd = function(){
  S.editWord = null; S.editLevel = S.activeLevel;
  mWT = []; mTags = []; mColor = lc(S.activeLevel);
  showWordModal({});
};
window.openEdit = function(id, lid){
  const w = (S.localDB[lid]||[]).find(x=>x.id===id) || S.shown.find(x=>x.id===id);
  if(!w) return;
  S.editWord = w; S.editLevel = lid;
  mWT    = Array.isArray(w.wordTypes) ? [...w.wordTypes] : (w.wordType ? [w.wordType] : []);
  mTags  = [...(w.tags||[])];
  mColor = w.color || lc(lid);
  showWordModal(w);
};

function showWordModal(w){
  const isEdit = !!w.id;
  const tLid   = w._forceLevel || (isEdit ? S.editLevel : (S.activeLevel || S.levels[0]?.id));
  const dv     = w.createdAt ? new Date(w.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  document.getElementById('wModal').innerHTML = `<div class="modal">
    <div class="modal-title">${isEdit?'✏️ Sửa từ vựng':'✨ Thêm từ mới'}</div>
    <div class="fg">
      <label class="flabel">Nội dung <span style="color:var(--red)">*</span></label>
      <textarea class="ftarea" id="mCont" placeholder="word (adj): nghĩa tiếng Việt">${esc(w.content||'')}</textarea>
    </div>
    <div class="frow">
      <div class="fg">
        <label class="flabel">Phiên âm</label>
        <input class="finput" id="mPhonetic" placeholder="/ˈwɜːd/" value="${esc(w.phonetic||'')}" style="font-family:'DM Mono',monospace;font-style:italic"/>
      </div>
    </div>
    <div class="frow">
      <div class="fg">
        <label class="flabel">Cấp độ</label>
        <select class="fselect" id="mLvl">${S.levels.map(l=>`<option value="${l.id}" ${tLid===l.id?'selected':''}>${esc(l.name)}</option>`).join('')}</select>
      </div>
      <div class="fg">
        <label class="flabel">Ngày thêm</label>
        <input type="date" class="finput" id="mDate" value="${dv}" style="font-family:'DM Mono',monospace;font-size:13px"/>
      </div>
    </div>
    <div class="fg">
      <label class="flabel">Loại từ <span style="color:var(--text2);font-size:10px;font-weight:400;text-transform:none">(chọn nhiều)</span>
        <button onclick="addWType()" style="background:none;border:none;color:var(--accent);font-size:11px;cursor:pointer;margin-left:6px;text-transform:none">+ Thêm loại</button>
      </label>
      <div class="wt-grid" id="wtGrid">${rWTChips()}</div>
    </div>
    <div class="mfoot">
      <button class="btn btn-ghost" onclick="closeWM()">Hủy</button>
      <button class="btn btn-primary" onclick="saveWord()">${isEdit?'Lưu thay đổi':'Thêm từ'}</button>
    </div>
  </div>`;
  document.getElementById('wModal').classList.add('open');
}

function rWTChips(){
  return S.wtypes.map(t => {
    const c   = wtColor(t);
    const sel = mWT.includes(t);
    const style = sel
      ? `background:${c.bg};border-color:${c.border};color:${c.text}`
      : `background:var(--surface2);border-color:var(--border);color:var(--text2)`;
    const xBtn = sel ? `<button class="x-btn" onclick="togWT(event,'${esc(t)}')" title="Bỏ chọn">×</button>` : '';
    return `<span class="wt-chip ${sel?'sel':''}" style="${style}" onclick="togWT(event,'${esc(t)}')">${esc(t)}${xBtn}</span>`;
  }).join('') + `<button class="wt-add" onclick="addWType()">+ Thêm</button>`;
}
function rTagChips(){
  return mTags.map((t,i) => `<span class="tag-chip">${esc(t)}<button onclick="rmTag(${i})">×</button></span>`).join('');
}

window.togWT = function(e,t){
  e.stopPropagation();
  mWT = mWT.includes(t) ? mWT.filter(x=>x!==t) : [...mWT,t];
  const g = document.getElementById('wtGrid');
  if(g) g.innerHTML = rWTChips();
};
window.rmTag = function(i){ mTags.splice(i,1); refreshTW(); };
function refreshTW(){
  const w = document.getElementById('tWrap');
  if(w) w.innerHTML = rTagChips() + `<input id="tInp" class="tag-inp" placeholder="Nhập tag, Enter để thêm..." onkeydown="handleTagKey(event)"/>`;
}
window.handleTagKey = function(e){
  if((e.key==='Enter'||e.key===',') && e.target.value.trim()){
    e.preventDefault(); mTags.push(e.target.value.trim()); refreshTW();
    document.getElementById('tInp')?.focus();
  }
};
window.pickColor = function(c){
  mColor = c;
  document.querySelectorAll('#wModal .cswatch').forEach(s => s.classList.toggle('sel', s.style.background===c||s.style.backgroundColor===c));
};
window.addWType = function(){
  const n = prompt('Tên loại từ mới:');
  if(n && n.trim() && !S.wtypes.includes(n.trim())){
    S.wtypes.push(n.trim());
    localStorage.setItem('vv_wtypes', JSON.stringify(S.wtypes));
    const g = document.getElementById('wtGrid');
    if(g) g.innerHTML = rWTChips();
  }
};
window.closeWM = function(){
  document.getElementById('wModal').classList.remove('open');
  _pendingChildId = null; _pendingChildLid = null;
};

/* ═══════════════ WORD FAMILY — ADD PARENT ═══════════════ */
let _pendingChildId = null, _pendingChildLid = null;

window.openAddParent = function(childId, childLid){
  _pendingChildId = childId; _pendingChildLid = childLid;
  S.editWord = null; S.editLevel = childLid;
  mWT = []; mTags = []; mColor = lc(childLid);
  showWordModal({_forceLevel: childLid});
  requestAnimationFrame(() => {
    const modal = document.querySelector('#wModal .modal');
    if(!modal) return;
    let childName = '';
    for(const l of S.levels){ const cw=(S.localDB[l.id]||[]).find(x=>x.id===childId); if(cw){childName=(cw.content||'').split(':')[0].trim();break;} }
    const hint = document.createElement('div');
    hint.style.cssText = 'background:color-mix(in srgb,var(--accent) 12%,var(--surface2));border:1px solid color-mix(in srgb,var(--accent) 35%,var(--border));border-radius:9px;padding:8px 12px;font-size:12px;color:var(--accent);margin-bottom:6px;display:flex;align-items:center;gap:8px';
    hint.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>🌿 Từ mới này sẽ thành <strong>từ cha</strong> của "<strong>${esc(childName)}</strong>"`;
    const titleEl = modal.querySelector('.modal-title');
    if(titleEl) titleEl.after(hint);
    const lvlSel = modal.querySelector('#mLvl');
    const warnEl = document.createElement('div');
    warnEl.id = 'apLvlWarn';
    warnEl.style.cssText = 'display:none;background:color-mix(in srgb,var(--red) 12%,var(--surface2));border:1px solid color-mix(in srgb,var(--red) 50%,var(--border));border-radius:8px;padding:7px 11px;font-size:12px;color:var(--red);margin-top:5px;align-items:center;gap:7px';
    warnEl.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Từ cha nên ở cấp độ cao hơn từ con (<strong>${esc(S.levels.find(l=>l.id===childLid)?.name||childLid)}</strong>)!`;
    if(lvlSel){
      lvlSel.parentNode.appendChild(warnEl);
      warnEl.style.display = 'flex';
      lvlSel.style.borderColor = 'var(--red)';
      lvlSel.addEventListener('change', function(){
        const show = this.value === childLid;
        warnEl.style.display = show ? 'flex' : 'none';
        lvlSel.style.borderColor = show ? 'var(--red)' : '';
      });
    }
  });
};

/* ═══════════════ WORD FAMILY — SET EXISTING PARENT ═══════════════ */
let _spChildId = null, _spChildLid = null;

window.openSetParentModal = function(childId, childLid){
  _spChildId = childId; _spChildLid = childLid;
  let childName = '';
  for(const l of S.levels){ const cw=(S.localDB[l.id]||[]).find(x=>x.id===childId); if(cw){childName=(cw.content||'').split(':')[0].trim();break;} }
  const overlay = document.getElementById('spModal');
  overlay.innerHTML = `<div class="sp-modal">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
      <div style="font-family:'Playfair Display',serif;font-size:16px">🌿 Gắn từ cha cho "<strong>${esc(childName)}</strong>"</div>
      <button onclick="closeSpModal()" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;width:28px;height:28px;cursor:pointer;color:var(--text2);display:flex;align-items:center;justify-content:center"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <button class="sp-none-btn" onclick="setParentId('${childId}','${childLid}','');closeSpModal();toast('Đã đặt là từ độc lập','ok')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      None — Đặt là từ độc lập (xóa cha hiện tại)
    </button>
    <div class="sp-search-wrap">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="spInp" class="sp-inp" placeholder="Tìm từ cha… (gõ ít nhất 1 ký tự)" oninput="spSearch(this.value,'${childId}')" autocomplete="off"/>
    </div>
    <div class="sp-results" id="spResults"><div class="sp-hint">Gõ để tìm từ muốn đặt làm cha</div></div>
  </div>`;
  overlay.classList.add('open');
  requestAnimationFrame(() => document.getElementById('spInp')?.focus());
};

window.closeSpModal = function(){ document.getElementById('spModal').classList.remove('open'); };

window.spSearch = function(q, excludeId){
  const res = document.getElementById('spResults');
  if(!res) return;
  const trimQ = q.trim().toLowerCase();
  if(!trimQ){ res.innerHTML = '<div class="sp-hint">Gõ để tìm từ muốn đặt làm cha</div>'; return; }
  const idsWithChildren = new Set();
  for(const l of S.levels)
    for(const w of (S.localDB[l.id]||[]))
      if(w.parentId) idsWithChildren.add(w.parentId);
  let hits = [];
  for(const l of S.levels)
    for(const w of (S.localDB[l.id]||[])){
      if(w.id === excludeId) continue;
      if(idsWithChildren.has(w.id)) continue;
      if((w.content||'').toLowerCase().includes(trimQ)) hits.push({w,l});
    }
  hits.sort((a,b) => {
    const ai=(a.w.content||'').toLowerCase().indexOf(trimQ);
    const bi=(b.w.content||'').toLowerCase().indexOf(trimQ);
    return ai!==bi ? ai-bi : (b.w.createdAt||0)-(a.w.createdAt||0);
  });
  hits = hits.slice(0,30);
  if(!hits.length){ res.innerHTML = '<div class="sp-hint">Không tìm thấy từ nào</div>'; return; }
  res.innerHTML = hits.map(({w,l}) => {
    const wd = (w.content||'').split(':')[0].trim();
    const mn = (w.content||'').includes(':') ? (w.content||'').split(':').slice(1).join(':').trim() : '';
    return `<div class="sp-item" onclick="setParentId('${_spChildId}','${_spChildLid}','${w.id}');closeSpModal();toast('Đã gắn từ cha ✓','ok')">
      <div style="flex:1;min-width:0">
        <div class="sp-item-word">${esc(wd)}${mn?`<span style="color:var(--text2);font-weight:400"> — ${esc(mn.slice(0,40))}${mn.length>40?'…':''}</span>`:''}</div>
        <div class="sp-item-meta">[${l.id}] ${l.name}</div>
      </div>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  }).join('');
};

/* ═══════════════ SET PARENT HELPER ═══════════════ */
window.setParentId = async function(childId, childLid, parentId){
  let found = false;
  for(const l of S.levels){
    const arr = S.localDB[l.id]||[];
    const idx = arr.findIndex(x=>x.id===childId);
    if(idx > -1){
      arr[idx].parentId  = parentId;
      arr[idx].updatedAt = Date.now();
      try{ await updateDoc(doc(db,col(l.id),childId),{parentId,updatedAt:arr[idx].updatedAt}); }
      catch(e){ toast('Lỗi cập nhật: '+e.message,'err'); return; }
      found = true; break;
    }
  }
  if(!found) return;
  saveLocalDB();
  if(S.searchMode) S.shown = doGlobalSearch(S.searchQ);
  else if(S.activeLevel) S.shown = getLevelData(S.activeLevel).slice(0,S.shownLimit);
  rMain();
};

/* ═══════════════ SAVE (WRITE-THROUGH) ═══════════════ */
window.saveWord = async function(){
  const content = document.getElementById('mCont')?.value?.trim();
  if(!content){ toast('Vui lòng nhập nội dung','err'); return; }
  const lid       = document.getElementById('mLvl')?.value || S.activeLevel;
  const dv        = document.getElementById('mDate')?.value;
  const createdAt = S.editWord ? (dv ? new Date(dv).getTime() : Date.now()) : Date.now();
  const phonetic  = document.getElementById('mPhonetic')?.value?.trim()||'';
  const audioUrl  = document.getElementById('mAudio')?.value?.trim()||'';
  const existingParentId = S.editWord?.parentId||'';
  const data = {content,wordTypes:[...mWT],tags:[...mTags],color:mColor,createdAt,updatedAt:Date.now(),phonetic,audioUrl,parentId:existingParentId};

  try {
    let affectedLids = [lid];
    if(S.editWord){
      const oldLid = S.editLevel, newLid = lid;
      affectedLids = [oldLid, newLid];
      if(oldLid !== newLid){
        await deleteDoc(doc(db,col(oldLid),S.editWord.id));
        const ref = await addDoc(collection(db,col(newLid)),data);
        const nw  = {id:ref.id,...data,_lid:newLid};
        if(S.localDB[oldLid]) S.localDB[oldLid] = S.localDB[oldLid].filter(x=>x.id!==S.editWord.id);
        S.counts[oldLid] = Math.max(0,(S.counts[oldLid]||1)-1);
        if(!S.localDB[newLid]) S.localDB[newLid] = [];
        S.localDB[newLid].push(nw);
        S.counts[newLid] = (S.counts[newLid]||0)+1;
      } else {
        await updateDoc(doc(db,col(oldLid),S.editWord.id),data);
        if(S.localDB[oldLid]){
          const i = S.localDB[oldLid].findIndex(x=>x.id===S.editWord.id);
          if(i > -1) S.localDB[oldLid][i] = {...S.localDB[oldLid][i],...data,_lid:oldLid};
        }
      }
      localStorage.setItem('vv_counts',JSON.stringify(S.counts));
      [oldLid,newLid].forEach(id => { const el=document.getElementById('cnt_'+id); if(el) el.textContent=S.counts[id]; });
      toast('Đã cập nhật ✓','ok');
    } else {
      const ref = await addDoc(collection(db,col(lid)),data);
      const nw  = {id:ref.id,...data,_lid:lid};
      if(!S.localDB[lid]) S.localDB[lid] = [];
      S.localDB[lid].push(nw);
      S.counts[lid] = (S.counts[lid]||0)+1;
      localStorage.setItem('vv_counts',JSON.stringify(S.counts));
      const el = document.getElementById('cnt_'+lid); if(el) el.textContent = S.counts[lid];
      toast('Đã thêm từ mới ✓','ok');
      if(_pendingChildId){
        const cId = _pendingChildId, cLid = _pendingChildLid;
        _pendingChildId = null; _pendingChildLid = null;
        for(const l of S.levels){
          const arr = S.localDB[l.id]||[];
          const idx = arr.findIndex(x=>x.id===cId);
          if(idx > -1){
            arr[idx].parentId  = ref.id;
            arr[idx].updatedAt = Date.now();
            try{ await updateDoc(doc(db,col(l.id),cId),{parentId:ref.id,updatedAt:arr[idx].updatedAt}); }
            catch(e){ toast('Lỗi gắn cha: '+e.message,'err'); }
            break;
          }
        }
      }
    }
    saveLocalDB();
    if(S.searchMode) S.shown = doGlobalSearch(S.searchQ);
    else if(affectedLids.includes(S.activeLevel)) S.shown = getLevelData(S.activeLevel).slice(0,S.shownLimit);
    closeWM(); rMain(); rSidebar();
  } catch(e){ toast('Lỗi: '+e.message,'err'); }
};

/* ═══════════════ DELETE (WRITE-THROUGH) ═══════════════ */
let delTarget = null;
window.confirmDel = function(id,lid){ delTarget={id,lid}; document.getElementById('cfmModal').classList.add('open'); };
window.closeCfm   = function(){ document.getElementById('cfmModal').classList.remove('open'); delTarget=null; };
window.doDelete   = async function(){
  if(!delTarget) return;
  const {id,lid} = delTarget;
  try {
    await deleteDoc(doc(db,col(lid),id));
    if(S.localDB[lid]) S.localDB[lid] = S.localDB[lid].filter(x=>x.id!==id);
    saveLocalDB();
    S.counts[lid] = Math.max(0,(S.counts[lid]||1)-1);
    localStorage.setItem('vv_counts',JSON.stringify(S.counts));
    const el = document.getElementById('cnt_'+lid); if(el) el.textContent=S.counts[lid];
    if(!S.searchMode) S.shown = getLevelData(lid).slice(0,S.shownLimit);
    else S.shown = S.shown.filter(x=>x.id!==id);
    closeCfm(); rMain(); rSidebar(); toast('Đã xóa ✓','ok');
  } catch(e){ toast('Lỗi: '+e.message,'err'); }
};

/* ═══════════════ SETTINGS ═══════════════ */
window.openSettings = function(){
  document.getElementById('setModal').innerHTML = `<div class="modal" style="width:580px">
    <div class="modal-title">⚙️ Cài đặt cấp độ</div>
    <div style="display:grid;grid-template-columns:1fr 32px 32px 32px 32px;align-items:center;gap:8px;padding:0 0 6px;border-bottom:1px solid var(--border);margin-bottom:4px">
      <span style="font-size:10px;color:var(--text2);font-weight:600;letter-spacing:.5px;text-transform:uppercase">Tên cấp độ</span>
      <span style="font-size:9px;color:var(--text2);text-align:center">Màu 1</span>
      <span style="font-size:9px;color:var(--text2);text-align:center">Màu 2</span>
      <span style="font-size:9px;color:var(--text2);text-align:center">Chữ</span>
      <span></span>
    </div>
    <div id="leList">
      ${S.levels.map(l => {
        const c1=l.color||'#4a9eff', c2=l.color2||c1, ct=l.textColor||getContrastColor(c1);
        return `<div class="le-item" data-id="${l.id}" style="display:grid;grid-template-columns:1fr 32px 32px 32px 32px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <input class="ni" value="${esc(l.name)}" placeholder="Tên cấp độ"/>
          <div style="position:relative;display:flex;justify-content:center">
            <div class="lc-btn lc-btn1" style="background:${c1}" data-color="${c1}" title="Màu 1" onclick="toggleCP(this,'${l.id}','color1')"></div>
          </div>
          <div style="position:relative;display:flex;justify-content:center">
            <div class="lc-btn lc-btn2" style="background:${c2}" data-color="${c2}" title="Màu 2" onclick="toggleCP(this,'${l.id}','color2')"></div>
          </div>
          <div style="position:relative;display:flex;justify-content:center">
            <div class="lc-btn lc-btntxt" style="background:${ct};border:2px solid var(--border)" data-color="${ct}" title="Màu chữ" onclick="toggleCP(this,'${l.id}','textColor')">
              <span style="font-size:9px;font-weight:700;color:${getContrastColor(ct)}">A</span>
            </div>
          </div>
          <button class="iBtn del" onclick="delLevel('${l.id}')" ${S.levels.length<=1?'disabled':''}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>`;
      }).join('')}
    </div>
    <button class="btn btn-ghost" style="width:100%;margin-top:12px;justify-content:center" onclick="addLevel()">+ Thêm cấp độ</button>
    <div class="mfoot">
      <button class="btn btn-ghost" onclick="closeSet()">Hủy</button>
      <button class="btn btn-primary" onclick="saveSet()">Lưu</button>
    </div>
  </div>`;
  document.getElementById('setModal').classList.add('open');
};

window.toggleCP = function(btn,lid,field){
  document.querySelectorAll('.cpop').forEach(p=>p.remove());
  const curField = field||'color1';
  const item = document.querySelector(`[data-id="${lid}"]`);
  let cur = '#4a9eff';
  if(item){
    if(curField==='color1')    cur = item.querySelector('.lc-btn1')?.dataset.color||'#4a9eff';
    else if(curField==='color2')    cur = item.querySelector('.lc-btn2')?.dataset.color||cur;
    else if(curField==='textColor') cur = item.querySelector('.lc-btntxt')?.dataset.color||'#ffffff';
  }
  const pop = document.createElement('div');
  pop.className = 'cpop';
  pop.innerHTML = PAL.map(c=>`<div class="cswatch ${cur===c?'sel':''}" style="background:${c};width:22px;height:22px;border-radius:6px" onclick="applyLC(event,'${c}','${lid}','${curField}')"></div>`).join('')
    + `<input type="color" value="${cur}" oninput="applyLC(event,this.value,'${lid}','${curField}')" style="width:100%;height:26px;border:none;border-radius:6px;cursor:pointer;margin-top:4px"/>`;
  document.body.appendChild(pop);
  const rect = btn.getBoundingClientRect();
  let top = rect.bottom+6, left = rect.left;
  if(left+220>window.innerWidth) left = window.innerWidth-228;
  if(top+240>window.innerHeight) top  = rect.top-246;
  pop.style.top = top+'px'; pop.style.left = left+'px';
  setTimeout(()=>document.addEventListener('click',function cl(e){if(!pop.contains(e.target)&&e.target!==btn){pop.remove();document.removeEventListener('click',cl);}},10));
};
window.applyLC = function(e,c,lid,field){
  e.stopPropagation();
  const item = document.querySelector(`[data-id="${lid}"]`);
  if(item){
    const f = field||'color1';
    if(f==='color1')    { const b=item.querySelector('.lc-btn1');    if(b){b.style.background=c;b.dataset.color=c;} }
    else if(f==='color2')    { const b=item.querySelector('.lc-btn2');    if(b){b.style.background=c;b.dataset.color=c;} }
    else if(f==='textColor') { const b=item.querySelector('.lc-btntxt'); if(b){b.style.background=c;b.dataset.color=c;b.style.color=getContrastColor(c);} }
    item.querySelectorAll('.cswatch').forEach(s => s.classList.toggle('sel',s.style.background===c||s.style.backgroundColor===c));
  }
};
window.addLevel = function(){
  S.levels.push({id:'L'+Date.now(),name:'Cấp mới',color:PAL[Math.floor(Math.random()*PAL.length)]});
  openSettings();
};
window.delLevel = function(id){
  if(S.levels.length<=1) return;
  if(!confirm('Xóa cấp độ này? Dữ liệu trong Firestore không bị xóa.')) return;
  S.levels = S.levels.filter(l=>l.id!==id);
  if(S.activeLevel===id){ S.activeLevel=S.levels[0]?.id||null; S.shown=[]; }
  openSettings();
};
window.saveSet = async function(){
  document.querySelectorAll('#leList .le-item').forEach(item => {
    const id=item.dataset.id, l=S.levels.find(x=>x.id===id);
    if(l){
      l.name      = item.querySelector('.ni').value.trim()||l.name;
      l.color     = item.querySelector('.lc-btn1')?.dataset.color||l.color;
      l.color2    = item.querySelector('.lc-btn2')?.dataset.color||l.color;
      l.textColor = item.querySelector('.lc-btntxt')?.dataset.color||'#ffffff';
    }
  });
  localStorage.setItem('vv_levels',JSON.stringify(S.levels));
  localStorage.setItem('vv_levels_updatedAt', String(Date.now()));
  // Lưu lên Firestore để đồng bộ màu giữa các thiết bị
  try {
    await setDoc(doc(db,'_settings','levels'), {levels: S.levels, updatedAt: Date.now()});
  } catch(e){ console.warn('Không thể lưu cài đặt lên cloud:', e); }
  closeSet(); rMain(); rSidebar(); toast('Đã lưu cài đặt ✓','ok');
};
window.closeSet = function(){ document.getElementById('setModal').classList.remove('open'); };

/* ═══════════════ MOBILE DRAWER ═══════════════ */
function rDrawer(){
  const nav = document.getElementById('drawerNav'); if(!nav) return;
  nav.innerHTML = S.levels.map(l => {
    const cnt    = S.counts[l.id] !== undefined ? S.counts[l.id] : '…';
    const active = S.activeLevel===l.id && !S.searchMode;
    const dotStyle = l.color2 ? `background:linear-gradient(135deg,${l.color},${l.color2})` : `background:${l.color}`;
    return `<button class="lvl-btn ${active?'active':''}" onclick="selLevel('${l.id}');closeDrawer()">
      <span class="dot" style="${dotStyle}"></span><span>${esc(l.name)}</span>
      <span class="cnt">${cnt}</span></button>`;
  }).join('');
}
window.openDrawer = function(){
  rDrawer(); updateTotalUI();
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
};
window.closeDrawer = function(){
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
  document.body.style.overflow = '';
};

/* ═══════════════ TOAST ═══════════════ */
function toast(msg, type=''){
  const el = Object.assign(document.createElement('div'),{className:`toast ${type}`,textContent:msg});
  document.getElementById('toastC').appendChild(el);
  setTimeout(()=>el.remove(), 3100);
}

/* ═══════════════ INIT ═══════════════ */
document.addEventListener('click', e => {
  ['wModal','setModal','cfmModal','spModal'].forEach(id => {
    const el = document.getElementById(id);
    if(el && e.target===el) el.classList.remove('open');
  });
});

async function init(){
  rSidebar();
  if(S.levels.length) selLevel(S.levels[0].id);
  for(const l of S.levels) syncLevel(l.id);
  // Đồng bộ cài đặt cấp độ (màu sắc) từ Firestore
  try {
    const snap = await getDoc(doc(db,'_settings','levels'));
    if(snap.exists()){
      const data = snap.data();
      if(data.levels && Array.isArray(data.levels)){
        // Chỉ cập nhật nếu Firestore mới hơn localStorage
        const fbUpdated = data.updatedAt||0;
        const lsUpdated = parseInt(localStorage.getItem('vv_levels_updatedAt')||'0');
        if(fbUpdated > lsUpdated){
          S.levels = data.levels;
          localStorage.setItem('vv_levels', JSON.stringify(S.levels));
          localStorage.setItem('vv_levels_updatedAt', String(fbUpdated));
          rSidebar(); rMain();
        }
      }
    }
  } catch(e){ console.warn('Không thể tải cài đặt từ cloud:', e); }
}
init();