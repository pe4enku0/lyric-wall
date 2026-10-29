// Bridge between the UI and the main process. The UI only sees window.lyricWall.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lyricWall', {
  info: () => ipcRenderer.invoke('app:info'),
  // Normal windows: report the content height so the window fits it
  fitWindow: height => ipcRenderer.send('window:fit', height),
  onLayoutChanged: cb => ipcRenderer.on('layout:changed', () => cb()),
  // { paused, reasons }: the wallpaper stops drawing completely while paused
  getRender: () => ipcRenderer.invoke('render:get'),
  onRender: cb => ipcRenderer.on('render:state', (_e, st) => cb(st)),

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
  // { cpu, paused, reasons } every 2 s
  onStatus: cb => ipcRenderer.on('control:status', (_e, st) => cb(st)),
  openLog: () => ipcRenderer.send('control:openLog'),
  quit: () => ipcRenderer.send('control:quit'),
  openSettings: () => ipcRenderer.send('settings:open'),

  // Look of the wallpaper (settings window)
  getLook: () => ipcRenderer.invoke('look:get'),
  setLook: (key, value) => ipcRenderer.invoke('look:set', key, value),
  saveImage: dataUrl => ipcRenderer.invoke('look:saveImage', dataUrl),
  getImage: () => ipcRenderer.invoke('look:image'),
  onLook: cb => ipcRenderer.on('look:changed', (_e, look) => cb(look))
});
