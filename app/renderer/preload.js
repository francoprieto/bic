'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bic', {
  // Ciclo de vida del renderer
  rendererReady: () => ipcRenderer.send('renderer-ready'),

  // Eventos desde main
  onSetFiles:     cb => ipcRenderer.on('set-files',      (_, d) => cb(d)),
  onModeLocal:    cb => ipcRenderer.on('mode-local',     ()     => cb()),
  onSignProgress: cb => ipcRenderer.on('sign-progress',  (_, d) => cb(d)),
  onSignResult:   cb => ipcRenderer.on('sign-result',    (_, d) => cb(d)),

  // Firma
  sign:  payload => ipcRenderer.send('sign', payload),
  reset: ()      => ipcRenderer.send('reset'),

  // Certificados
  listCerts:  params => ipcRenderer.invoke('list-certs', params),
  selectCert: ()     => ipcRenderer.invoke('select-cert'),

  // Archivos locales
  selectFiles: () => ipcRenderer.invoke('select-files'),
  openFile:    filePath => ipcRenderer.invoke('open-file', filePath),

  // Estado completo (perfiles + perfil activo)
  getState:          ()                   => ipcRenderer.invoke('get-state'),

  // Operaciones de perfil
  saveProfileConfig: (profileId, config)  => ipcRenderer.invoke('save-profile-config', profileId, config),
  createProfile:     name                 => ipcRenderer.invoke('create-profile', name),
  renameProfile:     (profileId, name)    => ipcRenderer.invoke('rename-profile', profileId, name),
  deleteProfile:     profileId            => ipcRenderer.invoke('delete-profile', profileId),
  setCurrentProfile: profileId            => ipcRenderer.invoke('set-current-profile', profileId),

  // Imagen de firma (por perfil)
  saveSignatureImage:   (buf, ext, profileId) => ipcRenderer.invoke('save-signature-image', buf, ext, profileId),
  getSignatureImage:    profileId             => ipcRenderer.invoke('get-signature-image', profileId),
  deleteSignatureImage: profileId             => ipcRenderer.invoke('delete-signature-image', profileId),
});
