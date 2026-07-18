'use strict';
/**
 * UNITY-MD — Telegram Pair Bot
 * Token: TG_PAIR_BOT_TOKEN
 * 
 * 🔥 PUBLIC MODE: Koi bhi user pair kar sakta hai
 * 🔥 RATE LIMITED: 1 request per minute per user (100 users ke liye safe)
 */

const TelegramBot = require('node-telegram-bot-api');
const cfg         = require('../../config');
const db          = require('../commands/index');
const logger      = require('../commands/logger');

let bot = null;

// ── Rate Limiting (Har user 1 minute mein sirf 1 request) ──
const rateLimit = new Map(); // chatId -> timestamp

const _inProgress = new Set();
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForPairCode(sess, timeoutMs = 60000) {
  let elapsed = 0;
  while (elapsed < timeoutMs) {
    if (sess.pairCode)               return { result: 'code',      pairCode: sess.pairCode };
    if (sess.status === 'connected') return { result: 'connected' };
    if (sess.status === 'error')     return { result: 'error' };
    await wait(500);
    elapsed += 500;
  }
  return { result: 'timeout' };
}

// ── Keyboards ─────────────────────────────────────────────────
const KB_START = {
  inline_keyboard: [[
    { text: '🔗 Pair My Number', callback_data: 'pair_start' },
  ], [
    { text: '📖 How It Works',   callback_data: 'pair_help'  },
  ]],
};
function kbRetry(num) {
  return {
    inline_keyboard: [[
      { text: '🔄 Try Again', callback_data: 'retry_' + num },
      { text: '🏠 Home',      callback_data: 'home'          },
    ]],
  };
}
const KB_HOME = {
  inline_keyboard: [[{ text: '🏠 Back to Home', callback_data: 'home' }]],
};

// ── Message templates ─────────────────────────────────────────
function msgStart(name) {
  return (
    '<b>╔══════════════════╗</b>\n' +
    '<b>║  🧲  UNITY-MD BOT  ║</b>\n' +
    '<b>╚══════════════════╝</b>\n\n' +
    '👋 Hey <b>' + (name || 'there') + '</b>! Welcome to the\n' +
    '<b>UNITY-MD Pairing Bot</b>\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '🔗 Connect your WhatsApp number to\n' +
    '   the <b>UNITY-MD</b> bot in seconds.\n\n' +
    '📌 All you need is your\n' +
    '   WhatsApp number with country code.\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n\n' +
    '<i>Tap a button below to get started 👇</i>'
  );
}
function msgHelp() {
  return (
    '<b>╔══════════════════╗</b>\n' +
    '<b>║   📖  HOW IT WORKS  ║</b>\n' +
    '<b>╚══════════════════╝</b>\n\n' +
    '<b>Step 1</b> — Send your number:\n' +
    '   <code>/pair 94771234567</code>\n' +
    '   <i>(include country code, no + or spaces)</i>\n\n' +
    '<b>Step 2</b> — You will receive a pairing code\n\n' +
    '<b>Step 3</b> — Open WhatsApp on your phone:\n' +
    '   ⚙️ Settings\n' +
    '   📱 Linked Devices\n' +
    '   ➕ Link a Device\n' +
    '   🔢 Enter the code\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '⚠️ <b>Note:</b> Code expires in <b>60 seconds</b>\n' +
    '━━━━━━━━━━━━━━━━━━━━━'
  );
}
function msgUsage() {
  return (
    '<b>╔══════════════════╗</b>\n' +
    '<b>║   🔗  PAIR YOUR BOT  ║</b>\n' +
    '<b>╚══════════════════╝</b>\n\n' +
    '📌 <b>Usage:</b>\n' +
    '   <code>/pair [number]</code>\n\n' +
    '📌 <b>Example:</b>\n' +
    '   <code>/pair 94771234567</code>\n' +
    '   <i>(country code + number, no spaces)</i>\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '💡 Need help? Tap <b>How It Works</b> below.'
  );
}
function msgGenerating(num) {
  return (
    '<b>╔══════════════════╗</b>\n' +
    '<b>║  ⏳  GENERATING CODE  ║</b>\n' +
    '<b>╚══════════════════╝</b>\n\n' +
    '📞 Number: <code>+' + num + '</code>\n\n' +
    '<b>🔄 Creating your pairing code...</b>\n' +
    '<i>This may take a few seconds.</i>\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '⏱ Please wait, do not close this chat.'
  );
}
function msgReady(num, code) {
  return (
    '<b>╔══════════════════╗</b>\n' +
    '<b>║  ✅  CODE IS READY!  ║</b>\n' +
    '<b>╚══════════════════╝</b>\n\n' +
    '📞 Number: <code>+' + num + '</code>\n' +
    '🔑 Your Code:\n\n' +
    '<code>' + code + '</code>\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '<b>📲 Enter this code in WhatsApp:</b>\n\n' +
    '   1️⃣ Open <b>WhatsApp</b>\n' +
    '   2️⃣ Tap <b>Settings</b> ⚙️\n' +
    '   3️⃣ <b>Linked Devices</b> → <b>Link a Device</b>\n' +
    '   4️⃣ Enter the code above 👆\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '⏱ <b>Expires in 60 seconds!</b>\n' +
    '<i>Tap the code above to copy it.</i>'
  );
}
function msgConnected(num) {
  return (
    '<b>╔══════════════════╗</b>\n' +
    '<b>║  🎉  ALREADY LINKED!  ║</b>\n' +
    '<b>╚══════════════════╝</b>\n\n' +
    '✅ <code>+' + num + '</code> is already connected!\n\n' +
    'Your WhatsApp is linked and ready.\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '💬 Go chat — UNITY-MD is active!'
  );
}
function msgTimeout(num) {
  return (
    '<b>╔══════════════════╗</b>\n' +
    '<b>║  ⏰  CODE EXPIRED!   ║</b>\n' +
    '<b>╚══════════════════╝</b>\n\n' +
    '❌ The pairing code for <code>+' + num + '</code>\n' +
    '   expired before being entered.\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '💡 Tap <b>Try Again</b> to get a new code.\n' +
    '   You have 60s to enter it in WhatsApp.'
  );
}
function msgError(err) {
  return (
    '<b>╔══════════════════╗</b>\n' +
    '<b>║   ❌  PAIRING FAILED  ║</b>\n' +
    '<b>╚══════════════════╝</b>\n\n' +
    'Something went wrong during pairing.\n\n' +
    '<b>Reason:</b> <code>' + err + '</code>\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '<b>Check the following:</b>\n' +
    '   ◉ Number includes country code\n' +
    '   ◉ Number has an active WhatsApp\n' +
    '   ◉ Number not already linked\n\n' +
    '💡 Tap <b>Try Again</b> or wait 60s.'
  );
}
function msgInProgress(num) {
  return (
    '<b>⏳ Already Processing...</b>\n\n' +
    'A pairing request for <code>+' + num + '</code>\n' +
    'is currently in progress.\n\n' +
    'Please wait for it to complete.'
  );
}

// ── Core pair flow ────────────────────────────────────────────
async function doPair(chatId, number, editMsgId = null) {
  if (_inProgress.has(number)) {
    const opts = { parse_mode: 'HTML' };
    return editMsgId
      ? bot.editMessageText(msgInProgress(number), { chat_id: chatId, message_id: editMsgId, ...opts }).catch(() => {})
      : bot.sendMessage(chatId, msgInProgress(number), opts);
  }

  let sm = global.unitySessionManager;
  if (!sm) {
    try { sm = require('../sessionManager'); global.unitySessionManager = sm; } catch (_e) {}
  }
  if (!sm) {
    const txt = '❌ <b>Session manager not ready.</b>\nPlease try again in a moment.';
    const opts = { parse_mode: 'HTML' };
    return editMsgId
      ? bot.editMessageText(txt, { chat_id: chatId, message_id: editMsgId, ...opts }).catch(() => {})
      : bot.sendMessage(chatId, txt, opts);
  }

  const existing = sm.getSession(number);
  if (existing?.status === 'connected') {
    const opts = { parse_mode: 'HTML', reply_markup: KB_HOME };
    return editMsgId
      ? bot.editMessageText(msgConnected(number), { chat_id: chatId, message_id: editMsgId, ...opts }).catch(() => {})
      : bot.sendMessage(chatId, msgConnected(number), opts);
  }

  _inProgress.add(number);

  let sentMsg;
  if (editMsgId) {
    await bot.editMessageText(msgGenerating(number), {
      chat_id: chatId, message_id: editMsgId, parse_mode: 'HTML',
    }).catch(() => {});
    sentMsg = { message_id: editMsgId };
  } else {
    sentMsg = await bot.sendMessage(chatId, msgGenerating(number), { parse_mode: 'HTML' });
  }

  try {
    const sess    = await sm.startSession(number, () => {});
    const outcome = await waitForPairCode(sess);

    if (outcome.result === 'connected') {
      await bot.editMessageText(msgConnected(number), {
        chat_id: chatId, message_id: sentMsg.message_id,
        parse_mode: 'HTML', reply_markup: KB_HOME,
      }).catch(() => {});
      return;
    }

    if (outcome.result === 'code') {
      const code    = outcome.pairCode;
      const userJid = number + '@s.whatsapp.net';
      await db.setPaired(userJid, true).catch(() => {});
      try {
        const { autoFollowChannels } = require('./autoHandler');
        await autoFollowChannels(userJid);
      } catch (_e) {}

      await bot.editMessageText(msgReady(number, code), {
        chat_id: chatId, message_id: sentMsg.message_id, parse_mode: 'HTML',
      }).catch(() => {});
      return;
    }

    if (outcome.result === 'timeout') {
      await bot.editMessageText(msgTimeout(number), {
        chat_id: chatId, message_id: sentMsg.message_id,
        parse_mode: 'HTML', reply_markup: kbRetry(number),
      }).catch(() => {});
      return;
    }

    await bot.editMessageText(msgError('Session error'), {
      chat_id: chatId, message_id: sentMsg.message_id,
      parse_mode: 'HTML', reply_markup: kbRetry(number),
    }).catch(() => {});

  } catch (e) {
    logger.error('[TG-PAIR] startSession error for ' + number + ': ' + e.message);
    await bot.editMessageText(msgError(e.message), {
      chat_id: chatId, message_id: sentMsg.message_id,
      parse_mode: 'HTML', reply_markup: kbRetry(number),
    }).catch(() => {});
  } finally {
    _inProgress.delete(number);
  }
}

// ── Start bot ─────────────────────────────────────────────────
async function start() {
  const TOKEN = process.env.TG_PAIR_BOT_TOKEN;
  if (!TOKEN) {
    logger.warn('[TG-PAIR] TG_PAIR_BOT_TOKEN not set — pair bot disabled');
    return;
  }

  // ── Clear any stuck webhook/session before polling ───────────
  try {
    const tempBot = new TelegramBot(TOKEN);
    await tempBot.deleteWebhook({ drop_pending_updates: true });
  } catch (e) {
    logger.warn('[TG-PAIR] deleteWebhook failed: ' + e.message);
  }

  bot = new TelegramBot(TOKEN, { polling: true });
  bot.on('polling_error', err => {
    logger.error('[TG-PAIR] Polling error: ' + err.message);
    if (err.message && (err.message.includes('401') || err.message.includes('409') || err.message.includes('EFATAL'))) {
      logger.warn('[TG-PAIR] Fatal polling error — restarting in 5s...');
      try { bot.stopPolling(); } catch {}
      setTimeout(start, 5000);
    }
  });

  // /start
  bot.onText(/^\/start(@\S+)?$/, (msg) => {
    const name = msg.from && msg.from.first_name ? msg.from.first_name : 'there';
    bot.sendMessage(msg.chat.id, msgStart(name), { parse_mode: 'HTML', reply_markup: KB_START });
  });

  // /help
  bot.onText(/^\/help(@\S+)?$/, (msg) => {
    bot.sendMessage(msg.chat.id, msgHelp(), { parse_mode: 'HTML', reply_markup: KB_HOME });
  });

  // /pair <number>
  bot.onText(/^\/pair(?:@\S+)?\s+(.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const number = (match[1] || '').replace(/[^0-9]/g, '');
    if (number.length < 7) {
      return bot.sendMessage(chatId, msgUsage(), { parse_mode: 'HTML', reply_markup: KB_HOME });
    }

    // 🔥 RATE LIMITING: 1 request per minute per user
    const now = Date.now();
    if (rateLimit.has(chatId) && (now - rateLimit.get(chatId) < 60000)) {
      const remaining = Math.ceil((60000 - (now - rateLimit.get(chatId))) / 1000);
      return bot.sendMessage(chatId, `⏳ Wait *${remaining}* seconds before requesting again.`, { parse_mode: 'Markdown' });
    }
    rateLimit.set(chatId, now);

    await doPair(chatId, number);
  });

  // /pair no args
  bot.onText(/^\/pair(@\S+)?$/, (msg) => {
    bot.sendMessage(msg.chat.id, msgUsage(), { parse_mode: 'HTML', reply_markup: KB_HOME });
  });

  // Inline callbacks
  bot.on('callback_query', async (cb) => {
    const chatId = cb.message && cb.message.chat && cb.message.chat.id;
    const msgId  = cb.message && cb.message.message_id;
    const data   = cb.data || '';
    await bot.answerCallbackQuery(cb.id).catch(() => {});

    if (data === 'home') {
      const name = cb.from && cb.from.first_name ? cb.from.first_name : 'there';
      await bot.editMessageText(msgStart(name), {
        chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: KB_START,
      }).catch(() => {});
      return;
    }
    if (data === 'pair_help') {
      await bot.editMessageText(msgHelp(), {
        chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: KB_HOME,
      }).catch(() => {});
      return;
    }
    if (data === 'pair_start') {
      await bot.editMessageText(msgUsage(), {
        chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: KB_HOME,
      }).catch(() => {});
      return;
    }
    if (data.startsWith('retry_')) {
      const number = data.replace('retry_', '');
      await doPair(chatId, number, msgId);
      return;
    }
  });

  logger.info('[TG-PAIR] ✅ Pair bot started (Public Mode + Rate Limited)');
}

module.exports = { start };
