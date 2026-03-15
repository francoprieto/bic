'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bic', {
  // Renderer listo para recibir archivos
  rendererReady: () => ipcRenderer.send('renderer-ready'),

  // Archivos desde protocolo bic://
  onSetFiles:    cb => ipcRenderer.on('set-files',    (_, d) => cb(d)),
  onModeLocal:   cb => ipcRenderer.on('mode-local',   ()     => cb()),

  // Firma
  sign:          payload => ipcRenderer.send('sign', payload),
  onSignProgress: cb => ipcRenderer.on('sign-progress', (_, d) => cb(d)),
  onSignResult:   cb => ipcRenderer.on('sign-result',   (_, d) => cb(d)),
  reset:         ()      => ipcRenderer.send('reset'),

  // Certificados
  listCerts:     params  => ipcRenderer.invoke('list-certs', params),

  // Configuración y perfiles
  getConfig:     ()      => ipcRenderer.invoke('get-config'),
  saveConfig:    config  => ipcRenderer.invoke('save-config', config),
  getProfiles:   ()      => ipcRenderer.invoke('get-profiles'),
  saveProfiles:  profiles => ipcRenderer.invoke('save-profiles', profiles),

  // Archivos
  selectFiles:   ()      => ipcRenderer.invoke('select-files'),
  selectCert:    ()      => ipcRenderer.invoke('select-cert'),
  saveSignatureImage: (buf, ext, profileId) => ipcRenderer.invoke('save-signature-image', buf, ext, profileId),
  getSignatureImage:  profileId => ipcRenderer.invoke('get-signature-image', profileId),
});
