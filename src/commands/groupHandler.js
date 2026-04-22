'use strict';
const cfg = require('../../config');
const db = require('./index');
const logger = require('./logger');

// ── Spam tracker ──────────────────────────────────────────────
const spamMap  = new Map(); // jid -> [timestamps]
const floodMap = new Map(); // groupJid -> Map(senderJid -> [ts])
const raidMap  = new Map(); // groupJid -> [join timestamps]

// ── Main group message protection ────────────────────────────
async function handleGroupProtection(sock, msg) {
  try {
    const jid = msg.key?.remoteJid;
    if (!jid?.endsWith('@g.us')) return;

    const group = await db.getGroup(jid);
    const s = group.settings;
    const sender = msg.key?.participant || msg.participant || '';
    if (!sender) return;

    const msgType = Object.keys(msg.message || {})[0];
    const body =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption || '';

    // ── Anti-spam ────────────────────────────────────────────
    if (s.antiSpam) {
      const now = Date.now();
      if (!spamMap.has(sender)) spamMap.set(sender, []);
      const times = spamMap.get(sender).filter(t => now - t < 5000);
      times.push(now);
      spamMap.set(sender, times);

      if (times.length >= 5) {
        await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
        await sock.sendMessage(jid, {
          text:
            `⚠️ *Anti-Spam*\n\n` +
            `@${sender.split('@')[0]} spam detected!\n\n` +
            `${cfg.footer}`,
          mentions: [sender],
        });
        const warns = await db.warnUser(sender, 'spam');
        if (warns >= cfg.limits.warnLimit) {
          await sock.groupParticipantsUpdate(jid, [sender], 'remove').catch(() => {});
        }
        return;
      }
    }

    // ── Anti-link ────────────────────────────────────────────
    if (s.antiLink) {
      const linkRegex = /(https?:\/\/|www\.|wa\.me\/|chat\.whatsapp\.com\/)[^\s]*/i;
      if (linkRegex.test(body)) {
        await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
        await sock.sendMessage(jid, {
          text:
            `🔗 *Anti-Link*\n\n` +
            `@${sender.split('@')[0]} links not allowed!\n\n` +
            `${cfg.footer}`,
          mentions: [sender],
        });
        const warns = await db.warnUser(sender, 'sent link');
        if (warns >= cfg.limits.warnLimit) {
          await sock.groupParticipantsUpdate(jid, [sender], 'remove').catch(() => {});
        }
        return;
      }
    }

    // ── Anti-toxic ────────────────────────────────────────────
    if (s.antiToxic && group.bannedWords?.length) {
      const lower = body.toLowerCase();
      const found = group.bannedWords.find(w => lower.includes(w.toLowerCase()));
      if (found) {
        await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
        await sock.sendMessage(jid, {
          text:
            `🚫 *Anti-Toxic*\n\n` +
            `@${sender.split('@')[0]} inappropriate language!\n\n` +
            `${cfg.footer}`,
          mentions: [sender],
        });
        await db.warnUser(sender, `bad word: ${found}`);
        return;
      }
    }

    // ── Anti-forward ─────────────────────────────────────────
    if (s.antiForward) {
      const isForwarded = msg.message?.[msgType]?.contextInfo?.isForwarded;
      if (isForwarded) {
        await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
        return;
      }
    }

    // ── Flood detect ─────────────────────────────────────────
    if (s.floodDetect) {
      const now = Date.now();
      if (!floodMap.has(jid)) floodMap.set(jid, new Map());
      const gFlood = floodMap.get(jid);
      if (!gFlood.has(sender)) gFlood.set(sender, []);
      const sTimes = gFlood.get(sender).filter(t => now - t < 3000);
      sTimes.push(now);
      gFlood.set(sender, sTimes);

      if (sTimes.length >= 8) {
        await sock.sendMessage(jid, {
          text:
            `⚡ *Flood Detected!*\n\n` +
            `@${sender.split('@')[0]} muted for 5 minutes.\n\n` +
            `${cfg.footer}`,
          mentions: [sender],
        });
        setTimeout(() => gFlood.set(sender, []), 5 * 60 * 1000);
        return;
      }
    }

    // ── Slowmode ──────────────────────────────────────────────
    if (s.slowMode) {
      const now = Date.now();
      if (!spamMap.has(`slow_${sender}`)) {
        spamMap.set(`slow_${sender}`, now);
      } else {
        const last = spamMap.get(`slow_${sender}`);
        const diff = (now - last) / 1000;
        if (diff < s.slowModeDelay) {
          await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
          return;
        }
        spamMap.set(`slow_${sender}`, now);
      }
    }

    // ── Keyword auto-reply ────────────────────────────────────
    if (group.keywords?.length) {
      for (const kw of group.keywords) {
        if (body.toLowerCase().includes(kw.trigger.toLowerCase())) {
          await sock.sendMessage(jid, { text: kw.reply }, { quoted: msg });
          break;
        }
      }
    }

  } catch (e) {
    logger.error(`[GROUP PROTECTION] ${e.message}`);
  }
}

// ── Group join ────────────────────────────────────────────────
async function handleGroupJoin(sock, update) {
  try {
    const { id, participants, action } = update;
    if (action !== 'add') return;

    // Only the session that is actually IN this group should handle it
    try {
      const groupMeta = await sock.groupMetadata(id);
      const botJid = sock.user?.id?.replace(/:.*@/, '@') || '';
      const isMember = groupMeta.participants.some(p => p.id.replace(/:.*@/, '@') === botJid);
      if (!isMember) return;
    } catch (e) {
      // If we can't fetch metadata, this session isn't in the group
      return;
    }

    const group  = await db.getGroup(id);
    const s      = group.settings;
    const ownerJid = cfg.ownerNumber + '@s.whatsapp.net';

    // Anti-raid
    const now = Date.now();
    if (!raidMap.has(id)) raidMap.set(id, []);
    const joins = raidMap.get(id).filter(t => now - t < 30000);
    joins.push(...participants.map(() => now));
    raidMap.set(id, joins);

    if (s.antiRaid && joins.length >= 10) {
      await sock.groupSettingUpdate(id, 'announcement').catch(() => {});
      await sock.sendMessage(id, {
        text:
          `🚨 *Raid Detected!*\n\n` +
          `Group locked for 5 minutes.\n\n` +
          `${cfg.footer}`,
      });
      await sock.sendMessage(ownerJid, {
        text:
          `🚨 *RAID ALERT!*\n\n` +
          `📍 Group: ${id}\n` +
          `👥 Mass join: ${joins.length}\n` +
          `🔒 Auto-locked\n\n` +
          `${cfg.footer}`,
      }).catch(() => {});
      setTimeout(() => {
        sock.groupSettingUpdate(id, 'not_announcement').catch(() => {});
        raidMap.set(id, []);
      }, 5 * 60 * 1000);
      return;
    }

    // New member auto-DM
    for (const p of participants) {
      await sock.sendMessage(p, {
        text:
          `👋 *Welcome!*\n\n` +
          `You joined *${group.name || 'the group'}*.\n\n` +
          `Use *.rules* to see group rules.\n\n` +
          `${cfg.footer}`,
      }).catch(() => {});
    }

  } catch (e) {
    logger.error(`[GROUP JOIN] ${e.message}`);
  }
}

// ── Group leave ───────────────────────────────────────────────
async function handleGroupLeave(sock, update) {
  try {
    const { id, participants, action } = update;
    if (action !== 'remove') return;
    // Logging only — no goodbye message (removed per design)
    logger.info(`[GROUP] ${participants.length} left ${id}`);
  } catch (e) {}
}

// ── Cleanup every 10 minutes ──────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [k, times] of spamMap) {
    if (typeof times === 'number') {
      if (now - times > 60000) spamMap.delete(k);
    } else {
      const fresh = times.filter(t => now - t < 60000);
      if (!fresh.length) spamMap.delete(k);
      else spamMap.set(k, fresh);
    }
  }
  for (const [id, times] of raidMap) {
    const fresh = times.filter(t => now - t < 60000);
    if (!fresh.length) raidMap.delete(id);
    else raidMap.set(id, fresh);
  }
}, 10 * 60 * 1000);

module.exports = { handleGroupProtection, handleGroupJoin, handleGroupLeave };