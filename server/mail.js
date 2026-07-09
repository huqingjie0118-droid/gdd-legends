// 邮件模块：真实 SMTP（可选 nodemailer）或 dev 本地回退（.mailbox + 控制台）
const fs = require('fs');
const path = require('path');

const MAILBOX_DIR = path.join(__dirname, '.mailbox');

function devDeliver(to, subject, link) {
  try {
    if (!fs.existsSync(MAILBOX_DIR)) fs.mkdirSync(MAILBOX_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(MAILBOX_DIR, `${ts}.txt`);
    const content = `收件人: ${to}\n主题:   ${subject}\n链接:   ${link}\n时间:   ${new Date().toLocaleString()}\n`;
    fs.writeFileSync(file, content);
    console.log(`[MAIL:dev] → ${to} | ${subject}\n        链接: ${link}\n        (已存至 ${file})`);
  } catch (e) {
    console.error('[MAIL:dev] 写入失败:', e.message);
  }
}

async function sendVerification(email, link) {
  const subject = '【传奇H5】请验证你的邮箱';
  if (process.env.SMTP_HOST) {
    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: +(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === '1',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await t.sendMail({ from: process.env.MAIL_FROM || 'noreply@legends.local', to: email, subject, text: `点击完成验证：\n${link}` });
      return;
    } catch (e) {
      console.warn('[MAIL] SMTP 发送失败，回退 dev 模式:', e.message);
    }
  }
  devDeliver(email, subject, link);
}

async function sendPasswordReset(email, link) {
  const subject = '【传奇H5】密码重置链接';
  if (process.env.SMTP_HOST) {
    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: +(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === '1',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await t.sendMail({ from: process.env.MAIL_FROM || 'noreply@legends.local', to: email, subject, text: `点击重置密码（1小时内有效）：\n${link}` });
      return;
    } catch (e) {
      console.warn('[MAIL] SMTP 发送失败，回退 dev 模式:', e.message);
    }
  }
  devDeliver(email, subject, link);
}

module.exports = { sendVerification, sendPasswordReset };
