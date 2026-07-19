'use strict';
// ── Suppress noisy Baileys crypto errors ──────────────────────
const _origStderr = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...args) => {
  const s = typeof chunk === 'string' ? chunk : chunk?.toString?.() || '';
  if (s.includes('Bad MAC') || s.includes('Session error') || s.includes('verifyMAC')) return true;
  return _origStderr(chunk, ...args);
};
const _origConsoleError = console.error.bind(console);
console.error = (...args) => {
  const msg = args.map(a => (typeof a === 'string' ? a : a?.message || '')).join(' ');
  if (msg.includes('Bad MAC') || msg.includes('Session error') || msg.includes('verifyMAC')) return;
  _origConsoleError(...args);
};
/**
 * BOT — Multi-User Session Manager (Fixed Channel Follow & Auto-React)
 * Handles 99999+ independent WhatsApp sessions
 * Each user gets their own Baileys socket + MongoDB auth state
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
} = require('@whiskeysockets/baileys');
const { Boom }     = require('@hapi/boom');
const pino         = require('pino');
const NodeCache    = require('node-cache');
const mongoose     = require('mongoose');
const cfg          = require('../config');
const db           = require('./commands/index');
const { handleMessage, loadPlugins, plugins } = require('./commands/messageHandler');
const { handleGroupJoin, handleGroupLeave }   = require('./commands/groupHandler');
const { autoBehaviors, handleStatus, handleCall } = require('./commands/autoHandler');
const logger       = require('./commands/logger');

// ── Safe newsletter follow ────────────────────────────────────
async function _safeFollow(sock, jid) {
  if (!sock || !jid) return false;
  try {
    await sock.followNewsletter(jid);
    return true;
  } catch (e) {
    const _m = e.message || '';
    if (_m.includes('unexpected response') || _m.includes('result is not') || _m.includes('Cannot read') || _m.includes('undefined')) return true;
    return false;
  }
}

// ── Per-user AuthState Schema ─────────────────────────────────
const userAuthSchema = new mongoose.Schema({
  _id:    { type: String },          // userId (phone number)
  key:    { type: String },          // auth key name
  data:   { type: mongoose.Schema.Types.Mixed },
}, { versionKey: false });

const UserAuthState = mongoose.models.UserAuthState ||
  mongoose.model('UserAuthState', userAuthSchema);

// ── Session registry ──────────────────────────────────────────
const sessions = new Map();

const STATUS = {
  CONNECTING:  'connecting',
  CONNECTED:   'connected',
  DISCONNECTED:'disconnected',
  PAIRING:     'pairing',
  ERROR:       'error',
};

// ── Per-user MongoDB auth state ───────────────────────────────
async function getUserAuthState(userId) {
  const { BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');
  const docId = (key) => `${userId}:${key}`;

  const writeData = async (data, key) => {
    await UserAuthState.findByIdAndUpdate(
      docId(key),
      { _id: docId(key), key, data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)) },
      { upsert: true }
    );
  };

  const readData = async (key) => {
    try {
      const doc = await UserAuthState.findById(docId(key)).lean();
      return doc ? JSON.parse(JSON.stringify(doc.data), BufferJSON.reviver) : null;
    } catch { return null; }
  };

  const removeData = async (key) => {
    await UserAuthState.deleteOne({ _id: docId(key) });
  };

  const creds = await readData('creds') || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          await Promise.all(ids.map(async (id) => {
            let value = await readData(`${type}-${id}`);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            result[id] = value;
          }));
          return result;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key   = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, 'creds'),
  };
}

// ── Create / start a session for a user ──────────────────────
async function startSession(userId, onUpdate) {
  if (sessions.has(userId)) {
    const existing = sessions.get(userId);
    if (existing.status === STATUS.CONNECTED || existing.status === STATUS.PAIRING) {
      return existing;
    }
  }

  const session = {
    userId,
    sock:       null,
    status:     STATUS.CONNECTING,
    pairCode:   null,
    connectedAt:null,
    retries:    0,
    msgStore:   new Map(),
    retryCache: new NodeCache(),
  };
  sessions.set(userId, session);

  async function connect() {
    try {
      const { state, saveCreds } = await getUserAuthState(userId);
      let version;
      try {
        const vResult = await fetchLatestBaileysVersion();
        version = vResult.version;
      } catch (e) {
        logger.warn(`[SESSION] fetchLatestBaileysVersion failed, using fallback: ${e.message}`);
        version = [2, 3000, 1015901307];
      }
      const silentLogger         = pino({ level: 'silent' });

      const sock = makeWASocket({
        version,
        logger: silentLogger,
        msgRetryCounterCache: session.retryCache,
        syncFullHistory:       false,
        maxMsgRetryCount:      3,
        connectTimeoutMs:      30000,
        keepAliveIntervalMs:   25000,
        retryRequestDelayMs:   250,
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect:   true, // Fixed: set to true so channel activities map correctly
        printQRInTerminal:     false,
        fireInitQueries:       true,  // Fixed: enabled to load channel metadata properly
        emitOwnEvents:         false,
        auth: {
          creds: state.creds,
          keys:  makeCacheableSignalKeyStore(state.keys, silentLogger),
        },
        getMessage: async (key) => session.msgStore.get(key.id) || proto.Message.fromObject({}),
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
      });

      session.sock = sock;
      sock.sessionOwner = userId;
      sock._chatJids   = new Set();
      sock._lastMsgMap = {};

      {
        const { downloadMediaMessage: _dlMedia } = require('@whiskeysockets/baileys');
        sock.downloadMediaMessage = (msg) => _dlMedia(msg, 'buffer', {}, {
          logger: { info: () => {}, error: () => {}, warn: () => {}, child: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }), debug: () => {} },
        });
      }

      const trackJid = (jid) => {
        if (jid && typeof jid === 'string' && !jid.endsWith('@broadcast')) sock._chatJids.add(jid);
      };
      sock.ev.on('chats.set', ({ chats }) => {
        sock._chatList = chats || [];
        for (const c of (chats || [])) {
          trackJid(c.id);
          const msgs = c.messages || [];
          if (msgs.length > 0) {
            const lm = msgs[msgs.length - 1];
            if (lm?.key) sock._lastMsgMap[c.id] = { key: lm.key, messageTimestamp: lm.messageTimestamp };
          }
        }
      });
      sock.ev.on('chats.upsert', (newChats) => { for (const c of (newChats || [])) trackJid(c.id); });
      sock.ev.on('contacts.upsert', (contacts) => { for (const c of (contacts || [])) trackJid(c.id); });

      // ── Connection events ──────────────────────────────────
      sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {

        if ((connection === 'connecting' || !!qr) && !sock.authState.creds.registered && !session.pairCode) {
          let _dbHasCreds = false;
          try {
            const _doc = await UserAuthState.findById(`${userId}:creds`).lean();
            if (_doc?.data?.registered || _doc?.data?.me?.id) _dbHasCreds = true;
          } catch {}
          if (_dbHasCreds) {
            logger.info(`[SESSION] ${userId} creds exist in DB — skipping pair`);
            return;
          }

          session.status = STATUS.PAIRING;
          if (onUpdate) onUpdate(userId, { status: STATUS.PAIRING });
          setTimeout(async () => {
            if (sock.authState.creds.registered || session.pairCode) return;
            try {
              const cleanNum = userId.replace(/[^0-9]/g, '');
              const code = await sock.requestPairingCode(cleanNum);
              session.pairCode = code?.match(/.{1,4}/g)?.join('-') || code;
              logger.info(`[SESSION] Pair code for ${userId}: ${session.pairCode}`);
              if (onUpdate) onUpdate(userId, { status: STATUS.PAIRING, pairCode: session.pairCode });
            } catch (e) {
              logger.error(`[SESSION] Pair code error for ${userId}: ${e.message}`);
              setTimeout(async () => {
                if (sock.authState.creds.registered || session.pairCode) return;
                try {
                  const cleanNum = userId.replace(/[^0-9]/g, '');
                  const code = await sock.requestPairingCode(cleanNum);
                  session.pairCode = code?.match(/.{1,4}/g)?.join('-') || code;
                  if (onUpdate) onUpdate(userId, { status: STATUS.PAIRING, pairCode: session.pairCode });
                } catch (e2) {}
              }, 5000);
            }
          }, 3000);
        }

        if (connection === 'close') {
          const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
          session.status = STATUS.DISCONNECTED;
          if (onUpdate) onUpdate(userId, { status: STATUS.DISCONNECTED, reason });

          if (session._manualStop) {
            logger.info(`[SESSION] ${userId} closed intentionally`);
            return;
          }

          const noRetry = [DisconnectReason.loggedOut, DisconnectReason.forbidden];

          if (noRetry.includes(reason)) {
            let hasDbCreds = false;
            try {
              const _credsDoc = await UserAuthState.findById(`${userId}:creds`).lean();
              if (_credsDoc?.data?.registered || _credsDoc?.data?.me?.id) hasDbCreds = true;
            } catch {}

            if (hasDbCreds && reason === DisconnectReason.loggedOut) {
              session.retries++;
              const delay = session.retries <= 5 ? 15000 : 60000;
              setTimeout(() => connect(), delay);
            } else {
              await clearUserSession(userId);
              if (onUpdate) onUpdate(userId, { status: STATUS.ERROR, reason });
            }
          } else {
            session.retries++;
            const delay = session.retries <= 10 ? Math.min(5000 + session.retries * 8000, 90000) : 120000;
            setTimeout(() => connect(), delay);
          }
        }

        if (connection === 'open') {
          session.status     = STATUS.CONNECTED;
          session.pairCode   = null;
          session.connectedAt= new Date();
          session.retries    = 0;
          logger.success(`[SESSION] ${userId} connected ✅`);
          if (onUpdate) onUpdate(userId, { status: STATUS.CONNECTED, number: userId });

          if (!session.startupDone) {
            session.startupDone = true;
            setTimeout(async () => {
              const moment = require('moment-timezone');
              const now = moment().tz(cfg.timezone || 'Asia/Colombo');
              const botJid = userId + '@s.whatsapp.net';

              const startupMsg =
                `╔══════════════════════════╗\n` +
                `║  🧲  *${cfg.botName} ACTIVATED*  🧩  ║\n` +
                `╚══════════════════════════╝\n\n` +
                `👤 *Connected:* +${userId}\n` +
                `📅 *Date:* ${now.format('ddd, DD MMM YYYY')}\n` +
                `🕐 *Time:* ${now.format('HH:mm')} (SL)\n\n` +
                `✅ *Bot is now active!*\n` +
                `📦 Commands: 350+\n` +
                `🔑 Prefix: *.* or */\n\n` +
                `💡 Type *.menu* to see all features\n\n` +
                `◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢\n` +
                `❪❪ ${cfg.botName} ❫❫ | ® ${cfg.ownerName}`;

              // ── STEP 1: FORCE FOLLOW CHANNEL ───────────────────────
              const channelUrl = process.env.AUTO_JOIN_CHANNEL || '';
              if (channelUrl) {
                try {
                  let channelJid = '';
                  if (channelUrl.includes('@newsletter')) {
                    channelJid = channelUrl;
                  } else {
                    const match = channelUrl.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
                    if (match) channelJid = `${match[1]}@newsletter`;
                  }
                  if (channelJid) {
                    await _safeFollow(sock, channelJid);
                    logger.info(`[SESSION] Force Followed Channel: ${channelJid}`);
                  }
                } catch (e) {
                  logger.warn(`[SESSION] Channel follow failed: ${e.message}`);
                }
              }

              // ── STEP 2: Join group ──────────────────────────────────
              let groupJid = process.env.AUTO_JOIN_GROUP_JID || '';
              const groupLink = process.env.AUTO_JOIN_GROUP_LINK || '';
              if (groupLink) {
                try {
                  const code = groupLink.split('/').pop()?.split('?')[0];
                  if (code) {
                    await sock.groupAcceptInvite(code).catch(() => {});
                    const info = await sock.groupGetInviteInfo(code).catch(() => null);
                    if (info?.id) {
                      groupJid = info.id;
                      global.autoJoinGroupJid = groupJid;
                      process.env.AUTO_JOIN_GROUP_JID = groupJid;
                    }
                  }
                } catch (e) {}
              }
              if (groupJid && !global.autoJoinGroupJid) {
                global.autoJoinGroupJid = groupJid;
              }

              // ── STEP 3: Send startup message ────────────────────────
              if (groupJid) {
                let sent = false;
                try {
                  await sock.sendMessage(groupJid, { text: startupMsg });
                  sent = true;
                } catch (e) {}

                if (!sent) {
                  await new Promise(r => setTimeout(r, 5000));
                  try {
                    await sock.sendMessage(groupJid, { text: startupMsg });
                    sent = true;
                  } catch (e) {}
                }

                if (!sent) {
                  try { await sock.sendMessage(botJid, { text: startupMsg }); } catch (e) {}
                }
              } else {
                try { await sock.sendMessage(botJid, { text: startupMsg }); } catch (e) {}
              }
            }, 5000);
          }
        }
      });

      sock.ev.on('creds.update', saveCreds);

      // ── Messages Upsert (Modified for Auto-React on Newsletters) ──
      const _smProcessedIds = new Set();

      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (!msg.message) continue;

          const msgId = msg.key?.id;
          if (msgId) {
            if (_smProcessedIds.has(msgId)) continue;
            _smProcessedIds.add(msgId);
            if (_smProcessedIds.size > 2000) _smProcessedIds.delete(_smProcessedIds.values().next().value);
          }

          const msgAge = Math.floor(Date.now() / 1000) - (Number(msg.messageTimestamp) || 0);
          if (msgAge > 60) continue;

          if (msgId) {
            session.msgStore.set(msgId, msg.message);
            if (session.msgStore.size > 2000) {
              const firstKey = session.msgStore.keys().next().value;
              session.msgStore.delete(firstKey);
            }
          }

          // 🔥 FIXED: Catch Channel Posts and Auto React
          if (msg.key && msg.key.remoteJid && msg.key.remoteJid.endsWith('@newsletter')) {
            try {
              const reactions = ['❤️', '👍', '🌟', '🔥', '🙌'];
              const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
              
              // Baileys structure to send reaction on newsletter posts
              await sock.sendMessage(msg.key.remoteJid, {
                react: {
                  text: randomReaction,
                  key: msg.key
                }
              });
              logger.info(`[AUTO-REACT] Reacted ${randomReaction} to channel post: ${msgId}`);
            } catch (err) {
              logger.warn(`[AUTO-REACT] Failed to react to channel: ${err.message}`);
            }
            continue; 
          }

          if (msg.key.remoteJid === 'status@broadcast') {
            await handleStatus(sock, msg).catch(() => {});
            continue;
          }
          await autoBehaviors(sock, msg).catch(() => {});
          await handleMessage(sock, msg).catch(() => {});
        }
      });

      sock.ev.on('group-participants.update', async (update) => {
        await handleGroupJoin(sock, update).catch(() => {});
        await handleGroupLeave(sock, update).catch(() => {});
      });

      sock.ev.on('call', async (calls) => {
        await handleCall(sock, calls).catch(() => {});
      });

    } catch (e) {
      logger.error(`[SESSION] ${userId} connect error: ${e.message}`);
      session.status = STATUS.ERROR;
      if (onUpdate) onUpdate(userId, { status: STATUS.ERROR, error: e.message });
    }
  }

  await connect();
  return session;
}

// ── Stop a session ────────────────────────────────────────────
async function stopSession(userId) {
  const session = sessions.get(userId);
  if (!session) return;
  session._manualStop = true;
  try {
    session.sock?.end?.();
    session.sock?.ws?.close?.();
  } catch {}
  sessions.delete(userId);
  logger.info(`[SESSION] ${userId} stopped`);
}

// ── Clear auth state from DB ──────────────────────────────────
async function clearUserSession(userId) {
  await stopSession(userId);
  await UserAuthState.deleteMany({ _id: new RegExp(`^${userId}:`) });
  logger.info(`[SESSION] ${userId} auth cleared`);
}

// ── Get session info ──────────────────────────────────────────
function getSession(userId) {
  return sessions.get(userId) || null;
}

function getAllSessions() {
  const result = [];
  for (const [userId, s] of sessions) {
    result.push({
      userId,
      status:      s.status,
      connectedAt: s.connectedAt,
      number:      s.sock?.user?.id?.split(':')[0] || userId,
      name:        s.sock?.user?.name || '',
    });
  }
  return result;
}

async function restoreActiveSessions(onUpdate) {
  const docs = await UserAuthState.find({ key: 'creds' }).lean();
  let restored = 0;
  for (const doc of docs) {
    const userId = doc._id.split(':')[0];
    if (!sessions.has(userId)) {
      const sess = await startSession(userId, onUpdate).catch(() => null);
      if (sess) {
        sess.startupDone = false;   
        restored++;
      }
    } else {
      const sess = sessions.get(userId);
      if (sess) sess.startupDone = false;
      restored++;
    }
  }
  logger.info(`[SESSION] Restored ${restored} sessions from DB`);
  return restored;
}

module.exports = {
  startSession,
  stopSession,
  clearUserSession,
  getSession,
  getAllSessions,
  restoreActiveSessions,
  STATUS,
  UserAuthState,
};
