// Main process: windows, tray, system integration.
const { app, ipcMain, shell, Notification, screen, systemPreferences } = require('electron');
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
const audio = require('./audio');
audio.enableFeatures();
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

// Mac: the model name for the sound output button ("MacBook Air"); asked once, in the background.
const modelName = new Promise(resolve => {
  if (process.platform !== 'darwin') { resolve(null); return; }
  require('child_process').execFile('/usr/sbin/system_profiler', ['SPHardwareDataType', '-json'], { timeout: 4000 }, (err, out) => {
    try { resolve(err ? null : JSON.parse(out).SPHardwareDataType[0].machine_name || null); } catch (_) { resolve(null); }
  });
});

// The system accent colour (blue on a Mac by default, the chosen colour on Windows) for the app's windows.
function sysAccent() {
  try { return '#' + systemPreferences.getAccentColor().slice(0, 6); } catch (_) { return null; }
}
ipcMain.handle('app:info', async () => ({
  version: app.getVersion(),
  platform: process.platform,
  // Look of the wallpaper: 'mac' or 'win'. LW_UI=win npm run window shows the Windows look on a Mac (for testing).
  ui: ['mac', 'win'].includes(process.env.LW_UI) ? process.env.LW_UI : process.platform === 'darwin' ? 'mac' : 'win',
  lang: i18n.lang(),
  strings: i18n.uiStrings(),
  stringsEn: i18n.uiStrings('en'), // the VHS theme is always in English (its font has no Cyrillic)
  accent: sysAccent(),
  deviceLabel: (await Promise.race([modelName, new Promise(r => setTimeout(r, 1500, null))])) || i18n.t(adapter.deviceKey)
}));
ipcMain.handle('player:get', () => player.get());
ipcMain.on('player:control', (_e, cmd, value, rid) => player.control(cmd, value, typeof rid === 'string' ? rid.slice(0, 16) : undefined));
ipcMain.on('app:log', (_e, level, text) => (log[level] || log.info)('UI:', text));
ipcMain.on('app:openSoundSettings', () => shell.openExternal(adapter.soundSettingsUrl));
ipcMain.on('app:openControl', () => control.show('the "…" button on the wallpaper'));
ipcMain.handle('lyrics:get', () => lyrics.get());
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

// The app's windows show only its own pages: a link or file dropped on a window must not replace the page
// (a web page there would get the app's bridge, preload.js), and no page may open new windows.
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-navigate', (e, url) => { e.preventDefault(); log.warn('Blocked navigation to', url.slice(0, 80)); });
  wc.setWindowOpenHandler(({ url }) => { log.warn('Blocked a new window for', url.slice(0, 80)); return { action: 'deny' }; });
});

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
  audio.setup();
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
