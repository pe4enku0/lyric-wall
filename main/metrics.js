// CPU use of the whole app (main process, wallpaper and windows, GPU), in % of one CPU core,
// measured since the previous call. Helper processes (osascript / PowerShell) are not included.
const { app } = require('electron');

function cpuPercent() {
  return app.getAppMetrics().reduce((sum, m) => sum + (m.cpu ? m.cpu.percentCPUUsage : 0), 0);
}

module.exports = { cpuPercent };
