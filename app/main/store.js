'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CONFIG_FILE = path.join(os.homedir(), '.bic', 'app-config.json');

// Config por defecto que se aplica a todo perfil nuevo o al perfil "Por defecto"
const DEFAULT_PROFILE_CONFIG = {
  posicion:     'centro-inferior',
  pagina:       'primera',
  numeroPagina: '',
  alto:         '40',
  ancho:        '160',
  mt:           '50',
  mb:           '50',
  ml:           '50',
  mr:           '50',
  directorio:   '',
};

// Estado inicial del archivo de configuración (primera instalación)
const INITIAL_STATE = {
  currentProfile: 'default',
  profiles: {
    default: {
      name:      'Por defecto',
      isDefault: true,
      config:    { ...DEFAULT_PROFILE_CONFIG },
    },
  },
};

// ─── Lectura ──────────────────────────────────────────────────────────────────
function load() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

      // Migraciones / guards de integridad
      if (!data.profiles)                  data.profiles = {};
      if (!data.profiles.default)          data.profiles.default = { ...INITIAL_STATE.profiles.default };
      if (!data.profiles.default.config)   data.profiles.default.config = { ...DEFAULT_PROFILE_CONFIG };
      if (!data.currentProfile)            data.currentProfile = 'default';
      // Si el perfil activo fue borrado de alguna forma, volver a default
      if (!data.profiles[data.currentProfile]) data.currentProfile = 'default';

      return data;
    }
  } catch (e) {
    process.stderr.write(`[STORE] Error al leer config: ${e.message}\n`);
  }
  // Primera instalación: crear y persistir el estado inicial
  const initial = JSON.parse(JSON.stringify(INITIAL_STATE));
  save(initial);
  return initial;
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
    process.stderr.write(`[STORE] Guardado: ${CONFIG_FILE}\n`);
  } catch (e) {
    process.stderr.write(`[STORE] Error al guardar config: ${e.message}\n`);
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/** Devuelve todo el estado: { currentProfile, profiles } */
function getState() {
  return load();
}

/** Guarda la config de un perfil específico */
function saveProfileConfig(profileId, config) {
  const data = load();
  if (!data.profiles[profileId]) return false;
  data.profiles[profileId].config = config;
  save(data);
  return true;
}

/** Crea un perfil nuevo. Devuelve el id generado. */
function createProfile(name) {
  const data = load();
  const id   = 'profile-' + Date.now();
  data.profiles[id] = {
    name,
    isDefault: false,
    config:    { ...DEFAULT_PROFILE_CONFIG },
  };
  data.currentProfile = id;
  save(data);
  return id;
}

/** Renombra un perfil */
function renameProfile(profileId, newName) {
  const data = load();
  if (!data.profiles[profileId]) return false;
  data.profiles[profileId].name = newName;
  save(data);
  return true;
}

/** Elimina un perfil (no permite borrar el default) */
function deleteProfile(profileId) {
  const data = load();
  if (!data.profiles[profileId] || data.profiles[profileId].isDefault) return false;
  delete data.profiles[profileId];
  if (data.currentProfile === profileId) data.currentProfile = 'default';
  save(data);
  return true;
}

/** Cambia el perfil activo */
function setCurrentProfile(profileId) {
  const data = load();
  if (!data.profiles[profileId]) return false;
  data.currentProfile = profileId;
  save(data);
  return true;
}

module.exports = {
  getState,
  saveProfileConfig,
  createProfile,
  renameProfile,
  deleteProfile,
  setCurrentProfile,
  DEFAULT_PROFILE_CONFIG,
};
