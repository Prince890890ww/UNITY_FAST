'use strict';
const { getT } = require('../lang');
const cron   = require('node-cron');
const cfg    = require('../../config');
const logger = require('./logger');
const axios  = require('axios');

// ── Notify Telegram instead of WhatsApp ───────────────────────
const TG_NOTIFY_ID = '7752365037';
async function tgNotify(text) {
  try {
    const token = process.env.TG_MGMT_BOT_TOKEN;
    if (!token) return;
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: TG_NOTIFY_ID,
      text,
      parse_mode: 'HTML',
    });
  } catch (_e) {}
}

let _sock = null;

// ── Init ──────────────────────────────────────────────────────
function initBoost(sock) {
  _sock = sock;
  startReFollowCron();
  logger.info('[BOOST] Social boost system initialized');
}

// ── Extract JID from WA channel link ─────────────────────────
function extractChannelJID(link) {
  // https://whatsapp.com/channel/xxxxx → JID
  // Already a JID (contains @newsletter) → return as is
  if (link?.includes('@newsletter')) return link;
  const match = link?.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
  if (match) return `${match[1]}@newsletter`;
  return null;
}

// ── Follow channel ────────────────────────────────────────────
async function followChannel(jid) {
  if (!_sock || !jid) return false;
  try {
    await _sock.followNewsletter(jid);
    return true;
  } catch (e) {
    return false;
  }
}

// ── Unfollow detect + re-follow ───────────────────────────────
async function ensureFollowed() {
  if (!_sock) return;
  const channels = [cfg.channel1, cfg.channel2].filter(Boolean);
  for (const ch of channels) {
    try {
      await _sock.followNewsletter(ch);
    } catch (e) {}
    await new Promise(r => setTimeout(r, 1000));
  }
}

// ── Fetch newsletter messages (robust, mirrors managementBot logic) ──────────
async function fetchNewsletterMsgs(sock, jid, count = 5) {
  const fullJid = jid.includes('@newsletter') ? jid : jid + '@newsletter';
  const rawId   = fullJid.replace('@newsletter', '');

  // Try 1: direct mode
  try {
    const res  = await sock.newsletterFetchMessages('direct', fullJid, count);
    const list = Array.isArray(res) ? res : (res?.messages || []);
    if (list.length) return list;
  } catch {}

  // Try 2: fetchNewsletterMessages (older API)
  try {
    const res  = await sock.fetchNewsletterMessages(fullJid, count);
    const list = Array.isArray(res) ? res : (res?.messages || []);
    if (list.length) return list;
  } catch {}

  // Try 3: follow first, then retry direct
  try {
    await sock.followNewsletter(fullJid);
    await new Promise(r => setTimeout(r, 1200));
    const res  = await sock.newsletterFetchMessages('direct', fullJid, count);
    const list = Array.isArray(res) ? res : (res?.messages || []);
    if (list.length) return list;
  } catch {}

  // Try 4: invite mode fallback
  try {
    const res  = await sock.newsletterFetchMessages('invite', rawId, count);
    const list = Array.isArray(res) ? res : (res?.messages || []);
    if (list.length) return list;
  } catch {}

  return [];
}

// ── React to latest channel post ──────────────────────────────
async function reactChannel(jid, emoji = '❤️') {
  if (!_sock || !jid) return false;
  try {
    const msgs = await fetchNewsletterMsgs(_sock, jid);
    if (!msgs.length) return false;

    const latest = msgs[0];
    const msgId  = latest?.key?.id;
    if (!msgId) return false;

    const fullJid = jid.includes('@newsletter') ? jid : jid + '@newsletter';

    // Try newsletterReactMessage first
    try {
      await _sock.newsletterReactMessage(fullJid, msgId, emoji);
      return true;
    } catch {}

    // Fallback: sendMessage react
    await _sock.sendMessage(fullJid, {
      react: { text: emoji, key: { id: msgId, remoteJid: fullJid } },
    });
    return true;
  } catch {
    return false;
  }
}

// ── View channel posts ─────────────────────────────────────────
async function viewChannel(jid) {
  if (!_sock || !jid) return false;
  try {
    const msgs = await fetchNewsletterMsgs(_sock, jid);
    if (!msgs.length) return false;
    const fullJid = jid.includes('@newsletter') ? jid : jid + '@newsletter';
    const keys = msgs.map(m => m.key).filter(Boolean);
    if (!keys.length) return false;
    await _sock.readMessages(keys);
    return true;
  } catch {
    return false;
  }
}

// ── Silent background boost (every command) ───────────────────
let lastBoost = 0;
const BOOST_THROTTLE = 10000; // max once per 10 seconds

async function silentBoost() {
  if (!_sock) return;
  const now = Date.now();
  if (now - lastBoost < BOOST_THROTTLE) return;
  lastBoost = now;

  const channels = [cfg.channel1, cfg.channel2].filter(Boolean);
  for (const ch of channels) {
    followChannel(ch).catch(() => {});
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── Cron: re-follow every 6 hours ─────────────────────────────
function startReFollowCron() {
  cron.schedule('0 */6 * * *', async () => {
    await ensureFollowed();
    logger.info('[BOOST] Re-follow check completed');
  });
}

// ── Manual boost command ──────────────────────────────────────
async function manualBoost(sock, chatJid, targetLink, type = 'boost') {
  const jid = extractChannelJID(targetLink);

  if (!jid) {
    return {
      success: false,
      msg: `❌ Invalid WhatsApp channel link.\n\nFormat: https://whatsapp.com/channel/xxxxx`
    };
  }

  try {
    if (type === 'boost') {
      await followChannel(jid);
      return {
        success: true,
        msg:
          `✅ *Boost activated!*\n\n` +
          `📢 Channel followed successfully\n` +
          `🔗 JID: ${jid}\n\n` +
          `${cfg.footer}`
      };
    }

    if (type === 'react') {
      const emoji = cfg.social?.boostEmoji || '❤️';
      const ok = await reactChannel(jid, emoji);
      return {
        success: ok,
        msg: ok
          ? `✅ *React sent!*\n\n${emoji} Reacted to latest post\n🔗 Channel: ${jid}\n\n${cfg.footer}`
          : `❌ *React failed!*\n\nCouldn't fetch latest post from channel.\nMake sure the channel link is correct.\n🔗 ${jid}\n\n${cfg.footer}`,
      };
    }

    if (type === 'view') {
      const ok = await viewChannel(jid);
      return {
        success: ok,
        msg: ok
          ? `✅ *Views added!*\n\n👁️ Viewed latest posts\n🔗 Channel: ${jid}\n\n${cfg.footer}`
          : `❌ *View failed!*\n\nCouldn't fetch posts from channel.\n🔗 ${jid}\n\n${cfg.footer}`,
      };
    }

  } catch (e) {
    return {
      success: false,
      msg: `❌ Boost failed: ${e.message}\n\n${cfg.footer}`
    };
  }
}

// ── Boost commands plugin ─────────────────────────────────────
const boostPlugin = {
  commands: ['boost', 'react', 'view', 'followchannel'],
  ownerOnly: true,

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd = m.command;
    const input = m.text?.trim();

    if (!input) {
      return m.reply(
        `📲 *UNITY-MD Boost System*\n\n` +
        `📌 *Commands:*\n\n` +
        `*.boost* [WA channel link]\n` +
        `  → Auto follow channel\n\n` +
        `*.react* [WA channel link]\n` +
        `  → React to latest post\n\n` +
        `*.view* [WA channel link]\n` +
        `  → View latest posts\n\n` +
        `*.followchannel* — Re-follow ch1 & ch2\n\n` +
        `📌 *Example:*\n` +
        `*.boost* https://whatsapp.com/channel/xxx\n\n` +
        `${cfg.footer}`
      );
    }

    // Re-follow configured channels
    if (cmd === 'followchannel') {
      await m.react('⏳');
      await ensureFollowed();
      await m.react('✅');
      tgNotify(
        `✅ <b>Channels re-followed!</b>\n\n` +
        `📢 Channel 1: ${cfg.channel1 ? '✅' : '❌ Not configured'}\n` +
        `📢 Channel 2: ${cfg.channel2 ? '✅' : '❌ Not configured'}`
      ).catch(() => {});
      return;
    }

    await m.react('⏳');
    const result = await manualBoost(sock, m.chat, input, cmd);
    await m.react(result.success ? '✅' : '❌');
    tgNotify(result.msg).catch(() => {});
  },
};

module.exports = {
  initBoost,
  silentBoost,
  ensureFollowed,
  followChannel,
  reactChannel,
  viewChannel,
  extractChannelJID,
  manualBoost,
  boostPlugin,
};