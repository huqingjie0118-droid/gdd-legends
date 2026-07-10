// 启动器：根据 Node 版本决定是否加 --experimental-sqlite 标志
// Node 22 / 23 的 node:sqlite 仍处实验阶段需该标志；Node 24+ 已内置稳定、禁用该标志。
// 这样无论开发机跑哪个 Node 大版本，`npm start` 都能直接用上 SQLite。
const { spawn } = require('child_process');
const path = require('path');

const major = parseInt(process.versions.node.split('.')[0], 10) || 22;
const flag = major < 24 ? '--experimental-sqlite' : '';
const args = [flag, path.join(__dirname, 'index.js'), ...process.argv.slice(2)].filter(Boolean);

const child = spawn(process.execPath, args, { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code === null ? 1 : code));
