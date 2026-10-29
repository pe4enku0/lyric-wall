// Main process: windows, tray, system integration.
const { app, ipcMain } = require('electron');
const os = require('os');
const log = require('./log');

process.on('uncaughtException', e => log.error('Uncaught error:', e && e.stack || e));
process.on('unhandledRejection', e => log.error('Unhandled promise rejection:', e && e.stack || e));

// Only one copy of the app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const adapter = require('../adapters');
const settings = require('./settings');
const i18n = require('./i18n');
const player = require('./player');
const wallpaper = require('./wallpaper');
const tray = require('./tray');

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  lang: i18n.lang(),
  strings: i18n.uiStrings(),
  deviceLabel: i18n.t(adapter.deviceKey)
}));
ipcMain.handle('player:get', () => player.get());
ipcMain.on('player:control', (_e, cmd) => player.control(cmd));

app.on('second-instance', () => log.info('Second launch ignored: the app is already running (tray icon)'));

app.whenReady().then(() => {
  log.info(`Start Lyric Wall ${app.getVersion()}: ${process.platform} ${os.release()}, Electron ${process.versions.electron}, adapter ${adapter.name}, language ${i18n.lang()}`);
  adapter.init();
  wallpaper.watchDisplays();
  if (settings.get('wallpaperEnabled')) wallpaper.create();
  tray.create();

  // For the automatic check in GitHub Actions: start, run for 10 seconds, quit.
  if (process.argv.includes('--smoke-test')) {
    setTimeout(() => { log.info('Smoke test: app ran for 10 seconds'); app.quit(); }, 10000);
  }
});

// The app lives in the tray even when the wallpaper is off and there are no windows.
app.on('window-all-closed', () => {});
app.on('before-quit', () => wallpaper.destroy());
