// "npm run install-app" (macOS): copies the freshly built app into ~/Applications and starts it.
// An app built on this Mac is not marked as downloaded, so macOS does not block it — unlike the unsigned
// build from GitHub. No admin rights are needed (~/Applications belongs to the user).
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.platform !== 'darwin') {
  console.log('install-app is for macOS only.');
  process.exit(0);
}

const root = path.join(__dirname, '..');
const built = fs.readdirSync(path.join(root, 'dist'))
  .map(d => path.join(root, 'dist', d, 'Lyric Wall.app'))
  .find(p => p.includes(`mac-${process.arch}`) && fs.existsSync(p));
if (!built) {
  console.error('No built app found in dist/. Run "npm run install-app" again.');
  process.exit(1);
}

// Quit any running Lyric Wall (the built app or "npm start") so it can be replaced.
for (const pattern of ['Lyric Wall.app/Contents/MacOS/Lyric Wall', 'lyric-wall/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron']) {
  try { execFileSync('pkill', ['-f', pattern]); console.log('Closed the running Lyric Wall.'); } catch (_) {}
}
execFileSync('sleep', ['1']);

const apps = path.join(os.homedir(), 'Applications');
const target = path.join(apps, 'Lyric Wall.app');
fs.mkdirSync(apps, { recursive: true });
fs.rmSync(target, { recursive: true, force: true });
execFileSync('ditto', [built, target]); // ditto keeps the app bundle intact (signature, links)
console.log('Installed:', target);

execFileSync('open', [target]);
console.log('Lyric Wall started. Its icon is in the menu bar.');
