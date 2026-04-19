// ===== LUYEN TOAN JS =====
// Requires: MathJax (loaded in HTML), Anthropic API via fetch

// ---- STATE ----
let currentTopic = 'chuyen-ve';
let currentSubtype = 'fraction-eq';
let queue = [];
let qIdx = 0;
let selected = null;
let history = [];
let aiCache = []; // cache AI questions to avoid re-generating
let aiLoading = false;

// ---- TOPICS ----
const TOPICS = [
  { id: 'chuyen-ve', label: 'Chuyển vế đổi dấu' },
  { id: 'phan-so',   label: 'Tỉ lệ phân số' },
  { id: 'quy-dong',  label: 'Quy đồng' },
  { id: 'mu',        label: 'Biểu thức mũ' },
  { id: 'can',       label: 'Hệ số trong căn' },
  { id: 'tinh-toan', label: '✦ Tính toán AI', ai: true },
];

const SUBTYPES = [
  { id: 'fraction-eq',   label: 'Phân số = Phân số' },
  { id: 'fraction-ineq', label: 'Bất phương trình phân số' },
  { id: 'simplify',      label: 'Rút gọn / Quy đồng' },
  { id: 'min-max-sq',    label: 'Min/Max (hoàn phương)' },
  { id: 'min-max-am',    label: 'Min/Max (AM-GM)' },
];

// ---- STATIC QUESTIONS (non-AI tabs) ----
const STATIC_QS = {
  'chuyen-ve': [
    {
      q: 'Từ phương trình \\(3x + 5 = 14\\), chuyển vế 5 sang vế phải?',
      choices: ['\\(3x = 14 + 5\\)','\\(3x = 14 - 5\\)','\\(3x = 14 \\times 5\\)','\\(3x = 5 - 14\\)','\\(x = (14-5)/3\\)','\\(-3x = 5 - 14\\)'],
      ans: 1, tip: 'Chuyển vế thì đổi dấu: +5 → −5', explain: '\\(3x + 5 = 14 \\Rightarrow 3x = 14 - 5 = 9\\)'
    },
    {
      q: 'Từ \\(2x - 7 = 3\\), chuyển −7 sang vế phải?',
      choices: ['\\(2x = 3 - 7\\)','\\(2x = 3 + 7\\)','\\(2x = 7 + 3\\)','\\(2x = -3 - 7\\)','\\(x = 3 + 7\\)','\\(-2x = 7 - 3\\)'],
      ans: 1, tip: 'Chuyển −7 → +7 khi sang vế phải', explain: '\\(2x - 7 = 3 \\Rightarrow 2x = 3 + 7 = 10\\)'
    },
    {
      q: '\\(-4x > 12\\). Chia hai vế cho −4 thì?',
      choices: ['\\(x > -3\\)','\\(x < -3\\)','\\(x > 3\\)','\\(x < 3\\)','\\(x = -3\\)','\\(x \\geq -3\\)'],
      ans: 1, tip: 'Chia/nhân BPT cho số âm → đổi chiều dấu!', explain: '\\(-4x > 12 \\Rightarrow x < -3\\)'
    },
    {
      q: '\\(5 - x = 2\\). Chuyển 5 sang vế phải?',
      choices: ['\\(-x = 2 + 5\\)','\\(-x = 2 - 5\\)','\\(x = 2 - 5\\)','\\(-x = 5 - 2\\)','\\(x = 5 - 2\\)','\\(-x = -2 + 5\\)'],
      ans: 1, tip: '+5 ở trái → −5 ở phải', explain: '\\(5 - x = 2 \\Rightarrow -x = -3 \\Rightarrow x = 3\\)'
    },
    {
      q: '\\(3 - 2x \\leq 7\\). Chuyển vế 3?',
      choices: ['\\(-2x \\leq 7 + 3\\)','\\(-2x \\leq 7 - 3\\)','\\(2x \\leq 7 - 3\\)','\\(-2x \\geq 7 - 3\\)','\\(-2x \\leq 4\\)','\\(2x \\geq 3 - 7\\)'],
      ans: 1, tip: 'Chuyển +3 sang phải → −3. Không đổi chiều vì chưa chia/nhân số âm.', explain: '\\(3 - 2x \\leq 7 \\Rightarrow -2x \\leq 4 \\Rightarrow x \\geq -2\\)'
    },
  ],
  'phan-so': [
    {
      q: 'Nếu \\(\\dfrac{a}{b} = \\dfrac{c}{d}\\) thì tích chéo nào đúng?',
      choices: ['\\(a + d = b + c\\)','\\(a \\cdot d = b \\cdot c\\)','\\(a - c = b - d\\)','\\(\\dfrac{a}{c} = \\dfrac{d}{b}\\)','\\(a + b = c + d\\)','\\(a \\cdot b = c \\cdot d\\)'],
      ans: 1, tip: 'Hai phân số bằng nhau → tích chéo bằng nhau', explain: '\\(\\dfrac{a}{b} = \\dfrac{c}{d} \\Leftrightarrow a \\cdot d = b \\cdot c\\)'
    },
    {
      q: 'Cho \\(\\dfrac{x}{3} = \\dfrac{4}{6}\\). Tìm \\(x\\)?',
      choices: ['\\(x = 1\\)','\\(x = 2\\)','\\(x = 3\\)','\\(x = 4\\)','\\(x = 6\\)','\\(x = 8\\)'],
      ans: 1, tip: 'Tích chéo: \\(6x = 12\\)', explain: '\\(6x = 3 \\cdot 4 = 12 \\Rightarrow x = 2\\)'
    },
    {
      q: '\\(\\dfrac{2}{x} = \\dfrac{5}{10}\\). Tìm \\(x\\)?',
      choices: ['\\(x = 1\\)','\\(x = 4\\)','\\(x = 5\\)','\\(x = 25\\)','\\(x = 2\\)','\\(x = 10\\)'],
      ans: 1, tip: 'Tích chéo: \\(2 \\cdot 10 = 5x\\)', explain: '\\(5x = 20 \\Rightarrow x = 4\\)'
    },
    {
      q: 'Cho \\(\\dfrac{x}{5} = \\dfrac{3}{15}\\). Tìm \\(x\\)?',
      choices: ['\\(x = 5\\)','\\(x = 1\\)','\\(x = 3\\)','\\(x = 9\\)','\\(x = 15\\)','\\(x = 45\\)'],
      ans: 1, tip: 'Rút gọn \\(\\frac{3}{15} = \\frac{1}{5}\\) hoặc dùng tích chéo', explain: '\\(15x = 15 \\Rightarrow x = 1\\)'
    },
  ],
  'quy-dong': [
    {
      q: 'Quy đồng \\(\\dfrac{1}{3} + \\dfrac{1}{4}\\). Mẫu chung là?',
      choices: ['7','12','3','4','6','24'],
      ans: 1, tip: 'BCNN(3, 4) = 12', explain: '\\(\\dfrac{1}{3} + \\dfrac{1}{4} = \\dfrac{4}{12} + \\dfrac{3}{12} = \\dfrac{7}{12}\\)'
    },
    {
      q: 'Rút gọn \\(\\dfrac{x^2 - 1}{x - 1}\\) (với \\(x \\neq 1\\))?',
      choices: ['\\(x - 1\\)','\\(x + 1\\)','\\(x^2 + 1\\)','\\(\\dfrac{1}{x+1}\\)','\\(x\\)','\\(2x\\)'],
      ans: 1, tip: '\\(x^2 - 1 = (x-1)(x+1)\\)', explain: '\\(\\dfrac{(x-1)(x+1)}{x-1} = x+1\\)'
    },
    {
      q: 'Tính \\(\\dfrac{2}{6x} + \\dfrac{3}{4x}\\).',
      choices: ['\\(\\dfrac{5}{10x}\\)','\\(\\dfrac{5}{24x}\\)','\\(\\dfrac{13}{12x}\\)','\\(\\dfrac{7}{12x}\\)','\\(\\dfrac{1}{3x} + \\dfrac{3}{4x}\\)','\\(\\dfrac{5}{6x}\\)'],
      ans: 2, tip: 'BCNN(6x, 4x) = 12x → quy đồng từng phân số', explain: '\\(\\dfrac{4}{12x} + \\dfrac{9}{12x} = \\dfrac{13}{12x}\\)'
    },
  ],
  'mu': [
    {
      q: '\\(a^3 \\times a^4 = ?\\)',
      choices: ['\\(a^{12}\\)','\\(a^7\\)','\\(a^{43}\\)','\\(2a^7\\)','\\(a^1\\)','\\(a^{34}\\)'],
      ans: 1, tip: 'Nhân cùng cơ số → cộng số mũ', explain: '\\(a^3 \\times a^4 = a^{3+4} = a^7\\)'
    },
    {
      q: '\\(a^5 \\div a^2 = ?\\)',
      choices: ['\\(a^{10}\\)','\\(a^3\\)','\\(a^7\\)','\\(a^{2.5}\\)','\\(a^{52}\\)','\\(a^{-3}\\)'],
      ans: 1, tip: 'Chia cùng cơ số → trừ số mũ', explain: '\\(a^5 \\div a^2 = a^{5-2} = a^3\\)'
    },
    {
      q: '\\((a^2)^3 = ?\\)',
      choices: ['\\(a^5\\)','\\(a^6\\)','\\(a^{23}\\)','\\(a^8\\)','\\(a^{2+3}\\)','\\(3a^2\\)'],
      ans: 1, tip: 'Lũy thừa của lũy thừa → nhân số mũ', explain: '\\((a^2)^3 = a^{2 \\times 3} = a^6\\)'
    },
    {
      q: '\\((2a)^3 = ?\\)',
      choices: ['\\(2a^3\\)','\\(6a^3\\)','\\(8a^3\\)','\\(2a^3 \\cdot 3\\)','\\(4a^3\\)','\\(2^3 + a^3\\)'],
      ans: 2, tip: '\\((ab)^n = a^n b^n\\)', explain: '\\((2a)^3 = 2^3 \\cdot a^3 = 8a^3\\)'
    },
  ],
  'can': [
    {
      q: 'Đưa 3 vào trong căn: \\(3\\sqrt{2} = ?\\)',
      choices: ['\\(\\sqrt{3 \\cdot 2}\\)','\\(\\sqrt{9 \\cdot 2}\\)','\\(\\sqrt{3+2}\\)','\\(\\sqrt{6}\\)','\\(3\\sqrt{4}\\)','\\(\\sqrt{3^2+2}\\)'],
      ans: 1, tip: '\\(3 = \\sqrt{9} = \\sqrt{3^2}\\) nên \\(3\\sqrt{2} = \\sqrt{9 \\cdot 2}\\)', explain: '\\(3\\sqrt{2} = \\sqrt{3^2 \\cdot 2} = \\sqrt{18}\\)'
    },
    {
      q: 'Rút gọn \\(\\sqrt{48}\\)?',
      choices: ['\\(2\\sqrt{12}\\)','\\(4\\sqrt{3}\\)','\\(6\\sqrt{2}\\)','\\(3\\sqrt{4}\\)','\\(12\\sqrt{2}\\)','\\(8\\sqrt{3}\\)'],
      ans: 1, tip: '48 = 16 × 3 = 4² × 3', explain: '\\(\\sqrt{48} = \\sqrt{16 \\cdot 3} = 4\\sqrt{3}\\)'
    },
    {
      q: 'Rút gọn \\(\\sqrt{75}\\)?',
      choices: ['\\(3\\sqrt{5}\\)','\\(5\\sqrt{3}\\)','\\(5\\sqrt{5}\\)','\\(25\\sqrt{3}\\)','\\(15\\sqrt{2}\\)','\\(\\sqrt{25} \\cdot \\sqrt{50}\\)'],
      ans: 1, tip: '75 = 25 × 3 = 5² × 3', explain: '\\(\\sqrt{75} = 5\\sqrt{3}\\)'
    },
    {
      q: '\\(2\\sqrt{3} + 5\\sqrt{3} = ?\\)',
      choices: ['\\(7\\sqrt{6}\\)','\\(7\\sqrt{3}\\)','\\(10\\sqrt{3}\\)','\\(7\\sqrt{9}\\)','\\(10\\sqrt{9}\\)','\\(35\\sqrt{3}\\)'],
      ans: 1, tip: 'Cộng căn đồng dạng: cộng hệ số, giữ nguyên \\(\\sqrt{3}\\)', explain: '\\((2+5)\\sqrt{3} = 7\\sqrt{3}\\)'
    },
    {
      q: '\\(\\sqrt{9a^2}\\) với \\(a \\geq 0\\)?',
      choices: ['\\(9a\\)','\\(3a\\)','\\(3a^2\\)','\\(a\\sqrt{9}\\)','\\(3|a|\\)','\\(\\sqrt{3} \\cdot a\\)'],
      ans: 1, tip: '\\(\\sqrt{9a^2} = \\sqrt{9} \\cdot \\sqrt{a^2} = 3 \\cdot a\\) (vì \\(a \\geq 0\\))', explain: '\\(\\sqrt{9a^2} = 3a\\)'
    },
  ],
};

// ---- AI PROMPT BUILDER ----
function buildAIPrompt(subtype) {
  const subtypeDesc = {
    'fraction-eq': `Dạng bài: Cho phương trình có 2 phân số bằng nhau dạng frac{biểu thức có x hoặc x,y}{biểu thức} = frac{...}{...}. Hỏi tìm x (hoặc y) bằng bao nhiêu. Ví dụ: frac{x}{y+1} = frac{y}{4}, tìm y nếu x=2. Hoặc: frac{2x-1}{3} = frac{x+2}{5}, tìm x.`,
    'fraction-ineq': `Dạng bài: Bất phương trình chứa phân số với x (hoặc x,y). Ví dụ: frac{2x+1}{3} > frac{x-1}{2}. Hỏi tập nghiệm hoặc khoảng giá trị của x. Hoặc: frac{x+1}{x-2} < 0 hỏi x thuộc khoảng nào.`,
    'simplify': `Dạng bài: Rút gọn hoặc tính giá trị biểu thức chứa phân số và x. Ví dụ: rút gọn frac{x^2-4}{x-2}, hoặc tính frac{1}{x-1} + frac{1}{x+1}. Có thể yêu cầu quy đồng 2-3 phân số.`,
    'min-max-sq': `Dạng bài: Biến đổi biểu thức bậc 2 để tìm GTNN hoặc GTLN bằng phương pháp hoàn phương (completing the square). Ví dụ: f(x) = -3(x^2 - 2x) + 1000. Yêu cầu: Chọn bước biến đổi ĐÚNG để áp dụng hoàn phương. Các đáp án là các cách biến đổi khác nhau (hầu hết sai). Đáp án đúng phải là bước hoàn phương chính xác như: -3(x^2 - 2x + 1 - 1) + 1000 = -3(x-1)^2 + 3 + 1000.`,
    'min-max-am': `Dạng bài: Biến đổi biểu thức để áp dụng BĐT AM-GM tìm GTNN hoặc GTLN. Ví dụ: tìm GTLN của (1-x)(4-x)·x hoặc sqrt{(1-x)(3+x)·x}. Các đáp án là các cách biến đổi (nhân/chia hệ số, tách thành tích để áp dụng AM-GM). Đáp án đúng là cách biến đổi hợp lệ giúp áp dụng AM-GM được.`,
  };

  return `Bạn là giáo viên toán lớp 9 Việt Nam. Tạo 1 câu hỏi trắc nghiệm toán CHẤT LƯỢNG CAO theo dạng sau:

DẠNG BÀI: ${subtypeDesc[subtype]}

YÊU CẦU BẮT BUỘC:
1. Câu hỏi xoay quanh biến x hoặc x, y. Biểu thức phải cụ thể, có số thực.
2. Phải có ĐÚNG 6 đáp án (A, B, C, D, E, F). Chỉ 1 đáp án đúng.
3. TUYỆT ĐỐI KHÔNG dùng đáp án kiểu: "Cả A và B đúng", "Tất cả đều sai", "Không có đáp án nào".
4. Các đáp án sai phải trông hợp lý (mắc lỗi phổ biến: sai dấu, sai bước, nhầm công thức).
5. Dùng LaTeX cho tất cả biểu thức toán. Phân số PHẢI dùng \\frac{tử}{mẫu} (KHÔNG dùng a/b).
6. Thêm 1 gợi ý ngắn (tip) giúp học sinh nhận ra hướng giải.
7. Thêm giải thích đáp án đúng (explain) ngắn gọn.

TRẢ LỜI CHỈ JSON (không có markdown, không có backtick), đúng format:
{
  "q": "Câu hỏi bằng LaTeX",
  "choices": ["đáp án A", "đáp án B", "đáp án C", "đáp án D", "đáp án E", "đáp án F"],
  "ans": <index 0-5 của đáp án đúng>,
  "tip": "gợi ý ngắn",
  "explain": "giải thích đáp án đúng",
  "badge": "${subtype === 'min-max-am' ? 'AM-GM' : subtype === 'min-max-sq' ? 'Min/Max' : 'Tính toán'}"
}`;
}

// ---- FETCH AI QUESTION ----
async function fetchAIQuestion(subtype) {
  const prompt = buildAIPrompt(subtype);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!response.ok) throw new Error('API error ' + response.status);
  const data = await response.json();
  const text = data.content.map(c => c.text || '').join('').trim();
  // Strip possible markdown fences
  const clean = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(clean);
}

// ---- RENDER ----
function renderTabs() {
  document.getElementById('lt-tabs').innerHTML = TOPICS.map(t =>
    `<button class="lt-tab${t.ai ? ' ai-tab' : ''}${t.id === currentTopic ? ' active' : ''}" onclick="switchTopic('${t.id}')">${t.label}</button>`
  ).join('');
}

function renderSubtypes() {
  const row = document.getElementById('lt-subtype-row');
  if (currentTopic !== 'tinh-toan') { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  row.innerHTML = SUBTYPES.map(s =>
    `<button class="lt-subtype${s.id === currentSubtype ? ' active' : ''}" onclick="switchSubtype('${s.id}')">${s.label}</button>`
  ).join('');
}

function renderScore() {
  const correct = history.filter(Boolean).length;
  document.getElementById('score-text').textContent = `${correct} / ${history.length}`;
  document.getElementById('dots').innerHTML = history.slice(-12).map(ok =>
    `<div class="lt-dot ${ok ? 'ok' : 'err'}"></div>`
  ).join('');
}

async function renderQ() {
  const area = document.getElementById('lt-area');

  if (currentTopic === 'tinh-toan') {
    // AI mode
    if (aiCache.length === 0) {
      await generateAIQuestion();
      return;
    }
    const q = aiCache[qIdx % aiCache.length];
    renderQBox(area, q, true);
  } else {
    const qs = STATIC_QS[currentTopic];
    const q = qs[qIdx % qs.length];
    renderQBox(area, q, false);
  }
}

function renderQBox(area, q, isAI) {
  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
  const badge = q.badge || (isAI ? 'AI' : '');
  const badgeClass = badge === 'AM-GM' ? 'badge-amgm' : badge === 'Min/Max' ? 'badge-max' : badge === 'AI' ? 'badge-ai' : 'badge-ai';

  area.innerHTML = `
    <div class="lt-box">
      <div class="lt-box-label">
        Câu ${qIdx + 1}
        ${badge ? `<span class="lt-badge ${badgeClass}">${badge}</span>` : ''}
        ${isAI ? `<span style="font-size:.72rem;color:var(--accent2);margin-left:auto"><i class="fas fa-robot"></i> AI</span>` : ''}
      </div>
      <div class="lt-problem" id="lt-problem">${q.q}</div>
      ${q.tip ? `<div class="lt-tip"><i class="fas fa-lightbulb" style="color:var(--accent);margin-right:6px"></i>${q.tip}</div>` : ''}
      <div class="lt-options" id="lt-opts">
        ${q.choices.map((c, i) => `
          <button class="lt-option" id="opt-${i}" onclick="choose(${i})">
            <span class="opt-lbl">${labels[i]}.</span>
            <span id="opt-text-${i}">${c}</span>
          </button>`).join('')}
      </div>
      <div id="lt-feedback"></div>
      <button class="lt-btn-next" id="lt-btn-next" style="display:none" onclick="nextQ()">
        <i class="fas fa-arrow-right"></i> Câu tiếp theo
      </button>
    </div>
    ${isAI ? `<button class="lt-gen-btn" id="lt-regen-btn" onclick="regenQ()">
      <i class="fas fa-sync-alt"></i> Sinh câu mới
    </button>` : ''}
  `;

  // Store answer index on area for choose()
  area.dataset.ans = q.ans;
  area.dataset.explain = q.explain || '';

  typesetMath();
}

function typesetMath() {
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([document.getElementById('lt-area')]).catch(console.warn);
  }
}

// ---- INTERACTION ----
window.choose = function(idx) {
  if (selected !== null) return;
  selected = idx;
  const area = document.getElementById('lt-area');
  const ans = parseInt(area.dataset.ans);
  const explain = area.dataset.explain;
  const correct = idx === ans;
  history.push(correct);
  renderScore();

  document.querySelectorAll('.lt-option').forEach((btn, i) => {
    btn.disabled = true;
    if (i === ans) btn.classList.add('correct');
    else if (i === idx && !correct) btn.classList.add('wrong');
  });

  document.getElementById('lt-feedback').innerHTML = `
    <div class="lt-feedback ${correct ? 'correct' : 'wrong'}">
      ${correct ? '<i class="fas fa-check-circle"></i> Đúng rồi! ' : '<i class="fas fa-times-circle"></i> Chưa đúng. '}
      <span id="fb-explain">${explain}</span>
    </div>`;

  document.getElementById('lt-btn-next').style.display = 'block';
  typesetMath();
};

window.nextQ = function() {
  qIdx++;
  selected = null;
  renderQ();
};

window.regenQ = async function() {
  const btn = document.getElementById('lt-regen-btn');
  if (btn) btn.disabled = true;
  await generateAIQuestion(true);
};

// ---- NAVIGATION ----
window.switchTopic = function(id) {
  currentTopic = id;
  queue = [];
  qIdx = 0;
  selected = null;
  aiCache = [];
  renderTabs();
  renderSubtypes();
  renderQ();
};

window.switchSubtype = function(id) {
  currentSubtype = id;
  qIdx = 0;
  selected = null;
  aiCache = [];
  renderSubtypes();
  renderQ();
};

// ---- AI GENERATION ----
async function generateAIQuestion(replace = false) {
  if (aiLoading) return;
  aiLoading = true;
  const area = document.getElementById('lt-area');

  area.innerHTML = `
    <div class="lt-box">
      <div class="lt-loading">
        <div class="lt-spinner"></div>
        AI đang sinh câu hỏi... vui lòng chờ
      </div>
    </div>`;

  try {
    const q = await fetchAIQuestion(currentSubtype);
    // Validate
    if (!q.q || !Array.isArray(q.choices) || q.choices.length < 4 || typeof q.ans !== 'number') {
      throw new Error('Invalid response format');
    }
    // Ensure 6 choices
    while (q.choices.length < 6) q.choices.push(`Không có phương án này (${q.choices.length + 1})`);

    if (replace || aiCache.length === 0) {
      aiCache = [q];
      qIdx = 0;
    } else {
      aiCache.push(q);
    }
    selected = null;
    renderQ();
  } catch (e) {
    area.innerHTML = `
      <div class="lt-box">
        <div class="lt-err">
          <i class="fas fa-exclamation-triangle"></i> Không thể sinh câu hỏi: ${e.message}
        </div>
        <br>
        <button class="lt-gen-btn" onclick="generateAIQuestion(true)">
          <i class="fas fa-redo"></i> Thử lại
        </button>
      </div>`;
  } finally {
    aiLoading = false;
  }
}

// ---- TOAST ----
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

// ---- INIT ----
function init() {
  renderTabs();
  renderSubtypes();
  renderScore();

  // Shuffle static queues
  Object.keys(STATIC_QS).forEach(k => {
    STATIC_QS[k] = STATIC_QS[k].sort(() => Math.random() - .5);
  });

  renderQ();
}

// Wait for MathJax to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
