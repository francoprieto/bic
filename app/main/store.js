'use strict';

/**
 * Persistencia de configuración y perfiles en ~/.bic/app-config.json
 * Reemplaza el uso de localStorage (que no es accesible desde main process).
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CONFIG_FILE = path.join(os.homedir(), '.bic', 'app-config.json');

const DEFAULTS = {
  config: {
    posicion: 'centro-inferior',
    pagina:   'primera',
    numeroPagina: '',
    alto:  '40',
    ancho: '160',
    mt: '50', mb: '50', ml: '50', mr: '50',
    inseguro: false,
    directorio: '',
    proxy: '',
  },
  profiles: {
    default: {
      name: 'Por defecto',
      isDefault: true,
      config: null,   // null = usa config global
    }
  },
  currentProfile: 'default',
};

function load() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error al leer app-config.json:', e.message);
  }
  return structuredClone(DEFAULTS);
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error al guardar app-config.json:', e.message);
  }
}

function getConfig() {
  return load();
}

function saveConfig(config) {
  const data = load();
  data.config = config;
  save(data);
  return true;
}

function getProfiles() {
  return load().profiles;
}

function saveProfiles(profiles) {
  const data = load();
  data.profiles = profiles;
  save(data);
  return true;
}

module.exports = { getConfig, saveConfig, getProfiles, saveProfiles, DEFAULTS };
