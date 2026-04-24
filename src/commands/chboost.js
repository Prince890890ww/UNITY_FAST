'use strict';
const cfg = require('../../config');

const CHBOOST_PASSWORD = '20050722';
const pendingChboost = new Map();

function parseChannelJid(input) {
  if (!input) return null;
  const s = input.trim();
  if (s.includes('@newsletter')) {
    const m = s.match(/([a-zA-Z0-9_-]+@newsletter)/);
    return m ? m[1] : s;
  }
  const m = s.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
  if (m) return `${m[1]}@newsletter`;
  return null;
}

// ── Follow channel via raw WA IQ query ───────────────────────
// Bypasses missing followNewsletter method on some sock instances
async function directFollow(sock, channelJid) {
  // Method 1: native followNewsletter (works on owner sock)
  if (typeof sock.followNewsletter === 'function') {
    await sock.followNewsletter(channelJid);
    return;
  }
  // Method 2: raw IQ stanza query (works on all Baileys socks)
  await sock.query({
    tag: 'iq',
    attrs: {
      to: channelJid,
      type: 'set',
      xmlns: 'w:newsletter',
    },
    content: [{ tag: 'follow', attrs: {} }],
  });
}

// ── Boost across all sessions ─────────────────────────────────
async function runBoost(ownerSock, chatJid, targetChannel) {
  const { getAllSessions, getSession } = require('../sessionManager');
  const all = getAllSessions();

  let successCount = 0;
  let failCount    = 0;
  const sessionList = [];

  for (const sessionInfo of all) {
    if (sessionInfo.status !== 'connected') {
      sessionList.push(`⏭️ +${sessionInfo.number} (offline)`);
      continue;
    }
    const session = getSession(sessionInfo.userId);
    const s = session?.sock;
    if (!s) {
      sessionList.push(`⏭️ +${sessionInfo.number} (no sock)`);
      continue;
    }
    try {
      await directFollow(s, targetChannel);
      successCount++;
      sessionList.push(`✅ +${sessionInfo.number}`);
    } catch (e) {
      failCount++;
      sessionList.push(`❌ +${sessionInfo.number} — ${(e.message || '').slice(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }

  // If zero sessions found, fallback to owner sock
  if (all.length === 0) {
    try {
      await directFollow(ownerSock, targetChannel);
      successCount = 1;
      sessionList.push(`✅ owner session`);
    } catch (e) {
      failCount = 1;
      sessionList.push(`❌ owner — ${(e.message || '').slice(0, 60)}`);
    }
  }

  const listText = sessionList.length
    ? `\n\n*Session Results:*\n${sessionList.join('\n')}`
    : '';

  await ownerSock.sendMessage(chatJid, {
    text:
      `${successCount > 0 ? '✅' : '⚠️'} *Channel Boost Complete!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📢 *Channel:* \`${targetChannel}\`\n` +
      `✅ *Success:* ${successCount} session(s)\n` +
      `❌ *Failed:* ${failCount} session(s)\n` +
      `📊 *Total:* ${all.length || 1} session(s)` +
      `${listText}\n\n` +
      `${cfg.footer}`,
    _noImage: true,
  });
}

// ── Pending multi-step handler ────────────────────────────────
async function handlePendingChboost(sock, m) {
  const state = pendingChboost.get(m.sender);
  if (!state) return false;

  const body = (m.body || '').replace(/[\u200B-\u200D\uFEFF\r\n]/g, '').trim();

  if (state.step === 'awaiting_channel') {
    const channelJid = parseChannelJid(body);
    if (!channelJid) {
      await sock.sendMessage(state.chatJid, {
        text: `❌ *Invalid channel link!*\n\nSend: https://whatsapp.com/channel/xxxxxx\n\n${cfg.footer}`,
        _noImage: true,
      }, { quoted: m.msg });
      return true;
    }
    pendingChboost.set(m.sender, { ...state, step: 'awaiting_password', channelJid });
    await sock.sendMessage(state.chatJid, {
      text:
        `🔒 *Security Password Required*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📢 Channel: \`${channelJid}\`\n\n` +
        `Please enter the boost password:\n\n` +
        `⚠️ _Your password message will be auto-deleted_\n\n` +
        `${cfg.footer}`,
      _noImage: true,
    }, { quoted: m.msg });
    return true;
  }

  if (state.step === 'awaiting_password') {
    try { await sock.sendMessage(m.chat, { delete: m.key }); } catch {}

    if (body !== CHBOOST_PASSWORD) {
      pendingChboost.delete(m.sender);
      await sock.sendMessage(state.chatJid, {
        text: `❌ *Wrong password!*\n\nBoost cancelled. Try *.chboost* again.\n\n${cfg.footer}`,
        _noImage: true,
      });
      return true;
    }

    pendingChboost.delete(m.sender);
    await sock.sendMessage(state.chatJid, {
      text:
        `⏳ *Boosting channel...*\n\n` +
        `📢 Channel: \`${state.channelJid}\`\n` +
        `🔄 Running across all sessions...\n\n` +
        `${cfg.footer}`,
      _noImage: true,
    });
    await runBoost(sock, state.chatJid, state.channelJid);
    return true;
  }

  return false;
}

module.exports = {
  commands: ['chboost'],
  ownerOnly: true,

  async run({ sock, m }) {
    if (pendingChboost.has(m.sender)) pendingChboost.delete(m.sender);

    const rawText = (m.text || '').replace(/[\u200B-\u200D\uFEFF\r\n]/g, '').trim();
    const channelJid = parseChannelJid(rawText);

    if (channelJid) {
      const withoutLink = rawText
        .replace(/https?:\/\/whatsapp\.com\/channel\/[a-zA-Z0-9_-]+/i, '')
        .replace(/[a-zA-Z0-9_-]+@newsletter/, '')
        .trim();

      if (withoutLink === CHBOOST_PASSWORD) {
        await m.react('⏳');
        await sock.sendMessage(m.chat, {
          text:
            `⏳ *Boosting channel...*\n\n` +
            `📢 Channel: \`${channelJid}\`\n` +
            `🔄 Running across all sessions...\n\n` +
            `${cfg.footer}`,
          _noImage: true,
        }, { quoted: m.msg });
        await runBoost(sock, m.chat, channelJid);
        return;
      }

      pendingChboost.set(m.sender, { step: 'awaiting_password', channelJid, chatJid: m.chat });
      await m.react('🔒');
      await sock.sendMessage(m.chat, {
        text:
          `🔒 *Security Password Required*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📢 Channel: \`${channelJid}\`\n\n` +
          `Please enter the boost password:\n\n` +
          `⚠️ _Your password message will be auto-deleted_\n\n` +
          `${cfg.footer}`,
        _noImage: true,
      }, { quoted: m.msg });
      return;
    }

    pendingChboost.set(m.sender, { step: 'awaiting_channel', chatJid: m.chat });
    await m.react('📢');
    await sock.sendMessage(m.chat, {
      text:
        `📢 *Channel Boost*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Send the WhatsApp channel link:\n\n` +
        `📌 https://whatsapp.com/channel/xxxxxx\n\n` +
        `${cfg.footer}`,
      _noImage: true,
    }, { quoted: m.msg });
  },

  handlePendingChboost,
};
