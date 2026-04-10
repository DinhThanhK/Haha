/* ============================================================
   Card Vault — app.js  v4  (Firestore)
   Settings vẫn dùng localStorage (preference cục bộ).
   Card data → Firestore collection "cards"
   ============================================================ */

const SETTINGS_KEY  = 'card_vault_settings';
const FS_COLLECTION = 'cards';

const CARD_TYPES = ['Monster','Spell','Trap','Special'];

const ELEMENTS = [
  {id:'fire',    label:'🔥 Fire',    icon:'./elements/fire.png'},
  {id:'water',   label:'💧 Water',   icon:'./elements/water.png'},
  {id:'ice',     label:'❄️ Ice',     icon:'./elements/ice.png'},
  {id:'plant',   label:'🌿 Plant',   icon:'./elements/plant.png'},
  {id:'wind',    label:'🌬️ Wind',    icon:'./elements/wind.png'},
  {id:'earth',   label:'🏔️ Earth',   icon:'./elements/earth.png'},
  {id:'poison',  label:'☠️ Poison',  icon:'./elements/poison.png'},
  {id:'metal',   label:'⚙️ Metal',   icon:'./elements/metal.png'},
  {id:'thunder', label:'⚡ Thunder', icon:'./elements/thunder.png'},
  {id:'sound',   label:'🔊 Sound',   icon:'./elements/sound.png'},
  {id:'light',   label:'✨ Light',   icon:'./elements/light.png'},
  {id:'dark',    label:'🔮 Dark',    icon:'./elements/dark.png'},
];

const ELEM_MAP = Object.fromEntries(ELEMENTS.map(e => [e.id, e]));

const BUFF_ICONS = {
  lotus: './icons/lotus.png',
  ruby:  './icons/ruby.png',
};

function elemIcon(id, short=false){
  const e = ELEM_MAP[id];
  if(!e) return id;
  if(e.icon){
    const name = short ? '' : ` ${id.charAt(0).toUpperCase()+id.slice(1)}`;
    return `<img src="${e.icon}" alt="${id}" class="icon-img icon-elem" onerror="this.outerHTML='${e.label}'">${name}`;
  }
  return e.label;
}

function buffIcon(type, val){
  const src = BUFF_ICONS[type];
  const emoji = type==='lotus'?'🪷':'💎';
  if(src){
    return `<img src="${src}" alt="${type}" class="icon-img icon-buff" onerror="this.outerHTML='${emoji}'">${val}`;
  }
  return `${emoji}${val}`;
}

const DEFAULT_TYPE_COLORS = {
  Monster:'#d4b86a',
  Spell:  '#4ec97a',
  Trap:   '#a855f7',
  Special:'__rainbow__',
};

// ── STATE ──────────────────────────────────────────────────────
let cards        = [];
let editingId    = null;
let currentImage = '';
let viewMode     = 'grid';
let detailLang   = 'vn';
let settings     = { typeColors: {...DEFAULT_TYPE_COLORS} };
let currentEditElements = [];

// filter state
let filterType      = '';
let filterStars     = '';
let filterStarRange = '';
let filterStarSort  = '';
let filterSpellSub  = '';
let filterElement   = '';
let searchQuery     = '';

// ── SETTINGS (localStorage) ────────────────────────────────────
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
    settings = { typeColors:{...DEFAULT_TYPE_COLORS}, ...s,
      typeColors: {...DEFAULT_TYPE_COLORS, ...(s.typeColors||{})} };
  } catch { settings={typeColors:{...DEFAULT_TYPE_COLORS}}; }
}

// ── FIRESTORE HELPERS ──────────────────────────────────────────
function getFS(){
  // Chờ Firebase module khởi tạo xong (từ index.html)
  if(!window.DB || !window.FirestoreAPI){
    console.warn('Firestore chưa sẵn sàng');
    return null;
  }
  return window.FirestoreAPI;
}

async function fsAddCard(data){
  const fs = getFS(); if(!fs) return null;
  const { collection, addDoc, serverTimestamp } = fs;
  // Xóa field image dạng base64 lớn nếu muốn tiết kiệm quota Firestore
  // (Giữ nguyên ở đây — nếu dùng URL thì nhỏ, base64 thì to)
  const ref = await addDoc(collection(window.DB, FS_COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

async function fsUpdateCard(id, data){
  const fs = getFS(); if(!fs) return;
  const { doc, updateDoc, serverTimestamp } = fs;
  const ref = doc(window.DB, FS_COLLECTION, id);
  // Loại bỏ field id khỏi data trước khi update
  const { id: _omit, ...rest } = data;
  await updateDoc(ref, { ...rest, updatedAt: serverTimestamp() });
}

async function fsDeleteCard(id){
  const fs = getFS(); if(!fs) return;
  const { doc, deleteDoc } = fs;
  await deleteDoc(doc(window.DB, FS_COLLECTION, id));
}

function fsListen(){
  const fs = getFS(); if(!fs) return;
  const { collection, query, orderBy, onSnapshot } = fs;
  const q = query(collection(window.DB, FS_COLLECTION), orderBy('createdAt', 'desc'));
  onSnapshot(q, snapshot => {
    cards = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCards();
  }, err => {
    console.error('Firestore onSnapshot lỗi:', err);
    showToast('⚠️ Không thể kết nối Firestore!', '#e03858', 4000);
  });
}

// ── HELPERS ────────────────────────────────────────────────────
function cardTypeGroup(card){
  const t = card.cardType||'Monster';
  if(t==='Spell')   return 'spell';
  if(t==='Trap')    return 'trap';
  if(t==='Special') return 'special';
  return 'monster';
}

function starCount(card){ const s=parseInt(card.stars||0); return isNaN(s)?0:s; }
function starsDisplay(n){ return n?'★'.repeat(Math.min(n,10)):''; }

function spellSubLabel(sub){
  if(sub==='P')  return 'Normal Spell (P)';
  if(sub==='P*') return 'Continuous Spell (P★)';
  return sub||'';
}

function elemBadges(elems){
  if(!elems||!elems.length) return '';
  return elems.map(e=>`<span class="ci-elem elem-${e}">${elemIcon(e)}</span>`).join('');
}

function typeBorderStyle(cardType){
  const c = settings.typeColors[cardType]||'#888';
  if(c==='__rainbow__'||cardType==='Special')
    return 'border-top:3px solid transparent;border-image:linear-gradient(90deg,#f0cc6a,#4ec97a,#a855f7,#e03858,#2090e8) 1;';
  return `border-top:3px solid ${c};`;
}

// ── FILTER BAR ─────────────────────────────────────────────────
function buildSubFilters(){
  const c = document.getElementById('subFilters');
  c.innerHTML = '';

  if(filterType==='Monster'){
    const s1 = document.createElement('select');
    s1.className='hselect';
    s1.innerHTML=`<option value="">Tất cả sao</option>`+
      [1,2,3,4,5,6,7,8,9,10].map(n=>`<option value="${n}"${filterStars==n?' selected':''}>★ ${n}</option>`).join('');
    s1.addEventListener('change',()=>{ filterStars=s1.value; filterStarRange=''; renderCards(); });
    c.appendChild(s1);

    const s2 = document.createElement('select');
    s2.className='hselect';
    s2.innerHTML=`<option value="">Tất cả nhóm</option>
      <option value="low"${filterStarRange==='low'?' selected':''}>Low (1-4★)</option>
      <option value="medium"${filterStarRange==='medium'?' selected':''}>Medium (5-7★)</option>
      <option value="high"${filterStarRange==='high'?' selected':''}>High (8-10★)</option>`;
    s2.addEventListener('change',()=>{ filterStarRange=s2.value; filterStars=''; renderCards(); });
    c.appendChild(s2);

    const s3 = document.createElement('select');
    s3.className='hselect';
    s3.innerHTML=`<option value="">Sắp xếp sao</option>
      <option value="asc"${filterStarSort==='asc'?' selected':''}>★ ↑ ít→nhiều</option>
      <option value="desc"${filterStarSort==='desc'?' selected':''}>★ ↓ nhiều→ít</option>`;
    s3.addEventListener('change',()=>{ filterStarSort=s3.value; renderCards(); });
    c.appendChild(s3);
  }

  if(filterType==='Spell'){
    const s = document.createElement('select');
    s.className='hselect';
    s.innerHTML=`<option value="">Tất cả Spell</option>
      <option value="P"${filterSpellSub==='P'?' selected':''}>Normal Spell (P)</option>
      <option value="P*"${filterSpellSub==='P*'?' selected':''}>Continuous Spell (P★)</option>`;
    s.addEventListener('change',()=>{ filterSpellSub=s.value; renderCards(); });
    c.appendChild(s);
  }
}

// ── RENDER GRID ────────────────────────────────────────────────
function renderCards(){
  const grid  = document.getElementById('cardGrid');
  const empty = document.getElementById('emptyState');
  grid.querySelectorAll('.card-item').forEach(el=>el.remove());

  let filtered = cards.filter(c=>{
    if(searchQuery && !(c.name||'').toLowerCase().includes(searchQuery)) return false;
    if(filterType && (c.cardType||'Monster')!==filterType) return false;
    if(filterElement && !(c.elements||[]).includes(filterElement)) return false;
    if(filterType==='Monster'){
      const s=starCount(c);
      if(filterStars && s!==parseInt(filterStars)) return false;
      if(filterStarRange==='low'    && (s<1||s>4))  return false;
      if(filterStarRange==='medium' && (s<5||s>7))  return false;
      if(filterStarRange==='high'   && (s<8||s>10)) return false;
    }
    if(filterType==='Spell' && filterSpellSub && c.spellSub!==filterSpellSub) return false;
    return true;
  });

  if(filterStarSort==='asc')  filtered.sort((a,b)=>starCount(a)-starCount(b));
  if(filterStarSort==='desc') filtered.sort((a,b)=>starCount(b)-starCount(a));

  document.getElementById('cardCount').textContent=`${filtered.length} thẻ`;
  empty.style.display = filtered.length===0?'block':'none';
  filtered.forEach((card,i)=>{
    const el=buildTile(card);
    el.style.animationDelay=`${i*0.035}s`;
    grid.appendChild(el);
  });
}

// ── BUILD TILE ────────────────────────────────────────────────
function buildTile(card){
  const tg = cardTypeGroup(card);
  const isMonster = (card.cardType||'Monster')==='Monster';
  const el = document.createElement('div');
  el.className=`card-item type-${tg}`;
  el.dataset.id=card.id;
  el.dataset.tileLang='vn';
  el.setAttribute('style', typeBorderStyle(card.cardType||'Monster'));

  function tileContent(lang){
    const isVN  = lang==='vn';
    const desc   = isVN?(card.descVN||card.descEN||''):(card.descEN||card.descVN||'');
    const spDesc = isVN?(card.spDescVN||card.spDescEN||''):(card.spDescEN||card.spDescVN||'');
    const elems  = card.elements||[];
    const stars  = starCount(card);
    const ct     = card.cardType||'Monster';

    return `
      <div class="ci-top">
        <div class="ci-art-small">
          ${card.image
            ?`<img src="${card.image}" alt="${card.name||''}" loading="lazy"/>`
            :`<span class="ci-art-ph">🃏</span>`}
          <div class="ci-type-badge type-badge-${tg}">${ct}</div>
        </div>
        <div class="ci-head">
          <div class="ci-name">${card.name||'—'}</div>
          ${isMonster?`
            ${stars?`<div class="ci-stars">${starsDisplay(stars)} <span class="ci-star-num">(${stars}★)</span></div>`:''}
            <div class="ci-stats">
              ${card.atk!==''&&card.atk!=null?`<span class="ci-atk">ATK ${card.atk}</span>`:''}
              ${card.def!==''&&card.def!=null?`<span class="ci-def">DEF ${card.def}</span>`:''}
              ${card.lotus?`<span class="ci-buff">${buffIcon('lotus',card.lotus)}</span>`:''}
              ${card.ruby ?`<span class="ci-buff">${buffIcon('ruby', card.ruby)}</span>`:''}
            </div>
            ${elems.length?`<div class="ci-elements">${elemBadges(elems)}</div>`:''}
          `:card.spellSub?`<div class="ci-spell-sub">${spellSubLabel(card.spellSub)}</div>`:''}
        </div>
      </div>
      ${desc||spDesc?`
        <div class="ci-divider"></div>
        <div class="ci-descs">
          ${desc?`<div class="ci-desc-text">${desc}</div>`:''}
          ${spDesc&&isMonster?`<div class="ci-sp-text">${spDesc}</div>`:''}
        </div>`:''}
      <div class="ci-footer">
        <div class="ci-lang-toggle">
          <button class="ci-lang-btn ${lang==='vn'?'active':''}" data-lang="vn">🇻🇳</button>
          <button class="ci-lang-btn ${lang==='en'?'active':''}" data-lang="en">🇬🇧</button>
        </div>
        <div class="ci-actions-inline">
          <button class="ci-act ci-act-edit" data-id="${card.id}" title="Sửa">✏️</button>
          <button class="ci-act ci-act-del"  data-id="${card.id}" title="Xóa">🗑️</button>
        </div>
      </div>`;
  }

  el.innerHTML = tileContent('vn');

  el.addEventListener('click', e=>{
    const langBtn = e.target.closest('.ci-lang-btn');
    if(langBtn){ e.stopPropagation(); el.innerHTML=tileContent(langBtn.dataset.lang); bindTile(); return; }
    if(e.target.closest('.ci-actions-inline')) return;
    openDetail(card.id);
  });

  function bindTile(){
    el.querySelector('.ci-act-edit')?.addEventListener('click',e=>{e.stopPropagation();openEdit(card.id);});
    el.querySelector('.ci-act-del') ?.addEventListener('click',e=>{e.stopPropagation();deleteCard(card.id);});
  }
  bindTile();
  return el;
}

// ── DETAIL MODAL ───────────────────────────────────────────────
function openDetail(id){
  const card=cards.find(c=>c.id===id); if(!card) return;
  detailLang='vn'; renderDetail(card);
  document.getElementById('detailOverlay').classList.add('open');
}

function renderDetail(card){
  const body=document.getElementById('detailBody');
  const tg=cardTypeGroup(card);
  const isMonster=(card.cardType||'Monster')==='Monster';
  const isVN=detailLang==='vn';
  const desc  =isVN?(card.descVN||card.descEN||'—'):(card.descEN||card.descVN||'—');
  const spDesc=isVN?(card.spDescVN||card.spDescEN||''):(card.spDescEN||card.spDescVN||'');
  const elems=card.elements||[];
  const stars=starCount(card);
  const ct=card.cardType||'Monster';

  body.innerHTML=`
    <div class="detail-art">
      ${card.image?`<img src="${card.image}" alt="${card.name||''}"/>`:`<span class="detail-art-ph">🃏</span>`}
      <div class="detail-art-overlay">
        <div class="detail-type-badge type-badge-${tg}">${ct}</div>
        ${isMonster&&stars?`<div class="detail-stars">${starsDisplay(stars)}</div>`:''}
      </div>
    </div>
    <div class="detail-info">
      <div class="detail-name">${card.name||'—'}</div>
      ${isMonster?`
        <div class="detail-row">
          ${card.atk!==''&&card.atk!=null?`<div class="det-stat"><span class="det-stat-lbl">ATK</span><span class="det-stat-val-atk">${card.atk}</span></div>`:''}
          ${card.def!==''&&card.def!=null?`<div class="det-stat"><span class="det-stat-lbl">DEF</span><span class="det-stat-val-def">${card.def}</span></div>`:''}
          ${card.lotus?`<div class="det-buff">${buffIcon('lotus',card.lotus)}</div>`:''}
          ${card.ruby ?`<div class="det-buff">${buffIcon('ruby', card.ruby)}</div>`:''}
        </div>
        ${elems.length?`<div class="detail-elems">${elemBadges(elems)}</div>`:''}
      `:card.spellSub?`<div class="detail-spell-sub">${spellSubLabel(card.spellSub)}</div>`:''}
      <div class="detail-divider"></div>
      <div class="detail-copy-row">
        <button class="det-copy-btn" data-copy-val="${escAttr(card.name||'')}">⎘ Tên</button>
        <button class="det-copy-btn" data-copy-val="${escAttr(isVN?(card.descVN||card.descEN||''):(card.descEN||card.descVN||''))}">⎘ Mô tả</button>
        ${isMonster?`<button class="det-copy-btn" data-copy-val="${escAttr(isVN?(card.spDescVN||card.spDescEN||''):(card.spDescEN||card.spDescVN||''))}">⎘ Kỹ năng</button>`:''}
        ${card.image?`<button class="det-copy-btn" data-copy-val="${escAttr(card.image)}">⎘ URL ảnh</button>`:''}
      </div>
      <div class="detail-lang-tabs">
        <button class="dlang-btn ${isVN?'active':''}" data-dlang="vn" data-id="${card.id}">🇻🇳 Tiếng Việt</button>
        <button class="dlang-btn ${!isVN?'active':''}" data-dlang="en" data-id="${card.id}">🇬🇧 English</button>
      </div>
      <div class="detail-desc-section">
        <div class="det-desc-lbl">Mô tả chung</div>
        <div class="det-desc-text">${desc}</div>
        ${spDesc&&isMonster?`
          <div class="det-desc-lbl det-sp-lbl" style="margin-top:8px">Kỹ năng đặc biệt</div>
          <div class="det-special">${spDesc}</div>`:''
        }
      </div>
      <div class="detail-bottom-actions">
        <button class="btn-sm" id="detEditBtn" data-id="${card.id}">✏️ Chỉnh sửa</button>
        <button class="btn-cancel" id="detCloseBtn">Đóng</button>
      </div>
    </div>`;

  body.querySelectorAll('.dlang-btn').forEach(btn=>btn.addEventListener('click',()=>{
    detailLang=btn.dataset.dlang;
    const c=cards.find(x=>x.id===btn.dataset.id); if(c) renderDetail(c);
  }));
  body.querySelectorAll('.det-copy-btn').forEach(btn=>btn.addEventListener('click',()=>copyText(btn.dataset.copyVal)));
  body.querySelector('#detEditBtn').addEventListener('click',()=>{
    document.getElementById('detailOverlay').classList.remove('open');
    openEdit(body.querySelector('#detEditBtn').dataset.id);
  });
  body.querySelector('#detCloseBtn').addEventListener('click',()=>
    document.getElementById('detailOverlay').classList.remove('open'));
}

function escAttr(str){ return (str||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// ── SETTINGS MODAL ─────────────────────────────────────────────
function openSettings(){
  const body=document.getElementById('settingsBody');
  body.innerHTML=`
    <p style="font-size:12px;color:var(--text-dim);margin-bottom:14px">Tùy chỉnh màu viền theo loại thẻ. <em>Special</em> luôn dùng gradient.</p>
    ${CARD_TYPES.filter(t=>t!=='Special').map(t=>`
      <div class="settings-row">
        <label>${t}</label>
        <input type="color" class="color-pick" data-type="${t}" value="${settings.typeColors[t]||'#888888'}"/>
        <button class="btn-sm reset-color" data-type="${t}">Reset</button>
      </div>`).join('')}
    <div class="settings-row" style="opacity:.5">
      <label>Special</label>
      <span style="font-size:12px;color:var(--text-dim)">🌈 Rainbow gradient (auto)</span>
    </div>`;

  body.querySelectorAll('.color-pick').forEach(inp=>{
    inp.addEventListener('input',()=>{ settings.typeColors[inp.dataset.type]=inp.value; saveSettings(); renderCards(); });
  });
  body.querySelectorAll('.reset-color').forEach(btn=>{
    btn.addEventListener('click',()=>{ settings.typeColors[btn.dataset.type]=DEFAULT_TYPE_COLORS[btn.dataset.type]; saveSettings(); openSettings(); renderCards(); });
  });
  document.getElementById('settingsOverlay').classList.add('open');
}

// ── MODAL OPEN/CLOSE ───────────────────────────────────────────
function openAdd(){
  editingId=null; currentImage='';
  document.getElementById('modalTitle').textContent='Thêm thẻ bài mới';
  clearForm();
  document.getElementById('modalOverlay').classList.add('open');
  syncFormType(); updateLivePreview();
}
function openEdit(id){
  const card=cards.find(c=>c.id===id); if(!card) return;
  editingId=id; currentImage=card.image||'';
  document.getElementById('modalTitle').textContent='Chỉnh sửa thẻ bài';
  fillForm(card);
  document.getElementById('modalOverlay').classList.add('open');
  syncFormType(); updateLivePreview();
}
function closeModal(){ document.getElementById('modalOverlay').classList.remove('open'); editingId=null; }

// ── FORM HELPERS ───────────────────────────────────────────────
function syncFormType(){
  const t=(document.getElementById('fCardType')||{}).value||'Monster';
  const isMonster=t==='Monster', isSpell=t==='Spell';
  document.getElementById('monsterFields').style.display = isMonster?'':'none';
  document.getElementById('spellSubField').style.display = isSpell  ?'':'none';
  document.getElementById('spDescSection').style.display = isMonster?'':'none';
  if(isMonster) buildElemCheckboxes(currentEditElements||[]);
}

function buildElemCheckboxes(selected=[]){
  const wrap=document.getElementById('elemCheckboxes');
  if(!wrap) return;
  wrap.innerHTML=ELEMENTS.map(e=>{
    const iconHtml = e.icon
      ? `<img src="${e.icon}" alt="${e.id}" class="icon-img icon-elem-chk" onerror="this.style.display='none';this.nextSibling.style.display='inline'"><span style="display:none">${e.label.split(' ')[0]}</span>`
      : `<span>${e.label.split(' ')[0]}</span>`;
    const name = e.id.charAt(0).toUpperCase()+e.id.slice(1);
    return `<label class="elem-chk-label">
      <input type="checkbox" value="${e.id}"${selected.includes(e.id)?' checked':''}/>
      ${iconHtml} ${name}
    </label>`;
  }).join('');
}

function getSelectedElements(){
  return [...document.querySelectorAll('#elemCheckboxes input:checked')].map(i=>i.value);
}

function clearForm(){
  ['fNameVN','fNameEN','fDescVN','fSpDescVN','fDescEN','fSpDescEN','fAtk','fDef','fLotus','fRuby','fStars','imgUrlInput']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('fCardType').value='Monster';
  document.getElementById('fSpellSub').value='';
  currentEditElements=[]; buildElemCheckboxes([]);
  setImgPreview(''); syncFormType();
}

function fillForm(c){
  document.getElementById('fNameVN').value   = c.nameVN  ||c.name  ||'';
  document.getElementById('fNameEN').value   = c.nameEN  ||'';
  document.getElementById('fDescVN').value   = c.descVN  ||'';
  document.getElementById('fSpDescVN').value = c.spDescVN||'';
  document.getElementById('fDescEN').value   = c.descEN  ||'';
  document.getElementById('fSpDescEN').value = c.spDescEN||'';
  document.getElementById('fAtk').value      = c.atk !=null?c.atk:'';
  document.getElementById('fDef').value      = c.def !=null?c.def:'';
  document.getElementById('fLotus').value    = c.lotus   ||'';
  document.getElementById('fRuby').value     = c.ruby    ||'';
  document.getElementById('fStars').value    = c.stars   ||'';
  document.getElementById('fCardType').value = c.cardType||'Monster';
  document.getElementById('fSpellSub').value = c.spellSub||'';
  currentEditElements=c.elements||[]; buildElemCheckboxes(currentEditElements);
  setImgPreview(c.image||'');
}

function readForm(){
  const ct=document.getElementById('fCardType').value;
  const isMonster=ct==='Monster';
  return {
    name:    document.getElementById('fNameVN').value.trim()||document.getElementById('fNameEN').value.trim(),
    nameVN:  document.getElementById('fNameVN').value.trim(),
    nameEN:  document.getElementById('fNameEN').value.trim(),
    cardType:ct,
    spellSub:isMonster?'':(document.getElementById('fSpellSub').value||''),
    stars:   isMonster?(document.getElementById('fStars').value||''):'',
    elements:isMonster?getSelectedElements():[],
    atk:     isMonster?document.getElementById('fAtk').value:'',
    def:     isMonster?document.getElementById('fDef').value:'',
    lotus:   isMonster?document.getElementById('fLotus').value:'',
    ruby:    isMonster?document.getElementById('fRuby').value:'',
    descVN:  document.getElementById('fDescVN').value.trim(),
    spDescVN:isMonster?document.getElementById('fSpDescVN').value.trim():'',
    descEN:  document.getElementById('fDescEN').value.trim(),
    spDescEN:isMonster?document.getElementById('fSpDescEN').value.trim():'',
    image:   currentImage,
  };
}

// ── SAVE / DELETE CARD (Firestore) ─────────────────────────────
async function saveCard(){
  const data = readForm();
  if(!data.name && !data.nameEN){
    showToast('⚠️ Vui lòng nhập tên thẻ bài!','#e03858');
    return;
  }

  // Disable nút tránh bấm 2 lần
  const btnSave = document.getElementById('btnSaveCard');
  btnSave.disabled = true;
  btnSave.textContent = '⏳ Đang lưu...';

  try {
    if(editingId){
      await fsUpdateCard(editingId, data);
    } else {
      await fsAddCard(data);
    }
    closeModal();
    showToast('✓ Đã lưu thẻ bài!');
  } catch(err){
    console.error('Lưu Firestore thất bại:', err);
    showToast('⚠️ Lưu thất bại: ' + err.message, '#e03858', 4000);
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = '💾 Lưu thẻ bài';
  }
}

async function deleteCard(id){
  const c = cards.find(x=>x.id===id);
  if(!confirm(`Xóa "${c?.name||'thẻ này'}"?`)) return;
  try {
    await fsDeleteCard(id);
    showToast('🗑️ Đã xóa thẻ bài!', '#e03858');
  } catch(err){
    console.error('Xóa Firestore thất bại:', err);
    showToast('⚠️ Xóa thất bại: ' + err.message, '#e03858', 4000);
  }
}

// ── IMAGE ──────────────────────────────────────────────────────
function setImgPreview(src){
  currentImage=src;
  const img=document.getElementById('imgPreview'), ph=document.getElementById('dropPlaceholder');
  if(src){ img.src=src; img.style.display='block'; ph.style.display='none'; }
  else   { img.src='';  img.style.display='none';  ph.style.display='flex'; }
  updateLivePreview();
}
function handleFile(file){
  if(!file||!file.type.startsWith('image/')) return;
  if(file.size>1_200_000&&!confirm(`Ảnh ${(file.size/1024/1024).toFixed(1)}MB — lớn. Tiếp tục?`)) return;
  const r=new FileReader(); r.onload=e=>setImgPreview(e.target.result); r.readAsDataURL(file);
}

// ── LIVE PREVIEW ───────────────────────────────────────────────
function updateLivePreview(){
  const wrap=document.getElementById('livePreview'); if(!wrap) return;
  const name=document.getElementById('fNameVN')?.value||document.getElementById('fNameEN')?.value||'';
  const ct  =document.getElementById('fCardType')?.value||'Monster';
  const stars=document.getElementById('fStars')?.value||'';
  const atk =document.getElementById('fAtk')?.value;
  const def =document.getElementById('fDef')?.value;
  const tg  =ct.toLowerCase();
  if(!name&&!currentImage){
    wrap.innerHTML='<div class="prev-empty">Điền thông tin<br/>để xem trước thẻ</div>'; return;
  }
  wrap.innerHTML=`<div class="lp-card" style="${typeBorderStyle(ct)}">
    <div class="lp-art">${currentImage?`<img src="${currentImage}" alt=""/>`:
      `<span class="lp-art-ph">🃏</span>`}</div>
    <div class="lp-type type-badge-${tg}">${ct}</div>
    <div class="lp-bottom">
      <div class="lp-name">${name||'—'}</div>
      ${ct==='Monster'?`
        <div class="lp-stars">${starsDisplay(parseInt(stars)||0)}</div>
        <div class="lp-stats">
          ${atk?`<span class="lp-atk">ATK ${atk}</span>`:''}
          ${def?`<span class="lp-def">DEF ${def}</span>`:''}
        </div>`:''}
    </div></div>`;
}

// ── CLIPBOARD / TOAST ──────────────────────────────────────────
function copyText(text){
  if(!text) return;
  navigator.clipboard.writeText(text).then(()=>showToast('✓ Đã sao chép!')).catch(()=>{
    const ta=document.createElement('textarea'); ta.value=text;
    ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta);
    ta.focus(); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    showToast('✓ Đã sao chép!');
  });
}
let toastTimer=null;
function showToast(msg,bg='#28c870',duration=2000){
  const t=document.getElementById('copyToast');
  t.textContent=msg; t.style.background=bg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),duration);
}

// ── EVENT SETUP ────────────────────────────────────────────────
function setup(){
  document.getElementById('btnOpenModal').addEventListener('click',openAdd);
  document.getElementById('btnCloseModal').addEventListener('click',closeModal);
  document.getElementById('btnCancel').addEventListener('click',closeModal);
  document.getElementById('btnSaveCard').addEventListener('click',saveCard);
  document.getElementById('btnSettings').addEventListener('click',openSettings);
  document.getElementById('btnCloseSettings').addEventListener('click',()=>
    document.getElementById('settingsOverlay').classList.remove('open'));
  document.getElementById('btnCloseDetail').addEventListener('click',()=>
    document.getElementById('detailOverlay').classList.remove('open'));

  ['modalOverlay','detailOverlay','settingsOverlay'].forEach(id=>{
    document.getElementById(id).addEventListener('click',e=>{
      if(e.target.id===id) document.getElementById(id).classList.remove('open');
    });
  });

  document.getElementById('searchInput').addEventListener('input',e=>{
    searchQuery=e.target.value.toLowerCase(); renderCards();
  });
  document.getElementById('filterType').addEventListener('change',e=>{
    filterType=e.target.value;
    filterStars=''; filterStarRange=''; filterStarSort='';
    filterSpellSub=''; filterElement='';
    document.getElementById('filterElement').value='';
    buildSubFilters(); renderCards();
  });
  document.getElementById('filterElement').addEventListener('change',e=>{
    filterElement=e.target.value; renderCards();
  });
  document.getElementById('fCardType').addEventListener('change',()=>{ syncFormType(); updateLivePreview(); });

  document.getElementById('viewGrid').addEventListener('click',()=>{
    viewMode='grid';
    document.getElementById('cardGrid').classList.remove('list-view');
    document.getElementById('viewGrid').classList.add('active');
    document.getElementById('viewList').classList.remove('active');
  });
  document.getElementById('viewList').addEventListener('click',()=>{
    viewMode='list';
    document.getElementById('cardGrid').classList.add('list-view');
    document.getElementById('viewList').classList.add('active');
    document.getElementById('viewGrid').classList.remove('active');
  });

  const dropZone=document.getElementById('imgDropZone'), fileInput=document.getElementById('imgFileInput');
  dropZone.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); });
  dropZone.addEventListener('dragover',e=>{ e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop',e=>{
    e.preventDefault(); dropZone.classList.remove('dragover');
    if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  document.getElementById('btnLoadUrl').addEventListener('click',()=>{
    const url=document.getElementById('imgUrlInput').value.trim(); if(url) setImgPreview(url);
  });
  document.getElementById('imgUrlInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'){ const url=e.target.value.trim(); if(url) setImgPreview(url); }
  });

  ['fNameVN','fNameEN','fCardType','fStars','fAtk','fDef'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    el.addEventListener('input',updateLivePreview);
    el.addEventListener('change',updateLivePreview);
  });

  document.querySelectorAll('.copy-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const target=document.getElementById(btn.dataset.target);
      if(target) copyText(target.value);
    });
  });

  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape') return;
    ['modalOverlay','detailOverlay','settingsOverlay'].forEach(id=>
      document.getElementById(id)?.classList.remove('open'));
  });
}

// ── INIT ───────────────────────────────────────────────────────
function init(){
  loadSettings();
  setup();
  buildSubFilters();

  // Chờ Firebase module khởi tạo (module script chạy trước app.js nên thường đã sẵn sàng)
  // Dùng setTimeout nhỏ để chắc chắn window.DB đã được gán
  const tryListen = (attempt=0) => {
    if(window.DB && window.FirestoreAPI){
      fsListen(); // lắng nghe real-time Firestore
    } else if(attempt < 10){
      setTimeout(()=>tryListen(attempt+1), 200);
    } else {
      showToast('⚠️ Không thể kết nối Firebase!', '#e03858', 5000);
    }
  };
  tryListen();
}

init();