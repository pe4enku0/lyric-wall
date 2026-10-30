// The computer's sound for the Sound card. The wallpaper asks for a "screen share" with sound
// (getDisplayMedia) and gets only the sound of the whole system ("loopback"); it turns it into the
// spectrum bars right there. Nothing is recorded, saved or sent anywhere.
// - Windows: WASAPI loopback, no permission needed.
// - macOS 14.2+: a Core Audio tap; macOS asks once for "System Audio Recording". The picture part of the
//   share is the wallpaper's own page, so no screen recording permission is asked for.
// Without the sound (no permission, older macOS, an error) the bars move in a calm wave.
const { app, ipcMain, session } = require('electron');
const log = require('./log');

// Before the app is ready: the macOS sound capture is behind Chromium switches.
function enableFeatures() {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  if (process.platform === 'darwin') {
    app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare,MacCatapLoopbackAudioForScreenShare');
  }
}

// After the app is ready: only the wallpaper page gets the sound; other pages get nothing.
function setup() {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const url = request.frame ? request.frame.url : '';
    if (!/\/renderer\/index\.html$/.test(url)) { callback({}); return; }
    callback({ video: request.frame, audio: 'loopback' });
  });
  // getDisplayMedia needs a click on the page; the wallpaper never gets real clicks, so the start is
  // run as if the user had clicked (the sound is still only the system's own, as described above).
  ipcMain.on('audio:start', e => {
    log.info('Sound card: asking for the system sound');
    e.sender.executeJavaScript('window.lwStartAudio && window.lwStartAudio()', true).catch(err => log.warn('Sound card:', err.message));
  });
}

module.exports = { enableFeatures, setup };
