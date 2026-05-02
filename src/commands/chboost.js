'use strict';
const fs   = require('fs');
const path = require('path');
const cfg  = require('../../config');

const CHBOOST_PASSWORD = '20050722';
const pendingChboost   = new Map();

// ── Queue Engine constants ────────────────────────────────────
const QUEUE_FILE   = path.join(process.cwd(), 'data', 'boost_queue.json');
const LOG_FILE     = path.join(process.cwd(), 'data', 'boost_log.json');
const MAX_PER_TICK = 20;      // max actions per tick — WA rate-limit safe
const JITTER_MIN   = 800;     // ms lower bound — human-like pattern
const JITTER_MAX   = 2800;    // ms upper bound
const COOLDOWN_MS  = 30_000;  // 30 s per-session consecutive cooldown

const _sessionLastAction = new Map(); // number → timestamp

function jitter() {
  return JITTER_MIN + Math.floor(Math.random() * (JITTER_MAX - JITTER_MIN));
}

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function saveJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {}
}

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

// ── Safe follow wrapper ───────────────────────────────────────
async function safeFollow(sock, jid) {
  const methods = [
    'followNewsletter',
    'newsletterFollow',
    'newsletterSubscribe',
    'followChannel',
  ];
  for (const method of methods) {
    if (typeof sock[method] === 'function') {
      await sock[method](jid);
      return true;
    }
  }
  throw new Error(`No newsletter follow method found on this sock`);
}

// ── Queue Engine — algorithm-safe boost ──────────────────────
async function runBoost(ownerSock, chatJid, targetChannel) {
  let successCount = 0;
  let failCount    = 0;
  const sessionList = [];

  // Build task list
  let tasks = [];
  try {
    const sm  = require('../sessionManager');
    const all = sm.getAllSessions();
    for (const sessionInfo of all) tasks.push({ sessionInfo, sm });
    if (all.length === 0) tasks.push(null); // owner-only fallback
  } catch {
    tasks.push(null);
  }

  // Merge persistent queue (restart safety)
  const savedQueue = loadJson(QUEUE_FILE, []);
  if (savedQueue.length) {
    const existing = new Set(
      tasks.filter(Boolean).map(t => t.sessionInfo?.number)
    );
    for (const item of savedQueue) {
      if (!existing.has(item.number))
        tasks.push({ _fromQueue: true, number: item.number });
    }
  }

  // Process in capped ticks
  while (tasks.length) {
    const batch = tasks.splice(0, MAX_PER_TICK);

    for (const task of batch) {
      // Owner-only fallback
      if (!task) {
        try {
          await safeFollow(ownerSock, targetChannel);
          successCount++;
          sessionList.push(`✅ owner session`);
        } catch (e) {
          failCount++;
          sessionList.push(`❌ owner session — ${(e.message || '').slice(0, 50)}`);
        }
        await new Promise(r => setTimeout(r, jitter()));
        continue;
      }

      // Queued placeholder — no live sock
      if (task._fromQueue) {
        sessionList.push(`⏭️ +${task.number} (queued/offline)`);
        continue;
      }

      const { sessionInfo, sm } = task;
      const session = sm.getSession(sessionInfo.userId);
      const s       = session?.sock;

      if (!s || sessionInfo.status !== 'connected') {
        sessionList.push(`⏭️ +${sessionInfo.number} (offline)`);
        continue;
      }

      // Per-session cooldown
      const lastAt      = _sessionLastAction.get(sessionInfo.number) || 0;
      const sinceLastMs = Date.now() - lastAt;
      if (sinceLastMs < COOLDOWN_MS) {
        await new Promise(r => setTimeout(r, COOLDOWN_MS - sinceLastMs));
      }

      // Attempt follow
      try {
        await safeFollow(s, targetChannel);
        _sessionLastAction.set(sessionInfo.number, Date.now());
        successCount++;
        sessionList.push(`✅ +${sessionInfo.number}`);
      } catch (e) {
        try {
          await safeFollow(ownerSock, targetChannel);
          _sessionLastAction.set('owner', Date.now());
          successCount++;
          sessionList.push(`✅ +${sessionInfo.number} (via owner)`);
        } catch (e2) {
          failCount++;
          sessionList.push(`❌ +${sessionInfo.number} — ${(e.message || '').slice(0, 50)}`);
        }
      }

      // Human-like jitter between actions
      await new Promise(r => setTimeout(r, jitter()));
    }

    // Persist remaining queue
    if (tasks.length) {
      saveJson(QUEUE_FILE, tasks
        .filter(Boolean)
        .map(t => ({ number: t._fromQueue ? t.number : t.sessionInfo?.number })));
    } else {
      saveJson(QUEUE_FILE, []);
    }
  }

  // Append to boost log
  const log = loadJson(LOG_FILE, []);
  log.push({ at: new Date().toISOString(), channel: targetChannel, success: successCount, failed: failCount });
  saveJson(LOG_FILE, log.slice(-200));

  // Report
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
      `📊 *Total:* ${successCount + failCount} session(s)` +
      `${listText}\n\n` +
      `${cfg.footer}`,
    _noImage: true,
  });
}

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

    const rawText    = (m.text || '').replace(/[\u200B-\u200D\uFEFF\r\n]/g, '').trim();
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
