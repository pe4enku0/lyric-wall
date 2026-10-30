// Settings window: background, picture blur/dim and snow, like the settings block in mockup.html.
const { ipcMain, shell } = require('electron');
const { createAppWindow, focus } = require('./windows');
const appearance = require('./appearance');
const actions = require('./actions');
const spotifyWeb = require('./spotify-web');
const log = require('./log');

let win = null;

function show(reason) {
  log.info('Settings window requested by:', reason || 'unknown');
  if (win) { focus(win); return; }
  win = createAppWindow('settings.html', 620);
  win.on('closed', () => { win = null; });
  log.info('Settings window opened');
}

ipcMain.on('settings:open', (_e, reason) => show(reason || 'a button in the app'));
ipcMain.handle('look:get', () => appearance.get());
ipcMain.handle('look:set', (_e, key, value) => appearance.set(key, value));
ipcMain.handle('look:saveImage', (_e, dataUrl, name) => appearance.saveImage(dataUrl, name));
ipcMain.handle('look:image', () => appearance.imageDataUrl());

// Spotify sign-in (main/spotify-web.js)
ipcMain.handle('web:state', () => spotifyWeb.state());
ipcMain.handle('web:setClientId', (_e, id) => spotifyWeb.setClientId(id));
ipcMain.handle('web:login', () => spotifyWeb.login());
ipcMain.handle('web:logout', () => { spotifyWeb.logout(); return spotifyWeb.state(); });
ipcMain.on('web:openDashboard', () => shell.openExternal('https://developer.spotify.com/dashboard'));
spotifyWeb.onChange(() => { if (win && !win.isDestroyed()) win.webContents.send('web:changed', spotifyWeb.state()); });

actions.onChange(key => { if (key === 'language' && win) win.webContents.reload(); });

module.exports = { show };
