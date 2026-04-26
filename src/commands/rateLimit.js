'use strict';
const cfg = require('../../config');

// ── Rate limit map ────────────────────────────────────────────
const rateLimitMap = new Map(); // jid -> [timestamps]
const cooldownMap  = new Map(); // jid:cmd -> timestamp

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
