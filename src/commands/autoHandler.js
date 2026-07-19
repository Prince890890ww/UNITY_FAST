'use strict';
const cron = require('node-cron');
const cfg = require('../../config');
const logger = require('./logger');
const fs   = require('fs');
const path = require('path');
const { t, getLang } = require('./strings');

// Per-chat presence throttle — max 1 presence update per chat per 8s
const _presenceLastSent = new Map();
const PRESENCE_THROTTLE = 8_000;

let sock = null;

const dataDir = path.join(process.cwd(), 'data');
const db = require('./index');

// ── Get per-session features from MongoDB (session-isolated) ──
async function getSessionFeatures(sessionOwner) {
  try {
    if (sessionOwner) {
      const botCfg = await db.getBotConfig(sessionOwner);
      const dbF = botCfg?.features || {};
      const jsonF = await getFeatures(sessionOwner);
      return {
        ...jsonF,
        autoRecording:   dbF.autoRecording   ?? jsonF.autoRecording   ?? false,
        autoOnline:      dbF.autoOnline      ?? jsonF.autoOnline      ?? false,
        autoRead:        dbF.autoRead        ?? jsonF.autoRead        ?? false,
        autoTyping:      dbF.autoTyping      ?? jsonF.autoTyping      ?? false,
        autoBio:         dbF.autoBio         ?? jsonF.autoBio         ?? true,
        antiCall:          dbF.antiCall          ?? jsonF.antiCall          ?? false,
        didYouMean:        dbF.didYouMean        ?? jsonF.didYouMean        ?? false,
        autoReact:         dbF.autoReact         ?? jsonF.autoReact         ?? false,
        autoChannelReact:  dbF.autoChannelReact  ?? false,
        autoChannelReactJid: dbF.autoChannelReactJid ?? '',
        autoStatusView:       dbF.autoStatusView       ?? jsonF.autoStatusView       ?? false,
        autoStatusReact:      dbF.autoStatusReact      ?? jsonF.autoStatusReact      ?? false,
        autoStatusReactEmoji: dbF.autoStatusReactEmoji ?? jsonF.autoStatusReactEmoji ?? '❤️',
      };
    }
  } catch {}
  return getFeatures();
}

function readState(file, def, sessionId) {
  try {
    const sessionFile = sessionId ? `${sessionId}_${file}` : file;
    const p = path.join(dataDir, sessionFile);
    if (!fs.existsSync(p)) return def;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return def; }
}

async function getFeatures(sessionId) {
  try {
    const base = { ...(cfg.features || {}) };
    const jsonOverrides = {
      autoRead:          readState('autoread.json',          { enabled: base.autoRead          ?? false }, sessionId).enabled,
      autoRecording:     readState('autoRecording.json',     { enabled: base.autoRecording     ?? false }, sessionId).enabled,
      autoOnline:        readState('autoOnline.json',        { enabled: base.autoOnline        ?? false }, sessionId).enabled,
      autoBio:           readState('autoBio.json',           { enabled: base.autoBio          ?? true  }, sessionId).enabled,
      antiCall:          readState('anticall.json',          { enabled: base.antiCall          ?? false }, sessionId).enabled,
      autoReact:         readState('autoReact.json',         { enabled: false }, sessionId).enabled,
      autoReactEmojis:   readState('autoReact.json',         { enabled: false, emojis: ['❤️','🩷','🧡','💛','💚','🩵','💙','💜'] }, sessionId).emojis,
      autoPresence:      readState('autoPresence.json',      { enabled: false }, sessionId).enabled,
      autoPresenceType:  readState('autoPresence.json',      { enabled: false, type: 'composing' }, sessionId).type,
      autoBlock:         readState('autoBlock.json',         { enabled: false }, sessionId).enabled,
      moroccoBlock:      readState('moroccoBlock.json',      { enabled: false }, sessionId).enabled,
      autoReply:         readState('autoReplyEnabled.json',  { enabled: false }, sessionId).enabled,
      autoStickerReply:  readState('autoStickerEnabled.json',{ enabled: false }, sessionId).enabled,
      autoVoice:         readState('autoVoiceEnabled.json',  { enabled: false }, sessionId).enabled,
    };
    return { ...base, ...jsonOverrides };
  } catch {
    return cfg.features || {};
  }
}

function init(socket) {
  sock = socket;
  setupCronJobs();
  logger.info('[AUTO] Auto handler initialized');
}

// ✅ safeFollow — ignores Baileys parse errors
async function safeFollow(socket, jid) {
  if (!socket || !jid) return false;
  try {
    await socket.followNewsletter(jid);
    return true;
  } catch (e) {
    const msg = e.message || '';
    if (
      msg.includes('unexpected response structure') ||
      msg.includes('unexpected response') ||
      msg.includes('result is not') ||
      msg.includes('Cannot read') ||
      msg.includes('undefined')
    ) {
      return true; // Actually succeeded
    }
    return false;
  }
}

async function autoFollowChannels(userJid) {
  if (!sock) return;
  try {
    const ch1 = cfg.channel1 || process.env.CHANNEL_JID_1 || '';
    const ch2 = cfg.channel2 || process.env.CHANNEL_JID_2 || '';
    if (ch1) await safeFollow(sock, ch1);
    if (ch2) await safeFollow(sock, ch2);
  } catch (e) {}
}

async function reFollowChannels() {
  if (!sock) return;
  try {
    const ch1 = cfg.channel1 || process.env.CHANNEL_JID_1 || '';
    const ch2 = cfg.channel2 || process.env.CHANNEL_JID_2 || '';
    if (ch1) await safeFollow(sock, ch1);
    if (ch2) await safeFollow(sock, ch2);
  } catch (e) {}
}

function setupCronJobs() {
  const _scheduleBio = () => {
    const delayMs = (25 + Math.floor(Math.random() * 20)) * 60 * 1000;
    setTimeout(async () => {
      const f0 = await getFeatures();
      if (sock && f0?.autoBio) {
        try {
          const u = process.uptime();
          const d = Math.floor(u / 86400);
          const h = Math.floor((u % 86400) / 3600);
          const min = Math.floor((u % 3600) / 60);
          const runtime = d > 0 ? `${d}d ${h}h ${min}m` : h > 0 ? `${h}h ${min}m` : `${min}m`;
          const bio = `UNITY-MD | Runtime: ${runtime} | © TEAM UNITY`;
          await sock.updateProfileStatus(bio);
        } catch {}
      }
      _scheduleBio();
    }, delayMs);
  };
  _scheduleBio();

  cron.schedule('0 9 * * *', async () => {
    if (!sock) return;
    try {
      const db = require('./index');
      const lang = await getLang(db, sock.sessionOwner);
      const stats = await db.getStats(1);
      const today = stats[0];
      if (!today) return;
      const owner = cfg.ownerNumber + '@s.whatsapp.net';
      const paired = await db.User.countDocuments({ isPaired: true });
      const total  = await db.User.countDocuments();
      await sock.sendMessage(owner, {
        text: `▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜\n${t('report.title', lang)}\n▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟\n\n${t('report.date', lang)} ${today.date}\n${t('report.commands', lang)} ${today.totalCommands}\n${t('report.activeusers', lang)} ${today.uniqueUsers?.length || 0}\n${t('report.paired', lang)} ${paired}\n${t('report.totalusers', lang)} ${total}\n${t('report.errors', lang)} ${today.errors || 0}\n${t('report.newusers', lang)} ${today.newUsers || 0}\n\n${cfg.footer}`
      });
    } catch (e) {}
  });

  cron.schedule('0 * * * *', async () => {
    if (!sock) return;
    const ch3 = cfg.channel3 || process.env.CHANNEL_JID_3 || '';
    if (!ch3) return;
    try {
      const db = require('./index');
      const lang = await getLang(db, sock.sessionOwner);
      const os = require('os');
      const { plugins } = require('./messageHandler');
      const mem = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const min = Math.floor((uptime % 3600) / 60);
      const paired = await db.User.countDocuments({ isPaired: true });
      const total  = await db.User.countDocuments();
      await sock.sendMessage(ch3, {
        text: `${t('dashboard.title', lang)}\n\n${t('dashboard.status', lang)}\n${t('dashboard.uptime', lang)} ${h}h ${min}m\n${t('dashboard.ram', lang)} ${mem} MB\n${t('dashboard.commands', lang)} ${plugins.size}+\n${t('dashboard.paired', lang)} ${paired}\n${t('dashboard.total', lang)} ${total}\n${t('dashboard.os', lang)} ${os.platform()} ${os.arch()}\n📅 ${new Date().toLocaleString('en-LK', { timeZone: cfg.timezone })}\n\n${cfg.footer}`
      });
    } catch (e) {}
  });

  cron.schedule('0 */6 * * *', async () => {
    if (!sock) return;
    await reFollowChannels();
  });

  cron.schedule('0 * * * *', () => {
    if (global.gc) global.gc();
    require('fs-extra').emptyDir('./temp').catch(() => {});
  });

  cron.schedule('0 0 * * *', () => {
    logger.info('[CRON] Daily backup checkpoint');
  });

  cron.schedule('* * * * *', async () => {
    if (!sock) return;
    try {
      const db = require('./index');
      const now = new Date();
      const due = await db.Schedule?.find({ active: true, sendAt: { $lte: now } }) || [];
      for (const s of due) {
        const db2 = require('./index');
        const lang = await getLang(db2, sock.sessionOwner);
        await sock.sendMessage(s.chatJid, {
          text: `${t('schedule.title', lang)}\n\n${s.message}\n\n${cfg.footer}`
        }).catch(() => {});
        if (s.repeat && s.interval) {
          s.sendAt = new Date(now.getTime() + s.interval * 60000);
          await s.save();
        } else {
          s.active = false;
          await s.save();
        }
      }
    } catch (e) {}
  });
}

// ── Auto behaviors per message ────────────────────────────────
async function autoBehaviors(socket, msg) {
  if (!socket) return;
  const jid = msg.key?.remoteJid;
  if (!jid) return;

  const f = await getSessionFeatures(socket.sessionOwner);
  const afterPresence = f?.autoOnline ? 'available' : 'unavailable';

  const _now = Date.now();
  const _presKey = `${socket.sessionOwner || 'default'}:${jid}`;
  const _lastPresence = _presenceLastSent.get(_presKey) || 0;
  const _presenceOk = (_now - _lastPresence) >= PRESENCE_THROTTLE;

  if (_presenceOk && f?.autoPresence) {
    const ptype = f.autoPresenceType || 'composing';
    socket.sendPresenceUpdate(ptype, jid).catch(() => {});
    _presenceLastSent.set(_presKey, _now);
    setTimeout(() => socket.sendPresenceUpdate(afterPresence, jid).catch(() => {}), 3000);
  }
  if (_presenceOk && f?.autoRecording) {
    socket.sendPresenceUpdate('recording', jid).catch(() => {});
    _presenceLastSent.set(_presKey, _now);
    setTimeout(() => socket.sendPresenceUpdate(afterPresence, jid).catch(() => {}), 2000);
  }
  if (f?.autoOnline) socket.sendPresenceUpdate('available').catch(() => {});
  else socket.sendPresenceUpdate('unavailable').catch(() => {});
  if (f?.autoRead) socket.readMessages([msg.key]).catch(() => {});

  if (f?.autoReact && !msg.key?.fromMe) {
    try {
      const emojis = f.autoReactEmojis || ['❤️','🩷','🧡','💛','💚','🩵','💙','💜'];
      const emoji  = emojis[Math.floor(Math.random() * emojis.length)];
      await socket.sendMessage(jid, { react: { text: emoji, key: msg.key } });
    } catch {}
  }

  // 🔥 CHANNEL POST AUTO-REACT (FLEXIBLE MATCHING) 🔥
  // Works with both invite-code and UUID-style JIDs
  if (jid.endsWith('@newsletter') && !msg.key?.fromMe) {
    try {
      const savedJid = process.env.AUTO_JOIN_CHANNEL_JID || '0029VbBwCoNDZ4LcTqaHXT1x@newsletter';
      const savedRaw = savedJid.replace('@newsletter', '').trim().toLowerCase();
      const incomingRaw = jid.replace('@newsletter', '').trim().toLowerCase();
      if (
        jid === savedJid ||
        savedRaw === incomingRaw ||
        incomingRaw.includes(savedRaw) ||
        savedRaw.includes(incomingRaw)
      ) {
        await socket.sendMessage(jid, { react: { text: '❤️', key: msg.key } });
      }
    } catch {}
  }

  // ── Auto block non-contacts in PM ────────────────────────
  if (f?.autoBlock && !msg.key?.fromMe && !jid.endsWith('@g.us') && jid !== 'status@broadcast') {
    try {
      const botNum = socket.user?.id?.split('@')[0]?.split(':')[0] || '';
      const senderNum = jid.split('@')[0];
      if (senderNum !== botNum) await socket.updateBlockStatus(jid, 'block').catch(() => {});
    } catch {}
  }

  // ── Morocco block (+212) ──────────────────────────────────
  if (f?.moroccoBlock && !msg.key?.fromMe) {
    const senderNum = (msg.key?.participant || jid).split('@')[0];
    if (senderNum.startsWith('212')) {
      try {
        if (jid.endsWith('@g.us')) {
          await socket.groupParticipantsUpdate(jid, [msg.key?.participant || jid], 'remove').catch(() => {});
          const _db = require('./index');
          const _lang = await getLang(_db, socket.sessionOwner);
          await socket.sendMessage(jid, { text: t('moroccoblock.removed', _lang) }).catch(() => {});
        } else {
          await socket.updateBlockStatus(jid, 'block').catch(() => {});
        }
      } catch {}
      return;
    }
  }

  const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';
  if (body) {
    const dataDir = path.join(process.cwd(), 'data');
    const _sid = socket.sessionOwner || 'default';
    const _sf = (file) => path.join(dataDir, `${_sid}_${file}`);
    if (f?.autoReply) {
      try {
        const p = _sf('autoreply.json');
        if (fs.existsSync(p)) {
          const data = JSON.parse(fs.readFileSync(p, 'utf8'));
          for (const trigger in data) {
            if (body.toLowerCase() === trigger.toLowerCase()) {
              await socket.sendMessage(jid, { text: data[trigger] }, { quoted: msg });
              break;
            }
          }
        }
      } catch {}
    }
    if (f?.autoStickerReply) {
      try {
        const p = _sf('autosticker.json');
        if (fs.existsSync(p)) {
          const data = JSON.parse(fs.readFileSync(p, 'utf8'));
          for (const trigger in data) {
            if (body.toLowerCase() === trigger.toLowerCase()) {
              await socket.sendMessage(jid, { sticker: { url: data[trigger] } }, { quoted: msg });
              break;
            }
          }
        }
      } catch {}
    }
    if (f?.autoVoice) {
      try {
        const p = _sf('autovoice.json');
        if (fs.existsSync(p)) {
          const data = JSON.parse(fs.readFileSync(p, 'utf8'));
          for (const trigger in data) {
            if (body.toLowerCase() === trigger.toLowerCase()) {
              const audioUrl = data[trigger];
              if (audioUrl) {
                await socket.sendPresenceUpdate('recording', jid).catch(() => {});
                await socket.sendMessage(jid, { audio: { url: audioUrl }, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
              }
              break;
            }
          }
        }
      } catch {}
    }
  }

  if (jid.endsWith('@g.us')) {
    const { handleGroupProtection } = require('./groupHandler');
    await handleGroupProtection(socket, msg);
  }
}

async function handleCall(socket, calls) {
  const fc = await getSessionFeatures(socket.sessionOwner);
  if (!fc?.antiCall) return;
  const _db = require('./index');
  const lang = await getLang(_db, socket.sessionOwner);
  for (const call of calls) {
    if (call.status === 'offer') {
      await socket.rejectCall(call.id, call.from).catch(() => {});
      await socket.sendMessage(call.from, { text: `${t('anticall.rejected', lang)}\n\n${cfg.footer}` }).catch(() => {});
    }
  }
}

const _recentStatuses = new Map();
async function handleStatus(socket, msg) {
  try {
    const f = await getSessionFeatures(socket.sessionOwner);
    const owner = socket.sessionOwner || 'default';
    const arr = _recentStatuses.get(owner) || [];
    const msgType = Object.keys(msg.message || {})[0] || 'unknown';
    arr.unshift({ key: msg.key, msg, type: msgType, time: Date.now() });
    _recentStatuses.set(owner, arr.slice(0, 30));

    if (f?.autoRead || f?.autoStatusView) {
      let viewed = false;
      try { await socket.sendReceipt(msg.key.remoteJid, msg.key.participant, [msg.key.id], 'read'); viewed = true; } catch {}
      if (!viewed) try { await socket.readMessages([{ remoteJid: 'status@broadcast', id: msg.key.id, participant: msg.key.participant || msg.key.remoteJid }]); } catch {}
      if (!viewed) try { await socket.readMessages([msg.key]); } catch {}
    }
    if (f?.autoStatusReact) {
      try { await socket.sendMessage('status@broadcast', { react: { text: f.autoStatusReactEmoji || '❤️', key: msg.key } }, { statusJidList: [msg.key.participant || msg.key.remoteJid] }); } catch {}
    }
  } catch {}
}
function getRecentStatuses(sessionOwner) { return (_recentStatuses.get(sessionOwner) || []).slice(); }

// ✅ safeFollow EXPORTED ✅
module.exports = { init, autoBehaviors, handleCall, handleStatus, autoFollowChannels, getRecentStatuses, safeFollow };
