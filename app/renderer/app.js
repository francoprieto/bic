'use strict';

// ─── Estado ───────────────────────────────────────────────────────────────────
let allFiles     = [];
let selectedIds  = new Set();
let profiles     = {};
let currentProfile = 'default';
let appConfig    = {};
let isLocalMode  = false;

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initDarkMode();
  initPosButtons();
  await loadConfig();
  initProfileUI();
  initSignPanel();
  initConfigPanel();
  bindBicEvents();
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`panel-${tab}`).classList.remove('hidden');
    });
  });

  // Estilos de tabs
  const style = document.createElement('style');
  style.textContent = `
    .tab-btn { color: #6b7280; background: #f3f4f6; }
    .tab-btn.active { color: #1d4ed8; background: white; border-bottom: 2px solid #1d4ed8; }
    .dark .tab-btn { color: #9ca3af; background: #1f2937; }
    .dark .tab-btn.active { color: #60a5fa; background: #111827; border-bottom-color: #60a5fa; }
    .pos-btn { color: #374151; background: #f9fafb; border-color: #d1d5db; }
    .pos-btn:hover { background: #e5e7eb; }
    .pos-btn.active-pos { background: #1d4ed8; color: white; border-color: #1d4ed8; }
    .dark .pos-btn { color: #d1d5db; background: #374151; border-color: #4b5563; }
    .dark .pos-btn.active-pos { background: #2563eb; border-color: #2563eb; }
  `;
  document.head.appendChild(style);
}

// ─── Dark mode ────────────────────────────────────────────────────────────────
function initDarkMode() {
  const btn  = document.getElementById('toggleDark');
  const icon = document.getElementById('darkIcon');
  const dark = localStorage.getItem('darkMode') === 'true';
  if (dark) { document.documentElement.classList.add('dark'); icon.textContent = '☀️'; }

  btn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    icon.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('darkMode', isDark);
  });
}

// ─── Posición de firma ────────────────────────────────────────────────────────
function initPosButtons() {
  document.querySelectorAll('.pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active-pos'));
      btn.classList.add('active-pos');
    });
  });
}

// ─── Cargar configuración ─────────────────────────────────────────────────────
async function loadConfig() {
  const data = await window.bic.getConfig();
  appConfig  = data.config  || {};
  profiles   = data.profiles || { default: { name: 'Por defecto', isDefault: true, config: null } };
  currentProfile = data.currentProfile || 'default';
  applyConfigToUI(getEffectiveConfig());
}

function getEffectiveConfig() {
  const profile = profiles[currentProfile];
  return (profile && profile.config) ? profile.config : appConfig;
}

function applyConfigToUI(cfg) {
  if (!cfg) return;
  setVal('alto',  cfg.alto  || '40');
  setVal('ancho', cfg.ancho || '160');
  setVal('mt',    cfg.mt    || '50');
  setVal('mb',    cfg.mb    || '50');
  setVal('ml',    cfg.ml    || '50');
  setVal('mr',    cfg.mr    || '50');
  setVal('directorio', cfg.directorio || '');
  setVal('pagina', cfg.pagina || 'primera');

  // Posición activa
  document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active-pos'));
  const posBtn = document.querySelector(`.pos-btn[data-pos="${cfg.posicion || 'centro-inferior'}"]`);
  if (posBtn) posBtn.classList.add('active-pos');

  // Página específica
  toggleNumeroPagina(cfg.pagina === 'np');
}

function readConfigFromUI() {
  const posBtn = document.querySelector('.pos-btn.active-pos');
  return {
    posicion:     posBtn ? posBtn.dataset.pos : 'centro-inferior',
    pagina:       getVal('pagina'),
    numeroPagina: getVal('numeroPagina'),
    alto:         getVal('alto'),
    ancho:        getVal('ancho'),
    mt:           getVal('mt'),
    mb:           getVal('mb'),
    ml:           getVal('ml'),
    mr:           getVal('mr'),
    directorio:   getVal('directorio'),
  };
}

// ─── Perfiles ─────────────────────────────────────────────────────────────────
function initProfileUI() {
  const select = document.getElementById('profileSelect');
  renderProfileSelect(select);

  select.addEventListener('change', () => {
    currentProfile = select.value;
    applyConfigToUI(getEffectiveConfig());
    const profile = profiles[currentProfile];
    setVal('profileName', profile ? profile.name : '');
  });

  document.getElementById('newProfileBtn').addEventListener('click', () => {
    const name = prompt('Nombre del nuevo perfil:');
    if (!name) return;
    const id = 'profile-' + Date.now();
    profiles[id] = { name, isDefault: false, config: readConfigFromUI() };
    currentProfile = id;
    saveProfiles();
    renderProfileSelect(select);
    select.value = id;
  });

  document.getElementById('delProfileBtn').addEventListener('click', () => {
    if (profiles[currentProfile]?.isDefault) return alert('No se puede eliminar el perfil por defecto');
    if (!confirm('¿Eliminar este perfil?')) return;
    delete profiles[currentProfile];
    currentProfile = 'default';
    saveProfiles();
    renderProfileSelect(select);
  });
}

function renderProfileSelect(select) {
  select.innerHTML = '';
  for (const [id, p] of Object.entries(profiles)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = p.name;
    if (id === currentProfile) opt.selected = true;
    select.appendChild(opt);
  }
}

async function saveProfiles() {
  await window.bic.saveProfiles(profiles);
}

// ─── Panel de firma ───────────────────────────────────────────────────────────
function initSignPanel() {
  const signBtn    = document.getElementById('signBtn');
  const selectAll  = document.getElementById('selectAll');
  const openBtn    = document.getElementById('openFilesBtn');
  const resetBtn   = document.getElementById('resetBtn');
  const useCert    = document.getElementById('useCert');
  const passwordEl = document.getElementById('password');

  useCert.addEventListener('change', () => {
    passwordEl.disabled = useCert.checked;
    if (useCert.checked) passwordEl.value = '';
  });

  openBtn.addEventListener('click', async () => {
    const paths = await window.bic.selectFiles();
    if (!paths.length) return;
    const newFiles = paths.map(p => ({
      id:     p,
      nombre: p.split('/').pop().split('\\').pop(),
      local:  p,
    }));
    allFiles = [...allFiles, ...newFiles];
    renderFileList();
    updateSignBtn();
  });

  resetBtn.addEventListener('click', () => {
    allFiles = [];
    selectedIds.clear();
    renderFileList();
    updateSignBtn();
    clearMsg();
    window.bic.reset();
  });

  selectAll.addEventListener('change', () => {
    if (selectAll.checked) {
      allFiles.forEach(f => selectedIds.add(f.id));
    } else {
      selectedIds.clear();
    }
    renderFileList();
    updateSignBtn();
  });

  signBtn.addEventListener('click', async () => {
    const filesToSign = allFiles.filter(f => selectedIds.has(f.id));
    if (!filesToSign.length) return;

    const pin        = useCert.checked ? null : passwordEl.value;
    const certSource = useCert.checked ? detectCertSource() : 'pkcs11';
    const config     = getEffectiveConfig();

    setSigningState(true);
    clearMsg();

    window.bic.sign({
      files:      filesToSign,
      pin,
      certSource,
      certAlias:  null,
      certFile:   null,
      config,
    });
  });
}

function detectCertSource() {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('win'))   return 'windows-store';
  if (platform.includes('mac'))   return 'nss';
  return 'nss';
}

function renderFileList() {
  const list = document.getElementById('fileList');
  list.innerHTML = '';

  if (!allFiles.length) {
    list.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Sin archivos. Abre PDFs o espera una solicitud web.</p>';
    return;
  }

  allFiles.forEach(f => {
    const checked = selectedIds.has(f.id);
    const row = document.createElement('label');
    row.className = 'flex items-center gap-2 p-2 rounded-lg cursor-pointer ' +
      'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700';
    row.innerHTML = `
      <input type="checkbox" class="file-check rounded" data-id="${f.id}" ${checked ? 'checked' : ''}>
      <span class="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">${f.nombre}</span>
      <span class="text-xs text-gray-400">${f.local ? '📁' : '🌐'}</span>
    `;
    row.querySelector('.file-check').addEventListener('change', e => {
      if (e.target.checked) selectedIds.add(f.id);
      else selectedIds.delete(f.id);
      updateSignBtn();
      updateSelectAll();
    });
    list.appendChild(row);
  });
}

function updateSignBtn() {
  document.getElementById('signBtn').disabled = selectedIds.size === 0;
}

function updateSelectAll() {
  const cb = document.getElementById('selectAll');
  cb.indeterminate = selectedIds.size > 0 && selectedIds.size < allFiles.length;
  cb.checked = allFiles.length > 0 && selectedIds.size === allFiles.length;
}

function setSigningState(signing) {
  document.getElementById('signBtn').disabled = signing;
  const spinner = document.getElementById('spinner');
  if (signing) spinner.classList.replace('hidden', 'flex');
  else         spinner.classList.replace('flex', 'hidden');
}

function showMsg(text, type = 'info') {
  const el = document.getElementById('signMsg');
  el.className = 'mb-3 p-3 rounded-lg text-sm ' + (
    type === 'error'   ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
    type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                         'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  );
  el.textContent = text;
  el.classList.remove('hidden');
}

function clearMsg() {
  document.getElementById('signMsg').classList.add('hidden');
}

// ─── Panel de configuración ───────────────────────────────────────────────────
function initConfigPanel() {
  document.getElementById('pagina').addEventListener('change', e => {
    toggleNumeroPagina(e.target.value === 'np');
  });

  document.getElementById('saveConfigBtn').addEventListener('click', async () => {
    const cfg = readConfigFromUI();
    if (profiles[currentProfile]) {
      profiles[currentProfile].config = cfg;
      await saveProfiles();
    }
    appConfig = cfg;
    await window.bic.saveConfig(cfg);
    showMsg('Configuración guardada', 'success');
    setTimeout(clearMsg, 2000);
  });

  // Imagen de firma
  document.getElementById('uploadSigBtn').addEventListener('click', () => {
    document.getElementById('sigInput').click();
  });

  document.getElementById('sigInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const ext = file.name.split('.').pop();
    const savedPath = await window.bic.saveSignatureImage(Array.from(new Uint8Array(buf)), ext, currentProfile);
    loadSigPreview(currentProfile);
  });

  document.getElementById('clearSigBtn').addEventListener('click', () => {
    document.getElementById('sigPreview').classList.add('hidden');
  });

  loadSigPreview(currentProfile);
}

async function loadSigPreview(profileId) {
  const b64 = await window.bic.getSignatureImage(profileId);
  const preview = document.getElementById('sigPreview');
  if (b64) {
    preview.src = 'data:image/png;base64,' + b64;
    preview.classList.remove('hidden');
  } else {
    preview.classList.add('hidden');
  }
}

function toggleNumeroPagina(show) {
  const el = document.getElementById('numeroPagina');
  el.classList.toggle('hidden', !show);
}

// ─── Eventos desde main process ───────────────────────────────────────────────
function bindBicEvents() {
  // Avisar al main que el renderer está listo para recibir archivos
  window.bic.rendererReady();

  window.bic.onModeLocal(() => {
    isLocalMode = true;
    document.getElementById('openFilesBtn').classList.remove('hidden');
    // Mostrar botón de prueba en modo local (desarrollo)
    const testBtn = document.getElementById('testBtn');
    if (testBtn) {
      testBtn.style.display = 'inline-block';
      testBtn.addEventListener('click', () => {
        const testFiles = [
          { id: 'test-1', nombre: 'A4-test-1.pdf',      url: 'http://127.0.0.1:3100/test/A4-test-1.pdf' },
          { id: 'test-2', nombre: 'oficio-test-2.pdf',  url: 'http://127.0.0.1:3100/test/oficio-test-2.pdf' },
          { id: 'test-3', nombre: 'carta-test-3.pdf',   url: 'http://127.0.0.1:3100/test/carta-test-3.pdf' },
        ];
        // Simular recibir set-files
        allFiles = testFiles;
        selectedIds = new Set(testFiles.map(f => f.id));
        renderFileList();
        updateSignBtn();
        updateSelectAll();
        addLog('🧪 Archivos de prueba cargados (modo dev)');
      });
    }
  });

  window.bic.onSetFiles(files => {
    console.log('[RENDERER] set-files recibido:', files.length, 'archivos');
    allFiles = files;
    selectedIds = new Set(files.map(f => f.id));
    renderFileList();
    updateSignBtn();
    updateSelectAll();
    document.getElementById('openFilesBtn').classList.add('hidden');
    // Cambiar a tab de firma
    document.querySelector('[data-tab="sign"]').click();
    // Log visible
    addLog(`📥 ${files.length} archivo(s) recibidos via protocolo bic://`);
  });

  window.bic.onSignProgress(msg => {
    document.getElementById('progressText').textContent = msg;
  });

  window.bic.onSignResult(result => {
    setSigningState(false);
    if (result.success) {
      showMsg('✓ ' + result.message, 'success');
      addLog('✓ ' + result.message);
    } else {
      showMsg('✗ ' + result.message, 'error');
      addLog('✗ ' + result.message);
    }
  });
}

// ─── Log ──────────────────────────────────────────────────────────────────────
function addLog(msg) {
  const el = document.getElementById('logContent');
  const line = document.createElement('div');
  const ts = new Date().toLocaleTimeString();
  line.className = 'text-gray-700 dark:text-gray-300';
  line.textContent = `[${ts}] ${msg}`;
  el.prepend(line);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getVal(id) { return document.getElementById(id)?.value || ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
