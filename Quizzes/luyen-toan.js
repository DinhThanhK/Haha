// ===== LUYEN TOAN JS v2 =====

// ===== CONFIG TOPICS =====
var TOPICS_EASY = [
  { id: 'chuyen-ve',  label: 'Chuyển vế' },
  { id: 'phan-so',    label: 'Tỉ lệ phân số' },
  { id: 'quy-dong',   label: 'Quy đồng / Rút gọn' },
  { id: 'mu',         label: 'Biểu thức mũ' },
  { id: 'can',        label: 'Căn thức' },
];
var TOPICS_HARD = [
  { id: 'he-phuong-trinh', label: 'Hệ phương trình' },
  { id: 'min-max-sq',      label: 'Min/Max hoàn phương' },
  { id: 'am-gm',           label: 'Min/Max AM-GM' },
];
var ALL_TOPICS = TOPICS_EASY.concat(TOPICS_HARD);

var TOPIC_LABEL = {};
ALL_TOPICS.forEach(function(t){ TOPIC_LABEL[t.id] = t.label; });

// ===== TIMER CONFIG =====
var TIMER_KEY = 'lt_timer_cfg';
var timerCfg = { easy: 120, hard: 300 }; // seconds
function loadTimerCfg() {
  try { var r = localStorage.getItem(TIMER_KEY); if(r) timerCfg = JSON.parse(r); } catch(e){}
}
function saveTimerCfg() {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(timerCfg)); } catch(e){}
}
loadTimerCfg();

function isHardTopic(id) { return TOPICS_HARD.some(function(t){ return t.id===id; }); }
function getTimerSecs(id) { return isHardTopic(id) ? timerCfg.hard : timerCfg.easy; }
function fmtTime(s) { var m=Math.floor(s/60),ss=s%60; return m+':'+(ss<10?'0':'')+ss; }

// ===== STATE =====
var currentTopic = 'chuyen-ve';
var qIdx = 0;
var selected = null;
var sessionAnswers = [];
var _timerInterval = null;
var _timerRemain = 0;
var _topicQueue = {};

// ===== SESSION HISTORY =====
var SESS_KEY = 'lt_session_history';
function loadSessionHistory() { try{var r=sessionStorage.getItem(SESS_KEY);return r?JSON.parse(r):[];}catch(e){return[];} }
function saveSessionHistory(e) { try{sessionStorage.setItem(SESS_KEY,JSON.stringify(e));}catch(e){} }
function addSessionRecord(topic,correct,total) {
  var e=loadSessionHistory();
  e.push({topic:topic,correct:correct,total:total,pct:total>0?Math.round(correct/total*100):0,ts:Date.now()});
  saveSessionHistory(e);
}

// ===== ADMIN MODAL =====
var ADMIN_PASS = '321';
var _adminCb = null;
function openAdminModal(title,desc,cb) {
  _adminCb=cb;
  document.getElementById('lt-pwd-title').textContent=title;
  document.getElementById('lt-pwd-desc').textContent=desc;
  document.getElementById('lt-pwd-input').value='';
  document.getElementById('lt-pwd-error').textContent='';
  document.getElementById('lt-pwd-modal').classList.add('visible');
  setTimeout(function(){document.getElementById('lt-pwd-input').focus();},100);
}
window.closeAdminModal=function(){document.getElementById('lt-pwd-modal').classList.remove('visible');_adminCb=null;};
window.confirmAdminPwd=function(){
  var val=document.getElementById('lt-pwd-input').value;
  if(val===ADMIN_PASS){var cb=_adminCb;window.closeAdminModal();if(cb)cb();}
  else{
    var inp=document.getElementById('lt-pwd-input');
    document.getElementById('lt-pwd-error').textContent='Mật khẩu không đúng.';
    inp.classList.add('error');inp.value='';
    setTimeout(function(){inp.classList.remove('error');},400);
    setTimeout(function(){inp.focus();},50);
  }
};

// ===== TIMER SETTINGS =====
window.openTimerSettings=function(){
  openAdminModal('Cài đặt thời gian','Nhập mật khẩu admin để chỉnh thời gian đếm ngược.',function(){
    document.getElementById('lt-easy-secs').value=timerCfg.easy;
    document.getElementById('lt-hard-secs').value=timerCfg.hard;
    document.getElementById('lt-timer-modal').classList.add('visible');
  });
};
window.closeTimerModal=function(){document.getElementById('lt-timer-modal').classList.remove('visible');};
window.saveTimerSettings=function(){
  var e=parseInt(document.getElementById('lt-easy-secs').value)||120;
  var h=parseInt(document.getElementById('lt-hard-secs').value)||300;
  timerCfg={easy:Math.max(30,Math.min(600,e)),hard:Math.max(60,Math.min(1200,h))};
  saveTimerCfg();
  updateTimerLabels();
  window.closeTimerModal();
  showToast('Đã lưu cài đặt thời gian!');
};
function updateTimerLabels(){
  var e=timerCfg.easy; var h=timerCfg.hard;
  document.getElementById('easy-time-label').textContent=(e>=60?Math.floor(e/60)+' phút'+(e%60?' '+e%60+' giây':''):e+' giây');
  document.getElementById('hard-time-label').textContent=(h>=60?Math.floor(h/60)+' phút'+(h%60?' '+h%60+' giây':''):h+' giây');
}

// ===== HISTORY MODAL =====
window.showHistoryModal=function(){renderHistoryEntries(loadSessionHistory());document.getElementById('lt-history-modal').classList.add('visible');};
window.closeHistoryModal=function(){document.getElementById('lt-history-modal').classList.remove('visible');};
function renderHistoryEntries(entries){
  var el=document.getElementById('lt-history-entries');
  if(!entries||entries.length===0){
    el.innerHTML='<div class="lt-history-empty"><i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:8px"></i>Chưa có lần làm nào trong phiên này.</div>';
    return;
  }
  el.innerHTML=entries.slice().reverse().map(function(e){
    var date=new Date(e.ts);
    var timeStr=date.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    var sc=e.pct>=70?'good':e.pct>=50?'ok':'bad';
    var hard=isHardTopic(e.topic)?'<span class="lt-hard-badge">Nâng cao</span>':'';
    return '<div class="lt-history-entry">'+
      '<div style="flex:1">'+
        '<div class="lt-he-topic"><i class="fas fa-book-open"></i> '+(TOPIC_LABEL[e.topic]||e.topic)+hard+'</div>'+
        '<div class="lt-he-meta"><i class="fas fa-check-circle" style="color:var(--correct)"></i> '+e.correct+' đúng &nbsp;<i class="fas fa-times-circle" style="color:var(--wrong)"></i> '+(e.total-e.correct)+' sai / '+e.total+' câu</div>'+
        '<div class="lt-he-time"><i class="fas fa-clock"></i> '+timeStr+'</div>'+
      '</div>'+
      '<div class="lt-he-score '+sc+'">'+e.pct+'%</div>'+
    '</div>';
  }).join('');
}
window.promptClearHistory=function(){
  openAdminModal('Xóa lịch sử','Nhập mật khẩu admin để xóa toàn bộ lịch sử phiên này.',function(){
    saveSessionHistory([]);renderHistoryEntries([]);showToast('Đã xóa lịch sử phiên!');
  });
};

// ===== TIMER =====
function stopTimer(){
  if(_timerInterval){clearInterval(_timerInterval);_timerInterval=null;}
  var el=document.getElementById('lt-timer');
  if(el) el.style.display='none';
}
function startTimer(secs){
  stopTimer();
  _timerRemain=secs;
  var el=document.getElementById('lt-timer');
  if(!el) return;
  el.style.display='flex';
  el.className='lt-timer';
  el.querySelector('.lt-timer-val').textContent=fmtTime(_timerRemain);
  _timerInterval=setInterval(function(){
    _timerRemain--;
    var tEl=document.getElementById('lt-timer');
    if(!tEl){stopTimer();return;}
    tEl.querySelector('.lt-timer-val').textContent=fmtTime(_timerRemain);
    if(_timerRemain<=30) tEl.className='lt-timer warn';
    if(_timerRemain<=10) tEl.className='lt-timer danger';
    if(_timerRemain<=0){
      stopTimer();
      timeUp();
    }
  },1000);
}
function timeUp(){
  if(selected!==null) return;
  selected=-1;
  sessionAnswers.push(false);
  renderScore();
  var area=document.getElementById('lt-area');
  var ans=parseInt(area.dataset.ans);
  document.querySelectorAll('.lt-option').forEach(function(b,i){
    b.disabled=true;
    if(i===ans) b.classList.add('correct');
  });
  document.getElementById('lt-feedback').innerHTML=
    '<div class="lt-feedback wrong"><i class="fas fa-clock"></i> Hết giờ! Đáp án đúng đã được đánh dấu.</div>';
  document.getElementById('lt-btn-next').style.display='block';
  typesetMath();
}

// ===== MATH =====
function typesetMath(){
  var area=document.getElementById('lt-area');
  if(!area) return;
  if(window.MathJax&&MathJax.typesetPromise){MathJax.typesetPromise([area]).catch(function(){});}
  else{setTimeout(typesetMath,400);}
}

// ===== TABS =====
function renderTabs(){
  document.getElementById('lt-tabs-easy').innerHTML=TOPICS_EASY.map(function(t){
    return '<button class="lt-tab'+(t.id===currentTopic?' active':'')+'" onclick="window.switchTopic(\''+t.id+'\')">'+t.label+'</button>';
  }).join('');
  document.getElementById('lt-tabs-hard').innerHTML=TOPICS_HARD.map(function(t){
    return '<button class="lt-tab hard'+(t.id===currentTopic?' active':'')+'" onclick="window.switchTopic(\''+t.id+'\')"><i class="fas fa-fire" style="font-size:.7rem"></i> '+t.label+'</button>';
  }).join('');
}

// ===== SCORE =====
function renderScore(){
  var ok=sessionAnswers.filter(Boolean).length;
  document.getElementById('score-text').textContent=ok+' / '+sessionAnswers.length;
  document.getElementById('dots').innerHTML=sessionAnswers.slice(-12).map(function(x){
    return '<div class="lt-dot '+(x?'ok':'err')+'"></div>';
  }).join('');
}

// ===== QUESTION QUEUE =====
function getQuestion(topic){
  var pool=(window.QUESTION_BANK||{})[topic]||[];
  if(!_topicQueue[topic]||_topicQueue[topic].length===0){
    var arr=pool.slice();
    for(var i=arr.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=arr[i];arr[i]=arr[j];arr[j]=t;}
    _topicQueue[topic]=arr;
  }
  return _topicQueue[topic][qIdx%_topicQueue[topic].length];
}

// ===== RENDER QUESTION =====
function renderQ(){
  var q=getQuestion(currentTopic);
  if(!q){
    document.getElementById('lt-area').innerHTML='<div class="lt-box"><div class="lt-err">Không có câu hỏi cho chủ đề này.</div></div>';
    return;
  }
  renderBox(q);
}

function renderBox(q){
  var labels=['A','B','C','D','E','F'];
  var area=document.getElementById('lt-area');
  var hard=isHardTopic(currentTopic);
  // Render options — content goes in a span so MathJax sees full text; label separate
  var opts=q.choices.map(function(c,i){
    return '<button class="lt-option" id="opt-'+i+'" onclick="window.choose('+i+')"><span class="opt-lbl">'+labels[i]+'.</span><span class="opt-body">'+c+'</span></button>';
  }).join('');
  var tipHtml=q.tip
    ?'<button class="lt-tip-btn" onclick="window.toggleTip()" id="lt-tip-btn"><i class="fas fa-lightbulb"></i> Xem gợi ý</button>'+
      '<div class="lt-tip" id="lt-tip" style="display:none"><i class="fas fa-lightbulb" style="color:var(--accent);margin-right:6px"></i>'+q.tip+'</div>'
    :'';
  var hardBadge=hard?'<span class="lt-hard-badge-box"><i class="fas fa-fire"></i> Nâng cao</span>':'';
  area.innerHTML=
    '<div class="lt-box'+(hard?' hard':'')+'">'+
    '<div class="lt-box-label">Câu '+(qIdx+1)+hardBadge+
    '<span class="lt-timer" id="lt-timer" style="display:none"><i class="fas fa-stopwatch"></i> <span class="lt-timer-val">0:00</span></span>'+
    '</div>'+
    '<div class="lt-problem">'+q.q+'</div>'+
    tipHtml+
    '<div class="lt-options">'+opts+'</div>'+
    '<div id="lt-feedback"></div>'+
    '<button class="lt-btn-next" id="lt-btn-next" style="display:none" onclick="window.nextQ()"><i class="fas fa-arrow-right"></i> Câu tiếp theo</button>'+
    '</div>';
  area.dataset.ans=q.ans;
  area.dataset.explain=q.explain||'';
  typesetMath();
  startTimer(getTimerSecs(currentTopic));
}

// ===== TOGGLE TIP =====
window.toggleTip=function(){
  var tip=document.getElementById('lt-tip');
  var btn=document.getElementById('lt-tip-btn');
  if(!tip) return;
  if(tip.style.display==='none'){
    tip.style.display='block';
    if(btn) btn.innerHTML='<i class="fas fa-lightbulb"></i> Ẩn gợi ý';
    typesetMath();
  } else {
    tip.style.display='none';
    if(btn) btn.innerHTML='<i class="fas fa-lightbulb"></i> Xem gợi ý';
  }
};

// ===== CHOOSE ANSWER =====
window.choose=function(idx){
  if(selected!==null) return;
  selected=idx;
  stopTimer();
  var area=document.getElementById('lt-area');
  var ans=parseInt(area.dataset.ans);
  var explain=area.dataset.explain||'';
  var ok=idx===ans;
  sessionAnswers.push(ok);
  renderScore();
  document.querySelectorAll('.lt-option').forEach(function(b,i){
    b.disabled=true;
    if(i===ans) b.classList.add('correct');
    else if(i===idx&&!ok) b.classList.add('wrong');
  });
  document.getElementById('lt-feedback').innerHTML=
    '<div class="lt-feedback '+(ok?'correct':'wrong')+'">'+
    (ok?'<i class="fas fa-check-circle"></i> Đúng rồi! ':'<i class="fas fa-times-circle"></i> Chưa đúng. ')+
    explain+'</div>';
  document.getElementById('lt-btn-next').style.display='block';
  typesetMath();
};

// ===== NAV =====
window.nextQ=function(){qIdx++;selected=null;renderQ();};
window.switchTopic=function(id){
  if(sessionAnswers.length>0) addSessionRecord(currentTopic,sessionAnswers.filter(Boolean).length,sessionAnswers.length);
  stopTimer();
  currentTopic=id;qIdx=0;selected=null;sessionAnswers=[];_topicQueue[id]=[];
  renderTabs();renderScore();renderQ();
};
window.resetSession=function(){
  if(!confirm('Làm lại từ đầu? Lịch sử sẽ được lưu.')) return;
  if(sessionAnswers.length>0) addSessionRecord(currentTopic,sessionAnswers.filter(Boolean).length,sessionAnswers.length);
  stopTimer();
  qIdx=0;selected=null;sessionAnswers=[];_topicQueue[currentTopic]=[];
  renderScore();renderQ();
};

// ===== TOAST =====
function showToast(msg){
  var t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg;t.classList.add('show');
  setTimeout(function(){t.classList.remove('show');},2500);
}

// ===== INIT =====
function init(){
  updateTimerLabels();
  renderTabs();
  renderScore();
  renderQ();
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}