// Picks the adapter for the current OS.
// require() sits inside the condition, so win.js is never loaded on macOS (and vice versa).

let adapter;
if (process.platform === 'darwin') {
  adapter = require('./mac');
} else if (process.platform === 'win32') {
  adapter = require('./win');
} else {
  // Other systems are not supported: show a plain window with no player data.
  adapter = {
    name: 'other',
    deviceKey: 'device.win',
    trayIcon: require('path').join(__dirname, '..', 'assets', 'trayTemplate@2x.png'),
    init() {},
    wallpaperWindowOptions: display => ({ ...display.bounds }),
    attachWallpaper(win) { win.show(); return 'window'; },
    placeWallpaper(win, display) { win.setBounds(display.bounds); },
    detachWallpaper() {},
    startNowPlaying(cb) { cb({ state: 'not-installed' }); },
    stopNowPlaying() {},
    control: () => Promise.resolve()
  };
}

module.exports = adapter;
