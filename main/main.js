// Main process: windows, tray, system integration.
const { app, ipcMain, shell, Notification, screen } = require('electron');
const os = require('os');
const log = require('./log');

process.on('uncaughtException', e => log.error('Uncaught error:', e && e.stack || e));
process.on('unhandledRejection', e => log.error('Unhandled promise rejection:', e && e.stack || e));

// Windows needs this for notifications and to group the app correctly.
if (process.platform === 'win32') app.setAppUserModelId('io.github.pe4enku0.lyricwall');

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
const tempo = require('./tempo');
const spotifyWeb = require('./spotify-web');
const power = require('./power');
const appearance = require('./appearance');
const { cpuPercent } = require('./metrics');
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
ipcMain.on('player:control', (_e, cmd, value, rid) => player.control(cmd, value, typeof rid === 'string' ? rid.slice(0, 16) : undefined));
ipcMain.on('app:log', (_e, level, text) => (log[level] || log.info)('UI:', text));
ipcMain.on('app:openSoundSettings', () => shell.openExternal(adapter.soundSettingsUrl));
ipcMain.on('app:openControl', () => control.show('the "…" button on the wallpaper'));
ipcMain.handle('lyrics:get', () => lyrics.get());
ipcMain.handle('tempo:get', () => tempo.get());
ipcMain.handle('web:getNow', () => ({ ...spotifyWeb.getNow(), loggedIn: spotifyWeb.state().loggedIn }));
ipcMain.handle('web:like', (_e, on) => spotifyWeb.setLiked(!!on));
ipcMain.handle('render:get', () => power.state());

// First start: tell where the app went, since it opens no window.
function welcome() {
  settings.set('welcomeShown', true);
  if (!Notification.isSupported()) return;
  new Notification({
    title: i18n.t('welcome.title'),
    body: i18n.t(process.platform === 'darwin' ? 'welcome.body.mac' : 'welcome.body.win')
  }).show();
}

// Starting the app again while it is already running opens the control window.
// Crashed parts of the app (a window's page, the GPU process…) are noted in the log.
app.on('render-process-gone', (_e, wc, d) => log.error('A window crashed:', d.reason, d.exitCode, wc.getURL().split('/').pop()));
app.on('child-process-gone', (_e, d) => { if (d.reason !== 'clean-exit') log.error('App process gone:', d.type, d.reason, d.exitCode); });

app.on('second-instance', (_e, argv) => control.show(`the app was started again (${argv.slice(1).join(' ') || 'no arguments'})`));
// macOS sends "activate" when the app is opened again from Finder / Launchpad / Dock.
// It also fires right at start, so the first seconds are ignored.
app.on('activate', () => { if (Date.now() - startedAt > 3000) control.show('macOS reopened the app (Finder / Launchpad)'); });

app.whenReady().then(() => {
  const d = screen.getPrimaryDisplay();
  log.info(`Start Lyric Wall ${app.getVersion()}${app.isPackaged ? '' : ' (development)'}: ${process.platform} ${os.release()} ${process.arch}, ` +
    `Electron ${process.versions.electron}, adapter ${adapter.name}, language ${i18n.lang()}, ` +
    `screen ${d.size.width}x${d.size.height} at ${d.scaleFactor}x, ${screen.getAllDisplays().length} display(s)`);
  adapter.init();
  power.start();
  spotifyWeb.start();
  appearance.onChange(power.checkBattery);
  wallpaper.watchDisplays();
  if (settings.get('wallpaperEnabled')) wallpaper.create();
  tray.create();
  // Note the CPU use in the log every 10 minutes (the control window shows it live).
  setInterval(() => log.info(`CPU: ${cpuPercent().toFixed(1)}% (wallpaper ${power.state().paused ? 'paused' : 'running'})`), 10 * 60 * 1000);
  // The app starts in the background: no window, no taskbar / Dock icon, only the tray / menu bar icon.
  // The control window opens from the tray menu or when the app is started again.
  if (!settings.get('welcomeShown')) welcome();

  // For the automatic check in GitHub Actions: start, run for 10 seconds, quit.
  if (process.argv.includes('--smoke-test')) {
    setTimeout(() => { log.info('Smoke test: app ran for 10 seconds'); app.quit(); }, 10000);
  }
});

// The app lives in the tray even when the wallpaper is off and there are no windows.
app.on('window-all-closed', () => {});
app.on('before-quit', () => { wallpaper.destroy(); spotifyWeb.stop(); });
