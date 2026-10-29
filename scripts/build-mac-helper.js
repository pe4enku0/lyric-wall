// Builds the macOS click helper (mac-helper/ClickLayer.swift) into native/mac/lyric-wall-clicks.
// Runs before "npm start" and "npm run dist". Does nothing on other systems or when it is up to date.
// Without the Swift compiler (Xcode Command Line Tools) the app falls back to a simpler click layer.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') process.exit(0);

const root = path.join(__dirname, '..');
const src = path.join(root, 'mac-helper', 'ClickLayer.swift');
const out = path.join(root, 'native', 'mac', 'lyric-wall-clicks');

if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) process.exit(0);

fs.mkdirSync(path.dirname(out), { recursive: true });
try {
  execFileSync('swiftc', ['-O', src, '-o', out], { stdio: 'inherit' });
  console.log('Built the macOS click helper:', path.relative(root, out));
} catch (e) {
  console.warn('Could not build the macOS click helper (is Xcode Command Line Tools installed?):', e.message);
  if (process.env.CI) process.exit(1); // the release build must contain it
}
