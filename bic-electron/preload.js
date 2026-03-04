const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onSetPdfUrls: (callback) => ipcRenderer.on('set-pdf-urls', (event, urls) => callback(urls)),
  sendToMain: (channel, data) => ipcRenderer.send(channel, data),
  onFromMain: (channel, callback) => ipcRenderer.on(channel, (event, ...data) => callback(event, ...data)),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  getConfs: () => ipcRenderer.invoke('get-confs'),
  saveSignatureImage: (buffer, ext, profileId) => ipcRenderer.invoke('save-signature-image', buffer, ext, profileId),
  saveDefaultImage: (profileId) => ipcRenderer.invoke('save-default-image', profileId),
  getSignatureImage: (profileId) => ipcRenderer.invoke('get-signature-image', profileId),
  getSignatureImagePath: (fileName) => ipcRenderer.invoke('get-signature-image-path', fileName),
  seleccionarArchivos: () => ipcRenderer.invoke('select-files')
}); 