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

// The console may be gone (the terminal that started the app was closed): writing to it then fails with
// EPIPE, and every failure was logged again, to the console, endlessly (the log grew by gigabytes).
let toConsole = true;
for (const s of [process.stdout, process.stderr]) if (s) s.on('error', () => { toConsole = false; });

let writes = 0;
function write(level, args) {
  const text = args.map(a => (typeof a === 'string' ? a : util.inspect(a, { depth: 3, breakLength: Infinity }))).join(' ');
  const line = `${new Date().toISOString()} [${level}] ${text}`;
  if (toConsole) try { console.log(line); } catch (_) { toConsole = false; }
  try {
    fs.appendFileSync(file, line + '\n');
    // A log that grows fast while the app runs is moved aside too (over 5 MB).
    if (++writes % 200 === 0 && fs.statSync(file).size > 5 * MAX_SIZE) fs.renameSync(file, file + '.old');
  } catch (_) {}
}

module.exports = {
  file,
  info: (...a) => write('INFO', a),
  warn: (...a) => write('WARN', a),
  error: (...a) => write('ERROR', a)
};
