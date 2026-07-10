// 传奇H5 账号与存档后端 —— SQLite 版（零依赖，使用 Node 内置 node:sqlite）
// 兼容回退：若运行环境无 node:sqlite（老旧 Node 且未开 --experimental-sqlite），
// 自动回退到原 JSON 文件存储，保证服务始终可启动。
const fs = require('fs');
const path = require('path');

// ---- 探测 node:sqlite 可用性 ----
let sqliteOk = true;
let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  sqliteOk = false;
}

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'legends.db');   // SQLite 主库
const JSON_FILE = path.join(DATA_DIR, 'db.json');    // JSON 回退

// 低层存储句柄
let _db = null;     // DatabaseSync 实例
let _json = null;   // 回退对象

function loadJSON() {
  if (!fs.existsSync(JSON_FILE)) return { users: {}, profiles: {}, saves: {} };
  try {
    const o = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
    return { users: o.users || {}, profiles: o.profiles || {}, saves: o.saves || {} };
  } catch (e) {
    console.error('[db] JSON 读取失败，重置:', e.message);
    return { users: {}, profiles: {}, saves: {} };
  }
}

if (sqliteOk) {
  _db = new DatabaseSync(DB_FILE);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      email TEXT,
      data TEXT,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      data TEXT,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS saves (
      slot TEXT PRIMARY KEY,
      data TEXT,
      updated_at INTEGER
    );
  `);

  // ---- 迁移旧 JSON 数据（仅一次） ----
  const old = loadJSON();
  if (old.users && Object.keys(old.users).length) {
    const stmt = _db.prepare('INSERT OR IGNORE INTO users (id, username, email, data, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const u of Object.values(old.users)) {
      stmt.run(u.id, (u.username || '').toLowerCase(), (u.email || '').toLowerCase(),
        JSON.stringify(u), u.createdAt || Date.now());
    }
  }
  if (old.profiles && Object.keys(old.profiles).length) {
    const stmt = _db.prepare('INSERT OR IGNORE INTO profiles (user_id, data, updated_at) VALUES (?, ?, ?)');
    for (const [uid, p] of Object.entries(old.profiles)) {
      stmt.run(uid, JSON.stringify(p), p.updatedAt || Date.now());
    }
  }
  if (old.saves && Object.keys(old.saves).length) {
    const stmt = _db.prepare('INSERT OR IGNORE INTO saves (slot, data, updated_at) VALUES (?, ?, ?)');
    for (const [slot, s] of Object.entries(old.saves)) {
      stmt.run(slot, typeof s.data === 'string' ? s.data : JSON.stringify(s.data), s.updatedAt || Date.now());
    }
  }
  console.log('[db] SQLite 已启用 →', DB_FILE);
} else {
  _json = loadJSON();
  console.log('[db] 未检测到 node:sqlite，回退 JSON 存储 →', JSON_FILE);
}

// ==================== 统一访问层 ====================
function toUser(row) { return row ? JSON.parse(row.data) : null; }
function toProfile(row) { return row ? JSON.parse(row.data) : null; }

const db = {
  backend: sqliteOk ? 'sqlite' : 'json',

  // ---------- 用户 ----------
  findUserByUsername(username) {
    const l = (username || '').toLowerCase();
    if (sqliteOk) {
      const r = _db.prepare('SELECT data FROM users WHERE username = ?').get(l);
      return toUser(r);
    }
    return Object.values(_json.users).find(u => u.username.toLowerCase() === l) || null;
  },
  findUserByEmail(email) {
    const l = (email || '').toLowerCase();
    if (sqliteOk) {
      const r = _db.prepare('SELECT data FROM users WHERE email = ?').get(l);
      return toUser(r);
    }
    return Object.values(_json.users).find(u => (u.email || '').toLowerCase() === l) || null;
  },
  findUserById(id) {
    if (sqliteOk) { const r = _db.prepare('SELECT data FROM users WHERE id = ?').get(id); return toUser(r); }
    return _json.users[id] || null;
  },
  allUsers() {
    if (sqliteOk) return _db.prepare('SELECT data FROM users').all().map(r => JSON.parse(r.data));
    return Object.values(_json.users);
  },
  allUserIds() {
    if (sqliteOk) return _db.prepare('SELECT id FROM users').all().map(r => r.id);
    return Object.keys(_json.users);
  },
  createUser(user) {
    if (sqliteOk) {
      _db.prepare('INSERT INTO users (id, username, email, data, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, (user.username || '').toLowerCase(), (user.email || '').toLowerCase(),
          JSON.stringify(user), user.createdAt || Date.now());
      return;
    }
    _json.users[user.id] = user; markDirty();
  },
  updateUser(id, patch) {
    if (sqliteOk) {
      const cur = db.findUserById(id);
      if (!cur) return;
      Object.assign(cur, patch);
      _db.prepare('UPDATE users SET data = ? WHERE id = ?').run(JSON.stringify(cur), id);
      return;
    }
    if (_json.users[id]) { Object.assign(_json.users[id], patch); markDirty(); }
  },

  // ---------- 档案 ----------
  getProfile(userId) {
    if (sqliteOk) { const r = _db.prepare('SELECT data FROM profiles WHERE user_id = ?').get(userId); return toProfile(r); }
    return _json.profiles[userId] || null;
  },
  createProfile(profile) {
    if (sqliteOk) {
      _db.prepare('INSERT INTO profiles (user_id, data, updated_at) VALUES (?, ?, ?)')
        .run(profile.userId, JSON.stringify(profile), Date.now());
      return;
    }
    _json.profiles[profile.userId] = profile; markDirty();
  },
  updateProfile(userId, patch) {
    if (sqliteOk) {
      let cur = db.getProfile(userId);
      if (!cur) cur = { userId };
      Object.assign(cur, patch, { updatedAt: Date.now() });
      _db.prepare('INSERT INTO profiles (user_id, data, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
        .run(userId, JSON.stringify(cur), Date.now());
      return;
    }
    if (!_json.profiles[userId]) _json.profiles[userId] = { userId };
    Object.assign(_json.profiles[userId], patch, { updatedAt: Date.now() });
    markDirty();
  },

  // ---------- 游戏存档（背包/装备/角色） ----------
  getSave(slot) {
    if (sqliteOk) {
      const r = _db.prepare('SELECT data, updated_at FROM saves WHERE slot = ?').get(slot);
      return r ? { data: JSON.parse(r.data), updatedAt: r.updated_at } : null;
    }
    const s = _json.saves[slot];
    return s ? { data: s.data, updatedAt: s.updatedAt } : null;
  },
  setSave(slot, dataStr) {
    const now = Date.now();
    if (sqliteOk) {
      _db.prepare('INSERT INTO saves (slot, data, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(slot) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
        .run(slot, dataStr, now);
      return;
    }
    _json.saves[slot] = { data: JSON.parse(dataStr), updatedAt: now };
    markDirty();
  },
  listSaves() {
    if (sqliteOk) return _db.prepare('SELECT slot, updated_at FROM saves ORDER BY updated_at DESC').all();
    return Object.entries(_json.saves).map(([slot, s]) => ({ slot, updated_at: s.updatedAt }));
  },
  deleteSave(slot) {
    if (sqliteOk) { _db.prepare('DELETE FROM saves WHERE slot = ?').run(slot); return; }
    delete _json.saves[slot]; markDirty();
  },

  // ---------- 工具 ----------
  flush() {
    if (!sqliteOk) { fs.writeFileSync(JSON_FILE, JSON.stringify(_json, null, 2)); }
  },
};

// JSON 回退的定时落盘
let _dirty = false;
function markDirty() { _dirty = true; }
if (!sqliteOk) {
  setInterval(() => { if (_dirty) { db.flush(); _dirty = false; } }, 1000);
  process.on('exit', () => { if (_dirty) db.flush(); });
}

module.exports = db;
