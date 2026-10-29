// Settings window: background, picture blur/dim and snow, like the settings block in mockup.html.
const { ipcMain } = require('electron');
const { createAppWindow, focus } = require('./windows');
const appearance = require('./appearance');
const actions = require('./actions');
const log = require('./log');

let win = null;

function show() {
  if (win) { focus(win); return; }
  win = createAppWindow('settings.html', 700);
  win.on('closed', () => { win = null; });
  log.info('Settings window opened');
}

ipcMain.on('settings:open', () => show());
ipcMain.handle('look:get', () => appearance.get());
ipcMain.handle('look:set', (_e, key, value) => appearance.set(key, value));
ipcMain.handle('look:saveImage', (_e, dataUrl) => appearance.saveImage(dataUrl));
ipcMain.handle('look:image', () => appearance.imageDataUrl());

actions.onChange(key => { if (key === 'language' && win) win.webContents.reload(); });

module.exports = { show };
