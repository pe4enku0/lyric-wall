// Выбирает адаптер под текущую систему.
// require() стоит внутри условия, поэтому на Mac файл win.js не загружается вообще (и наоборот).

let adapter;
if (process.platform === 'darwin') {
  adapter = require('./mac');
} else if (process.platform === 'win32') {
  adapter = require('./win');
} else {
  adapter = { name: 'other', deviceLabel: () => 'Компьютер' };
}

module.exports = adapter;
