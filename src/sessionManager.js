// src/sessionManager.js — HAR USER KA ALAG FOLDER, EXPLICIT PAIRING
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  proto
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const NodeCache = require('node-cache');
const fs = require('fs-extra');
const path = require('path');

const sessions = new Map();
const msgRetryCounterCache = new NodeCache();

const STATUS = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  PAIRING: 'pairing',
  ERROR: 'error',
  DISCONNECTED: 'disconnected'
};

async function startSession(userId, onUpdate) {
  // Agar already connected hai toh return
  if (sessions.has(userId)) {
    const existing = sessions.get(userId);
    if (existing.status === STATUS.CONNECTED || existing.status === STATUS.PAIRING) {
      return existing;
    }
  }

  // 🔥 HAR USER KA ALAG FOLDER
  const authFolder = path.join(__dirname, '..', 'auth_info_baileys_' + userId);
  fs.ensureDirSync(authFolder);

  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'silent' });

  const session = {
    userId,
    sock: null,
    status: STATUS.CONNECTING,
    pairCode: null,
    connectedAt: null,
    msgStore: new Map(),
    retryCache: new NodeCache(),
  };
  sessions.set(userId, session);

  const sock = makeWASocket({
    version,
    logger,
    msgRetryCounterCache: session.retryCache,
    syncFullHistory: false,
    maxMsgRetryCount: 3,
    connectTimeoutMs: 30000,
    keepAliveIntervalMs: 25000,
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: false,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    getMessage: async (key) => session.msgStore.get(key.id) || proto.Message.fromObject({}),
    browser: Browsers.baileys('Desktop'),
  });

  session.sock = sock;

  // ── ✅ EXPLICIT PAIRING CODE GENERATION ───────────────────
  // Socket banne ke 2 second baad seedha code generate karo
  setTimeout(async () => {
    // Agar already registered hai toh kuch mat karo
    if (sock.authState.creds.registered) {
      session.status = STATUS.CONNECTED;
      if (onUpdate) onUpdate(userId, { status: STATUS.CONNECTED });
      return;
    }
    // Agar code already set hai toh skip
    if (session.pairCode) return;

    try {
      session.status = STATUS.PAIRING;
      if (onUpdate) onUpdate(userId, { status: STATUS.PAIRING });

      const cleanNum = userId.replace(/[^0-9]/g, '');
      const code = await sock.requestPairingCode(cleanNum);
      session.pairCode = code?.match(/.{1,4}/g)?.join('-') || code;
      console.log(`[SESSION] 🔑 ${userId} PAIR CODE: ${session.pairCode}`);
      if (onUpdate) onUpdate(userId, { status: STATUS.PAIRING, pairCode: session.pairCode });
    } catch (e) {
      console.error(`[SESSION] ❌ Pairing failed for ${userId}:`, e.message);
      session.status = STATUS.ERROR;
      if (onUpdate) onUpdate(userId, { status: STATUS.ERROR, error: e.message });
    }
  }, 2000);

  // ── Connection Events ──────────────────────────────────────
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // Agar QR aata hai ya connecting hai toh retry
    if ((connection === 'connecting' || !!qr) && !sock.authState.creds.registered && !session.pairCode) {
      // Agar timeout se code generate nahi hua toh wapas try karo
      setTimeout(async () => {
        if (session.pairCode || sock.authState.creds.registered) return;
        try {
          const cleanNum = userId.replace(/[^0-9]/g, '');
          const code = await sock.requestPairingCode(cleanNum);
          session.pairCode = code?.match(/.{1,4}/g)?.join('-') || code;
          console.log(`[SESSION] 🔑 ${userId} PAIR CODE (retry): ${session.pairCode}`);
          if (onUpdate) onUpdate(userId, { status: STATUS.PAIRING, pairCode: session.pairCode });
        } catch (e) {
          console.error(`[SESSION] Retry failed for ${userId}:`, e.message);
        }
      }, 5000);
    }

    if (connection === 'open') {
      session.status = STATUS.CONNECTED;
      session.connectedAt = new Date();
      session.pairCode = null;
      console.log(`[SESSION] ✅ ${userId} connected`);
      if (onUpdate) onUpdate(userId, { status: STATUS.CONNECTED });
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      session.status = STATUS.DISCONNECTED;
      console.log(`[SESSION] ❌ ${userId} closed (${reason})`);

      if (reason === DisconnectReason.loggedOut || reason === DisconnectReason.badSession) {
        sessions.delete(userId);
        fs.removeSync(authFolder);
        return;
      }

      setTimeout(() => {
        console.log(`[SESSION] 🔄 Reconnecting ${userId}...`);
        startSession(userId, onUpdate);
      }, 5000);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ── Messages ──────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      const msgId = msg.key?.id;
      if (msgId) {
        session.msgStore.set(msgId, msg.message);
        if (session.msgStore.size > 2000) {
          const first = session.msgStore.keys().next().value;
          session.msgStore.delete(first);
        }
      }
    }
  });

  return session;
}

function getSession(userId) {
  return sessions.get(userId) || null;
}

function getAllSessions() {
  const result = [];
  for (const [userId, s] of sessions) {
    result.push({ userId, status: s.status, connectedAt: s.connectedAt, pairCode: s.pairCode });
  }
  return result;
}

function removeSession(userId) {
  if (sessions.has(userId)) {
    try { sessions.get(userId)?.sock?.end(); } catch {}
    const folder = path.join(__dirname, '..', 'auth_info_baileys_' + userId);
    fs.removeSync(folder);
    sessions.delete(userId);
    console.log(`[SESSION] 🗑️ ${userId} removed`);
  }
}

async function restoreActiveSessions() {
  console.log('[SESSION] Memory mode — no sessions to restore');
  return 0;
}

module.exports = {
  startSession,
  getSession,
  getAllSessions,
  removeSession,
  restoreActiveSessions,
  STATUS
};
