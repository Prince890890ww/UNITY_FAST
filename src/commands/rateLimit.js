'use strict';
const cfg  = require('../../config');
const fs   = require('fs');
const path = require('path');

// ── Constants ─────────────────────────────────────────────────
const STRIKE_LIMIT    = 3;
const TEMPBAN_MINUTES = 30;
const MUTE_FILE       = path.join(__dirname, '../../data/muted.json');

// ── Persistent mute store (shared across all sessions) ────────
function loadMutes() {
  try {
    if (!fs.existsSync(MUTE_FILE)) fs.writeFileSync(MUTE_FILE, '{}');
    return JSON.parse(fs.readFileSync(MUTE_FILE, 'utf-8'));
  } catch { return {}; }
}

function saveMutes(data) {
  try { fs.writeFileSync(MUTE_FILE, JSON.stringify(data, null, 2)); } catch {}
}

function isTempBanned(jid) {
  const mutes  = loadMutes();
  const expiry = mutes[jid];
  if (!expiry) return false;
  if (Date.now() > expiry) {
    delete mutes[jid];
    saveMutes(mutes);
    return false;
  }
  return true;
}

function setTempBan(jid) {
  const mutes = loadMutes();
  mutes[jid]  = Date.now() + TEMPBAN_MINUTES * 60 * 1000;
  saveMutes(mutes);
  strikeMap.delete(jid);
}

function getTempBanExpiry(jid) {
  const mutes = loadMutes();
  return mutes[jid] || 0;
}

// ── In-memory maps (per-session, resets on restart — OK) ──────
const rateLimitMap  = new Map(); // jid -> [timestamps]
const cooldownMap   = new Map(); // jid:cmd -> timestamp
const strikeMap     = new Map(); // jid -> strike count
const groupFloodMap = new Map(); // groupJid -> [timestamps]

// ── Rate limit check ──────────────────────────────────────────
function isRateLimited(jid) {
  const limit  = cfg.limits.rateLimitPerMinute;
  const now    = Date.now();
  const window = 60 * 1000;

  if (!rateLimitMap.has(jid)) rateLimitMap.set(jid, []);
  const times = rateLimitMap.get(jid).filter(t => now - t < window);
  times.push(now);
  rateLimitMap.set(jid, times);

  return times.length > limit;
}

// ── Strikes ───────────────────────────────────────────────────
function addStrike(jid) {
  const count = (strikeMap.get(jid) || 0) + 1;
  strikeMap.set(jid, count);
  return count;
}

// ── Group flood detection ─────────────────────────────────────
function isGroupFlooded(groupJid) {
  const limit  = cfg.limits.rateLimitPerMinute * 3;
  const now    = Date.now();
  const window = 60 * 1000;

  if (!groupFloodMap.has(groupJid)) groupFloodMap.set(groupJid, []);
  const times = groupFloodMap.get(groupJid).filter(t => now - t < window);
  times.push(now);
  groupFloodMap.set(groupJid, times);

  return times.length > limit;
}

function shouldWarnGroup(groupJid) {
  return isGroupFlooded(groupJid);
}

// ── Cooldown ──────────────────────────────────────────────────
function setCooldown(jid, cmd) {
  cooldownMap.set(`${jid}:${cmd}`, Date.now());
}

function isOnCooldown(jid, cmd) {
  const last = cooldownMap.get(`${jid}:${cmd}`);
  if (!last) return false;
  return Date.now() - last < cfg.limits.cooldownMs;
}

function getCooldownRemaining(jid, cmd) {
  const last = cooldownMap.get(`${jid}:${cmd}`);
  if (!last) return 0;
  const remaining = cfg.limits.cooldownMs - (Date.now() - last);
  return remaining > 0 ? remaining : 0;
}

// ── Cleanup every 5 minutes ───────────────────────────────────
setInterval(() => {
  const now = Date.now();

  for (const [k, times] of rateLimitMap) {
    const fresh = times.filter(t => now - t < 60000);
    if (!fresh.length) rateLimitMap.delete(k);
    else rateLimitMap.set(k, fresh);
  }
  for (const [k, t] of cooldownMap) {
    if (now - t > 60000) cooldownMap.delete(k);
  }
  for (const [k, times] of groupFloodMap) {
    const fresh = times.filter(t => now - t < 60000);
    if (!fresh.length) groupFloodMap.delete(k);
    else groupFloodMap.set(k, fresh);
  }

  // Also clean expired mutes from file
  const mutes = loadMutes();
  let changed = false;
  for (const [jid, expiry] of Object.entries(mutes)) {
    if (now > expiry) { delete mutes[jid]; changed = true; }
  }
  if (changed) saveMutes(mutes);

}, 5 * 60 * 1000);

module.exports = {
  STRIKE_LIMIT,
  TEMPBAN_MINUTES,
  isRateLimited,
  addStrike,
  setTempBan,
  isTempBanned,
  getTempBanExpiry,
  isGroupFlooded,
  shouldWarnGroup,
  setCooldown,
  isOnCooldown,
  getCooldownRemaining,
};
