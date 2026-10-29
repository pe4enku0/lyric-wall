// Главный процесс: окна, трей, системные вещи.
const { app, ipcMain } = require('electron');
const os = require('os');
const log = require('./log');

process.on('uncaughtException', e => log.error('Необработанная ошибка:', e && e.stack || e));
process.on('unhandledRejection', e => log.error('Необработанная ошибка (promise):', e && e.stack || e));

// Только одна копия приложения.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const adapter = require('../adapters');
const settings = require('./settings');
const wallpaper = require('./wallpaper');
const tray = require('./tray');

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  adapter: adapter.name,
  deviceLabel: adapter.deviceLabel()
}));

app.on('second-instance', () => log.info('Попытка второго запуска: приложение уже работает (иконка в трее)'));

app.whenReady().then(() => {
  log.info(`Запуск Lyric Wall ${app.getVersion()}: ${process.platform} ${os.release()}, Electron ${process.versions.electron}, адаптер ${adapter.name}`);
  adapter.init();
  wallpaper.watchDisplays();
  if (settings.get('wallpaperEnabled')) wallpaper.create();
  tray.create();

  // Для автоматической проверки в GitHub Actions: запуститься, поработать 10 секунд и выйти.
  if (process.argv.includes('--smoke-test')) {
    setTimeout(() => { log.info('Проверка запуска: приложение проработало 10 секунд'); app.quit(); }, 10000);
  }
});

// Приложение живёт в трее, даже когда обои выключены и окон нет.
app.on('window-all-closed', () => {});
app.on('before-quit', () => wallpaper.destroy());
