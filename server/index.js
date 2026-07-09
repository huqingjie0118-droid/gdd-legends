// 传奇H5 账号服务（零依赖 Node HTTP）
const http = require('http');
const fs = require('fs');
const path = require('path');
const auth = require('./auth');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..'); // h5-game 目录（游戏静态资源）
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
auth.setBase(BASE);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      const ct = req.headers['content-type'] || '';
      try {
        if (ct.includes('application/json')) resolve(data ? JSON.parse(data) : {});
        else if (ct.includes('application/x-www-form-urlencoded')) {
          const o = {}; for (const [k, v] of new URLSearchParams(data)) o[k] = v; resolve(o);
        } else resolve(data ? JSON.parse(data) : {});
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS（游戏与 API 同源部署时也可跨域调用）
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const u = new URL(req.url, BASE);
  const p = u.pathname;

  try {
    if (p === '/api/health') return sendJSON(res, 200, { ok: true, ts: Date.now() });

    // 注册
    if (p === '/api/register' && req.method === 'POST') {
      const b = await readBody(req);
      const r = auth.register(b);
      return sendJSON(res, r.ok ? 200 : 400, r);
    }
    // 登录
    if (p === '/api/login' && req.method === 'POST') {
      const b = await readBody(req);
      const r = auth.login(b);
      return sendJSON(res, r.ok ? 200 : 401, r);
    }
    // 登出
    if (p === '/api/logout' && req.method === 'POST') {
      auth.logout(auth.tokenFrom(req));
      return sendJSON(res, 200, { ok: true });
    }
    // 当前会话
    if (p === '/api/me' && req.method === 'GET') {
      const r = auth.getMe(auth.tokenFrom(req));
      if (!r.ok) return sendJSON(res, 401, { ok: false, error: '未登录或会话已过期' });
      return sendJSON(res, 200, r);
    }
    // 找回密码（请求重置邮件）
    if (p === '/api/recover' && req.method === 'POST') {
      const b = await readBody(req);
      const r = auth.requestReset(b.email);
      return sendJSON(res, 200, r);
    }
    // 重置密码（表单页 + 提交）
    if (p === '/api/reset' && req.method === 'GET') {
      const tok = u.searchParams.get('token') || '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><meta charset="utf-8"><title>重置密码</title></head>
<body style="font-family:system-ui,sans-serif;max-width:380px;margin:80px auto;text-align:center;color:#222">
<h2>重置密码</h2>
<form method="POST" action="/api/reset">
<input type="hidden" name="token" value="${tok}">
<input name="password" type="password" placeholder="新密码(≥8位,含大小写数字)" required
  style="width:100%;padding:10px;margin:8px 0;box-sizing:border-box;border:1px solid #ccc;border-radius:8px">
<button style="padding:10px 24px;border:0;border-radius:8px;background:#c0392b;color:#fff;cursor:pointer">提交</button>
</form></body></html>`);
      return;
    }
    if (p === '/api/reset' && req.method === 'POST') {
      const b = await readBody(req);
      const r = auth.resetPassword(b.token, b.password);
      if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        return sendJSON(res, r.ok ? 200 : 400, r);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:60px;color:#222">
<h2>${r.ok ? '✅ 密码已重置，请用新密码登录' : '❌ ' + (r.error || '重置失败')}</h2>
<p><a href="/">返回游戏</a></p></body></html>`);
      return;
    }
    // 邮箱验证
    if (p === '/api/verify' && req.method === 'GET') {
      const r = auth.verifyEmail(u.searchParams.get('token'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:60px;color:#222">
<h2>${r.ok ? '✅ 邮箱验证成功！' : '❌ ' + (r.error || '验证失败')}</h2>
<p><a href="/">返回游戏</a></p></body></html>`);
      return;
    }
    // 档案读取
    if (p === '/api/profile' && req.method === 'GET') {
      const r = auth.getMe(auth.tokenFrom(req));
      if (!r.ok) return sendJSON(res, 401, { ok: false, error: '未登录' });
      return sendJSON(res, 200, { ok: true, profile: r.profile });
    }
    // 档案保存
    if (p === '/api/profile' && req.method === 'PUT') {
      const r = auth.getMe(auth.tokenFrom(req));
      if (!r.ok) return sendJSON(res, 401, { ok: false, error: '未登录' });
      const b = await readBody(req);
      const updated = auth.saveProfile(r.user.id, b);
      return sendJSON(res, 200, { ok: true, profile: updated });
    }

    // 静态资源
    return serveStatic(res, p);
  } catch (e) {
    console.error('[server] 错误:', e);
    sendJSON(res, 500, { ok: false, error: '服务器错误' });
  }
});

server.listen(PORT, () => {
  console.log(`\n🛡️  传奇H5 账号服务已启动`);
  console.log(`    游戏/接口: ${BASE}`);
  console.log(`    邮件模式:  ${process.env.SMTP_HOST ? 'SMTP(' + process.env.SMTP_HOST + ')' : 'dev 本地回退(.mailbox/)'}`);
  console.log('');
});
