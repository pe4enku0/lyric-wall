// Bridge between the UI and the main process. The UI only sees window.lyricWall.
const { contextBridge, ipcRenderer } = require('electron');

// Errors in any window of the app go to the log file.
const sendError = text => ipcRenderer.send('app:log', 'error', `${location.pathname.split('/').pop()}: ${String(text).slice(0, 500)}`);
window.addEventListener('error', e => sendError(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
window.addEventListener('unhandledrejection', e => sendError(e.reason && e.reason.stack || e.reason));

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
  // rid: request id for the log (from the click layer), optional
  control: (cmd, value, rid) => ipcRenderer.send('player:control', cmd, value, rid),
  log: (level, text) => ipcRenderer.send('app:log', level, String(text).slice(0, 500)),
  openSoundSettings: () => ipcRenderer.send('app:openSoundSettings'),
  openControl: () => ipcRenderer.send('app:openControl'),

  // Spotify Web API: queue and likes (wallpaper), sign-in (settings window)
  getWebNow: () => ipcRenderer.invoke('web:getNow'),
  onWebNow: cb => ipcRenderer.on('web:now', (_e, now) => cb(now)),
  onWebState: cb => ipcRenderer.on('web:state', (_e, st) => cb(st)),
  webLike: on => ipcRenderer.invoke('web:like', on),
  webState: () => ipcRenderer.invoke('web:state'),
  webSetClientId: id => ipcRenderer.invoke('web:setClientId', id),
  webLogin: () => ipcRenderer.invoke('web:login'),
  webLogout: () => ipcRenderer.invoke('web:logout'),
  onWebChanged: cb => ipcRenderer.on('web:changed', (_e, st) => cb(st)),
  openSpotifyDashboard: () => ipcRenderer.send('web:openDashboard'),

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
  // The computer's sound for the Sound card (see main/audio.js)
  startAudio: () => ipcRenderer.send('audio:start'),
  // Windows: a ready spectrum (bytes like AnalyserNode.getByteFrequencyData, binHz = Hz per byte)
  onAudioSpectrum: cb => ipcRenderer.on('audio:spectrum', (_e, bytes, binHz) => cb(bytes, binHz)),
  // Windows: the name of the output device that plays (the label of the sound output button)
  onAudioDevice: cb => ipcRenderer.on('audio:device', (_e, name) => cb(name)),

  // Control window: switches shared with the tray menu
  controlState: () => ipcRenderer.invoke('control:state'),
  controlSet: (key, value) => ipcRenderer.invoke('control:set', key, value),
  onControlChanged: cb => ipcRenderer.on('control:changed', (_e, state) => cb(state)),
  // { cpu, paused, reasons } every 2 s
  onStatus: cb => ipcRenderer.on('control:status', (_e, st) => cb(st)),
  openLog: () => ipcRenderer.send('control:openLog'),
  quit: () => ipcRenderer.send('control:quit'),
  openSettings: reason => ipcRenderer.send('settings:open', reason),

  // Look of the wallpaper (settings window)
  getLook: () => ipcRenderer.invoke('look:get'),
  setLook: (key, value) => ipcRenderer.invoke('look:set', key, value),
  saveImage: (dataUrl, name) => ipcRenderer.invoke('look:saveImage', dataUrl, name),
  getImage: () => ipcRenderer.invoke('look:image'),
  onLook: cb => ipcRenderer.on('look:changed', (_e, look) => cb(look))
});
