// Log file in the app data folder. It stays on this computer only.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const util = require('util');

const file = path.join(app.getPath('userData'), 'lyric-wall.log');
const MAX_SIZE = 1024 * 1024;

fs.mkdirSync(path.dirname(file), { recursive: true });
// Keep the log small: a log over 1 MB is moved aside on start.
try {
  if (fs.statSync(file).size > MAX_SIZE) fs.renameSync(file, file + '.old');
} catch (_) {}

function write(level, args) {
  const text = args.map(a => (typeof a === 'string' ? a : util.inspect(a, { depth: 3, breakLength: Infinity }))).join(' ');
  const line = `${new Date().toISOString()} [${level}] ${text}`;
  console.log(line);
  try { fs.appendFileSync(file, line + '\n'); } catch (_) {}
}

module.exports = {
  file,
  info: (...a) => write('INFO', a),
  warn: (...a) => write('WARN', a),
  error: (...a) => write('ERROR', a)
};
