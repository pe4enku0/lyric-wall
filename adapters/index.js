// Выбирает адаптер под текущую систему.
// require() стоит внутри условия, поэтому на Mac файл win.js не загружается вообще (и наоборот).

let adapter;
if (process.platform === 'darwin') {
  adapter = require('./mac');
} else if (process.platform === 'win32') {
  adapter = require('./win');
} else {
  // Другие системы не поддерживаются: показываем обычное окно.
  adapter = {
    name: 'other',
    deviceLabel: () => 'Компьютер',
    trayIcon: require('path').join(__dirname, '..', 'assets', 'trayTemplate@2x.png'),
    init() {},
    wallpaperWindowOptions: display => ({ ...display.bounds }),
    attachWallpaper(win) { win.show(); return 'window'; },
    placeWallpaper(win, display) { win.setBounds(display.bounds); },
    detachWallpaper() {}
  };
}

module.exports = adapter;
