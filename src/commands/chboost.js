'use strict';
const cfg = require('../../config');

// ── CHBOOST password ──────────────────────────────────────────
const CHBOOST_PASSWORD = '20050722';

// ── Multi-step pending state ──────────────────────────────────
const pendingChboost = new Map();

// ── Parse channel JID from any string ────────────────────────
function parseChannelJid(input) {
  if (!input) return null;
  const s = input.trim();
  if (s.includes('@newsletter')) {
    // extract just the JID part if mixed with other text
    const jidMatch = s.match(/([a-zA-Z0-9_-]+@newsletter)/);
    return jidMatch ? jidMatch[1] : s;
  }
  const m = s.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
  if (m) return `${m[1]}@newsletter`;
  return null;
}

// ── Run boost across all sessions ────────────────────────────
async function runBoost(sock, chatJid, targetChannel) {
  let successCount = 0;
  let failCount = 0;
  const sessionList = [];

  try {
    const { getAllSessions, getSession } = require('../sessionManager');
    const all = getAllSessions();

    for (const sessionInfo of all) {
      const session = getSession(sessionInfo.userId);
      if (!session?.sock) { failCount++; continue; }
      try {
        await session.sock.followNewsletter(targetChannel);
        successCount++;
        sessionList.push(`✅ +${sessionInfo.number}`);
      } catch {
        failCount++;
        sessionList.push(`❌ +${sessionInfo.number}`);
      }
      await new Promise(r => setTimeout(r, 800));
    }
  } catch {
    try {
      await sock.followNewsletter(targetChannel);
      successCount++;
    } catch { failCount++; }
  }

  const listText = sessionList.length
    ? `\n\n*Session Results:*\n${sessionList.join('\n')}`
    : '';

  await sock.sendMessage(chatJid, {
    text:
      `✅ *Channel Boost Complete!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📢 *Channel:* \`${targetChannel}\`\n` +
      `✅ *Success:* ${successCount} session(s)\n` +
      `❌ *Failed:* ${failCount} session(s)\n` +
      `📊 *Total:* ${successCount + failCount} session(s)` +
      `${listText}\n\n` +
      `${cfg.footer}`,
    _noImage: true,
  });
}

// ── Handle pending multi-step input ──────────────────────────
async function handlePendingChboost(sock, m) {
  const state = pendingChboost.get(m.sender);
  if (!state) return false;

  // Use body, stripped of any invisible chars
  const body = (m.body || '').replace(/[\u200B-\u200D\uFEFF\r\n]/g, '').trim();

  // ── Step 1: waiting for channel link ─────────────────────
  if (state.step === 'awaiting_channel') {
    const channelJid = parseChannelJid(body);
    if (!channelJid) {
      await sock.sendMessage(state.chatJid, {
        text:
          `❌ *Invalid channel link!*\n\n` +
          `Send a valid WhatsApp channel link:\n` +
          `https://whatsapp.com/channel/xxxxxx\n\n` +
          `${cfg.footer}`,
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

  // ── Step 2: waiting for password ──────────────────────────
  if (state.step === 'awaiting_password') {
    // Delete password message immediately
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

// ── Plugin export ─────────────────────────────────────────────
module.exports = {
  commands: ['chboost'],
  ownerOnly: true,

  async run({ sock, m }) {
    if (pendingChboost.has(m.sender)) pendingChboost.delete(m.sender);

    const rawText = (m.text || '').replace(/[\u200B-\u200D\uFEFF\r\n]/g, '').trim();

    // ── Extract channel link from text ────────────────────────
    const channelJid = parseChannelJid(rawText);

    if (channelJid) {
      // ── Check if password is also inline ─────────────────
      // Remove the URL/JID from rawText and check remaining
      const withoutLink = rawText
        .replace(/https?:\/\/whatsapp\.com\/channel\/[a-zA-Z0-9_-]+/i, '')
        .replace(/[a-zA-Z0-9_-]+@newsletter/, '')
        .trim();

      if (withoutLink === CHBOOST_PASSWORD) {
        // Both link + password in one message — boost directly!
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

      // Link only — ask for password
      pendingChboost.set(m.sender, {
        step: 'awaiting_password',
        channelJid,
        chatJid: m.chat,
      });
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

    // ── No link — ask for it ──────────────────────────────────
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
