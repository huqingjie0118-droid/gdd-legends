// 账号核心逻辑：注册/登录/会话/找回/验证 + 玩家档案读写
const crypto = require('crypto');
const db = require('./db');
const mail = require('./mail');

let BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
function setBase(u) { BASE_URL = u || BASE_URL; }

// ============ 工具 ============
function tokenFrom(req) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(pw, salt, hash) {
  try {
    const h = crypto.scryptSync(pw, salt, 64);
    return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
  } catch { return false; }
}
function genToken() { return crypto.randomBytes(24).toString('hex'); }

// 密码强度评分（0-5）
function passwordStrength(pw) {
  pw = pw || '';
  const reasons = [];
  if (pw.length < 8) reasons.push('至少8位');
  if (!/[a-z]/.test(pw)) reasons.push('含小写字母');
  if (!/[A-Z]/.test(pw)) reasons.push('含大写字母');
  if (!/[0-9]/.test(pw)) reasons.push('含数字');
  if (!/[^a-zA-Z0-9]/.test(pw)) reasons.push('含特殊字符');
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  return { score: Math.min(5, score), valid: reasons.length === 0, reasons };
}

const RE_USERNAME = /^[a-zA-Z0-9_]{3,20}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, emailVerified: !!u.emailVerified };
}

function defaultProfile(id) {
  return {
    userId: id, class: null,
    level: 1, exp: 0, expToNext: 100, gold: 0,
    equipment: {}, backpack: [],
    mapIndex: 0, clearedMaps: [],
    skillTree: {}, advancement: 0, skillPoints: 0,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

// 清理过期会话
function pruneSessions(user) {
  const now = Date.now();
  let changed = false;
  for (const [tok, s] of Object.entries(user.sessions || {})) {
    if (!s || s.expires < now) { delete user.sessions[tok]; changed = true; }
  }
  return changed;
}

// ============ 注册 ============
// 注册（最简版：用户名 + 密码；邮箱可选，留作后续扩展，注册时不强制验证）
function register({ username, email, password }) {
  const errors = {};
  if (!RE_USERNAME.test(username || '')) errors.username = '用户名需3-20位，仅字母/数字/下划线';
  const ps = passwordStrength(password || '');
  if (!ps.valid) errors.password = '密码需满足: ' + ps.reasons.join('、');
  if (email && !RE_EMAIL.test(email)) errors.email = '邮箱格式不正确';
  if (Object.keys(errors).length) return { ok: false, errors };

  if (db.findUserByUsername(username)) return { ok: false, errors: { username: '用户名已存在' } };
  if (email && db.findUserByEmail(email)) return { ok: false, errors: { email: '该邮箱已注册' } };

  const id = crypto.randomUUID();
  const { salt, hash } = hashPassword(password);
  const user = {
    id, username, email: email || null,
    pwSalt: salt, pwHash: hash,
    emailVerified: false,
    verifyToken: null, verifyExpires: 0,
    resetToken: null, resetExpires: null,
    sessions: {}, createdAt: Date.now(),
  };
  db.createUser(user);
  db.createProfile(defaultProfile(id));
  db.flush();
  return { ok: true, userId: id };
}

// ============ 登录 ============
function login({ identifier, password, remember }) {
  const id = (identifier || '').trim();
  if (!id || !password) return { ok: false, error: '请输入账号和密码' };
  const user = db.findUserByUsername(id) || db.findUserByEmail(id);
  if (!user) return { ok: false, error: '账号或密码错误' };
  if (!verifyPassword(password, user.pwSalt, user.pwHash)) return { ok: false, error: '账号或密码错误' };

  const token = genToken();
  const expires = Date.now() + (remember ? 30 * 86400000 : 2 * 3600000);
  user.sessions = user.sessions || {};
  user.sessions[token] = { expires, remember: !!remember };
  pruneSessions(user);
  db.flush();
  return { ok: true, token, user: publicUser(user) };
}

function logout(token) {
  if (!token) return;
  for (const u of db.allUsers()) {
    if (u.sessions && u.sessions[token]) {
      delete u.sessions[token];
      db.flush();
      return;
    }
  }
}

// ============ 会话校验 ============
function getMe(token) {
  if (!token) return { ok: false };
  for (const uid of db.allUserIds()) {
    const u = db.findUserById(uid);
    if (!u || !u.sessions) continue;
    const s = u.sessions[token];
    if (s && s.expires > Date.now()) {
      pruneSessions(u);
      db.flush();
      const profile = db.getProfile(uid);
      return { ok: true, user: publicUser(u), profile };
    }
  }
  return { ok: false };
}

// ============ 密码找回 ============
function requestReset(email) {
  const user = db.findUserByEmail(email);
  if (user) {
    user.resetToken = genToken();
    user.resetExpires = Date.now() + 3600000;
    db.flush();
    mail.sendPasswordReset(email, `${BASE_URL}/api/reset?token=${user.resetToken}`).catch(() => {});
  }
  // 无论是否存在都返回 ok，避免账号枚举
  return { ok: true };
}

function resetPassword(token, newPassword) {
  const ps = passwordStrength(newPassword || '');
  if (!ps.valid) return { ok: false, error: '密码强度不足: ' + ps.reasons.join('、') };
  for (const uid of db.allUserIds()) {
    const u = db.findUserById(uid);
    if (u && u.resetToken === token && u.resetExpires > Date.now()) {
      const { salt, hash } = hashPassword(newPassword);
      u.pwSalt = salt; u.pwHash = hash;
      u.resetToken = null; u.resetExpires = null;
      u.sessions = {}; // 重置后令所有旧会话失效
      db.flush();
      return { ok: true };
    }
  }
  return { ok: false, error: '重置链接无效或已过期' };
}

// ============ 邮箱验证 ============
function verifyEmail(token) {
  for (const uid of db.allUserIds()) {
    const u = db.findUserById(uid);
    if (u && u.verifyToken === token && u.verifyExpires > Date.now()) {
      u.emailVerified = true;
      u.verifyToken = null;
      db.flush();
      return { ok: true };
    }
  }
  return { ok: false, error: '验证链接无效或已过期' };
}

// ============ 档案读写 ============
const PROFILE_FIELDS = ['class', 'level', 'exp', 'expToNext', 'gold', 'equipment', 'backpack', 'mapIndex', 'clearedMaps', 'skillTree', 'advancement', 'skillPoints'];
function saveProfile(userId, patch) {
  const data = {};
  for (const k of PROFILE_FIELDS) {
    if (k in (patch || {})) {
      let v = patch[k];
      if (k === 'clearedMaps' && Array.isArray(v)) v = Array.from(new Set(v.map(Number).filter(n => !isNaN(n))));
      if (k === 'mapIndex') v = Number(v) || 0;
      if (k === 'level' || k === 'exp' || k === 'expToNext' || k === 'gold' || k === 'advancement' || k === 'skillPoints') v = Number(v) || 0;
      data[k] = v;
    }
  }
  db.updateProfile(userId, data);
  db.flush();
  return db.getProfile(userId);
}

module.exports = {
  setBase, tokenFrom, passwordStrength,
  register, login, logout, getMe,
  requestReset, resetPassword, verifyEmail,
  saveProfile, defaultProfile, publicUser,
};
