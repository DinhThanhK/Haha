// file-handler.js – Xử lý kéo thả file, đọc ZIP/JSON
'use strict';

let _jszip = null;
function loadJSZip() {
  if (_jszip) return Promise.resolve(_jszip);
  if (window.JSZip) { _jszip = window.JSZip; return Promise.resolve(_jszip); }
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = () => { _jszip = window.JSZip; res(_jszip); };
    s.onerror = () => rej(new Error('Không load được JSZip CDN'));
    document.head.appendChild(s);
  });
}

function setupDrop() {
  const dz = $('dropZone');
  dz.addEventListener('click', () => $('fileBtn').click());
  document.addEventListener('dragover', e => e.preventDefault());

  // Drop: phải extract entries NGAY TRONG event handler trước khi event expire
  document.addEventListener('drop', e => {
    e.preventDefault();
    const items = e.dataTransfer.items;
    if (items && items.length) {
      // Extract tất cả entries ngay lập tức (items sẽ bị clear sau khi event kết thúc)
      const entries = [];
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      if (entries.length && entries.some(en => en.isDirectory)) {
        // Có folder → dùng FileSystem API
        handleFolderDrop(entries); // truyền entries đã extract, không phải items
        return;
      }
    }
    // Fallback: file thường
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    handleFiles(files);
  });

  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));

  $('fileBtn').addEventListener('change', e => {
    if (e.target.files.length) handleFiles([...e.target.files]);
    e.target.value = '';
  });
  $('fileBtnZip').addEventListener('change', e => {
    if (e.target.files.length) handleZipFile(e.target.files[0]);
    e.target.value = '';
  });
  $('fileBtnFolder').addEventListener('change', e => {
    if (e.target.files.length) handleFolderFiles([...e.target.files]);
    e.target.value = '';
  });
  $('zipLoadBtn').addEventListener('click', () => $('fileBtnZip').click());
  $('folderLoadBtn').addEventListener('click', () => $('fileBtnFolder').click());
}

async function handleFiles(files) {
  // FIX #5: Phân loại file – session JSON (có _session trong tên) xử lý riêng
  const sessionFiles = files.filter(f => f.name.toLowerCase().endsWith('.json') && f.name.toLowerCase().includes('_session'));
  const jsons = files.filter(f => f.name.toLowerCase().endsWith('.json') && !f.name.toLowerCase().includes('_session'));
  const zips  = files.filter(f => f.name.toLowerCase().endsWith('.zip'));

  // Nạp session sau khi dữ liệu có (xử lý sau)
  if (sessionFiles.length && jsons.length === 0 && zips.length === 0) {
    // Chỉ có file session, apply ngay nếu đã có data
    if (S.data) {
      for (const sf of sessionFiles) await loadSessionFile(sf);
    } else {
      setStatus('⚠ Hãy nạp JSON + ZIP trước, rồi mới nạp session', 'err');
    }
    return;
  }

  if (!jsons.length && !zips.length) {
    setStatus('❌ Cần file .json hoặc .zip', 'err'); return;
  }
  if (jsons.length) {
    showLoad('Đang đọc JSON...', 10);
    try {
      const buf  = await jsons[0].arrayBuffer();
      const text = new TextDecoder().decode(buf);
      S.data = JSON.parse(text);
      showLoad('Xử lý dữ liệu...', 30);
      processData(S.data);
      // FIX #5: Nếu có session file đi kèm, apply sau khi data load
      if (sessionFiles.length) {
        setTimeout(async () => {
          for (const sf of sessionFiles) await loadSessionFile(sf);
        }, 100);
      }
    } catch(e) {
      hideLoad(); setStatus('❌ JSON lỗi: ' + e.message, 'err'); return;
    }
  }
  if (zips.length) {
    await handleZipFile(zips[0]);
  } else {
    hideLoad();
  }
}

async function handleZipFile(zipFile) {
  // FIX #6: Lưu tên file zip để dùng làm prefix khi xuất
  S._sourceZipName = zipFile.name;
  showLoad(`📦 Đang giải nén ${zipFile.name}...`, 40);
  $('zipStatus').textContent = `Đang đọc ${zipFile.name}...`;
  try {
    const JSZip = await loadJSZip();
    const bytes = await zipFile.arrayBuffer();
    const zip   = await JSZip.loadAsync(bytes);
    const pngEntries = Object.values(zip.files).filter(f => !f.dir && /\.png$/i.test(f.name));
    if (!pngEntries.length) {
      $('zipStatus').textContent = '⚠ Không có PNG trong ZIP';
      hideLoad(); return;
    }
    setStatus(`📦 Đang load ${pngEntries.length} PNG...`, 'loading');
    let done = 0, loaded = 0;
    for (const entry of pngEntries) {
      const parts   = entry.name.split('/');
      const fname   = parts[parts.length - 1];
      const stem    = fname.replace(/\.png$/i, '');
      const mediaKey = 'media/' + stem;
      if (S.imgLoaded[mediaKey] && !S.imgMissing[mediaKey]) { done++; continue; }
      try {
        const ab   = await entry.async('arraybuffer');
        const blob = new Blob([ab], { type: 'image/png' });
        const url  = URL.createObjectURL(blob);
        await new Promise(res => {
          const img = new Image();
          img.onload = () => {
            S.imgCache[mediaKey] = img;
            S.imgLoaded[mediaKey] = true;
            delete S.imgMissing[mediaKey];
            S.imgCache[stem] = img;
            S.imgLoaded[stem] = true;
            loaded++; done++;
            setProgress(40 + (done / pngEntries.length) * 55);
            res();
          };
          img.onerror = () => { done++; res(); };
          img.src = url;
        });
      } catch(e) { done++; }
    }
    S.missingCount = Object.keys(S.imgMissing).length;
    updateImgHint();
    $('zipStatus').textContent = `✓ Loaded ${loaded} / ${pngEntries.length} PNG`;
    setStatus(`✓ ${S.animNames.length} anims · ${loaded} images`, 'ok');
    for (const key in S.imgMissing) { delete S.imgCache[key]; delete S.imgLoaded[key]; }
    S.imgMissing = {};
    if (S.currentAnim) {
      loadImagesForAnim(S.currentAnim, () => {
        stopAnim(); startAnim();
        autoExpandCanvas(S.data?.meta?.canvasW||390, S.data?.meta?.canvasH||390);
      });
    }
  } catch(e) {
    $('zipStatus').textContent = '❌ Lỗi: ' + e.message;
    console.error('ZIP error:', e);
  }
  hideLoad();
  // FIX #5: Nếu có session file đi kèm với zip
  if (typeof sessionFiles !== 'undefined' && sessionFiles.length && S.data) {
    setTimeout(async () => {
      for (const sf of sessionFiles) await loadSessionFile(sf);
    }, 600);
  }
}
// ── Folder import (thư mục thường, không cần ZIP) ────────────────────────────

// Dùng FileSystemEntry API (drag & drop)
async function handleFolderDrop(entries) {
  // entries[] đã được extract trong event handler — an toàn để dùng async
  setStatus('📁 Đang đọc folder...', 'loading');
  showLoad('Đang quét thư mục...', 5);

  const allFiles = [];

  async function traverseEntry(entry, pathPrefix) {
    if (entry.isFile) {
      await new Promise((res) => entry.file(f => {
        allFiles.push({ file: f, path: pathPrefix + f.name });
        res();
      }, () => res())); // bỏ qua lỗi đọc file đơn lẻ, không dừng toàn bộ
    } else if (entry.isDirectory) {
      const dirPath    = pathPrefix + entry.name + '/';
      const reader     = entry.createReader();
      const dirEntries = [];

      // Collect toàn bộ (max 100/batch → loop đến khi empty)
      await new Promise(res => {
        const readNext = () => {
          reader.readEntries(batch => {
            if (!batch.length) { res(); return; }
            dirEntries.push(...batch);
            readNext();
          }, () => res());
        };
        readNext();
      });

      // Traverse tuần tự sau khi collect xong
      for (const child of dirEntries) {
        await traverseEntry(child, dirPath);
      }
    }
  }

  // FIX: traverse tất cả entries — cả file lẫn folder (mixed drop)
  for (const entry of entries) {
    await traverseEntry(entry, '');
  }

  console.log('[FolderDrop] Tổng entries sau traverse:', allFiles.length);
  await processFolderFiles(allFiles);
}

// Dùng <input webkitdirectory> (button click)
async function handleFolderFiles(fileList) {
  setStatus('📁 Đang đọc folder...', 'loading');
  showLoad('Đang quét thư mục...', 5);

  const allFiles = fileList.map(f => ({
    file: f,
    path: f.webkitRelativePath || f.name,
  }));

  await processFolderFiles(allFiles);
}

// Core: phân loại và load JSON + PNG từ danh sách file
async function processFolderFiles(allFiles) {
  console.log('[Folder] Tổng files quét được:', allFiles.length, allFiles.map(f=>f.path));
  // Phân loại
  const jsonFiles    = allFiles.filter(f => /\.json$/i.test(f.file.name) && !f.file.name.toLowerCase().includes('_session'));
  const sessionFiles = allFiles.filter(f => /\.json$/i.test(f.file.name) && f.file.name.toLowerCase().includes('_session'));
  const pngFiles     = allFiles.filter(f => /\.png$/i.test(f.file.name));
  console.log('[Folder] JSON:', jsonFiles.map(f=>f.file.name), '| Session:', sessionFiles.map(f=>f.file.name), '| PNG:', pngFiles.length);

  if (!jsonFiles.length && !pngFiles.length) {
    hideLoad();
    setStatus('❌ Folder không có JSON hoặc PNG nào', 'err');
    return;
  }

  setStatus(`📁 Tìm thấy: ${jsonFiles.length} JSON · ${pngFiles.length} PNG`, 'loading');

  // 1. Load JSON chính (ưu tiên file có "main" / "export" / "deep" trong tên)
  if (jsonFiles.length) {
    showLoad('Đang đọc JSON...', 15);
    const jsonFile = jsonFiles.find(f => /main|export|deep/i.test(f.file.name)) || jsonFiles[0];
    try {
      const text = await jsonFile.file.text();
      S.data = JSON.parse(text);
      showLoad('Xử lý dữ liệu...', 30);
      processData(S.data);
    } catch(e) {
      hideLoad();
      setStatus('❌ JSON lỗi: ' + e.message, 'err');
      return;
    }
  }

  // 2. Load PNG trực tiếp từ File objects
  if (pngFiles.length) {
    showLoad(`📁 Đang load ${pngFiles.length} PNG...`, 35);
    let done = 0, loaded = 0;
    for (const { file } of pngFiles) {
      const stem     = file.name.replace(/\.png$/i, '');
      const mediaKey = 'media/' + stem;
      try {
        const url = URL.createObjectURL(file);
        await new Promise(res => {
          const img = new Image();
          img.onload = () => {
            S.imgCache[mediaKey] = img;
            S.imgLoaded[mediaKey] = true;
            delete S.imgMissing[mediaKey];
            S.imgCache[stem] = img;
            S.imgLoaded[stem] = true;
            loaded++; done++;
            setProgress(35 + (done / pngFiles.length) * 55);
            res();
          };
          img.onerror = () => { done++; res(); };
          img.src = url;
        });
      } catch(e) { done++; }
    }
    $('zipStatus').textContent = `✓ Loaded ${loaded} / ${pngFiles.length} PNG từ folder`;
    S.missingCount = Object.keys(S.imgMissing).length;
    updateImgHint();
    for (const key in S.imgMissing) { delete S.imgCache[key]; delete S.imgLoaded[key]; }
    S.imgMissing = {};
  }

  // 3. Chạy animation
  if (S.currentAnim) {
    loadImagesForAnim(S.currentAnim, () => {
      stopAnim(); startAnim();
      autoExpandCanvas(S.data?.meta?.canvasW || 390, S.data?.meta?.canvasH || 390);
    });
  }

  // 4. Load session SAU KHI PNG đã load xong (không dùng setTimeout để tránh race condition)
  if (sessionFiles.length && S.data) {
    showLoad('Đang áp dụng session...', 95);
    for (const sf of sessionFiles) await loadSessionFile(sf.file);
  }

  setStatus(`✓ Folder: ${S.animNames?.length || 0} anims · ${Object.keys(S.imgCache).length} images`, 'ok');
  hideLoad();
  $('zipLoadRow').style.display = 'flex';
}
