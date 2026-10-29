// Control window: opens when the app icon is clicked. Shows what is playing and the main switches.
// Closing it keeps the wallpaper running in the background (tray / menu bar icon).
const { app, ipcMain } = require('electron');
const { createAppWindow, focus } = require('./windows');
const actions = require('./actions');
const player = require('./player');
const log = require('./log');

let win = null;
let unsubscribe = null;

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function show() {
  if (win) { focus(win); return; }
  win = createAppWindow('control.html', 440);
  win.on('closed', () => {
    win = null;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  });
  unsubscribe = player.subscribe(snap => send('player:state', snap));
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
