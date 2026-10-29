// Мостик между интерфейсом и главным процессом. Интерфейс видит только window.lyricWall.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lyricWall', {
  info: () => ipcRenderer.invoke('app:info')
});
