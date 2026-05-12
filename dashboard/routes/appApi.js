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


// ═══════════════════════════════════════════════════════════════
// APP CHAT — VIRTUAL CHANNEL  (direct handleMessage approach)
// Commands processed in-process. Replies intercepted before WhatsApp.
// ═══════════════════════════════════════════════════════════════

const chatStore = new Map();  // phone → [{id,fromMe,text,type,ts}]
const CHAT_MAX  = 300;

function chatPush(phone, msg) {
  if (!chatStore.has(phone)) chatStore.set(phone, []);
  const arr = chatStore.get(phone);
  arr.push(msg);
  if (arr.length > CHAT_MAX) arr.splice(0, arr.length - CHAT_MAX);
}

// ── POST /api/app/chat/setup ──────────────────────────────────
// Virtual channel — no group needed, just verify bot is connected
router.post('/chat/setup', appAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ ok: false, error: 'phone required' });
    const { getSession } = require('../../src/sessionManager');
    const session = getSession(buildUserId(req.appUser.uid, normalizePhone(phone)));
    if (!session?.sock) return res.status(503).json({ ok: false, error: 'Bot not connected' });
    res.json({ ok: true, jid: `${normalizePhone(phone)}@s.whatsapp.net` });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── GET /api/app/chat/jid/:phone ──────────────────────────────
router.get('/chat/jid/:phone', appAuth, async (req, res) => {
  try {
    const cleanPhone = normalizePhone(req.params.phone);
    const { getSession } = require('../../src/sessionManager');
    const session = getSession(buildUserId(req.appUser.uid, cleanPhone));
    if (!session?.sock) return res.json({ ok: true, jid: null });
    res.json({ ok: true, jid: `${cleanPhone}@s.whatsapp.net` });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── POST /api/app/chat/send ───────────────────────────────────
router.post('/chat/send', appAuth, async (req, res) => {
  try {
    const { phone, text } = req.body;
    if (!phone || !text) return res.status(400).json({ ok: false, error: 'phone + text required' });

    const cleanPhone = normalizePhone(phone);
    const { getSession } = require('../../src/sessionManager');
    const session = getSession(buildUserId(req.appUser.uid, cleanPhone));
    const sock    = session?.sock;
    if (!sock) return res.status(503).json({ ok: false, error: 'Bot not connected' });

    const msgId    = `APP_${Date.now()}`;
    const ownerJid = `${cleanPhone}@s.whatsapp.net`;

    // ① Save user's outgoing bubble immediately
    chatPush(cleanPhone, { id: msgId, fromMe: true, text, type: 'text', ts: Date.now() });

    // ② Check if it's a command
    const cfg_  = require('../../config');
    const isCmd = cfg_.prefixes?.some(p => text.trim().startsWith(p));

    if (!isCmd) {
      // Plain message — just echo in store, no bot processing
      return res.json({ ok: true });
    }

    // ③ Intercept sock.sendMessage → capture bot replies to chatStore
    //    IMPORTANT: handleMessage ALSO wraps/restores sock.sendMessage internally,
    //    so we must set our interceptor BEFORE calling handleMessage, and the
    //    internal restore will still point to our interceptor since it captures
    //    the current value.
    const _realSend = sock._realSend || sock.sendMessage; // keep real original safe
    sock._realSend  = _realSend;                          // persist across multiple calls

    sock.sendMessage = async (jid, content, opts) => {
      // Extract readable content from whatever the bot sends
      let replyText = '';
      let replyType = 'text';

      if (typeof content.text     === 'string') replyText = content.text;
      if (typeof content.caption  === 'string') replyText = content.caption;
      if (content.image)   { replyType = 'image';    replyText = replyText || '[📷 Image]'; }
      if (content.audio)   { replyType = 'audio';    replyText = replyText || '[🎙 Voice Note]'; }
      if (content.video)   { replyType = 'video';    replyText = replyText || '[🎬 Video]'; }
      if (content.sticker) { replyType = 'sticker';  replyText = '[🎭 Sticker]'; }
      if (content.document){ replyType = 'document'; replyText = replyText || `[📄 ${content.fileName || 'File'}]`; }

      // Flatten buttons/list to readable text
      const btns = content.buttons || content.templateButtons || [];
      if (btns.length) {
        const bLines = btns.map(b => `▸ ${b.buttonText?.displayText || b.displayText || ''}`).filter(Boolean).join('\n');
        replyText = [replyText, bLines].filter(Boolean).join('\n\n');
      }
      if (content.list) {
        const rows = (content.list.sections || []).flatMap(s => s.rows || []);
        replyText = [
          content.list.title || '', content.list.description || '',
          rows.map(r => `▸ ${r.title}`).join('\n'),
        ].filter(Boolean).join('\n');
      }

      // Save to chatStore
      if (replyText || replyType !== 'text') {
        chatPush(cleanPhone, {
          id:     `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          fromMe: false,
          text:   replyText || '[Message]',
          type:   replyType,
          ts:     Date.now(),
        });
      }

      // Return fake key — do NOT forward to WhatsApp
      return { key: { id: `appchat_${Date.now()}`, fromMe: true, remoteJid: jid } };
    };

    // ④ Build fake DM message (fromMe=false, remoteJid=ownerJid → isOwner=true in parser)
    const fakeMsg = {
      key: {
        fromMe:    false,
        remoteJid: ownerJid,
        id:        msgId,
      },
      message:          { conversation: text.trim() },
      messageTimestamp: Math.floor(Date.now() / 1000),
      pushName:         'App',
    };

    // ⑤ Call handleMessage directly (await = waits for full plugin execution)
    try {
      const { handleMessage } = require('../../src/commands/messageHandler');
      await handleMessage(sock, fakeMsg);
    } catch (cmdErr) {
      console.error('[AppChat CMD]', cmdErr.message);
      chatPush(cleanPhone, {
        id: `err_${Date.now()}`, fromMe: false,
        text: `⚠️ Error: ${cmdErr.message}`, type: 'text', ts: Date.now(),
      });
    }

    // ⑥ Restore real sendMessage (handleMessage may have already restored it,
    //    but set it explicitly to be safe)
    sock.sendMessage = _realSend;

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
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
