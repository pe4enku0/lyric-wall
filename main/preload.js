// Bridge between the UI and the main process. The UI only sees window.lyricWall.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lyricWall', {
  info: () => ipcRenderer.invoke('app:info'),
  onLayoutChanged: cb => ipcRenderer.on('layout:changed', () => cb()),

  // Player: snapshots and commands 'toggle' | 'next' | 'prev'
  getPlayer: () => ipcRenderer.invoke('player:get'),
  onPlayer: cb => ipcRenderer.on('player:state', (_e, snap) => cb(snap)),
  control: cmd => ipcRenderer.send('player:control', cmd),

  // Lyrics for the current track (see main/lyrics.js)
  getLyrics: () => ipcRenderer.invoke('lyrics:get'),
  onLyrics: cb => ipcRenderer.on('lyrics:state', (_e, r) => cb(r)),

  // Control window: switches shared with the tray menu
  controlState: () => ipcRenderer.invoke('control:state'),
  controlSet: (key, value) => ipcRenderer.invoke('control:set', key, value),
  onControlChanged: cb => ipcRenderer.on('control:changed', (_e, state) => cb(state)),
  controlResize: height => ipcRenderer.send('control:resize', height),
  openLog: () => ipcRenderer.send('control:openLog'),
  quit: () => ipcRenderer.send('control:quit')
});
