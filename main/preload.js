// Мостик между интерфейсом и главным процессом. Интерфейс видит только window.lyricWall.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lyricWall', {
  info: () => ipcRenderer.invoke('app:info'),
  // Команды из трея: 'toggle', 'next', 'prev'
  onCommand: cb => ipcRenderer.on('player:command', (_e, cmd) => cb(cmd))
});
