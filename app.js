// ==========================================
// CEK BARKOT — APPLOGIC & SUPABASE CONTROLLER
// T.B.K JH Edition
// ==========================================

const DEFAULT_SUPABASE_URL = 'https://jrpklibocgicubevyshm.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpycGtsaWJvY2dpY3ViZXZ5c2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NTA3NjUsImV4cCI6MjEwMzQyNjc2NX0.xGoel8SNa2v9DcZBYwKcmjzGF7j6LJ-OQkr919JyYSc';

// 7 Barcode Belum Ditempel (Sesuai berkas resmi tgl 28-30 Agustus)
const MISSING_BARCODES_DEFAULT = [
  "33419",
  "33422",
  "33744",
  "32277",
  "32278",
  "34240",
  "943647"
];

let currentDate = '2026-08-31';
let state = {
  list: [],
  doneMap: {}
};
let currentFilter = 'all';
let soundEnabled = true;
let lockModeEnabled = true;
let audioCtx = null;
let supabaseClient = null;
let realtimeChannel = null;
let activeSpotlightBal = null;

// Ukuran Font State: '16pm' (iPhone 16 Pro Max default), 'a16' (Samsung A16), 'lansia', 'normal'
let currentFontSizeMode = localStorage.getItem('barkot_font_mode') || '16pm';

// Scanner state
let html5QrScanner = null;
let currentCameraId = null;
let availableCameras = [];
let isTorchOn = false;

// Safe accessor for SEED_DATA
function getSeedData() {
  if (typeof window !== 'undefined' && window.SEED_DATA) return window.SEED_DATA;
  if (typeof SEED_DATA !== 'undefined' && SEED_DATA) return SEED_DATA;
  return {};
}

// ==========================================
// DYNAMIC MISSING BARCODES STORAGE (SHARED VIA CLOUD)
// ==========================================
function getMissingBarcodesList() {
  const stored = localStorage.getItem('barkot_missing_list_v2');
  if (stored !== null) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.map(x => String(x).trim()).filter(Boolean);
      }
    } catch(e) {}
  }
  return [...MISSING_BARCODES_DEFAULT];
}

async function saveMissingBarcodesList(list) {
  const cleanList = Array.isArray(list) ? list.map(x => String(x).trim()).filter(Boolean) : [];
  localStorage.setItem('barkot_missing_list_v2', JSON.stringify(cleanList));
  updateMissingBannerUI();
  loadDataForCurrentDate();

  if (supabaseClient) {
    try {
      await supabaseClient
        .from('barkot_settings')
        .upsert({
          key: 'missing_barcodes',
          value: cleanList,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
    } catch(e) {
      console.warn('saveMissingBarcodesList cloud error:', e);
    }
  }
}

function removeMissingBarcode(code) {
  const target = String(code || '').trim();
  const list = getMissingBarcodesList().filter(x => String(x).trim() !== target);
  saveMissingBarcodesList(list);

  // Tandai bal selesai jika ada di dataset dan sinkronkan ke Supabase
  const seed = getSeedData();
  Object.keys(seed).forEach(tgl => {
    const it = (seed[tgl] || []).find(x => String(x.barkot).trim() === target || String(x.no_gud).trim() === target);
    if (it) {
      it.is_done = true;
      try {
        const key = 'barkot_local:' + tgl;
        const raw = localStorage.getItem(key);
        const st = raw ? JSON.parse(raw) : { list: seed[tgl] || [], doneMap: {} };
        if (!st.doneMap) st.doneMap = {};
        st.doneMap[it.no_gud] = true;
        localStorage.setItem(key, JSON.stringify(st));
      } catch(e) {}

      if (tgl === currentDate) {
        state.doneMap[it.no_gud] = true;
        const curIt = state.list.find(x => x.no_gud === it.no_gud);
        if (curIt) curIt.is_done = true;
      }

      if (supabaseClient) {
        syncLocalItemToCloud({ ...it, tanggal: tgl }, true);
      }
    }
  });

  saveLocalState();
  render();
  openMissingModal();
  showToast(`✓ Barkot #${target} dihapus dari daftar & ditandai selesai!`);
}

async function addNewMissingBarcode() {
  const input = document.getElementById('newMissingInput');
  const val = (input ? input.value : '').trim();
  if (!val) {
    showToast('Ketikkan nomor barcode atau No Gud dahulu!');
    return;
  }

  const seed = getSeedData();
  let targetBarkot = val;
  let targetNoGud = null;
  let targetItem = null;
  let targetTgl = null;

  // Cari di dataset apakah sesuai nomor barkot atau nomor gudang
  for (const tgl of Object.keys(seed)) {
    const it = (seed[tgl] || []).find(x => 
      (x.barkot && String(x.barkot).trim() === val) || 
      String(x.no_gud).trim() === val
    );
    if (it) {
      targetItem = it;
      targetTgl = tgl;
      if (it.barkot) targetBarkot = String(it.barkot).trim();
      targetNoGud = it.no_gud;
      break;
    }
  }

  const list = getMissingBarcodesList();
  if (!list.some(x => String(x).trim() === targetBarkot)) {
    list.unshift(targetBarkot);
  }

  // Jika item ada di dataset, ubah statusnya menjadi belum selesai (is_done = false)
  if (targetItem && targetTgl) {
    targetItem.is_done = false;
    try {
      const key = 'barkot_local:' + targetTgl;
      const raw = localStorage.getItem(key);
      const st = raw ? JSON.parse(raw) : { list: seed[targetTgl] || [], doneMap: {} };
      if (st.doneMap) delete st.doneMap[targetNoGud];
      localStorage.setItem(key, JSON.stringify(st));
    } catch(e) {}

    if (targetTgl === currentDate) {
      delete state.doneMap[targetNoGud];
      const curIt = state.list.find(x => x.no_gud === targetNoGud);
      if (curIt) curIt.is_done = false;
    }

    if (supabaseClient) {
      try {
        await supabaseClient
          .from('barkot_data')
          .upsert({
            tanggal: targetTgl,
            no_gud: targetNoGud,
            grade: targetItem.grade,
            barkot: targetItem.barkot || null,
            kg: targetItem.kg !== undefined && targetItem.kg !== null ? targetItem.kg : null,
            is_done: false,
            done_at: null
          }, { onConflict: 'tanggal,no_gud' });
      } catch(e) {}
    }
  }

  saveMissingBarcodesList(list);
  saveLocalState();
  render();
  if (input) input.value = '';
  openMissingModal();
  showToast(`✓ Barkot #${targetBarkot} ditambahkan ke daftar belum ditempel`);
}

function resetMissingBarcodesDefault() {
  if (confirm('Kembalikan daftar barcode belum ditempel ke default (7 barcode resmi)?')) {
    saveMissingBarcodesList([...MISSING_BARCODES_DEFAULT]);
    openMissingModal();
    showToast('Daftar direset ke 7 barcode resmi');
  }
}

// ==========================================
// BARKOT GANDA & MISSING HELPERS
// ==========================================
function getBalDuplicateInfo(item) {
  if (!item || !item.barkot || String(item.barkot).trim() === '') return null;
  const no_gud = item.no_gud;
  const seed = getSeedData();
  
  const allOccurrences = [];
  const allDates = Object.keys(seed).sort();
  for (const tgl of allDates) {
    const match = (seed[tgl] || []).find(x => x.no_gud === no_gud && x.barkot && String(x.barkot).trim() !== '');
    if (match) {
      allOccurrences.push({ ...match, tanggal: tgl });
    }
  }

  if (allOccurrences.length > 1) {
    const earliest = allOccurrences[0];
    const currentItemTgl = item.tanggal || currentDate;
    if (currentItemTgl > earliest.tanggal) {
      return {
        isSecondary: true,
        isPrimary: false,
        earlierDate: earliest.tanggal,
        earlierBarkot: earliest.barkot,
        earlierKg: earliest.kg,
        earlierGrade: earliest.grade,
        totalOccurrences: allOccurrences.length
      };
    }
  }
  return null;
}

function getAllMissingAndDualItems() {
  const missingList = [];
  const dualList = [];
  const seed = getSeedData();
  const allDates = Object.keys(seed).sort();

  const seenNoGud = {};
  allDates.forEach(tgl => {
    (seed[tgl] || []).forEach(item => {
      if (item.barkot && String(item.barkot).trim() !== '') {
        if (!seenNoGud[item.no_gud]) {
          seenNoGud[item.no_gud] = { ...item, tanggal: tgl };
        } else {
          const primary = seenNoGud[item.no_gud];
          dualList.push({
            ...item,
            tanggal: tgl,
            primaryDate: primary.tanggal,
            primaryBarkot: primary.barkot,
            primaryGrade: primary.grade,
            primaryKg: primary.kg
          });
        }
      }
    });
  });

  const missingCodes = getMissingBarcodesList();
  missingCodes.forEach(b => {
    let found = null;
    let foundIsDone = false;
    for (const tgl of allDates) {
      const match = (seed[tgl] || []).find(x => String(x.barkot).trim() === String(b).trim());
      if (match) {
        let isDone = Boolean(match.is_done);
        try {
          const tglKey = 'barkot_local:' + tgl;
          const tglRaw = localStorage.getItem(tglKey);
          if (tglRaw) {
            const parsed = JSON.parse(tglRaw);
            if (parsed.doneMap && parsed.doneMap[match.no_gud]) {
              isDone = true;
            }
          }
        } catch(e) {}

        if (isDone) {
          foundIsDone = true;
        }

        const isAlreadyInDual = dualList.some(d => d.no_gud === match.no_gud && d.tanggal === tgl);
        if (!isAlreadyInDual && !isDone) {
          found = { ...match, tanggal: tgl };
        }
        break;
      }
    }
    if (found) {
      missingList.push(found);
    } else if (!foundIsDone) {
      const inDual = dualList.some(d => String(d.barkot).trim() === String(b).trim());
      if (!inDual) {
        missingList.push({
          barkot: b,
          no_gud: '—',
          grade: '—',
          kg: '—',
          tanggal: '—'
        });
      }
    }
  });

  return { dualList, missingList };
}

function updateMissingBannerUI() {
  const banner = document.getElementById('missingBanner');
  if (!banner) return;
  const { dualList, missingList } = getAllMissingAndDualItems();
  const totalCount = dualList.length + missingList.length;
  
  const titleEl = document.getElementById('missingBannerTitle');
  const btnEl = document.getElementById('missingBannerBtn');

  if (titleEl) {
    titleEl.textContent = `${totalCount} Bal Belum Ditempel / Barkot Ganda`;
  }
  if (btnEl) {
    btnEl.textContent = `Lihat & Kelola (${totalCount}) →`;
  }
}

// ==========================================
// DATE & FORMATTING HELPERS
// ==========================================
function formatDateIndo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][d.getDay()];
  const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][d.getMonth()];
  return `${hari}, ${d.getDate()} ${bulan} ${d.getFullYear()}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = parseInt(parts[2], 10);
    const m = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][parseInt(parts[1], 10) - 1];
    return `${d} ${m}`;
  }
  return dateStr;
}

function renderQuickDates() {
  const container = document.getElementById('quickDatesContainer');
  if (!container) return;
  
  const seed = getSeedData();
  const dateSet = new Set(Object.keys(seed));

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('barkot_local:')) {
      dateSet.add(key.replace('barkot_local:', ''));
    }
  }
  if (currentDate) dateSet.add(currentDate);

  const sortedDates = Array.from(dateSet).sort();
  container.innerHTML = '';

  sortedDates.forEach(dateStr => {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDate();
    const count = (seed[dateStr] || []).length;
    const pill = document.createElement('span');
    pill.className = 'date-pill' + (dateStr === currentDate ? ' active' : '');
    pill.textContent = `${day} Ags (${count})`;
    pill.onclick = () => onDateChanged(dateStr);
    container.appendChild(pill);
  });
}

function onDateChanged(newDate) {
  currentDate = newDate;
  const picker = document.getElementById('datePicker');
  if (picker) picker.value = currentDate;
  const label = document.getElementById('dateDisplayLabel');
  if (label) label.textContent = formatDateIndo(currentDate);
  
  renderQuickDates();
  hideSpotlight();
  loadDataForCurrentDate();
}

// ==========================================
// FONT SIZE & LOCK MODE MODES
// ==========================================
function initFontSize() {
  applyFontSize(currentFontSizeMode);
}

function cycleFontSize() {
  if (currentFontSizeMode === '16pm') {
    currentFontSizeMode = 'a16';
  } else if (currentFontSizeMode === 'a16') {
    currentFontSizeMode = 'lansia';
  } else if (currentFontSizeMode === 'lansia') {
    currentFontSizeMode = 'normal';
  } else {
    currentFontSizeMode = '16pm';
  }
  localStorage.setItem('barkot_font_mode', currentFontSizeMode);
  applyFontSize(currentFontSizeMode);
  const labels = {
    '16pm': 'Mode: iPhone 16 Pro Max (Ideal)',
    'a16': 'Mode: Samsung A16',
    'lansia': 'Mode: Ekstra Besar (Lansia)',
    'normal': 'Mode: Standar'
  };
  showToast(labels[currentFontSizeMode] || 'Mode Teks Diperbarui');
}

function applyFontSize(mode) {
  document.body.classList.remove('font-mode-16pm', 'font-mode-a16', 'font-mode-lansia', 'font-mode-normal');
  document.body.classList.add('font-mode-' + mode);
  const btn = document.getElementById('fontSizeBtn');
  if (btn) {
    if (mode === '16pm') {
      btn.textContent = '📱';
      btn.title = 'Ukuran Teks: iPhone 16 Pro Max (Klik untuk ganti)';
    } else if (mode === 'a16') {
      btn.textContent = '📲';
      btn.title = 'Ukuran Teks: Samsung A16 (Klik untuk ganti)';
    } else if (mode === 'lansia') {
      btn.textContent = '👓';
      btn.title = 'Ukuran Teks: Ekstra Besar / Lansia (Klik untuk ganti)';
    } else {
      btn.textContent = '📐';
      btn.title = 'Ukuran Teks: Normal / Standar (Klik untuk ganti)';
    }
  }
}

function initLockMode() {
  const saved = localStorage.getItem('barkot_lock_mode');
  lockModeEnabled = saved !== null ? (saved === 'true') : true;
  updateLockBtnUI();
}

function toggleLockMode() {
  lockModeEnabled = !lockModeEnabled;
  localStorage.setItem('barkot_lock_mode', String(lockModeEnabled));
  updateLockBtnUI();
  render();
  showToast(lockModeEnabled ? '🔒 Kunci Diaktifkan (Bal selesai terkunci)' : '🔓 Kunci Dimatikan (Bebas sentuh/un-centang)');
}

function updateLockBtnUI() {
  const btn = document.getElementById('lockBtn');
  if (!btn) return;
  if (lockModeEnabled) {
    btn.className = 'draw-btn-ghost active-lock';
    btn.textContent = '🔒';
    btn.title = 'Kunci AKTIF: Bal selesai tidak bisa tidak sengaja ter-uncentang';
  } else {
    btn.className = 'draw-btn-ghost';
    btn.textContent = '🔓';
    btn.title = 'Kunci NONAKTIF: Bal selesai bisa langsung disentuh';
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('soundBtn');
  if (btn) {
    btn.textContent = soundEnabled ? '🔔' : '🔕';
  }
  showToast(soundEnabled ? 'Suara scanner diaktifkan' : 'Suara scanner dimatikan');
}

function playBeep(freq = 880, type = 'sine', duration = 0.12) {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch(e) {}
}

function triggerHaptic(type = 'success') {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      if (type === 'success') {
        navigator.vibrate([40, 30, 40]); // Getar ganda pendek sukses
      } else if (type === 'error' || type === 'warning') {
        navigator.vibrate([160, 60, 160]); // Getar panjang peringatan
      } else if (type === 'tap') {
        navigator.vibrate(25); // Getar sentuh mikro
      }
    } catch(e) {}
  }
}

// ==========================================
// DATA LOADING & LOCAL STORAGE
// ==========================================
function saveLocalState() {
  if (!currentDate) return;
  try {
    localStorage.setItem('barkot_local:' + currentDate, JSON.stringify(state));
  } catch(e) {}
}

function loadDataForCurrentDate() {
  const key = 'barkot_local:' + currentDate;
  const seed = getSeedData();
  const seedItems = seed[currentDate] || [];

  let localState = null;
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      localState = JSON.parse(raw);
    } catch(e) {}
  }

  const doneMap = (localState && localState.doneMap) ? { ...localState.doneMap } : {};
  const localListMap = {};
  if (localState && Array.isArray(localState.list)) {
    localState.list.forEach(it => {
      localListMap[it.no_gud] = it;
    });
  }

  const missingBarcodes = getMissingBarcodesList();
  
  let mergedList = [];
  if (seedItems.length > 0) {
    mergedList = seedItems.map(seedItem => {
      const localItem = localListMap[seedItem.no_gud];
      const dupInfo = getBalDuplicateInfo(seedItem);
      const isDual = Boolean(dupInfo && dupInfo.isSecondary);
      const isMissingInList = missingBarcodes.includes(String(seedItem.barkot || '').trim());
      const isMissing = isDual || isMissingInList;

      let isDone;
      if (doneMap[seedItem.no_gud] !== undefined) {
        isDone = Boolean(doneMap[seedItem.no_gud]);
      } else {
        isDone = Boolean(seedItem.is_done) && !isMissing;
      }

      if (isDone) {
        doneMap[seedItem.no_gud] = true;
      } else {
        delete doneMap[seedItem.no_gud];
      }

      return {
        ...seedItem,
        barkot: (localItem && localItem.barkot !== undefined && localItem.barkot !== '') ? localItem.barkot : seedItem.barkot,
        is_out: (localItem && localItem.is_out !== undefined) ? localItem.is_out : seedItem.is_out,
        is_done: isDone
      };
    });

    if (localState && Array.isArray(localState.list)) {
      localState.list.forEach(locIt => {
        if (!mergedList.find(x => String(x.no_gud) === String(locIt.no_gud))) {
          mergedList.push(locIt);
        }
      });
    }
  } else if (localState && Array.isArray(localState.list)) {
    mergedList = localState.list;
  }

  state = {
    list: mergedList,
    doneMap: doneMap
  };
  saveLocalState();

  render();
  renderQuickDates();
  updateMissingBannerUI();

  if (supabaseClient) {
    fetchFromSupabaseBackground(currentDate);
  }
}

async function fetchFromSupabaseBackground(dateStr) {
  try {
    const { data, error } = await supabaseClient
      .from('barkot_data')
      .select('*')
      .eq('tanggal', dateStr);
    
    if (!error && data && data.length > 0) {
      const cloudMap = {};
      data.forEach(row => {
        cloudMap[row.no_gud] = row;
      });

      let changed = false;
      state.list.forEach(item => {
        if (cloudMap[item.no_gud]) {
          const c = cloudMap[item.no_gud];
          if (c.barkot !== undefined && c.barkot !== null && c.barkot !== item.barkot) {
            item.barkot = c.barkot;
            changed = true;
          }
          if (c.grade && c.grade !== item.grade) {
            item.grade = c.grade;
            changed = true;
          }
          if (c.kg !== undefined && c.kg !== item.kg) {
            item.kg = c.kg;
            changed = true;
          }
          if (c.is_done !== undefined && Boolean(state.doneMap[item.no_gud]) !== Boolean(c.is_done)) {
            if (c.is_done) {
              state.doneMap[item.no_gud] = true;
            } else {
              delete state.doneMap[item.no_gud];
            }
            item.is_done = Boolean(c.is_done);
            changed = true;
          }
        }
      });

      if (changed) {
        saveLocalState();
        render();
      }
    }
  } catch(err) {
    console.warn('Supabase fetch background err', err);
  }
}

// ==========================================
// SEARCH & SPOTLIGHT
// ==========================================
function handleUnifiedSearch(query) {
  const q = (query || '').trim();
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) {
    clearBtn.style.display = q ? 'block' : 'none';
  }

  if (!q) {
    document.getElementById('globalMatchesBox').style.display = 'none';
    hideSpotlight();
    render();
    return;
  }

  // 1. Direct search in current date
  const directMatch = state.list.find(x => 
    String(x.no_gud) === q || 
    (x.barkot && String(x.barkot).trim() === q)
  );

  if (directMatch) {
    showSpotlight(directMatch);
  } else {
    hideSpotlight();
  }

  // 2. Global search across all dates
  performGlobalSearch(q);
  render();
}

function clearUnifiedSearch() {
  const input = document.getElementById('unifiedSearchInput');
  if (input) input.value = '';
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  document.getElementById('globalMatchesBox').style.display = 'none';
  hideSpotlight();
  render();
}

function performGlobalSearch(q) {
  const matchesBox = document.getElementById('globalMatchesBox');
  const seed = getSeedData();
  if (!matchesBox) return;

  const results = [];
  const allDates = Object.keys(seed).sort();

  for (const tgl of allDates) {
    const items = seed[tgl] || [];
    for (const item of items) {
      const matchGud = String(item.no_gud) === q || String(item.no_gud).startsWith(q);
      const matchBarkot = item.barkot && String(item.barkot).includes(q);
      if (matchGud || matchBarkot) {
        results.push({ ...item, tanggal: tgl });
      }
    }
  }

  if (results.length > 0) {
    matchesBox.style.display = 'block';
    matchesBox.innerHTML = `
      <div style="font-family:var(--font-roboto-mono); font-size:10px; text-transform:uppercase; color:var(--color-smoke); margin-bottom:6px;">
        Hasil Pencarian Semua Tanggal (${results.length}):
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto;">
        ${results.map(it => `
          <div style="background:var(--color-bone); border:1px solid var(--color-ash); border-radius:var(--radius-buttons); padding:8px 10px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="jumpToDateAndHighlight('${it.tanggal}', ${it.no_gud})">
            <div>
              <div style="font-weight:600; font-size:13px;">NO GUD ${it.no_gud} · Barkot: <b>${it.barkot || '—'}</b></div>
              <div style="font-size:11px; color:var(--color-smoke);">Tgl: ${formatDateShort(it.tanggal)} · GR ${it.grade || '—'} · ${it.kg ? it.kg + 'kg' : '—'}</div>
            </div>
            <span style="font-size:11px; color:var(--color-ink); font-weight:500;">Buka →</span>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    matchesBox.style.display = 'none';
  }
}

function jumpToDateAndHighlight(dateStr, noGud) {
  if (dateStr && dateStr !== '—' && dateStr !== currentDate) {
    onDateChanged(dateStr);
  }
  const item = state.list.find(x => String(x.no_gud) === String(noGud));
  if (item) {
    showSpotlight(item);
    const spotlight = document.getElementById('spotlightCard');
    if (spotlight) {
      spotlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function showSpotlight(item) {
  activeSpotlightBal = item;
  const spotlight = document.getElementById('spotlightCard');
  if (!spotlight) return;

  document.getElementById('spotNoGudVal').textContent = item.no_gud;
  document.getElementById('spotBarkotVal').textContent = item.barkot || '—';
  document.getElementById('spotGradeVal').textContent = item.grade ? `GRADE ${item.grade}` : 'GRADE —';
  document.getElementById('spotKgVal').textContent = (item.kg !== '' && item.kg !== undefined && item.kg !== null) ? `${item.kg} KG` : '— KG';

  const ketEl = document.getElementById('spotKetVal');
  if (ketEl) {
    if (item.ket) {
      ketEl.style.display = 'block';
      ketEl.textContent = `Catatan: ${item.ket}`;
    } else {
      ketEl.style.display = 'none';
    }
  }

  // Barkot Ganda Notice
  const dualNotice = document.getElementById('spotDualNotice');
  const dupInfo = getBalDuplicateInfo(item);
  if (dupInfo && dupInfo.isSecondary && dualNotice) {
    dualNotice.style.display = 'block';
    dualNotice.innerHTML = `
      ⚠️ <b>Catatan Barkot Ganda:</b> No Gud <b>${item.no_gud}</b> sudah pernah terbit pada tanggal <b>${formatDateIndo(dupInfo.earlierDate)}</b> dengan Barkot <b>${dupInfo.earlierBarkot}</b> (${dupInfo.earlierKg || '-'}kg).<br>
      <span style="font-size:11.5px; opacity:0.9;">Bal fisik tembakau sudah ditempel stiker pada tanggal sebelumnya.</span>
      <div style="margin-top:8px;">
        <button class="draw-btn-ghost-dark" style="padding:4px 10px; font-size:11px;" onclick="jumpToDateAndHighlight('${dupInfo.earlierDate}', ${item.no_gud})">🔍 Buka Data Tgl ${formatDateIndo(dupInfo.earlierDate)} (#${dupInfo.earlierBarkot})</button>
      </div>
    `;
  } else if (dualNotice) {
    dualNotice.style.display = 'none';
  }

  const manualInput = document.getElementById('spotManualBarkotInput');
  if (manualInput) {
    manualInput.value = item.barkot || '';
  }

  updateSpotlightUI();
  spotlight.style.display = 'block';
}

function hideSpotlight() {
  activeSpotlightBal = null;
  const spotlight = document.getElementById('spotlightCard');
  if (spotlight) spotlight.style.display = 'none';
}

function updateSpotlightUI() {
  if (!activeSpotlightBal) return;
  const isDone = Boolean(state.doneMap[activeSpotlightBal.no_gud]);
  const btn = document.getElementById('spotToggleBtn');
  const status = document.getElementById('spotStatusVal');
  const isOut = Boolean(activeSpotlightBal.is_out);

  if (status) {
    if (isOut) {
      status.textContent = 'STATUS: OUT';
      status.style.color = '#fca5a5';
    } else if (isDone) {
      status.textContent = lockModeEnabled ? 'TERKUNCI (SELESAI)' : 'SELESAI';
      status.style.color = '#86efac';
    } else {
      status.textContent = 'BELUM SELESAI';
      status.style.color = 'var(--color-silver)';
    }
  }

  if (btn) {
    if (isDone) {
      btn.textContent = '↺ Batalkan Selesai';
      btn.style.background = 'rgba(255,255,255,0.06)';
      btn.style.color = 'var(--color-bone)';
    } else {
      btn.textContent = '✓ Tandai Selesai';
      btn.style.background = 'var(--color-bone)';
      btn.style.color = 'var(--color-obsidian)';
    }
  }
}

function toggleSpotlightBal() {
  if (!activeSpotlightBal) return;
  toggleBal(activeSpotlightBal.no_gud);
  updateSpotlightUI();
}

function toggleSpotlightOut() {
  if (!activeSpotlightBal) return;
  activeSpotlightBal.is_out = !activeSpotlightBal.is_out;
  saveLocalState();
  render();
  updateSpotlightUI();
  showToast(`Status No Gud ${activeSpotlightBal.no_gud} diubah: ${activeSpotlightBal.is_out ? 'OUT' : 'AKTIF'}`);
}

function saveSpotlightBarkot() {
  if (!activeSpotlightBal) return;
  const input = document.getElementById('spotManualBarkotInput');
  const newBarkot = (input ? input.value : '').trim();
  activeSpotlightBal.barkot = newBarkot;
  saveLocalState();
  syncLocalItemToCloud(activeSpotlightBal, Boolean(state.doneMap[activeSpotlightBal.no_gud]));
  render();
  showSpotlight(activeSpotlightBal);
  showToast(`Barkot No Gud ${activeSpotlightBal.no_gud} disimpan: ${newBarkot || 'Kosong'}`);
}

// ==========================================
// CORE CHECKLIST TOGGLE & BATCH ACTIONS
// ==========================================
function toggleBal(noGud) {
  const item = state.list.find(x => x.no_gud === noGud);
  if (!item) return;

  const isDone = Boolean(state.doneMap[noGud]);

  if (isDone && lockModeEnabled) {
    playBeep(300, 'sawtooth', 0.15);
    triggerHaptic('error');
    showToast(`🔒 No Gud ${noGud} terkunci! Matikan tombol 🔒 ON di atas jika ingin membatalkan centang.`);
    return;
  }

  if (isDone) {
    delete state.doneMap[noGud];
    item.is_done = false;
    playBeep(440, 'sine', 0.08);
    triggerHaptic('tap');
  } else {
    state.doneMap[noGud] = true;
    item.is_done = true;
    playBeep(880, 'sine', 0.12);
    triggerHaptic('success');
  }

  saveLocalState();
  syncLocalItemToCloud(item, !isDone);
  render();

  if (activeSpotlightBal && activeSpotlightBal.no_gud === noGud) {
    updateSpotlightUI();
  }
}

function checkAllBal() {
  if (!state.list || state.list.length === 0) return;
  if (confirm(`Tandai SEMUA (${state.list.length} bal) pada tanggal ${formatDateIndo(currentDate)} sebagai SELESAI?`)) {
    state.list.forEach(item => {
      state.doneMap[item.no_gud] = true;
      item.is_done = true;
    });
    saveLocalState();
    render();
    syncAllLocalToCloud();
    showToast(`Semua bal tgl ${formatDateShort(currentDate)} ditandai selesai & disimpan`);
  }
}

function uncheckAllBal() {
  if (!state.list || state.list.length === 0) return;
  if (confirm(`Reset SEMUA centang pada tanggal ${formatDateIndo(currentDate)} menjadi BELUM SELESAI?`)) {
    state.doneMap = {};
    state.list.forEach(item => {
      item.is_done = false;
    });
    saveLocalState();
    render();
    syncAllLocalToCloud();
    showToast(`Semua centang tgl ${formatDateShort(currentDate)} di-reset & disimpan`);
  }
}

function clearCurrentDateData() {
  if (confirm(`Yakin ingin MENGHAPUS data bal tanggal ${formatDateIndo(currentDate)} dari penyimpanan lokal?`)) {
    localStorage.removeItem('barkot_local:' + currentDate);
    loadDataForCurrentDate();
    showToast('Data tanggal ini di-reset');
  }
}

function refreshCurrentDateData() {
  loadDataForCurrentDate();
  if (supabaseClient) {
    fetchFromSupabaseBackground(currentDate);
  }
  showToast('✓ Data tanggal ' + formatDateShort(currentDate) + ' dimuat ulang & disinkronkan');
}

function copyWaSummary() {
  if (!state.list || state.list.length === 0) {
    showToast('Tidak ada data bal untuk disalin');
    return;
  }
  const total = state.list.length;
  const doneCount = Object.keys(state.doneMap).length;
  const remainCount = Math.max(0, total - doneCount);
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const text = `*REKAP STOCK DJARUM GUDANG INDUK*\n📅 Tanggal: ${formatDateIndo(currentDate)}\n✅ Selesai: ${doneCount} Bal (${pct}%)\n⏳ Belum: ${remainCount} Bal\n📦 Total: ${total} Bal`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Rekap WhatsApp berhasil disalin ke clipboard!');
  }).catch(() => {
    prompt('Salin rekap ini secara manual:', text);
  });
}

// ==========================================
// RENDER GRID & FILTERS
// ==========================================
function setFilter(filterType, element) {
  currentFilter = filterType;
  const pills = document.querySelectorAll('.filter-pill');
  pills.forEach(p => p.classList.remove('active'));
  if (element) element.classList.add('active');
  render();
}

function render() {
  const grid = document.getElementById('balGrid');
  const emptyMsg = document.getElementById('emptyMsg');
  if (!grid) return;

  const searchInput = document.getElementById('unifiedSearchInput');
  const searchQ = (searchInput ? searchInput.value : '').trim();

  grid.innerHTML = '';

  const total = state.list.length;
  const doneCount = Object.keys(state.doneMap).length;
  const remainCount = Math.max(0, total - doneCount);
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const missingBarcodes = getMissingBarcodesList();
  const withBarkotCount = state.list.filter(x => x.barkot && String(x.barkot).trim() !== '' && !x.is_out).length;
  const noBarkotCount = state.list.filter(x => (!x.barkot || String(x.barkot).trim() === '') && !x.is_out).length;
  const outCount = state.list.filter(x => x.is_out).length;
  const missingCountInDate = state.list.filter(x => {
    const dupInfo = getBalDuplicateInfo(x);
    const isDual = Boolean(dupInfo && dupInfo.isSecondary);
    const isMissingInList = missingBarcodes.includes(String(x.barkot || '').trim());
    return isDual || isMissingInList;
  }).length;

  document.getElementById('countDone').textContent = doneCount;
  document.getElementById('countTotal').textContent = total;
  document.getElementById('countRemain').textContent = remainCount;
  document.getElementById('pctLabel').textContent = pct + '%';
  document.getElementById('progressBar').style.width = pct + '%';

  const tabAll = document.getElementById('tabAll');
  const tabWithBarkot = document.getElementById('tabWithBarkot');
  const tabNoBarkot = document.getElementById('tabNoBarkot');
  const tabOut = document.getElementById('tabOut');
  const tabPending = document.getElementById('tabPending');
  const tabDone = document.getElementById('tabDone');
  const tabMissing = document.getElementById('tabMissing');

  if (tabAll) tabAll.textContent = `Semua (${total})`;
  if (tabWithBarkot) tabWithBarkot.textContent = `Berbarkot (${withBarkotCount})`;
  if (tabNoBarkot) tabNoBarkot.textContent = `Tanpa Barkot (${noBarkotCount})`;
  if (tabOut) tabOut.textContent = `🚫 OUT (${outCount})`;
  if (tabPending) tabPending.textContent = `Belum (${remainCount})`;
  if (tabDone) tabDone.textContent = `Sudah (${doneCount})`;
  if (tabMissing) tabMissing.textContent = `⚠️ Belum Ditempel (${missingCountInDate})`;

  const filtered = state.list.filter(item => {
    const isDone = Boolean(state.doneMap[item.no_gud]);
    const dupInfo = getBalDuplicateInfo(item);
    const isDual = Boolean(dupInfo && dupInfo.isSecondary);
    const isMissingInList = missingBarcodes.includes(String(item.barkot || '').trim());
    const isMissing = isDual || isMissingInList;
    const hasBarkot = Boolean(item.barkot && String(item.barkot).trim() !== '');
    const isOut = Boolean(item.is_out);

    if (currentFilter === 'with_barkot' && (!hasBarkot || isOut)) return false;
    if (currentFilter === 'no_barkot' && (hasBarkot || isOut)) return false;
    if (currentFilter === 'out' && !isOut) return false;
    if (currentFilter === 'pending' && isDone) return false;
    if (currentFilter === 'done' && !isDone) return false;
    if (currentFilter === 'missing' && !isMissing) return false;
    
    if (searchQ) {
      const matchGud = String(item.no_gud) === searchQ || String(item.no_gud).startsWith(searchQ);
      const matchBarkot = item.barkot && String(item.barkot).includes(searchQ);
      return matchGud || matchBarkot;
    }
    return true;
  });

  if (filtered.length === 0) {
    emptyMsg.style.display = 'block';
    emptyMsg.textContent = total === 0 ? 
      `Belum ada data bal untuk tanggal ${formatDateIndo(currentDate)}.` : 
      'Tidak ada data bal yang cocok dengan filter.';
  } else {
    emptyMsg.style.display = 'none';
    for (const item of filtered) {
      const isDone = Boolean(state.doneMap[item.no_gud]);
      const dupInfo = getBalDuplicateInfo(item);
      const isDual = Boolean(dupInfo && dupInfo.isSecondary);
      const isMissingInList = missingBarcodes.includes(String(item.barkot || '').trim());
      const isMissing = isDual || isMissingInList;
      const isOut = Boolean(item.is_out);
      const isSearchMatch = searchQ && (String(item.no_gud) === searchQ || (item.barkot && String(item.barkot).trim() === searchQ));

      const card = document.createElement('div');
      card.className = 'bal-card' + 
                       (isDone ? ' done' : '') + 
                       (isOut ? ' out-item' : '') +
                       (isMissing && !isDone ? ' missing-item' : '') + 
                       (isSearchMatch ? ' highlight' : '');

      const barkotHtml = item.barkot ? `<span class="meta-tag meta-tag-barcode">${item.barkot}</span>` : '<span class="meta-tag meta-tag-barcode" style="color:var(--color-smoke); font-size:10px; font-style:italic;">Tanpa Barkot</span>';
      const gradeHtml = item.grade ? `<span class="meta-tag">GR ${item.grade}</span>` : '';
      const kgHtml = (item.kg !== '' && item.kg !== undefined && item.kg !== null) ? `<span class="meta-tag">${item.kg}kg</span>` : '';
      const ketHtml = item.ket ? `<span class="meta-tag" style="border-color:var(--color-ink); color:var(--color-ink); font-weight:500;">📝 ${item.ket}</span>` : '';

      const lockIndicator = (isDone && lockModeEnabled) ? '🔒' : (isDone ? '✓' : '');
      
      let badgeHtml = '';
      if (isOut) {
        badgeHtml = '<span class="out-flag">OUT</span>';
      } else if (isDual && !isDone) {
        badgeHtml = `<span class="missing-flag" style="background:#d97706; border-color:#b45309;">⚠️ Ganda (Masuk ${formatDateShort(dupInfo.earlierDate)})</span>`;
      } else if (isMissing && !isDone) {
        badgeHtml = '<span class="missing-flag">Belum Ditempel</span>';
      }

      let statusLabel = 'NO GUD';
      if (isOut) {
        statusLabel = '🚫 OUT (TIDAK DIPROSES)';
      } else if (isDone) {
        statusLabel = lockModeEnabled ? 'TERKUNCI' : 'SELESAI';
      } else if (isDual) {
        statusLabel = `SUDAH MASUK TGL ${formatDateShort(dupInfo.earlierDate).toUpperCase()}`;
      } else if (isMissing) {
        statusLabel = 'BELUM DITEMPEL';
      }

      card.innerHTML = `
        <div class="card-check-indicator">${lockIndicator}</div>
        ${badgeHtml}
        <div class="bal-number">${item.no_gud}</div>
        <div class="meta-tags-row">
          ${barkotHtml}
          ${gradeHtml}
          ${kgHtml}
          ${ketHtml}
        </div>
        <div class="card-status-label">${statusLabel}</div>
      `;
      card.onclick = () => {
        showSpotlight(item);
        if (!isOut) {
          toggleBal(item.no_gud);
        }
      };
      grid.appendChild(card);
    }
  }
}

// ==========================================
// EXCEL UPLOAD HANDLER
// ==========================================
function handleExcelUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (rows.length < 2) {
        showToast('Berkas Excel kosong atau format tidak sesuai');
        return;
      }

      let detectedDate = currentDate;
      const fileNameMatch = file.name.match(/\b(2[1-9]|3[0-1])\b/);
      if (fileNameMatch) {
        detectedDate = `2026-08-${fileNameMatch[1]}`;
      }

      const parsedItems = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const no_gud = parseInt(row[0], 10);
        if (!isNaN(no_gud)) {
          const g1 = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '';
          const g2 = row[2] !== undefined && row[2] !== null ? String(row[2]).trim() : '';
          const grade = g1 || g2;
          const barkotRaw = row[3] !== undefined && row[3] !== null ? String(row[3]).trim() : '';
          const barkot = (barkotRaw === '-' || barkotRaw === '—' || barkotRaw.toLowerCase() === 'none') ? '' : barkotRaw;
          const kg = row[4] !== undefined && row[4] !== null ? row[4] : null;
          const ket = row[5] !== undefined && row[5] !== null ? String(row[5]).trim() : '';

          const isOut = ket.toLowerCase().includes('out') || ket.toLowerCase().includes('oot') || grade.toLowerCase().includes('out');

          parsedItems.push({
            tanggal: detectedDate,
            no_gud: no_gud,
            grade: grade,
            barkot: barkot,
            kg: kg,
            ket: ket,
            is_out: isOut,
            is_done: false
          });
        }
      }

      if (parsedItems.length > 0) {
        const seed = getSeedData();
        seed[detectedDate] = parsedItems;
        currentDate = detectedDate;
        document.getElementById('datePicker').value = currentDate;
        document.getElementById('dateDisplayLabel').textContent = formatDateIndo(currentDate);

        state = {
          list: parsedItems,
          doneMap: {}
        };
        saveLocalState();
        renderQuickDates();
        render();
        syncAllLocalToCloud();
        showToast(`Berhasil memuat ${parsedItems.length} bal dari Excel untuk ${formatDateShort(detectedDate)}!`);
      } else {
        showToast('Tidak ada baris data bal yang valid ditemukan di Excel');
      }
    } catch(err) {
      console.error(err);
      showToast('Gagal membaca berkas Excel: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ==========================================
// MISSING BALES MODAL
// ==========================================
function openMissingModal() {
  const modal = document.getElementById('missingModal');
  const container = document.getElementById('missingListContainer');
  if (!modal || !container) return;

  container.innerHTML = '';
  const { dualList, missingList } = getAllMissingAndDualItems();

  // 1. Barkot Ganda Section
  if (dualList.length > 0) {
    const header1 = document.createElement('div');
    header1.style.cssText = 'font-family:var(--font-roboto-mono); font-size:11px; font-weight:600; text-transform:uppercase; color:#b45309; margin:8px 0 4px;';
    header1.textContent = `⚠️ Barkot Ganda (${dualList.length} Bal — Sudah Masuk di Tanggal Awal)`;
    container.appendChild(header1);

    dualList.forEach(it => {
      const itemEl = document.createElement('div');
      itemEl.style.cssText = 'background:var(--color-bone); border:1px solid #fde68a; border-radius:var(--radius-buttons); padding:10px 12px; display:flex; justify-content:space-between; align-items:center; gap:8px;';
      itemEl.innerHTML = `
        <div>
          <div style="font-weight:600; font-size:13px;">No Gud ${it.no_gud} · Barkot ${it.barkot}</div>
          <div style="font-size:11px; color:#92400e;">
            📅 Terbit di: <b>${formatDateShort(it.tanggal)}</b> (GR ${it.grade} · ${it.kg || '-'}kg)<br>
            ↩️ <i>Sudah tertempel di <b>${formatDateShort(it.primaryDate)}</b> (Barkot <b>${it.primaryBarkot}</b>)</i>
          </div>
        </div>
        <button class="draw-btn-ghost" style="font-size:10.5px; padding:3px 8px; min-height:26px; border-color:#b45309; color:#b45309;" onclick="jumpToDateAndHighlight('${it.primaryDate}', ${it.no_gud}); closeMissingModal();">🔍 Buka Tgl Awal</button>
      `;
      container.appendChild(itemEl);
    });
  }

  // 2. Missing Physical Barcodes Section
  const header2 = document.createElement('div');
  header2.style.cssText = 'font-family:var(--font-roboto-mono); font-size:11px; font-weight:600; text-transform:uppercase; color:var(--color-smoke); margin:12px 0 4px;';
  header2.textContent = `Daftar Belum Ditempel / Hilang (${missingList.length} Bal)`;
  container.appendChild(header2);

  missingList.forEach(it => {
    const itemEl = document.createElement('div');
    itemEl.style.cssText = 'background:var(--color-bone); border:1px solid var(--color-ash); border-radius:var(--radius-buttons); padding:10px 12px; display:flex; justify-content:space-between; align-items:center; gap:8px;';
    
    const ketBadge = it.ket ? `<span style="display:inline-block; margin-top:2px; font-size:11px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:4px; padding:1px 6px;">📝 ${it.ket}</span>` : '';

    itemEl.innerHTML = `
      <div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-family:var(--font-roboto-mono); font-weight:700; font-size:14px; color:var(--color-ink);">${it.no_gud !== '—' ? `NO GUD ${it.no_gud}` : 'BELUM ADA NO GUD'}</span>
          <span style="font-family:var(--font-roboto-mono); font-weight:500; font-size:12px; color:var(--color-smoke); background:var(--color-parchment); border:1px solid var(--color-ash); border-radius:4px; padding:1px 6px;">Barkot #${it.barkot}</span>
        </div>
        <div style="font-size:11.5px; color:var(--color-smoke); margin-top:3px;">
          📅 Tgl: <b>${formatDateShort(it.tanggal)}</b> · GR ${it.grade} · ${it.kg ? it.kg + 'kg' : '—'}
        </div>
        ${ketBadge}
      </div>
      <div style="display:flex; gap:4px; align-items:center;">
        ${it.tanggal !== '—' ? `<button class="draw-btn-ghost" style="font-size:10.5px; padding:4px 10px; min-height:28px;" onclick="jumpToDateAndHighlight('${it.tanggal}', ${it.no_gud}); closeMissingModal();">🔍 Buka</button>` : ''}
        <button class="draw-btn-ghost" style="font-size:10.5px; padding:4px 8px; min-height:28px; border-color:var(--color-out); color:var(--color-out);" onclick="removeMissingBarcode('${it.barkot}')" title="Hapus dari daftar">✕</button>
      </div>
    `;
    container.appendChild(itemEl);
  });

  modal.classList.add('open');
  modal.style.display = 'flex';
}

function closeMissingModal() {
  const modal = document.getElementById('missingModal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

// ==========================================
// CAMERA BARCODE SCANNER (Html5Qrcode 1D/2D)
// ==========================================
function getBarcodeFormats() {
  if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
    return [
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.CODE_93,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.QR_CODE
    ];
  }
  return undefined;
}

function getScannerQrBox(viewfinderWidth, viewfinderHeight) {
  const width = Math.floor(Math.min(viewfinderWidth * 0.92, 340));
  const height = Math.floor(Math.min(viewfinderHeight * 0.50, 160));
  return { width: Math.max(width, 220), height: Math.max(height, 100) };
}

async function startScanner() {
  const modal = document.getElementById('scannerModal');
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
  document.getElementById('scannerStatus').textContent = 'Memulai kamera...';
  document.getElementById('scannerResultBox').style.display = 'none';

  try {
    if (!html5QrScanner) {
      const formats = getBarcodeFormats();
      const config = {
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      };
      if (formats) config.formatsToSupport = formats;
      html5QrScanner = new Html5Qrcode('scannerReader', config);
    }

    const cameras = await Html5Qrcode.getCameras();
    if (cameras && cameras.length) {
      availableCameras = cameras;
      let backCam = cameras.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('belakang') || c.label.toLowerCase().includes('environment'));
      currentCameraId = backCam ? backCam.id : cameras[0].id;

      await html5QrScanner.start(
        currentCameraId,
        {
          fps: 15,
          qrbox: getScannerQrBox,
          aspectRatio: 1.333333
        },
        (decodedText) => onBarcodeDetected(decodedText),
        (errorMessage) => {}
      );
      document.getElementById('scannerStatus').textContent = 'Arahkan laser ke garis barcode...';
    } else {
      document.getElementById('scannerStatus').textContent = 'Kamera tidak ditemukan pada perangkat ini.';
    }
  } catch(err) {
    console.error('Camera err:', err);
    document.getElementById('scannerStatus').textContent = 'Gagal membuka kamera: ' + (err.message || 'Izin kamera ditolak');
  }
}

async function stopScanner() {
  if (html5QrScanner) {
    try {
      await html5QrScanner.stop();
    } catch(e) {}
  }
  const modal = document.getElementById('scannerModal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

function toggleTorch() {
  isTorchOn = !isTorchOn;
  try {
    if (html5QrScanner && html5QrScanner.applyVideoConstraints) {
      html5QrScanner.applyVideoConstraints({
        advanced: [{ torch: isTorchOn }]
      });
    }
    const btn = document.getElementById('torchBtn');
    if (btn) btn.textContent = isTorchOn ? '🔦 Matikan Senter' : '🔦 Nyalakan Senter';
  } catch(e) {
    showToast('Senter tidak didukung pada kamera ini');
  }
}

async function switchCamera() {
  if (availableCameras.length < 2) {
    showToast('Hanya 1 kamera yang terdeteksi');
    return;
  }
  const currentIndex = availableCameras.findIndex(c => c.id === currentCameraId);
  const nextIndex = (currentIndex + 1) % availableCameras.length;
  currentCameraId = availableCameras[nextIndex].id;

  if (html5QrScanner) {
    await html5QrScanner.stop();
    await html5QrScanner.start(
      currentCameraId,
      { fps: 15, qrbox: getScannerQrBox, aspectRatio: 1.333333 },
      (decodedText) => onBarcodeDetected(decodedText),
      () => {}
    );
    showToast('Kamera dialihkan');
  }
}

function extractCandidateBarcodes(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];

  const candidates = new Set();
  candidates.add(s);

  // 1. Bersihkan karakter non-alphanumeric
  const cleanAlnum = s.replace(/[^A-Za-z0-9]/g, '');
  candidates.add(cleanAlnum);

  // 2. Ambil digit di akhir string (misal: "26MDR034088" -> "034088" & "34088")
  const trailingMatch = cleanAlnum.match(/(\d{4,8})$/);
  if (trailingMatch) {
    const trailingDigits = trailingMatch[1];
    candidates.add(trailingDigits);
    const noLeadingZeros = trailingDigits.replace(/^0+/, '');
    if (noLeadingZeros.length >= 3) {
      candidates.add(noLeadingZeros);
    }
  }

  // 3. Ambil semua deretan angka 4-8 digit di manapun posisinya
  const allDigitSeqs = cleanAlnum.match(/\d{4,8}/g);
  if (allDigitSeqs) {
    allDigitSeqs.forEach(seq => {
      candidates.add(seq);
      const noZero = seq.replace(/^0+/, '');
      if (noZero.length >= 3) candidates.add(noZero);
    });
  }

  return Array.from(candidates);
}

function onBarcodeDetected(code) {
  const rawCode = String(code || '').trim();
  if (!rawCode) return;

  const candidates = extractCandidateBarcodes(rawCode);
  const seed = getSeedData();

  const matchesItem = (item) => {
    if (!item || !item.barkot) return false;
    const itemBarkot = String(item.barkot).trim();
    const itemBarkotNoZero = itemBarkot.replace(/^0+/, '');
    return candidates.some(c => 
      c === itemBarkot || 
      c === itemBarkotNoZero || 
      rawCode.includes(itemBarkot) ||
      (item.no_gud && c === String(item.no_gud).trim())
    );
  };

  // 1. Cari di tanggal aktif saat ini
  let matchedBal = state.list.find(matchesItem);
  const resultBox = document.getElementById('scannerResultBox');

  if (matchedBal) {
    document.getElementById('scanFoundNoGud').textContent = `NO GUD ${matchedBal.no_gud}`;
    document.getElementById('scanFoundBarkot').textContent = `Barkot: ${matchedBal.barkot}`;
    document.getElementById('scanFoundMeta').textContent = `GRADE ${matchedBal.grade || '—'} · ${matchedBal.kg ? matchedBal.kg + ' KG' : '—'}`;
    resultBox.style.display = 'block';

    state.doneMap[matchedBal.no_gud] = true;
    matchedBal.is_done = true;
    saveLocalState();
    syncLocalItemToCloud(matchedBal, true);
    render();
    playBeep(987, 'sine', 0.15);
    triggerHaptic('success');
    showToast(`✓ NO GUD ${matchedBal.no_gud} (#${matchedBal.barkot}) DITANDAI SELESAI!`);
  } else {
    // 2. Cari di tanggal lain
    let foundOther = null;
    for (const tgl of Object.keys(seed)) {
      const it = (seed[tgl] || []).find(matchesItem);
      if (it) {
        foundOther = { ...it, tanggal: tgl };
        break;
      }
    }

    if (foundOther) {
      document.getElementById('scanFoundNoGud').textContent = `NO GUD ${foundOther.no_gud} (Tgl ${formatDateShort(foundOther.tanggal)})`;
      document.getElementById('scanFoundBarkot').textContent = `Barkot: ${foundOther.barkot}`;
      document.getElementById('scanFoundMeta').textContent = `GRADE ${foundOther.grade || '—'} · ${foundOther.kg ? foundOther.kg + ' KG' : '—'} (Klik untuk buka)`;
      resultBox.style.display = 'block';
      resultBox.style.cursor = 'pointer';
      resultBox.onclick = () => {
        jumpToDateAndHighlight(foundOther.tanggal, foundOther.no_gud);
        stopScanner();
      };

      // Tandai juga bal tersebut selesai di storage tanggal asalnya & cloud
      try {
        const key = 'barkot_local:' + foundOther.tanggal;
        const raw = localStorage.getItem(key);
        const st = raw ? JSON.parse(raw) : { list: (seed[foundOther.tanggal] || []), doneMap: {} };
        if (!st.doneMap) st.doneMap = {};
        st.doneMap[foundOther.no_gud] = true;
        localStorage.setItem(key, JSON.stringify(st));
      } catch(e) {}

      if (supabaseClient) {
        syncLocalItemToCloud(foundOther, true);
      }

      playBeep(600, 'sine', 0.15);
      triggerHaptic('tap');
      showToast(`Barkot #${foundOther.barkot} ditemukan pada data ${formatDateShort(foundOther.tanggal)} (No Gud ${foundOther.no_gud})`);
    } else {
      const displayCode = candidates.find(c => /^\d{4,6}$/.test(c)) || rawCode;
      document.getElementById('scanFoundNoGud').textContent = `BARCODE: ${displayCode}`;
      document.getElementById('scanFoundBarkot').textContent = 'TIDAK DITEMUKAN DI DATASET';
      document.getElementById('scanFoundMeta').textContent = `Hasil Pindai Fisik: ${rawCode}`;
      resultBox.style.display = 'block';
      resultBox.style.cursor = 'default';
      resultBox.onclick = null;
      playBeep(260, 'sawtooth', 0.25);
      triggerHaptic('error');
    }
  }
}

function handleQuickScannerInput(val) {
  const clean = (val || '').trim();
  if (clean.length >= 4) {
    onBarcodeDetected(clean);
  }
}

// ==========================================
// SUPABASE CLOUD SYNC & REALTIME
// ==========================================
function initSupabase() {
  if (typeof supabase !== 'undefined') {
    try {
      supabaseClient = supabase.createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);
      updateCloudStatusUI('Online');
      setupRealtime();
      fetchAllDoneFromCloud();
      fetchMissingListFromCloud();
    } catch(e) {
      console.warn('Supabase init error:', e);
      updateCloudStatusUI('Offline');
    }
  } else {
    updateCloudStatusUI('Offline');
  }
}

async function fetchMissingListFromCloud() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('barkot_settings')
      .select('value')
      .eq('key', 'missing_barcodes')
      .single();
    
    if (!error && data && Array.isArray(data.value)) {
      const cleanList = data.value.map(x => String(x).trim()).filter(Boolean);
      localStorage.setItem('barkot_missing_list_v2', JSON.stringify(cleanList));
      updateMissingBannerUI();
      loadDataForCurrentDate();
    }
  } catch(e) {
    console.warn('fetchMissingListFromCloud err:', e);
  }
}

async function fetchAllDoneFromCloud() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('barkot_data')
      .select('tanggal, no_gud, grade, barkot, kg, is_done');
    
    if (!error && data && data.length > 0) {
      const seed = getSeedData();
      data.forEach(row => {
        const tgl = row.tanggal;
        const no_gud = row.no_gud;
        const isDone = Boolean(row.is_done);

        if (seed[tgl]) {
          const it = seed[tgl].find(x => x.no_gud === no_gud);
          if (it) {
            it.is_done = isDone;
            if (row.barkot !== undefined && row.barkot !== null && row.barkot !== '') it.barkot = row.barkot;
            if (row.grade) it.grade = row.grade;
            if (row.kg !== undefined && row.kg !== null) it.kg = row.kg;
          }
        }

        if (isDone) {
          try {
            const key = 'barkot_local:' + tgl;
            const raw = localStorage.getItem(key);
            const st = raw ? JSON.parse(raw) : { list: (seed[tgl] || []), doneMap: {} };
            if (!st.doneMap) st.doneMap = {};
            st.doneMap[no_gud] = true;
            localStorage.setItem(key, JSON.stringify(st));
          } catch(e) {}
        }
      });

      updateMissingBannerUI();
      loadDataForCurrentDate();
    }
  } catch(err) {
    console.warn('Supabase fetch all done error:', err);
  }
}

function updateCloudStatusUI(status) {
  const text = document.getElementById('cloudStatusText');
  if (text) {
    text.textContent = status;
    text.style.color = status === 'Online' ? '#16a34a' : 'var(--color-smoke)';
  }
}

async function syncLocalItemToCloud(item, isDone) {
  if (!supabaseClient || !item) return;
  try {
    await supabaseClient
      .from('barkot_data')
      .upsert({
        tanggal: item.tanggal || currentDate,
        no_gud: item.no_gud,
        grade: item.grade,
        barkot: item.barkot || null,
        kg: item.kg !== undefined && item.kg !== null ? item.kg : null,
        is_done: Boolean(isDone),
        done_at: isDone ? new Date().toISOString() : null
      }, { onConflict: 'tanggal,no_gud' });
  } catch(e) {
    console.warn('Supabase sync item err:', e);
  }
}

async function syncAllLocalToCloud() {
  if (!supabaseClient) {
    showToast('Cloud tidak terhubung');
    return;
  }
  if (!state.list || state.list.length === 0) {
    showToast('Tidak ada data bal untuk disinkronkan');
    return;
  }

  showToast('Mengunggah data ke Cloud...');
  const payload = state.list.map(it => {
    const isDone = Boolean(state.doneMap[it.no_gud]);
    return {
      tanggal: currentDate,
      no_gud: it.no_gud,
      grade: it.grade,
      barkot: it.barkot || null,
      kg: it.kg !== undefined && it.kg !== null ? it.kg : null,
      is_done: isDone,
      done_at: isDone ? (it.done_at || new Date().toISOString()) : null
    };
  });

  try {
    const { error } = await supabaseClient
      .from('barkot_data')
      .upsert(payload, { onConflict: 'tanggal,no_gud' });

    if (!error) {
      showToast('✓ Berhasil sinkron ke Cloud Supabase!');
    } else {
      showToast('Gagal sinkron ke Cloud: ' + error.message);
    }
  } catch(e) {
    showToast('Error Cloud: ' + e.message);
  }
}

function setupRealtime() {
  if (!supabaseClient) return;
  try {
    realtimeChannel = supabaseClient
      .channel('barkot_data_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barkot_data' }, payload => {
        if (payload.new) {
          const tgl = payload.new.tanggal;
          const no_gud = payload.new.no_gud;
          const isDone = Boolean(payload.new.is_done);

          // Update dataset in-memory
          const seed = getSeedData();
          if (seed[tgl]) {
            const it = seed[tgl].find(x => x.no_gud === no_gud);
            if (it) {
              it.is_done = isDone;
              if (payload.new.barkot !== undefined && payload.new.barkot !== null) it.barkot = payload.new.barkot;
            }
          }

          // Update storage tanggal tersebut
          try {
            const key = 'barkot_local:' + tgl;
            const raw = localStorage.getItem(key);
            const st = raw ? JSON.parse(raw) : { list: (seed[tgl] || []), doneMap: {} };
            if (!st.doneMap) st.doneMap = {};
            if (isDone) {
              st.doneMap[no_gud] = true;
            } else {
              delete st.doneMap[no_gud];
            }
            localStorage.setItem(key, JSON.stringify(st));
          } catch(e) {}

          // Update jika sedang melihat tanggal tersebut
          if (tgl === currentDate) {
            if (isDone) {
              state.doneMap[no_gud] = true;
            } else {
              delete state.doneMap[no_gud];
            }
            const curIt = state.list.find(x => x.no_gud === no_gud);
            if (curIt) curIt.is_done = isDone;
            saveLocalState();
            render();
          }

          // Selalu update UI banner & modal
          updateMissingBannerUI();
          const modal = document.getElementById('missingModal');
          if (modal && (modal.classList.contains('open') || modal.style.display === 'flex')) {
            openMissingModal();
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barkot_settings' }, payload => {
        if (payload.new && payload.new.key === 'missing_barcodes' && Array.isArray(payload.new.value)) {
          const cleanList = payload.new.value.map(x => String(x).trim()).filter(Boolean);
          localStorage.setItem('barkot_missing_list_v2', JSON.stringify(cleanList));
          updateMissingBannerUI();
          loadDataForCurrentDate();
          const modal = document.getElementById('missingModal');
          if (modal && (modal.classList.contains('open') || modal.style.display === 'flex')) {
            openMissingModal();
          }
        }
      })
      .subscribe();
  } catch(e) {}
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

// ==========================================
// INITIALIZATION
// ==========================================
function initApp() {
  const picker = document.getElementById('datePicker');
  if (picker) picker.value = currentDate;
  const label = document.getElementById('dateDisplayLabel');
  if (label) label.textContent = formatDateIndo(currentDate);

  initFontSize();
  initLockMode();
  initSupabase();
  renderQuickDates();
  loadDataForCurrentDate();

  // Close modals when clicking backdrop overlay
  document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('modal-overlay')) {
      if (e.target.id === 'scannerModal') {
        stopScanner();
      } else {
        e.target.classList.remove('open');
        e.target.style.display = 'none';
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
