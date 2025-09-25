const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onSetPdfUrls: (callback) => ipcRenderer.on('set-pdf-urls', (event, urls) => callback(urls)),
  sendToMain: (channel, data) => ipcRenderer.send(channel, data),
  onFromMain: (channel, callback) => ipcRenderer.on(channel, (event, ...data) => callback(event, ...data)),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  getConfs: () => ipcRenderer.invoke('get-confs'),
  saveSignatureImage: (buffer, ext) => ipcRenderer.invoke('save-signature-image', buffer, ext),
  saveDefaultImage: () => ipcRenderer.invoke('save-default-image'),
  seleccionarArchivos: () => ipcRenderer.invoke('select-files')
}); 