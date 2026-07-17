// src/sessionManager.js
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

const sessions = new Map(); // userId -> { sock, status, pairCode, ... }
const msgRetryCounterCache = new NodeCache();

const STATUS = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  PAIRING: 'pairing',
  ERROR: 'error',
  DISCONNECTED: 'disconnected'
};

async function startSession(userId, onUpdate) {
  // Agar already session hai toh return kar do
  if (sessions.has(userId)) {
    const existing = sessions.get(userId);
    if (existing.status === STATUS.CONNECTED || existing.status === STATUS.PAIRING) {
      return existing;
    }
  }

  // ✅ Har user ka ALAG FOLDER (MongoDB ki jagah)
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
    getMessage: async (key) => {
      return session.msgStore.get(key.id) || proto.Message.fromObject({});
    },
    browser: Browsers.baileys('Desktop'),
  });

  session.sock = sock;

  // ── Connection Events ──────────────────────────────────────
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // 🔥 PAIRING CODE GENERATION (SIRF TAB JAB REGISTERED NAHI)
    if ((connection === 'connecting' || !!qr) && !sock.authState.creds.registered && !session.pairCode) {
      session.status = STATUS.PAIRING;
      if (onUpdate) onUpdate(userId, { status: STATUS.PAIRING });

      try {
        const cleanNum = userId.replace(/[^0-9]/g, '');
        const code = await sock.requestPairingCode(cleanNum);
        session.pairCode = code?.match(/.{1,4}/g)?.join('-') || code;
        console.log(`[SESSION] 🔑 ${userId} PAIR CODE: ${session.pairCode}`);
        if (onUpdate) onUpdate(userId, { status: STATUS.PAIRING, pairCode: session.pairCode });
      } catch (e) {
        console.error(`[SESSION] Pair code error for ${userId}:`, e.message);
      }
    }

    // ✅ CONNECTED
    if (connection === 'open') {
      session.status = STATUS.CONNECTED;
      session.connectedAt = new Date();
      session.pairCode = null;
      console.log(`[SESSION] ✅ ${userId} connected successfully`);
      if (onUpdate) onUpdate(userId, { status: STATUS.CONNECTED });
    }

    // ❌ DISCONNECTED
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      session.status = STATUS.DISCONNECTED;
      console.log(`[SESSION] ❌ ${userId} closed (${reason})`);

      // Agar logged out hai toh folder delete karo aur session hatao
      if (reason === DisconnectReason.loggedOut || reason === DisconnectReason.badSession) {
        console.log(`[SESSION] 🗑️ ${userId} logged out — removing session & folder`);
        sessions.delete(userId);
        fs.removeSync(authFolder);
        return;
      }

      // Warna reconnect (unlimited retries)
      setTimeout(() => {
        console.log(`[SESSION] 🔄 Reconnecting ${userId}...`);
        startSession(userId, onUpdate);
      }, 5000);
    }
  });

  // ── Creds update ────────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Messages ──────────────────────────────────────────────────
  // Simple message handler (fast, no DB)
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
      // Auto-reply ya commands yahan handle kar sakte ho
      // Lekin abhi ke liye sirf store karo
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
    result.push({
      userId,
      status: s.status,
      connectedAt: s.connectedAt,
      pairCode: s.pairCode || null,
    });
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
  // Memory mode mein kuch restore nahi karna – fresh start
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
