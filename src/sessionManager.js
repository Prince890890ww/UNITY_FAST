'use strict';
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

const userAuthSchema = new mongoose.Schema({
  _id:    { type: String },
  key:    { type: String },
  data:   { type: mongoose.Schema.Types.Mixed },
}, { versionKey: false });

const UserAuthState = mongoose.models.UserAuthState ||
  mongoose.model('UserAuthState', userAuthSchema);

const sessions = new Map();
const STATUS = { CONNECTING: 'connecting', CONNECTED: 'connected', DISCONNECTED: 'disconnected', PAIRING: 'pairing', ERROR: 'error' };

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

async function startSession(userId, onUpdate) {
  if (sessions.has(userId)) {
    const existing = sessions.get(userId);
    if (existing.status === STATUS.CONNECTED || existing.status === STATUS.PAIRING) return existing;
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
        logger.warn(`[SESSION] fetchLatestBaileysVersion failed: ${e.message}`);
        version = [2, 3000, 1015901307];
      }
      const silentLogger = pino({ level: 'silent' });

      const sock = makeWASocket({
        version,
        logger: silentLogger,
        msgRetryCounterCache: session.retryCache,
        syncFullHistory: false,
        maxMsgRetryCount: 3,
        connectTimeoutMs: 30000,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 250,
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false,
        printQRInTerminal: false,
        fireInitQueries: false,
        emitOwnEvents: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
        },
        getMessage: async (key) => session.msgStore.get(key.id) || proto.Message.fromObject({}),
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
      });

      session.sock = sock;
      sock.sessionOwner = userId;
      sock._chatJids = new Set();
      sock._lastMsgMap = {};

      const { downloadMediaMessage: _dlMedia } = require('@whiskeysockets/baileys');
      sock.downloadMediaMessage = (msg) => _dlMedia(msg, 'buffer', {}, {
        logger: { info: () => {}, error: () => {}, warn: () => {}, child: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }), debug: () => {} },
      });

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
              logger.error(`[SESSION] Pair code error: ${e.message}`);
              setTimeout(async () => {
                if (sock.authState.creds.registered || session.pairCode) return;
                try {
                  const cleanNum = userId.replace(/[^0-9]/g, '');
                  const code = await sock.requestPairingCode(cleanNum);
                  session.pairCode = code?.match(/.{1,4}/g)?.join('-') || code;
                  if (onUpdate) onUpdate(userId, { status: STATUS.PAIRING, pairCode: session.pairCode });
                } catch (e2) {
                  logger.error(`[SESSION] Pair code retry failed: ${e2.message}`);
                }
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
              logger.warn(`[SESSION] ${userId} loggedOut but DB creds exist — retry in ${delay/1000}s`);
              setTimeout(() => connect(), delay);
            } else {
              logger.warn(`[SESSION] ${userId} logged out/forbidden — clearing session`);
              await clearUserSession(userId);
              if (onUpdate) onUpdate(userId, { status: STATUS.ERROR, reason });
            }
          } else {
            session.retries++;
            const delay = session.retries <= 10 ? Math.min(5000 + session.retries * 8000, 90000) : 120000;
            logger.info(`[SESSION] ${userId} reconnecting in ${Math.round(delay/1000)}s`);
            setTimeout(() => connect(), delay);
          }
        }

        if (connection === 'open') {
          session.status = STATUS.CONNECTED;
          session.pairCode = null;
          session.connectedAt = new Date();
          session.retries = 0;
          logger.success(`[SESSION] ${userId} connected ✅`);
          if (onUpdate) onUpdate(userId, { status: STATUS.CONNECTED, number: userId });

          // ── Startup actions: follow channel, join group, send msg ──
          if (!session.startupDone) {
            session.startupDone = true;
            setTimeout(async () => {
              const moment = require('moment-timezone');
              const now = moment().tz(cfg.timezone || 'Asia/Colombo');
              const botJid = userId + '@s.whatsapp.net';

              // 1. Follow channel
              const channelUrl = process.env.AUTO_JOIN_CHANNEL || '';
              try {
                let channelJid = '';
                if (channelUrl.includes('@newsletter')) {
                  channelJid = channelUrl;
                } else if (channelUrl) {
                  const match = channelUrl.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
                  if (match) channelJid = `${match[1]}@newsletter`;
                }
                if (channelJid) {
                  await sock.followNewsletter(channelJid);
                  logger.info(`[SESSION:STARTUP] ✅ Channel followed`);
                }
              } catch (e) {
                logger.warn(`[SESSION:STARTUP] Channel follow failed: ${e.message}`);
              }

              // 2. Join group via invite link
              const groupLink = process.env.AUTO_JOIN_GROUP_LINK || '';
              if (groupLink) {
                try {
                  const code = groupLink.split('/').pop().split('?')[0];
                  const info = await sock.groupGetInviteInfo(code).catch(() => null);
                  if (info?.id) {
                    await sock.groupAcceptInvite(code);
                    logger.info(`[SESSION:STARTUP] ✅ Group joined`);
                  }
                } catch (e) {
                  logger.warn(`[SESSION:STARTUP] Group join failed: ${e.message}`);
                }
              }

              // 3. Startup message
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

              if (groupLink) {
                try {
                  await sock.sendMessage(botJid, { text: startupMsg });
                } catch {}
              } else {
                try { await sock.sendMessage(botJid, { text: startupMsg }); } catch {}
              }
            }, 5000);
          }
        }
      });

      sock.ev.on('creds.update', saveCreds);

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
            if (session.msgStore.size > 2000) session.msgStore.delete(session.msgStore.keys().next().value);
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

async function stopSession(userId) {
  const session = sessions.get(userId);
  if (!session) return;
  session._manualStop = true;
  try { session.sock?.end?.(); session.sock?.ws?.close?.(); } catch {}
  sessions.delete(userId);
  logger.info(`[SESSION] ${userId} stopped`);
}

async function clearUserSession(userId) {
  await stopSession(userId);
  await UserAuthState.deleteMany({ _id: new RegExp(`^${userId}:`) });
  logger.info(`[SESSION] ${userId} auth cleared`);
}

function getSession(userId) {
  return sessions.get(userId) || null;
}

function getAllSessions() {
  const result = [];
  for (const [userId, s] of sessions) {
    result.push({
      userId,
      status: s.status,
      connectedAt: s.connectedAt,
      number: s.sock?.user?.id?.split(':')[0] || userId,
      name: s.sock?.user?.name || '',
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
      await startSession(userId, onUpdate).catch(() => {});
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
