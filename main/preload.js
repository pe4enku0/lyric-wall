// Bridge between the UI and the main process. The UI only sees window.lyricWall.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lyricWall', {
  info: () => ipcRenderer.invoke('app:info'),
  getPlayer: () => ipcRenderer.invoke('player:get'),
  onPlayer: cb => ipcRenderer.on('player:state', (_e, snap) => cb(snap)),
  // 'toggle' | 'next' | 'prev'
  control: cmd => ipcRenderer.send('player:control', cmd)
});
