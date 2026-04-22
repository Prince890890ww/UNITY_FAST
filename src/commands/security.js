'use strict';
const crypto = require('crypto');
const cfg = require('../../config');
const db = require('./index');

// ── OTP store (2FA) ───────────────────────────────────────────
const otpStore = new Map(); // jid -> { otp, expires }

// ── Generate OTP ──────────────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Send OTP to owner ─────────────────────────────────────────
async function sendOTP(sock, jid) {
  const otp = generateOTP();
  otpStore.set(jid, { otp, expires: Date.now() + 5 * 60 * 1000 });
  await sock.sendMessage(jid, {
    text:
      `🔐 *UNITY-MD 2FA Code*\n\n` +
      `Your OTP: *${otp}*\n\n` +
      `⏱️ Expires in 5 minutes.\n\n` +
      `${cfg.footer}`
  });
  return otp;
}

// ── Verify OTP ────────────────────────────────────────────────
function verifyOTP(jid, input) {
  const entry = otpStore.get(jid);
  if (!entry) return false;
  if (Date.now() > entry.expires) { otpStore.delete(jid); return false; }
  if (entry.otp === input) { otpStore.delete(jid); return true; }
  return false;
}

// ── Suspicious link detector ──────────────────────────────────
const PHISHING_PATTERNS = [
  /bit\.ly\/[a-zA-Z0-9]+/i,
  /tinyurl\.com\/[a-zA-Z0-9]+/i,
  /free.*prize/i,
  /click.*here.*win/i,
  /verify.*account.*now/i,
  /your.*account.*suspended/i,
  /whatsapp.*prize/i,
  /free.*recharge/i,
  /earn.*money.*fast/i,
  /casino.*free/i,
  /\.xyz\//i,
  /\.tk\//i,
  /\.ml\//i,
  /\.ga\//i,
  /\.cf\//i,
];

function isSuspiciousLink(text) {
  if (!cfg.features.linkDetector) return false;
  return PHISHING_PATTERNS.some(p => p.test(text));
}

// ── IP abuse detection ────────────────────────────────────────
const ipTracker = new Map();

function checkIPAbuse(ip) {
  if (!cfg.features.ipDetection) return false;
  const now = Date.now();
  if (!ipTracker.has(ip)) ipTracker.set(ip, []);
  const times = ipTracker.get(ip).filter(t => now - t < 60000);
  times.push(now);
  ipTracker.set(ip, times);
  return times.length > 100;
}

// ── Session encryption ────────────────────────────────────────
const SESSION_KEY = crypto.createHash('sha256')
  .update('UNITY_MD_SESSION_KEY_2025').digest();
const SESSION_IV = crypto.createHash('md5')
  .update('UNITY_SESSION_IV').digest();

function encryptSession(data) {
  if (!cfg.features.sessionEncryption) return JSON.stringify(data);
  const c = crypto.createCipheriv('aes-256-cbc', SESSION_KEY, SESSION_IV);
  return c.update(JSON.stringify(data), 'utf8', 'hex') + c.final('hex');
}

function decryptSession(data) {
  if (!cfg.features.sessionEncryption) return JSON.parse(data);
  try {
    const d = crypto.createDecipheriv('aes-256-cbc', SESSION_KEY, SESSION_IV);
    return JSON.parse(d.update(data, 'hex', 'utf8') + d.final('utf8'));
  } catch (e) {
    return JSON.parse(data);
  }
}

// ── Command audit ─────────────────────────────────────────────
async function auditCommand({ userJid, userName, command, groupJid, success, details }) {
  if (!cfg.features.auditLog) return;
  try {
    await db.logAudit({ userJid, userName, command, groupJid, success, details });
  } catch (e) {}
}

// ── Clean old OTPs every minute ───────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otpStore) {
    if (now > v.expires) otpStore.delete(k);
  }
}, 60000);

// ── Clean old IP records every 5 min ─────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of ipTracker) {
    const fresh = times.filter(t => now - t < 60000);
    if (!fresh.length) ipTracker.delete(ip);
    else ipTracker.set(ip, fresh);
  }
}, 5 * 60 * 1000);

module.exports = {
  generateOTP, sendOTP, verifyOTP,
  isSuspiciousLink,
  checkIPAbuse,
  encryptSession, decryptSession,
  auditCommand,
};