// 轻量 JSON 文件数据库（零依赖）。生产可替换为 SQLite/Postgres。
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) return { users: {}, profiles: {} };
  try {
    const o = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { users: o.users || {}, profiles: o.profiles || {} };
  } catch (e) {
    console.error('[db] 读取失败，重置:', e.message);
    return { users: {}, profiles: {} };
  }
}

let _db = load();
let _dirty = false;

function persist() {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(_db, null, 2));
  _dirty = false;
}

// 简单定时落盘，避免频繁写文件
setInterval(() => { if (_dirty) persist(); }, 1000);
process.on('exit', () => { if (_dirty) persist(); });

function markDirty() { _dirty = true; }

const db = {
  // ---- 用户 ----
  findUserByUsername(username) {
    const l = (username || '').toLowerCase();
    return Object.values(_db.users).find(u => u.username.toLowerCase() === l) || null;
  },
  findUserByEmail(email) {
    const l = (email || '').toLowerCase();
    return Object.values(_db.users).find(u => u.email.toLowerCase() === l) || null;
  },
  findUserById(id) { return _db.users[id] || null; },
  allUsers() { return Object.values(_db.users); },
  allUserIds() { return Object.keys(_db.users); },
  createUser(user) { _db.users[user.id] = user; markDirty(); },
  updateUser(id, patch) { if (_db.users[id]) { Object.assign(_db.users[id], patch); markDirty(); } },

  // ---- 档案 ----
  getProfile(userId) { return _db.profiles[userId] || null; },
  createProfile(profile) { _db.profiles[profile.userId] = profile; markDirty(); },
  updateProfile(userId, patch) {
    if (!_db.profiles[userId]) _db.profiles[userId] = { userId };
    Object.assign(_db.profiles[userId], patch, { updatedAt: Date.now() });
    markDirty();
  },

  // ---- 工具 ----
  flush() { persist(); },
};

module.exports = db;
