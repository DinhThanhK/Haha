// ===== LUYEN TOAN JS — no ES module, all globals =====

var currentTopic = 'chuyen-ve';
var currentSubtype = 'fraction-eq';
var qIdx = 0;
var selected = null;
var history = [];
var aiCache = [];
var aiLoading = false;

var TOPICS = [
  { id: 'chuyen-ve', label: 'Chuyển vế đổi dấu' },
  { id: 'phan-so',   label: 'Tỉ lệ phân số' },
  { id: 'quy-dong',  label: 'Quy đồng' },
  { id: 'mu',        label: 'Biểu thức mũ' },
  { id: 'can',       label: 'Hệ số trong căn' },
  { id: 'tinh-toan', label: '✦ Tính toán AI', ai: true },
];

var SUBTYPES = [
  { id: 'fraction-eq',   label: 'Phân số = Phân số' },
  { id: 'fraction-ineq', label: 'Bất phương trình phân số' },
  { id: 'simplify',      label: 'Rút gọn / Quy đồng' },
  { id: 'min-max-sq',    label: 'Min/Max (hoàn phương)' },
  { id: 'min-max-am',    label: 'Min/Max (AM-GM)' },
];

var STATIC_QS = {
  'chuyen-ve': [
    { q:'Từ \\(3x + 5 = 14\\), chuyển vế 5 sang phải?', choices:['\\(3x = 14 + 5\\)','\\(3x = 14 - 5\\)','\\(3x = 14 \\times 5\\)','\\(3x = 5 - 14\\)','\\(x = \\frac{14-5}{3}\\)','\\(-3x = 5 - 14\\)'], ans:1, tip:'Chuyển vế đổi dấu: +5 → −5', explain:'\\(3x = 14 - 5 = 9 \\Rightarrow x = 3\\)' },
    { q:'Từ \\(2x - 7 = 3\\), chuyển −7 sang phải?', choices:['\\(2x = 3 - 7\\)','\\(2x = 3 + 7\\)','\\(2x = 7 + 3\\)','\\(2x = -3 - 7\\)','\\(x = 3 + 7\\)','\\(-2x = 7 - 3\\)'], ans:1, tip:'−7 chuyển sang phải → +7', explain:'\\(2x = 10 \\Rightarrow x = 5\\)' },
    { q:'\\(-4x > 12\\). Chia hai vế cho −4?', choices:['\\(x > -3\\)','\\(x < -3\\)','\\(x > 3\\)','\\(x < 3\\)','\\(x = -3\\)','\\(x \\geq -3\\)'], ans:1, tip:'Chia BPT cho số âm → đổi chiều!', explain:'\\(x < \\frac{12}{-4} = -3\\)' },
    { q:'\\(5 - x = 2\\). Chuyển 5 sang phải?', choices:['\\(-x = 2 + 5\\)','\\(-x = 2 - 5\\)','\\(x = 2 - 5\\)','\\(-x = 5 - 2\\)','\\(x = 5 - 2\\)','\\(-x = -2 + 5\\)'], ans:1, tip:'+5 ở trái → −5 ở phải', explain:'\\(-x = -3 \\Rightarrow x = 3\\)' },
    { q:'\\(3 - 2x \\leq 7\\). Chuyển vế 3?', choices:['\\(-2x \\leq 7 + 3\\)','\\(-2x \\leq 7 - 3\\)','\\(2x \\leq 7 - 3\\)','\\(-2x \\geq 7 - 3\\)','\\(-2x \\leq 4\\)','\\(2x \\geq 3 - 7\\)'], ans:1, tip:'Chưa chia/nhân âm nên không đổi chiều', explain:'\\(-2x \\leq 4 \\Rightarrow x \\geq -2\\)' },
  ],
  'phan-so': [
    { q:'Nếu \\(\\dfrac{a}{b} = \\dfrac{c}{d}\\) thì?', choices:['\\(a+d = b+c\\)','\\(a \\cdot d = b \\cdot c\\)','\\(a-c = b-d\\)','\\(\\dfrac{a}{c} = \\dfrac{d}{b}\\)','\\(a+b = c+d\\)','\\(a \\cdot b = c \\cdot d\\)'], ans:1, tip:'Hai phân số bằng nhau → tích chéo bằng nhau', explain:'\\(ad = bc\\)' },
    { q:'\\(\\dfrac{x}{3} = \\dfrac{4}{6}\\). Tìm \\(x\\)?', choices:['\\(x=1\\)','\\(x=2\\)','\\(x=3\\)','\\(x=4\\)','\\(x=6\\)','\\(x=8\\)'], ans:1, tip:'Tích chéo: \\(6x = 12\\)', explain:'\\(6x = 12 \\Rightarrow x = 2\\)' },
    { q:'\\(\\dfrac{2}{x} = \\dfrac{5}{10}\\). Tìm \\(x\\)?', choices:['\\(x=1\\)','\\(x=4\\)','\\(x=5\\)','\\(x=25\\)','\\(x=2\\)','\\(x=10\\)'], ans:1, tip:'\\(5x = 20\\)', explain:'\\(2 \\times 10 = 5x \\Rightarrow x = 4\\)' },
    { q:'\\(\\dfrac{x}{5} = \\dfrac{3}{15}\\). Tìm \\(x\\)?', choices:['\\(x=5\\)','\\(x=1\\)','\\(x=3\\)','\\(x=9\\)','\\(x=15\\)','\\(x=45\\)'], ans:1, tip:'\\(\\frac{3}{15} = \\frac{1}{5}\\)', explain:'\\(15x = 15 \\Rightarrow x = 1\\)' },
  ],
  'quy-dong': [
    { q:'Quy đồng \\(\\dfrac{1}{3} + \\dfrac{1}{4}\\). Mẫu chung?', choices:['7','12','3','4','6','24'], ans:1, tip:'BCNN(3,4) = 12', explain:'\\(\\dfrac{4}{12} + \\dfrac{3}{12} = \\dfrac{7}{12}\\)' },
    { q:'Rút gọn \\(\\dfrac{x^2-1}{x-1}\\) với \\(x \\neq 1\\)?', choices:['\\(x-1\\)','\\(x+1\\)','\\(x^2+1\\)','\\(\\dfrac{1}{x+1}\\)','\\(x\\)','\\(2x\\)'], ans:1, tip:'\\(x^2-1 = (x-1)(x+1)\\)', explain:'Rút \\((x-1)\\) → \\(x+1\\)' },
    { q:'Tính \\(\\dfrac{2}{6x} + \\dfrac{3}{4x}\\).', choices:['\\(\\dfrac{5}{10x}\\)','\\(\\dfrac{5}{24x}\\)','\\(\\dfrac{13}{12x}\\)','\\(\\dfrac{7}{12x}\\)','\\(\\dfrac{1}{3x}\\)','\\(\\dfrac{5}{6x}\\)'], ans:2, tip:'BCNN(6x,4x) = 12x', explain:'\\(\\dfrac{4+9}{12x} = \\dfrac{13}{12x}\\)' },
  ],
  'mu': [
    { q:'\\(a^3 \\times a^4 = ?\\)', choices:['\\(a^{12}\\)','\\(a^7\\)','\\(a^{43}\\)','\\(2a^7\\)','\\(a\\)','\\(a^{34}\\)'], ans:1, tip:'Nhân cùng cơ số → cộng số mũ', explain:'\\(a^{3+4}=a^7\\)' },
    { q:'\\(a^5 \\div a^2 = ?\\)', choices:['\\(a^{10}\\)','\\(a^3\\)','\\(a^7\\)','\\(a^{2.5}\\)','\\(a^{52}\\)','\\(a^{-3}\\)'], ans:1, tip:'Chia cùng cơ số → trừ số mũ', explain:'\\(a^{5-2}=a^3\\)' },
    { q:'\\((a^2)^3 = ?\\)', choices:['\\(a^5\\)','\\(a^6\\)','\\(a^{23}\\)','\\(a^8\\)','\\(a^{5}\\)','\\(3a^2\\)'], ans:1, tip:'Lũy thừa của lũy thừa → nhân số mũ', explain:'\\(a^{2 \\times 3}=a^6\\)' },
    { q:'\\((2a)^3 = ?\\)', choices:['\\(2a^3\\)','\\(6a^3\\)','\\(8a^3\\)','\\(6a\\)','\\(4a^3\\)','\\(2^3+a^3\\)'], ans:2, tip:'\\((ab)^n = a^n b^n\\)', explain:'\\(2^3 a^3 = 8a^3\\)' },
  ],
  'can': [
    { q:'\\(3\\sqrt{2}\\) = ? (đưa 3 vào trong căn)', choices:['\\(\\sqrt{6}\\)','\\(\\sqrt{18}\\)','\\(\\sqrt{5}\\)','\\(3\\sqrt{4}\\)','\\(\\sqrt{11}\\)','\\(\\sqrt{9+2}\\)'], ans:1, tip:'\\(3=\\sqrt{9}\\) nên \\(3\\sqrt{2}=\\sqrt{9 \\cdot 2}\\)', explain:'\\(\\sqrt{18}\\)' },
    { q:'Rút gọn \\(\\sqrt{48}\\)?', choices:['\\(2\\sqrt{12}\\)','\\(4\\sqrt{3}\\)','\\(6\\sqrt{2}\\)','\\(3\\sqrt{4}\\)','\\(12\\sqrt{2}\\)','\\(8\\sqrt{3}\\)'], ans:1, tip:'48 = 16 × 3', explain:'\\(\\sqrt{16 \\cdot 3}=4\\sqrt{3}\\)' },
    { q:'Rút gọn \\(\\sqrt{75}\\)?', choices:['\\(3\\sqrt{5}\\)','\\(5\\sqrt{3}\\)','\\(5\\sqrt{5}\\)','\\(25\\sqrt{3}\\)','\\(15\\sqrt{2}\\)','\\(\\sqrt{25+50}\\)'], ans:1, tip:'75 = 25 × 3', explain:'\\(5\\sqrt{3}\\)' },
    { q:'\\(2\\sqrt{3}+5\\sqrt{3}=?\\)', choices:['\\(7\\sqrt{6}\\)','\\(7\\sqrt{3}\\)','\\(10\\sqrt{3}\\)','\\(7\\sqrt{9}\\)','\\(35\\sqrt{3}\\)','\\(\\sqrt{21}\\)'], ans:1, tip:'Cộng hệ số, giữ \\(\\sqrt{3}\\)', explain:'\\((2+5)\\sqrt{3}=7\\sqrt{3}\\)' },
    { q:'\\(\\sqrt{9a^2}\\) với \\(a \\geq 0\\)?', choices:['\\(9a\\)','\\(3a\\)','\\(3a^2\\)','\\(a\\sqrt{9}\\)','\\(3|a|\\)','\\(\\sqrt{3}a\\)'], ans:1, tip:'\\(\\sqrt{9}\\cdot\\sqrt{a^2}=3a\\)', explain:'\\(3a\\) vì \\(a\\geq 0\\)' },
  ],
};

function buildPrompt(subtype) {
  var d = {
    'fraction-eq':   'Phương trình có 2 phân số bằng nhau: \\frac{biểu thức với x hoặc y}{số} = \\frac{...}{...}. Hỏi tìm x hoặc y bằng bao nhiêu.',
    'fraction-ineq': 'Bất phương trình chứa phân số với x. Hỏi tập nghiệm hoặc khoảng giá trị. Ví dụ: \\frac{2x+1}{3} > \\frac{x-1}{2}.',
    'simplify':      'Rút gọn biểu thức phân số đại số hoặc quy đồng 2-3 phân số có x rồi rút gọn.',
    'min-max-sq':    'Cho biểu thức bậc 2 kiểu ax^2+bx+c. Hỏi chọn bước biến đổi ĐÚNG để hoàn phương (completing the square) tìm GTNN/GTLN. Đáp án sai hay gặp: sai dấu trong ngoặc, quên cộng bù, nhầm hệ số.',
    'min-max-am':    'Cho biểu thức tích hoặc căn tích với x (ví dụ: (1-x)(4-x)x hoặc \\sqrt{(1-x)(3+x)x}). Hỏi chọn cách biến đổi ĐÚNG để chuẩn bị áp dụng AM-GM. Đáp án sai: nhân sai hệ số, thiếu điều kiện bằng dấu.',
  };
  return 'Bạn là giáo viên toán lớp 9. Tạo 1 câu hỏi trắc nghiệm:\n\nDẠNG: ' + d[subtype] + '\n\nYÊU CẦU:\n- Đúng 6 đáp án (A-F), chỉ 1 đúng.\n- KHÔNG dùng "Cả A và B", "Tất cả đều sai".\n- Phân số PHẢI dùng \\frac{}{} (KHÔNG dùng a/b).\n- Đáp án sai phải trông hợp lý.\n- Thêm tip ngắn và explain.\n\nTRẢ LỜI CHỈ JSON (không backtick):\n{"q":"...","choices":["A","B","C","D","E","F"],"ans":0,"tip":"...","explain":"..."}';
}

function callAPI(subtype, cb) {
  var body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: buildPrompt(subtype) }]
  });

  // Thử trực tiếp trước (nếu chạy local hoặc có CORS headers)
  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: body
  })
  .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
  .then(function(data) { parseAndReturn(data, cb); })
  .catch(function(e) {
    // Fallback: allorigins proxy
    var proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://api.anthropic.com/v1/messages');
    fetch(proxy, { method:'POST', headers:{'Content-Type':'application/json'}, body: body })
    .then(function(r) { if (!r.ok) throw new Error('Proxy HTTP '+r.status); return r.json(); })
    .then(function(data) { parseAndReturn(data, cb); })
    .catch(function(e2) { cb(e2, null); });
  });
}

function parseAndReturn(data, cb) {
  try {
    var text = (data.content||[]).map(function(c){return c.text||'';}).join('').trim();
    var clean = text.replace(/^```json\s*/i,'').replace(/```$/i,'').trim();
    var q = JSON.parse(clean);
    if (!q.q || !Array.isArray(q.choices) || typeof q.ans !== 'number') throw new Error('Format lỗi');
    while (q.choices.length < 6) q.choices.push('(Phương án '+(q.choices.length+1)+')');
    cb(null, q);
  } catch(e) { cb(e, null); }
}

function typesetMath() {
  var area = document.getElementById('lt-area');
  if (!area) return;
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([area]).catch(function(){});
  } else { setTimeout(typesetMath, 400); }
}

function renderTabs() {
  document.getElementById('lt-tabs').innerHTML = TOPICS.map(function(t){
    return '<button class="lt-tab'+(t.ai?' ai-tab':'')+(t.id===currentTopic?' active':'')+'" onclick="switchTopic(\''+t.id+'\')">'+t.label+'</button>';
  }).join('');
}

function renderSubtypes() {
  var row = document.getElementById('lt-subtype-row');
  if (currentTopic !== 'tinh-toan') { row.style.display='none'; return; }
  row.style.display='flex';
  row.innerHTML = SUBTYPES.map(function(s){
    return '<button class="lt-subtype'+(s.id===currentSubtype?' active':'')+'" onclick="switchSubtype(\''+s.id+'\')">'+s.label+'</button>';
  }).join('');
}

function renderScore() {
  var ok = history.filter(Boolean).length;
  document.getElementById('score-text').textContent = ok+' / '+history.length;
  document.getElementById('dots').innerHTML = history.slice(-12).map(function(x){
    return '<div class="lt-dot '+(x?'ok':'err')+'"></div>';
  }).join('');
}

function renderQ() {
  if (currentTopic === 'tinh-toan') {
    if (aiCache.length === 0) { window.generateAIQuestion(false); return; }
    renderBox(aiCache[qIdx % aiCache.length], true);
  } else {
    var arr = STATIC_QS[currentTopic];
    renderBox(arr[qIdx % arr.length], false);
  }
}

function renderBox(q, isAI) {
  var labels = ['A','B','C','D','E','F'];
  var area = document.getElementById('lt-area');
  var badge = isAI ? (currentSubtype==='min-max-am'?'AM-GM':currentSubtype==='min-max-sq'?'Min/Max':'Tính toán') : '';
  var bclass = badge==='AM-GM'?'badge-amgm':badge==='Min/Max'?'badge-max':'badge-ai';
  var opts = q.choices.map(function(c,i){
    return '<button class="lt-option" id="opt-'+i+'" onclick="window.choose('+i+')"><span class="opt-lbl">'+labels[i]+'.</span><span>'+c+'</span></button>';
  }).join('');
  area.innerHTML =
    '<div class="lt-box">'+
    '<div class="lt-box-label">Câu '+(qIdx+1)+
    (badge?' <span class="lt-badge '+bclass+'">'+badge+'</span>':'')+
    (isAI?' <span style="font-size:.72rem;color:var(--accent2);margin-left:auto"><i class="fas fa-robot"></i> AI sinh</span>':'')+
    '</div>'+
    '<div class="lt-problem">'+q.q+'</div>'+
    (q.tip?'<div class="lt-tip"><i class="fas fa-lightbulb" style="color:var(--accent);margin-right:6px"></i>'+q.tip+'</div>':'')+
    '<div class="lt-options">'+opts+'</div>'+
    '<div id="lt-feedback"></div>'+
    '<button class="lt-btn-next" id="lt-btn-next" style="display:none" onclick="window.nextQ()"><i class="fas fa-arrow-right"></i> Câu tiếp theo</button>'+
    '</div>'+
    (isAI?'<button class="lt-gen-btn" onclick="window.regenQ()"><i class="fas fa-sync-alt"></i> Sinh câu mới</button>':'');
  area.dataset.ans = q.ans;
  area.dataset.explain = q.explain||'';
  typesetMath();
}

window.choose = function(idx) {
  if (selected !== null) return;
  selected = idx;
  var area = document.getElementById('lt-area');
  var ans = parseInt(area.dataset.ans);
  var explain = area.dataset.explain||'';
  var ok = idx === ans;
  history.push(ok);
  renderScore();
  document.querySelectorAll('.lt-option').forEach(function(b,i){
    b.disabled = true;
    if (i===ans) b.classList.add('correct');
    else if (i===idx && !ok) b.classList.add('wrong');
  });
  document.getElementById('lt-feedback').innerHTML =
    '<div class="lt-feedback '+(ok?'correct':'wrong')+'">'+
    (ok?'<i class="fas fa-check-circle"></i> Đúng rồi! ':'<i class="fas fa-times-circle"></i> Chưa đúng. ')+
    explain+'</div>';
  document.getElementById('lt-btn-next').style.display='block';
  typesetMath();
};

window.nextQ = function() { qIdx++; selected=null; renderQ(); };
window.regenQ = function() { window.generateAIQuestion(true); };
window.switchTopic = function(id) { currentTopic=id; qIdx=0; selected=null; aiCache=[]; renderTabs(); renderSubtypes(); renderQ(); };
window.switchSubtype = function(id) { currentSubtype=id; qIdx=0; selected=null; aiCache=[]; renderSubtypes(); renderQ(); };

window.generateAIQuestion = function(replace) {
  if (aiLoading) return;
  aiLoading = true;
  var area = document.getElementById('lt-area');
  area.innerHTML = '<div class="lt-box"><div class="lt-loading"><div class="lt-spinner"></div>AI đang sinh câu hỏi...</div></div>';
  callAPI(currentSubtype, function(err, q) {
    aiLoading = false;
    if (err) {
      area.innerHTML =
        '<div class="lt-box"><div class="lt-err"><i class="fas fa-exclamation-triangle"></i> Không thể sinh câu hỏi: '+err.message+'</div>'+
        '<br><button class="lt-gen-btn" onclick="window.generateAIQuestion(true)"><i class="fas fa-redo"></i> Thử lại</button></div>';
      return;
    }
    if (replace || aiCache.length===0) { aiCache=[q]; qIdx=0; }
    else aiCache.push(q);
    selected=null;
    renderQ();
  });
};

function init() {
  Object.keys(STATIC_QS).forEach(function(k){ STATIC_QS[k].sort(function(){return Math.random()-.5;}); });
  renderTabs(); renderSubtypes(); renderScore(); renderQ();
}

if (document.readyState==='loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
