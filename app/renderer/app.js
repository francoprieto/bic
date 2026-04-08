'use strict';

// ─── Estado global ────────────────────────────────────────────────────────────
let allFiles       = [];
let selectedIds    = new Set();
let profiles       = {};          // { [id]: { name, isDefault, config } }
let currentProfile = 'default';
let isLocalMode    = false;
let selectedCertPath = null;

const DEFAULT_CONFIG = {
  posicion: 'centro-inferior', pagina: 'primera', numeroPagina: '',
  alto: '40', ancho: '160', mt: '50', mb: '50', ml: '50', mr: '50',
  directorio: '',
};

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initDarkMode();
  initPosButtons();
  await loadState();
  initProfileUI();
  initConfigPanel();
  initSignPanel();
  bindBicEvents();
});

// ─── Cargar estado desde disco ────────────────────────────────────────────────
async function loadState() {
  const state    = await window.bic.getState();
  profiles       = state.profiles || {};
  currentProfile = state.currentProfile || 'default';

  // Garantía: siempre debe existir el perfil default
  if (!profiles.default) {
    profiles.default = { name: 'Por defecto', isDefault: true, config: { ...DEFAULT_CONFIG } };
  }
  if (!profiles[currentProfile]) currentProfile = 'default';

  applyConfigToUI(getEffectiveConfig());
}

// Devuelve la config del perfil activo (nunca null)
function getEffectiveConfig() {
  const p = profiles[currentProfile];
  return (p && p.config) ? p.config : { ...DEFAULT_CONFIG };
}

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
  if (localStorage.getItem('darkMode') === 'true') {
    document.documentElement.classList.add('dark');
    icon.textContent = '☀️';
  }
  btn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    icon.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('darkMode', isDark);
  });
}

// ─── Botones de posición ──────────────────────────────────────────────────────
function initPosButtons() {
  document.querySelectorAll('.pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active-pos'));
      btn.classList.add('active-pos');
    });
  });
}

// ─── Aplicar / leer config de la UI ──────────────────────────────────────────
function applyConfigToUI(cfg) {
  if (!cfg) cfg = { ...DEFAULT_CONFIG };
  setVal('alto',        cfg.alto        || '40');
  setVal('ancho',       cfg.ancho       || '160');
  setVal('mt',          cfg.mt          || '50');
  setVal('mb',          cfg.mb          || '50');
  setVal('ml',          cfg.ml          || '50');
  setVal('mr',          cfg.mr          || '50');
  setVal('directorio',  cfg.directorio  || '');

  // Restaurar último certificado seleccionado
  selectedCertPath = cfg.lastCertPath || null;
  const certFileName = document.getElementById('certFileName');
  if (certFileName) {
    certFileName.textContent = selectedCertPath
      ? selectedCertPath.split('/').pop().split('\\').pop()
      : 'Sin certificado seleccionado';
  }

  setVal('pagina',      cfg.pagina      || 'primera');
  toggleNumeroPagina(cfg.pagina === 'np');

  document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active-pos'));
  const posBtn = document.querySelector(`.pos-btn[data-pos="${cfg.posicion || 'centro-inferior'}"]`);
  if (posBtn) posBtn.classList.add('active-pos');
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
    lastCertPath: selectedCertPath || '',
  };
}

// ─── Perfiles ─────────────────────────────────────────────────────────────────

function mostrarMensaje(titulo, texto) {
  return new Promise(resolve => {
    const modal = document.getElementById('modal-mensaje');
    document.getElementById('modal-mensaje-titulo').textContent = titulo;
    document.getElementById('modal-mensaje-texto').textContent  = texto;
    modal.classList.remove('hidden');
    const btn = document.getElementById('btn-cerrar-mensaje');
    const cerrar = () => { modal.classList.add('hidden'); btn.removeEventListener('click', cerrar); resolve(); };
    btn.addEventListener('click', cerrar);
  });
}

function solicitarNombre() {
  return new Promise(resolve => {
    const modal     = document.getElementById('modal-nuevo-perfil');
    const input     = document.getElementById('input-nombre-perfil');
    const btnOk     = document.getElementById('btn-confirmar-perfil');
    const btnCancel = document.getElementById('btn-cancelar-perfil');
    input.value = '';
    modal.classList.remove('hidden');
    input.focus();
    const confirmar = () => { const n = input.value.trim(); modal.classList.add('hidden'); cleanup(); resolve(n || null); };
    const cancelar  = () => { modal.classList.add('hidden'); cleanup(); resolve(null); };
    const onEnter   = e => { if (e.key === 'Enter') confirmar(); };
    const cleanup   = () => { btnOk.removeEventListener('click', confirmar); btnCancel.removeEventListener('click', cancelar); input.removeEventListener('keypress', onEnter); };
    btnOk.addEventListener('click', confirmar);
    btnCancel.addEventListener('click', cancelar);
    input.addEventListener('keypress', onEnter);
  });
}

function confirmarAccion(texto) {
  return new Promise(resolve => {
    const modal     = document.getElementById('modal-confirmar');
    document.getElementById('modal-confirmar-texto').textContent = texto;
    modal.classList.remove('hidden');
    const btnOk     = document.getElementById('btn-aceptar-confirmar');
    const btnCancel = document.getElementById('btn-cancelar-confirmar');
    const aceptar  = () => { modal.classList.add('hidden'); cleanup(); resolve(true); };
    const cancelar = () => { modal.classList.add('hidden'); cleanup(); resolve(false); };
    const cleanup  = () => { btnOk.removeEventListener('click', aceptar); btnCancel.removeEventListener('click', cancelar); };
    btnOk.addEventListener('click', aceptar);
    btnCancel.addEventListener('click', cancelar);
  });
}

function initProfileUI() {
  const headerSelect = document.getElementById('profileSelect');
  renderProfileSelect(headerSelect);

  // Cambiar perfil desde el header
  headerSelect.addEventListener('change', () => switchProfile(headerSelect.value));

  // + Nuevo
  document.getElementById('newProfileBtn').addEventListener('click', async () => {
    const nombre = await solicitarNombre();
    if (!nombre) return;
    const id = await window.bic.createProfile(nombre);
    profiles[id] = { name: nombre, isDefault: false, config: { ...DEFAULT_CONFIG } };
    currentProfile = id;
    renderProfileSelect(headerSelect);
    applyConfigToUI(getEffectiveConfig());
    loadSigPreview(id);
    await mostrarMensaje('Perfil creado', `El perfil "${nombre}" fue creado exitosamente.`);
  });

  // 💾 Guardar
  document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const cfg = readConfigFromUI();
    profiles[currentProfile].config = cfg;
    await window.bic.saveProfileConfig(currentProfile, cfg);
    loadSigPreview(currentProfile);
    await mostrarMensaje('Guardado', `Configuración guardada en "${profiles[currentProfile]?.name}".`);
  });

  // 🗑️ Eliminar
  document.getElementById('delProfileBtn').addEventListener('click', async () => {
    if (profiles[currentProfile]?.isDefault) {
      await mostrarMensaje('No permitido', 'El perfil "Por defecto" no se puede eliminar.');
      return;
    }
    const nombre = profiles[currentProfile]?.name || currentProfile;
    const ok = await confirmarAccion(`¿Está seguro de eliminar el perfil "${nombre}"?`);
    if (!ok) return;
    await window.bic.deleteProfile(currentProfile);
    delete profiles[currentProfile];
    currentProfile = 'default';
    renderProfileSelect(headerSelect);
    applyConfigToUI(getEffectiveConfig());
    loadSigPreview('default');
    await mostrarMensaje('Eliminado', `El perfil "${nombre}" fue eliminado.`);
  });
}

function renderProfileSelect(select) {
  const prev = select.value;
  select.innerHTML = '';
  const sorted = Object.entries(profiles).sort(([, a], [, b]) => {
    if (a.isDefault) return -1;
    if (b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });
  for (const [id, p] of sorted) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = p.name;
    select.appendChild(opt);
  }
  select.value = profiles[prev] ? prev : currentProfile;
}

async function switchProfile(id) {
  if (!profiles[id]) return;
  currentProfile = id;
  await window.bic.setCurrentProfile(id);
  applyConfigToUI(getEffectiveConfig());
  loadSigPreview(id);
}

// ─── Panel de configuración ───────────────────────────────────────────────────
function initConfigPanel() {
  document.getElementById('pagina').addEventListener('change', e => {
    toggleNumeroPagina(e.target.value === 'np');
  });

  // Imagen de firma
  document.getElementById('uploadSigBtn').addEventListener('click', () => {
    document.getElementById('sigInput').click();
  });

  document.getElementById('sigInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const ext = file.name.split('.').pop().toLowerCase();
    await window.bic.saveSignatureImage(Array.from(new Uint8Array(buf)), ext, currentProfile);
    e.target.value = ''; // reset input para permitir re-subir el mismo archivo
    loadSigPreview(currentProfile);
  });

  document.getElementById('clearSigBtn').addEventListener('click', async () => {
    await window.bic.deleteSignatureImage(currentProfile);
    loadSigPreview(currentProfile);
  });

  document.getElementById('selectDirBtn').addEventListener('click', async () => {
    const dir = await window.bic.selectDirectory();
    if (dir) document.getElementById('directorio').value = dir;
  });

  loadSigPreview(currentProfile);
}

async function loadSigPreview(profileId) {
  const b64         = await window.bic.getSignatureImage(profileId);
  const preview     = document.getElementById('sigPreview');
  const placeholder = document.getElementById('sigPlaceholder');
  if (b64) {
    preview.src = 'data:image/png;base64,' + b64;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }
}

// ─── Panel de firma ───────────────────────────────────────────────────────────
function initSignPanel() {
  const useCert       = document.getElementById('useCert');
  const passwordEl    = document.getElementById('password');
  const passwordLabel = document.getElementById('passwordLabel');
  const certPanel     = document.getElementById('certPanel');
  const selectCertBtn = document.getElementById('selectCertBtn');
  const certFileName  = document.getElementById('certFileName');

  useCert.addEventListener('change', () => {
    const checked = useCert.checked;
    certPanel.classList.toggle('hidden', !checked);
    if (checked) {
      passwordLabel.textContent    = 'Contraseña:';
      passwordEl.placeholder       = 'Contraseña del certificado';
    } else {
      passwordLabel.textContent    = 'PIN token:';
      passwordEl.placeholder       = 'PIN del token';
    }
  });

  selectCertBtn.addEventListener('click', async () => {
    const p = await window.bic.selectCert();
    if (!p) return;
    selectedCertPath = p;
    certFileName.textContent = p.split('/').pop().split('\\').pop();
    // Persistir la ruta del certificado en la config del perfil
    const cfg = readConfigFromUI();
    profiles[currentProfile].config = cfg;
    await window.bic.saveProfileConfig(currentProfile, cfg);
  });

  document.getElementById('openFilesBtn').addEventListener('click', async () => {
    const paths = await window.bic.selectFiles();
    if (!paths.length) return;
    const newFiles = paths.map(p => ({
      id: p, nombre: p.split('/').pop().split('\\').pop(), local: p,
    }));
    allFiles = [...allFiles, ...newFiles];
    renderFileList();
    updateSignBtn();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    allFiles = [];
    selectedIds.clear();
    renderFileList();
    updateSignBtn();
    clearMsg();
    const links = document.getElementById('signedLinks');
    if (links) { links.innerHTML = ''; links.classList.add('hidden'); }
    window.bic.reset();
  });

  document.getElementById('selectAll').addEventListener('change', e => {
    if (e.target.checked) allFiles.forEach(f => selectedIds.add(f.id));
    else selectedIds.clear();
    renderFileList();
    updateSignBtn();
  });

  document.getElementById('signBtn').addEventListener('click', () => {
    const filesToSign = allFiles.filter(f => selectedIds.has(f.id));
    if (!filesToSign.length) return;

    let pin, certSource, certFile;
    if (useCert.checked) {
      if (!selectedCertPath) { showMsg('Seleccioná un archivo .p12 primero', 'error'); return; }
      if (!passwordEl.value.trim()) {
        passwordEl.focus();
        passwordEl.classList.add('ring-2', 'ring-red-500', 'border-red-500');
        showMsg('Ingresá la contraseña del certificado', 'error');
        return;
      }
      certSource = 'pkcs12';
      certFile   = selectedCertPath;
      pin        = passwordEl.value;
    } else {
      if (!passwordEl.value.trim()) {
        passwordEl.focus();
        passwordEl.classList.add('ring-2', 'ring-red-500', 'border-red-500');
        showMsg('Ingresá el PIN del token', 'error');
        return;
      }
      certSource = 'pkcs11';
      certFile   = null;
      pin        = passwordEl.value;
    }

    setSigningState(true);
    clearMsg();
    window.bic.sign({ files: filesToSign, pin, certSource, certAlias: null, certFile, config: getEffectiveConfig(), profileId: currentProfile });
  });

  // Quitar el borde rojo al empezar a escribir
  passwordEl.addEventListener('input', () => {
    passwordEl.classList.remove('ring-2', 'ring-red-500', 'border-red-500');
  });
}

function renderFileList() {
  const list = document.getElementById('fileList');
  list.innerHTML = '';
  if (!allFiles.length) {
    list.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Sin archivos. Abre PDFs o espera una solicitud web.</p>';
    return;
  }
  allFiles.forEach(f => {
    const row = document.createElement('label');
    row.className = 'flex items-center gap-2 p-2 rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700';
    row.dataset.id = f.id;
    row.innerHTML = `
      <input type="checkbox" class="file-check rounded" data-id="${f.id}" ${selectedIds.has(f.id) ? 'checked' : ''}>
      <span class="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">${f.nombre}</span>
      <span class="text-xs text-gray-400">${f.local ? '📁' : '🌐'}</span>
    `;
    row.querySelector('.file-check').addEventListener('change', e => {
      if (e.target.checked) selectedIds.add(f.id); else selectedIds.delete(f.id);
      updateSignBtn();
      updateSelectAll();
    });
    list.appendChild(row);
  });
}

function updateSignBtn()  { document.getElementById('signBtn').disabled = selectedIds.size === 0; }
function updateSelectAll() {
  const cb = document.getElementById('selectAll');
  cb.indeterminate = selectedIds.size > 0 && selectedIds.size < allFiles.length;
  cb.checked = allFiles.length > 0 && selectedIds.size === allFiles.length;
}
function setSigningState(signing) {
  document.getElementById('signBtn').disabled = signing;
  const spinner = document.getElementById('spinner');
  if (signing) spinner.classList.replace('hidden', 'flex');
  else         spinner.classList.replace('flex',   'hidden');
}

// ─── Mensajes ─────────────────────────────────────────────────────────────────
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
function clearMsg() { document.getElementById('signMsg').classList.add('hidden'); }

// ─── Eventos desde main ───────────────────────────────────────────────────────
function bindBicEvents() {
  window.bic.rendererReady();

  window.bic.onModeLocal(() => {
    isLocalMode = true;
    document.getElementById('openFilesBtn').classList.remove('hidden');
    const testBtn = document.getElementById('testBtn');
    if (testBtn) {
      testBtn.style.display = 'inline-block';
      testBtn.addEventListener('click', () => {
        allFiles = [
          { id: 'test-1', nombre: 'A4-test-1.pdf',     url: 'http://127.0.0.1:3100/test/A4-test-1.pdf' },
          { id: 'test-2', nombre: 'oficio-test-2.pdf', url: 'http://127.0.0.1:3100/test/oficio-test-2.pdf' },
          { id: 'test-3', nombre: 'carta-test-3.pdf',  url: 'http://127.0.0.1:3100/test/carta-test-3.pdf' },
        ];
        selectedIds = new Set(allFiles.map(f => f.id));
        renderFileList(); updateSignBtn(); updateSelectAll();
        addLog('🧪 Archivos de prueba cargados');
      });
    }
  });

  window.bic.onSetFiles(files => {
    allFiles    = files;
    selectedIds = new Set(files.map(f => f.id));
    renderFileList(); updateSignBtn(); updateSelectAll();
    document.getElementById('openFilesBtn').classList.add('hidden');
    document.querySelector('[data-tab="sign"]').click();
    addLog(`📥 ${files.length} archivo(s) recibidos via bic://`);
  });

  window.bic.onSignProgress(msg => {
    document.getElementById('progressText').textContent = msg;
  });

  window.bic.onSignResult(result => {
    setSigningState(false);
    if (result.success) {
      showMsg('✓ ' + result.message, 'success');
      addLog('✓ ' + result.message);
      // Mostrar links a los archivos firmados
      if (result.firmados?.length && result.firmadosDir) {
        showSignedLinks(result.firmados, result.firmadosDir, result.firmadosPaths);
      }
    } else {
      showMsg('✗ ' + result.message, 'error');
      addLog('✗ ' + result.message);
    }
  });
}

// ─── Links a archivos firmados ────────────────────────────────────────────────
function showSignedLinks(firmados, dir, firmadosPaths) {
  // Mapear nombre de archivo → archivo original
  const byName = {};
  allFiles.forEach(f => { byName[f.nombre] = f; });

  // Mapear nombre → ruta completa (si viene del main)
  const pathByName = {};
  if (firmadosPaths) {
    firmadosPaths.forEach(p => {
      const nombre = p.split(/[\\/]/).pop();
      pathByName[nombre] = p;
    });
  }

  firmados.forEach(nombre => {
    const fileInfo = byName[nombre];
    if (!fileInfo) return;

    // Buscar la fila por iteración en lugar de querySelector con data-id
    // (evita problemas con rutas que contienen caracteres especiales en CSS)
    const rows = document.querySelectorAll('#fileList label[data-id]');
    let row = null;
    for (const r of rows) {
      if (r.dataset.id === fileInfo.id) { row = r; break; }
    }
    if (!row) return;

    const fullPath = pathByName[nombre] || (dir + '/' + nombre);
    if (row.querySelector('.download-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'download-btn shrink-0 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors';
    btn.title = 'Abrir archivo firmado';
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4"/>
    </svg>`;
    btn.addEventListener('click', e => {
      e.preventDefault();
      window.bic.openFile(fullPath);
    });

    // Insertar antes del último span (el 📁/🌐)
    const lastSpan = row.querySelector('span:last-of-type');
    row.insertBefore(btn, lastSpan);

    // Marcar la fila como firmada
    row.classList.add('border-green-400', 'dark:border-green-600');
  });

  // Ocultar el panel separado si existe
  const container = document.getElementById('signedLinks');
  if (container) container.classList.add('hidden');
}

// ─── Log ──────────────────────────────────────────────────────────────────────
function addLog(msg) {
  const el   = document.getElementById('logContent');
  const line = document.createElement('div');
  line.className   = 'text-gray-700 dark:text-gray-300';
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.prepend(line);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toggleNumeroPagina(show) { document.getElementById('numeroPagina').classList.toggle('hidden', !show); }
function getVal(id)      { return document.getElementById(id)?.value || ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
