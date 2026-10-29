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

  // Player: snapshots and commands 'toggle' | 'next' | 'prev' | 'seek' (s) | 'volume' (0-100) | 'mute' | 'shuffle' | 'open'
  getPlayer: () => ipcRenderer.invoke('player:get'),
  onPlayer: cb => ipcRenderer.on('player:state', (_e, snap) => cb(snap)),
  control: (cmd, value) => ipcRenderer.send('player:control', cmd, value),
  log: (level, text) => ipcRenderer.send('app:log', level, String(text).slice(0, 500)),
  openSoundSettings: () => ipcRenderer.send('app:openSoundSettings'),
  openControl: () => ipcRenderer.send('app:openControl'),

  // Buttons on the desktop: the wallpaper reports where they are, the click layer reports hovers and clicks
  reportHits: items => ipcRenderer.send('hit:rects', items),
  onHit: cb => ipcRenderer.on('hit:event', (_e, ev) => cb(ev)),
  // used by the click layer itself (renderer/hit.html)
  onHitRects: cb => ipcRenderer.on('hit:rects', (_e, items) => cb(items)),
  onHitCursor: cb => ipcRenderer.on('hit:cursor', (_e, id) => cb(id)),
  hitEvent: ev => ipcRenderer.send('hit:event', ev),

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
