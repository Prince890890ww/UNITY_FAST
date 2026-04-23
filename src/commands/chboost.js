'use strict';
const cfg = require('../../config');

// ── CHBOOST password ──────────────────────────────────────────
const CHBOOST_PASSWORD = '20050722';

// ── Multi-step pending state ──────────────────────────────────
// Map<senderJid, { step, channelJid, chatJid }>
const pendingChboost = new Map();

// ── Parse channel JID from link or raw JID ────────────────────
function parseChannelJid(input) {
  if (!input) return null;
  const s = input.trim();
  if (s.includes('@newsletter')) return s;
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
      } catch (e) {
        failCount++;
        sessionList.push(`❌ +${sessionInfo.number}`);
      }

      // Small delay to avoid rate-limit
      await new Promise(r => setTimeout(r, 800));
    }
  } catch (e) {
    // fallback: use current sock only
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

// ── Handle pending multi-step input (called from messageHandler) ──
async function handlePendingChboost(sock, m) {
  const state = pendingChboost.get(m.sender);
  if (!state) return false;

  const body = m.body?.trim() || '';

  // ── Step 1: user sends channel link ──────────────────────────
  if (state.step === 'awaiting_channel') {
    const channelJid = parseChannelJid(body);
    if (!channelJid) {
      await sock.sendMessage(state.chatJid, {
        text:
          `❌ *Invalid channel link!*\n\n` +
          `Please send a valid WhatsApp channel link:\n` +
          `https://whatsapp.com/channel/xxxxxx\n\n` +
          `${cfg.footer}`,
        _noImage: true,
      }, { quoted: m.msg });
      return true;
    }

    pendingChboost.set(m.sender, {
      ...state,
      step: 'awaiting_password',
      channelJid,
    });

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

  // ── Step 2: user sends password ───────────────────────────────
  if (state.step === 'awaiting_password') {
    // Delete password message immediately (security)
    try {
      await sock.sendMessage(m.chat, { delete: m.key });
    } catch {}

    if (body !== CHBOOST_PASSWORD) {
      pendingChboost.delete(m.sender);
      await sock.sendMessage(state.chatJid, {
        text:
          `❌ *Wrong password!*\n\n` +
          `Boost cancelled. Try *.chboost* again.\n\n` +
          `${cfg.footer}`,
        _noImage: true,
      });
      return true;
    }

    pendingChboost.delete(m.sender);
    const targetChannel = state.channelJid;

    await sock.sendMessage(state.chatJid, {
      text:
        `⏳ *Boosting channel...*\n\n` +
        `📢 Channel: \`${targetChannel}\`\n` +
        `🔄 Running across all sessions...\n\n` +
        `${cfg.footer}`,
      _noImage: true,
    });

    await runBoost(sock, state.chatJid, targetChannel);
    return true;
  }

  return false;
}

// ── Plugin export ─────────────────────────────────────────────
module.exports = {
  commands: ['chboost'],
  ownerOnly: true,

  async run({ sock, m }) {
    // Cancel any existing pending state
    if (pendingChboost.has(m.sender)) {
      pendingChboost.delete(m.sender);
    }

    // ── Link inline: .chboost <link> — skip to password step ──
    const inlineLink = parseChannelJid(m.text?.trim());
    if (inlineLink) {
      pendingChboost.set(m.sender, {
        step: 'awaiting_password',
        channelJid: inlineLink,
        chatJid: m.chat,
      });

      await m.react('🔒');
      await sock.sendMessage(m.chat, {
        text:
          `🔒 *Security Password Required*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📢 Channel: \`${inlineLink}\`\n\n` +
          `Please enter the boost password:\n\n` +
          `⚠️ _Your password message will be auto-deleted_\n\n` +
          `${cfg.footer}`,
        _noImage: true,
      }, { quoted: m.msg });
      return;
    }

    // ── No link — ask for it ──────────────────────────────────
    pendingChboost.set(m.sender, {
      step: 'awaiting_channel',
      chatJid: m.chat,
    });

    await m.react('📢');
    await sock.sendMessage(m.chat, {
      text:
        `📢 *Channel Boost*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Send the WhatsApp channel link you want to boost:\n\n` +
        `📌 Format:\n` +
        `https://whatsapp.com/channel/xxxxxx\n\n` +
        `_Or send the channel JID directly_\n\n` +
        `${cfg.footer}`,
      _noImage: true,
    }, { quoted: m.msg });
  },

  // Export for messageHandler
  handlePendingChboost,
};
