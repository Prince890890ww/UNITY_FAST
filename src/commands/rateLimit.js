'use strict';
const cfg = require('../../config');

// ── Rate limit map ────────────────────────────────────────────
const rateLimitMap = new Map(); // jid -> [timestamps]
const cooldownMap  = new Map(); // jid:cmd -> timestamp

// ── Rate limit check ──────────────────────────────────────────
function isRateLimited(jid) {
  const limit = cfg.limits.rateLimitPerMinute;
  const now   = Date.now();
  const window = 60 * 1000;

  if (!rateLimitMap.has(jid)) rateLimitMap.set(jid, []);
  const times = rateLimitMap.get(jid).filter(t => now - t < window);
  times.push(now);
  rateLimitMap.set(jid, times);

  return times.length > limit;
}

// ── Set cooldown ──────────────────────────────────────────────
function setCooldown(jid, cmd) {
  const key = `${jid}:${cmd}`;
  cooldownMap.set(key, Date.now());
}

// ── Check cooldown ────────────────────────────────────────────
function isOnCooldown(jid, cmd) {
  const key  = `${jid}:${cmd}`;
  const last = cooldownMap.get(key);
  if (!last) return false;
  return Date.now() - last < cfg.limits.cooldownMs;
}

// ── Get remaining cooldown ms ─────────────────────────────────
function getCooldownRemaining(jid, cmd) {
  const key  = `${jid}:${cmd}`;
  const last = cooldownMap.get(key);
  if (!last) return 0;
  const remaining = cfg.limits.cooldownMs - (Date.now() - last);
  return remaining > 0 ? remaining : 0;
}

// ── Command flood detection (anti-stuck / server-kill attack) ────
// Same JID sending >8 commands in 10s → 30-min temp ban
const _floodMap = new Map(); // jid → [timestamps]
const _tempBan  = new Map(); // jid → ban_until_timestamp
const FLOOD_WIN = 10 * 1000;       // 10s window
const FLOOD_MAX = 8;               // max 8 commands in 10s
const BAN_DUR   = 30 * 60 * 1000; // 30 min

function isCommandFlooding(jid) {
  const now = Date.now();
  const bannedUntil = _tempBan.get(jid);
  if (bannedUntil) {
    if (now < bannedUntil) return true;
    _tempBan.delete(jid); // ban expired
  }
  const hits = (_floodMap.get(jid) || []).filter(t => now - t < FLOOD_WIN);
  hits.push(now);
  _floodMap.set(jid, hits);
  if (hits.length > FLOOD_MAX) {
    _tempBan.set(jid, now + BAN_DUR);
    _floodMap.delete(jid);
    return true;
  }
  return false;
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
}, 5 * 60 * 1000);

module.exports = {
  isRateLimited,
  setCooldown,
  isOnCooldown,
  getCooldownRemaining,
  isCommandFlooding,
};