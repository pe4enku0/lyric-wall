// Control window: opens when the app icon is clicked. Shows what is playing and the main switches.
// Closing it keeps the wallpaper running in the background (tray / menu bar icon).
const { app, ipcMain } = require('electron');
const { createAppWindow, focus } = require('./windows');
const actions = require('./actions');
const player = require('./player');
const power = require('./power');
const { cpuPercent } = require('./metrics');
const log = require('./log');

let win = null;
let unsubscribe = null;
let statusTimer = null;

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function show() {
  if (win) { focus(win); return; }
  win = createAppWindow('control.html', 440);
  win.on('closed', () => {
    win = null;
    clearInterval(statusTimer);
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  });
  unsubscribe = player.subscribe(snap => send('player:state', snap));
  // CPU use of the whole app and whether the wallpaper is paused, every 2 s while the window is open.
  cpuPercent();
  statusTimer = setInterval(() => send('control:status', { cpu: cpuPercent(), ...power.state() }), 2000);
  log.info('Control window opened');
}

ipcMain.handle('control:state', () => actions.state());
ipcMain.handle('control:set', (_e, key, value) => actions.set(key, value));
ipcMain.on('control:openLog', () => actions.openLog());
ipcMain.on('control:quit', () => app.quit());

actions.onChange(key => {
  if (key === 'language' && win) win.webContents.reload();
  else send('control:changed', actions.state());
});

module.exports = { show };
