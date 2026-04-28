'use strict';
const cfg = require('../../config');

// ── Rate limit maps ──────────────────────────────────────────
// Key: "sessionOwner|senderJid" → per-user per-session isolation
// So User A on Session 1 is counted separately from User A on Session 2
const rateLimitMap = new Map(); // "session|jid" -> [timestamps]
const cooldownMap  = new Map(); // "session|jid:cmd" -> timestamp

function _rlKey(session, jid)      { return `${session || 'default'}|${jid}`; }
function _cdKey(session, jid, cmd) { return `${session || 'default'}|${jid}:${cmd}`; }

// ── Rate limit check ──────────────────────────────────────────
function isRateLimited(jid, session) {
  const key    = _rlKey(session, jid);
  const limit  = cfg.limits.rateLimitPerMinute;
  const now    = Date.now();
  const window = 60 * 1000;

  if (!rateLimitMap.has(key)) rateLimitMap.set(key, []);
  const times = rateLimitMap.get(key).filter(t => now - t < window);
  times.push(now);
  rateLimitMap.set(key, times);

  return times.length > limit;
}

function setCooldown(jid, cmd, session) {
  cooldownMap.set(_cdKey(session, jid, cmd), Date.now());
}

function isOnCooldown(jid, cmd, session) {
  const last = cooldownMap.get(_cdKey(session, jid, cmd));
  if (!last) return false;
  return Date.now() - last < cfg.limits.cooldownMs;
}

function getCooldownRemaining(jid, cmd, session) {
  const last = cooldownMap.get(_cdKey(session, jid, cmd));
  if (!last) return 0;
  const r = cfg.limits.cooldownMs - (Date.now() - last);
  return r > 0 ? r : 0;
}

// ── Cleanup every 5 minutes ───────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [k, times] of rateLimitMap) {
    const fresh = times.filter(t => now - t < 60000);
    if (!fresh.length) rateLimitMap.delete(k); else rateLimitMap.set(k, fresh);
  }
  for (const [k, t] of cooldownMap) {
    if (now - t > 60000) cooldownMap.delete(k);
  }
}, 5 * 60 * 1000);

module.exports = { isRateLimited, setCooldown, isOnCooldown, getCooldownRemaining };
