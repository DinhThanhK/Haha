// =====================================================================
// subjects.js — Cấu hình NHÃN MÔN HỌC cho từng bộ đề
// ---------------------------------------------------------------------
// File này tách riêng để dễ THÊM / SỬA / XÓA nhãn mà không cần đụng vào
// quizzes.js (vì file đó đã quá dài).
//
// ➜ Muốn thêm môn mới: thêm 1 object vào mảng SUBJECTS bên dưới.
// ➜ Muốn sửa tên/icon/màu: sửa trực tiếp trong object tương ứng.
// ➜ Muốn xóa môn: xóa object đó khỏi mảng (các bộ đề cũ đang dùng nhãn
//   bị xóa sẽ tự rơi về nhãn mặc định DEFAULT_SUBJECT khi hiển thị).
//
// "icon"  : tên class FontAwesome (không cần viết "fas", chỉ phần "fa-...")
// "color" : màu chữ/icon (hex)
// "bg"    : màu nền mờ (rgba) đi kèm cho đẹp
// =====================================================================

export const SUBJECTS = [
  { key:'toan',  label:'Toán',  icon:'fa-square-root-alt', color:'#818cf8', bg:'rgba(99,102,241,.16)'  },
  { key:'ly',    label:'Lý',    icon:'fa-atom',             color:'#60a5fa', bg:'rgba(59,130,246,.16)'  },
  { key:'hoa',   label:'Hóa',   icon:'fa-flask',            color:'#34d399', bg:'rgba(16,185,129,.16)'  },
  { key:'anh',   label:'Anh',   icon:'fa-language',         color:'#fbbf24', bg:'rgba(245,158,11,.16)'  },
  { key:'sinh',  label:'Sinh',  icon:'fa-leaf',             color:'#4ade80', bg:'rgba(34,197,94,.16)'   },
  { key:'tin',   label:'Tin',   icon:'fa-laptop-code',      color:'#22d3ee', bg:'rgba(6,182,212,.16)'   },
  { key:'unity', label:'Unity', icon:'fa-cube',             color:'#a78bfa', bg:'rgba(139,92,246,.16)'  },
  { key:'khac',  label:'Khác',  icon:'fa-shapes',           color:'#94a3b8', bg:'rgba(100,116,139,.16)' },

  // ➜ Thêm nhãn mới ở đây, ví dụ:
  // { key:'su', label:'Sử', icon:'fa-landmark', color:'#d97706', bg:'rgba(217,119,6,.16)' },
];

// Nhãn mặc định khi tạo bộ đề mới / khi bộ đề cũ chưa có nhãn
export const DEFAULT_SUBJECT = 'khac';

// Lấy thông tin 1 nhãn theo key (rơi về nhãn mặc định nếu không tìm thấy
// — ví dụ nhãn đã bị xóa khỏi danh sách SUBJECTS)
export function getSubjectInfo(key) {
  return SUBJECTS.find(s => s.key === key) || SUBJECTS.find(s => s.key === DEFAULT_SUBJECT);
}

// Vẽ danh sách "pill" chọn môn học vào 1 container (dùng trong form thêm/sửa bộ đề)
export function renderSubjectPills(containerId, selectedKey) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const sel = selectedKey || DEFAULT_SUBJECT;
  wrap.innerHTML = SUBJECTS.map(s => `
    <div class="subject-pill${s.key === sel ? ' selected' : ''}" data-subject="${s.key}"
         style="--subj-color:${s.color};--subj-bg:${s.bg}"
         onclick="window.__selectSubjectPill('${containerId}','${s.key}',this)">
      <i class="fas ${s.icon}"></i> ${s.label}
    </div>`).join('');
}

// Đọc nhãn đang được chọn trong 1 container pill
export function getSelectedSubject(containerId) {
  const sel = document.querySelector(`#${containerId} .subject-pill.selected`);
  return sel ? sel.dataset.subject : DEFAULT_SUBJECT;
}

// Trả về HTML cho 1 tag nhỏ hiển thị trên thẻ bộ đề (quiz card)
export function subjectTagHtml(key) {
  const s = getSubjectInfo(key);
  return `<span class="quiz-card-tag subject-tag" style="--subj-color:${s.color};--subj-bg:${s.bg}"><i class="fas ${s.icon}"></i>${s.label}</span>`;
}

// Handler click cho pill — gắn vào window vì HTML pill dùng onclick inline
window.__selectSubjectPill = function (containerId, key, el) {
  document.querySelectorAll(`#${containerId} .subject-pill`).forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
};