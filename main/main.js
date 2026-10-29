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
const lyrics = require('./lyrics');
const wallpaper = require('./wallpaper');
const actions = require('./actions');
const control = require('./control');
require('./settings-window');
const tray = require('./tray');

const startedAt = Date.now();

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  lang: i18n.lang(),
  strings: i18n.uiStrings(),
  deviceLabel: i18n.t(adapter.deviceKey)
}));
ipcMain.handle('player:get', () => player.get());
ipcMain.on('player:control', (_e, cmd) => player.control(cmd));
ipcMain.handle('lyrics:get', () => lyrics.get());

// Started automatically at login: stay in the background without opening a window.
function startedAtLogin() {
  if (actions.LOGIN_ARGS.some(a => process.argv.includes(a))) return true;
  if (process.platform === 'darwin') {
    const s = app.getLoginItemSettings();
    return !!s.wasOpenedAtLogin || (s.openAtLogin && os.uptime() < 180);
  }
  return false;
}

// Clicking the app icon while it is already running opens the control window.
app.on('second-instance', () => { log.info('App icon clicked again: opening the control window'); control.show(); });
// macOS sends "activate" when the app is opened again from Finder / Launchpad / Dock.
// It also fires right at start, so the first seconds are ignored.
app.on('activate', () => { if (Date.now() - startedAt > 3000) control.show(); });

app.whenReady().then(() => {
  log.info(`Start Lyric Wall ${app.getVersion()}: ${process.platform} ${os.release()}, Electron ${process.versions.electron}, adapter ${adapter.name}, language ${i18n.lang()}`);
  adapter.init();
  wallpaper.watchDisplays();
  if (settings.get('wallpaperEnabled')) wallpaper.create();
  tray.create();
  if (startedAtLogin()) log.info('Started at login: no window');
  else control.show();

  // For the automatic check in GitHub Actions: start, run for 10 seconds, quit.
  if (process.argv.includes('--smoke-test')) {
    setTimeout(() => { log.info('Smoke test: app ran for 10 seconds'); app.quit(); }, 10000);
  }
});

// The app lives in the tray even when the wallpaper is off and there are no windows.
app.on('window-all-closed', () => {});
app.on('before-quit', () => wallpaper.destroy());
