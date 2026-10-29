// Bridge between the UI and the main process. The UI only sees window.lyricWall.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lyricWall', {
  info: () => ipcRenderer.invoke('app:info'),

  // Player: snapshots and commands 'toggle' | 'next' | 'prev'
  getPlayer: () => ipcRenderer.invoke('player:get'),
  onPlayer: cb => ipcRenderer.on('player:state', (_e, snap) => cb(snap)),
  control: cmd => ipcRenderer.send('player:control', cmd),

  // Control window: switches shared with the tray menu
  controlState: () => ipcRenderer.invoke('control:state'),
  controlSet: (key, value) => ipcRenderer.invoke('control:set', key, value),
  onControlChanged: cb => ipcRenderer.on('control:changed', (_e, state) => cb(state)),
  controlResize: height => ipcRenderer.send('control:resize', height),
  openLog: () => ipcRenderer.send('control:openLog'),
  quit: () => ipcRenderer.send('control:quit')
});
