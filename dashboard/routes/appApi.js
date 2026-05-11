'use strict';
/**
 * UNITY-MD — Mobile App API
 * Auth: simple APP_SECRET header (set APP_SECRET in Railway env)
 * Header: x-app-secret: <APP_SECRET>
 */

const express = require('express');
const router  = express.Router();

function getSM() { return require('../../src/sessionManager'); }

// ── Simple secret auth ────────────────────────────────────────
// Set APP_SECRET in Railway environment variables.
// Flutter app sends: headers: { 'x-app-secret': '<value>' }
const APP_SECRET = 'unity_md_2025_@secret#key';

function appAuth(req, res, next) {
  const provided = req.headers['x-app-secret'] || '';
  if (provided !== APP_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  req.appUser = { uid: 'app', email: '', name: 'app' };
  next();
}

function normalizePhone(phone) { return phone.replace(/[^0-9]/g, ''); }
function buildUserId(uid, phone) { return `${uid}:${phone}`; }

// ── POST /api/app/register ────────────────────────────────────
router.post('/register', appAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ ok: false, error: 'phone required' });

    const cleanPhone = normalizePhone(phone);
    if (cleanPhone.length < 7 || cleanPhone.length > 15)
      return res.status(400).json({ ok: false, error: 'Invalid phone number' });

    const userId = buildUserId(req.appUser.uid, cleanPhone);
    const sm = getSM();

    const existing = sm.getSession(userId);
    if (existing?.status === sm.STATUS.CONNECTED) {
      return res.json({ ok: true, status: 'connected', userId, phone: cleanPhone });
    }

    const sess = await sm.startSession(userId);
    let waited = 0;
    while (!sess.pairCode && sess.status !== sm.STATUS.CONNECTED
           && sess.status !== sm.STATUS.ERROR && waited < 30000) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
    }

    if (sess.status === sm.STATUS.CONNECTED)
      return res.json({ ok: true, status: 'connected', userId, phone: cleanPhone });
    if (sess.pairCode)
      return res.json({ ok: true, status: 'pairing', userId, phone: cleanPhone, pairCode: sess.pairCode });

    return res.status(500).json({ ok: false, error: 'Could not get pair code. Try again.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/app/status/:uid ──────────────────────────────────
router.get('/status/:uid', appAuth, async (req, res) => {
  try {
    const sm   = getSM();
    const sess = sm.getSession(req.params.uid);
    if (!sess) return res.json({ ok: true, status: 'disconnected' });
    res.json({ ok: true, status: sess.status, pairCode: sess.pairCode || null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── POST /api/app/reconnect ───────────────────────────────────
router.post('/reconnect', appAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ ok: false, error: 'phone required' });

    const userId = buildUserId(req.appUser.uid, normalizePhone(phone));
    const sm     = getSM();

    const existing = sm.getSession(userId);
    if (existing?.status === sm.STATUS.CONNECTED)
      return res.json({ ok: true, status: 'connected', userId });

    await sm.startSession(userId);
    let waited = 0;
    while (waited < 10000) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
      const s = sm.getSession(userId);
      if (s?.status === sm.STATUS.CONNECTED)
        return res.json({ ok: true, status: 'connected', userId });
      if (s?.pairCode)
        return res.json({ ok: true, status: 'pairing', userId, pairCode: s.pairCode });
    }

    const s = sm.getSession(userId);
    res.json({ ok: true, status: s?.status || 'connecting', userId });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── POST /api/app/disconnect ──────────────────────────────────
router.post('/disconnect', appAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ ok: false, error: 'phone required' });
    const userId = buildUserId(req.appUser.uid, normalizePhone(phone));
    await getSM().stopSession(userId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── GET /api/app/bot/info/:phone ──────────────────────────────
router.get('/bot/info/:phone', appAuth, async (req, res) => {
  try {
    const cleanPhone = normalizePhone(req.params.phone);
    const userId     = buildUserId(req.appUser.uid, cleanPhone);
    const sm         = getSM();
    const sess       = sm.getSession(userId);

    let cmdCount = 0;
    try { const { plugins } = require('../../src/commands/messageHandler');
          cmdCount = Object.keys(plugins || {}).length; } catch {}

    if (!sess) return res.json({ ok: true, status: 'disconnected', phone: cleanPhone,
      uptime: null, commandCount: cmdCount });

    const uptime = sess.connectedAt
      ? Math.floor((Date.now() - new Date(sess.connectedAt).getTime()) / 1000) : null;

    res.json({ ok: true, status: sess.status, phone: cleanPhone,
      uptime, commandCount: cmdCount, connectedAt: sess.connectedAt });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── GET /api/app/ping ─────────────────────────────────────────
router.get('/ping', (_, res) => res.json({ ok: true, server: 'UNITY-MD', ts: Date.now() }));

// ── POST /api/app/restart ─────────────────────────────────────
// App restart button → bot reconnects → startup msg + audio fires
router.post('/restart', appAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ ok: false, error: 'phone required' });

    const userId = buildUserId(req.appUser.uid, normalizePhone(phone));
    const sm     = getSM();

    // Stop existing session then restart — triggers connection.open → startup msg
    await sm.stopSession(userId).catch(() => {});
    setTimeout(() => sm.startSession(userId).catch(() => {}), 2000);

    res.json({ ok: true, message: 'Bot restarting...' });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── In-memory chat message store (phone → messages[]) ─────────
// Max 100 messages per phone kept in RAM
const chatStore = new Map();
const CHAT_MAX  = 100;

function chatPush(phone, msg) {
  if (!chatStore.has(phone)) chatStore.set(phone, []);
  const arr = chatStore.get(phone);
  arr.push(msg);
  if (arr.length > CHAT_MAX) arr.splice(0, arr.length - CHAT_MAX);
}

// Called from messageHandler when a message arrives for a chat JID
// Export so messageHandler can call: require('./appApi').storeChatMsg(phone, msg)
function storeChatMsg(phone, fromMe, text, ts) {
  chatPush(normalizePhone(phone), { fromMe, text, ts: ts || Date.now() });
}
module.exports.storeChatMsg = storeChatMsg;

// ── POST /api/app/chat/setup ──────────────────────────────────
// Creates a WhatsApp group for app ↔ bot communication
const chatJids = new Map(); // phone → groupJid

router.post('/chat/setup', appAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ ok: false, error: 'phone required' });

    const cleanPhone = normalizePhone(phone);

    // If already set up, just return it
    if (chatJids.has(cleanPhone))
      return res.json({ ok: true, jid: chatJids.get(cleanPhone) });

    const sock = global.unitySock;
    if (!sock) return res.status(503).json({ ok: false, error: 'Bot not connected' });

    // Create a group with just the bot (owner adds themselves via phone)
    const selfNum = sock.user?.id?.split(':')[0];
    const ownerJid = `${cleanPhone}@s.whatsapp.net`;

    const result = await sock.groupCreate('UNITY-MD Chat', [ownerJid]);
    const jid = result?.id;
    if (!jid) return res.status(500).json({ ok: false, error: 'Group creation failed' });

    chatJids.set(cleanPhone, jid);
    res.json({ ok: true, jid });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── GET /api/app/chat/jid/:phone ──────────────────────────────
router.get('/chat/jid/:phone', appAuth, async (req, res) => {
  try {
    const cleanPhone = normalizePhone(req.params.phone);
    const jid = chatJids.get(cleanPhone) || null;
    res.json({ ok: true, jid });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── POST /api/app/chat/send ───────────────────────────────────
router.post('/chat/send', appAuth, async (req, res) => {
  try {
    const { phone, text } = req.body;
    if (!phone || !text) return res.status(400).json({ ok: false, error: 'phone + text required' });

    const cleanPhone = normalizePhone(phone);
    const sock = global.unitySock;
    if (!sock) return res.status(503).json({ ok: false, error: 'Bot not connected' });

    const jid = chatJids.get(cleanPhone);
    if (!jid) return res.status(404).json({ ok: false, error: 'Chat not set up. Call /chat/setup first.' });

    await sock.sendMessage(jid, { text });

    // Save to local store (fromMe = false since it's from the app user)
    chatPush(cleanPhone, { fromMe: false, text, ts: Date.now() });

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── GET /api/app/chat/messages/:phone ─────────────────────────
router.get('/chat/messages/:phone', appAuth, async (req, res) => {
  try {
    const cleanPhone = normalizePhone(req.params.phone);
    const messages   = chatStore.get(cleanPhone) || [];
    res.json({ ok: true, messages });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
