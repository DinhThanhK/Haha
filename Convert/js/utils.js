// utils.js – Các hàm tiện ích dùng chung
'use strict';

const $ = id => document.getElementById(id);

function downloadBlob(data, mime, filename) {
  const blob = data instanceof Blob ? data : new Blob([data], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function kvRow(k, v, cls='') {
  return `<div class="kv"><span class="kk">${k}</span><span class="kv2 ${cls}">${v}</span></div>`;
}

// Overlay & status helpers
function showLoad(msg, pct) {
  const ov = $('loadOverlay');
  if (ov) ov.classList.remove('hidden');
  const msgEl = $('loadMsg');
  if (msgEl) msgEl.textContent = msg || '...';
  if (pct !== undefined) setProgress(pct);
}
function hideLoad() {
  const ov = $('loadOverlay');
  if (ov) ov.classList.add('hidden');
}
function setProgress(pct) {
  const fill = $('loadFill');
  if (fill) fill.style.width = pct + '%';
}
function setStatus(msg, type) {
  const b = $('statusBadge');
  if (b) {
    b.textContent = msg;
    b.className = 'h-badge ' + (type||'');
  }
}