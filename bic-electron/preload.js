const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onSetPdfUrls: (callback) => ipcRenderer.on('set-pdf-urls', (event, urls) => callback(urls)),
  sendToMain: (channel, data) => ipcRenderer.send(channel, data),
  onFromMain: (channel, callback) => ipcRenderer.on(channel, (event, data) => callback(data)),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  getConfs: () => ipcRenderer.invoke('get-confs')
}); 