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

    console.log(`[APP-CHAT] send | phone=${cleanPhone} text="${text}" sock=${!!sock} session=${!!session}`);

    if (!sock) return res.status(503).json({ ok: false, error: 'Bot not connected' });

    const msgId    = `APP_${Date.now()}`;
    const ownerJid = `${cleanPhone}@s.whatsapp.net`;

    chatPush(cleanPhone, { id: msgId, fromMe: true, text, type: 'text', ts: Date.now() });

    // Run async — errors logged, not swallowed
    _appChatRun(sock, cleanPhone, ownerJid, msgId, text.trim()).catch(e => {
      console.error('[APP-CHAT] _appChatRun threw:', e.message, e.stack);
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('[APP-CHAT] /chat/send error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

async function _appChatRun(sock, cleanPhone, ownerJid, msgId, text) {
  const cfg = require('../../config');
  const { plugins } = require('../../src/commands/messageHandler');
  const db  = require('../../src/commands/index'); // same db used by all plugins

  const prefix = cfg.prefixes.find(p => text.startsWith(p));
  console.log(`[APP-CHAT] prefix="${prefix}" text="${text}" prefixes=${JSON.stringify(cfg.prefixes)}`);
  if (!prefix) {
    console.log('[APP-CHAT] no prefix matched — ignoring');
    return;
  }

  const cmdBody = text.slice(prefix.length).trim();
  const cmdName = cmdBody.split(/\s+/)[0].toLowerCase();
  const cmdArgs = cmdBody.split(/\s+/).slice(1);
  const cmdText = cmdArgs.join(' ');

  const _pushReply = (txt, type = 'text') => chatPush(cleanPhone, {
    id:     `bot_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
    fromMe: false, text: txt || '[Message]', type, ts: Date.now(),
  });

  // ── Look up plugin directly by command name key ──────────
  const plugin = plugins.get(cmdName);
  console.log(`[APP-CHAT] cmdName="${cmdName}" plugin=${!!plugin} pluginsSize=${plugins.size}`);

  if (!plugin) {
    // Show available commands hint
    const available = [...plugins.keys()].slice(0, 10).join(', ');
    _pushReply(`❓ Command not found: *.${cmdName}*\n\nType *.menu* to see all commands.\n\nLoaded: ${plugins.size} commands`);
    console.log('[APP-CHAT] known commands sample:', available);
    return;
  }

  // ── Block group-only commands ─────────────────────────────
  const access = plugin.access || plugin.category || 'all';
  const blocked = ['group', 'groupOnly', 'admin', 'groupAdmin'];
  if (blocked.includes(access)) {
    _pushReply(`🚫 *.${cmdName}* is a group-only command.\n\nThis won't work in App Chat.`);
    return;
  }

  // ── Build m object ────────────────────────────────────────
  const m = {
    key:         { fromMe: false, remoteJid: ownerJid, id: msgId },
    jid:         ownerJid, chat: ownerJid,
    sender:      ownerJid, senderNum: cleanPhone,
    pushName:    'App',
    isGroup:     false, isGroupAdmin: false, isBotAdmin: false,
    isOwner:     true,  isPaired: true, isSelfChat: true,
    isFromChannel3: false,
    sessionOwner: sock.sessionOwner || `app:${cleanPhone}`,
    category:    'creator',
    isCmd:       true, isButtonTap: false,
    command:     cmdName, args: cmdArgs, text: cmdText,
    prefix,      body: text,
    msg: {
      key:     { fromMe: false, remoteJid: ownerJid, id: msgId },
      message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
      pushName: 'App',
    },
    msgType:  'conversation',
    isMedia:  false,
    quoted:   null,
    footer:   cfg.footer || '',
    message:  { conversation: text },
    reply: async (content) => {
      const t = typeof content === 'string' ? content
        : (content?.text || content?.caption || JSON.stringify(content));
      _pushReply(t);
    },
    replyWithThumb:  async (content) => _pushReply(typeof content === 'string' ? content : (content?.text || '')),
    replyAutoDelete: async (content) => _pushReply(typeof content === 'string' ? content : (content?.text || '')),
  };

  // ── Intercept sock.sendMessage → chatStore ────────────────
  const _orig = sock._appRealSend || sock.sendMessage;
  if (!sock._appRealSend) sock._appRealSend = _orig;

  sock.sendMessage = async (jid, content, opts) => {
    if (jid !== ownerJid) return _orig(jid, content, opts);

    // Skip control frames
    if (content.delete || content.react || content.edit)
      return { key: { id: `ctrl_${Date.now()}`, fromMe: true, remoteJid: jid } };

    let txt  = content.text || content.caption || '';
    let type = 'text';
    if (content.image)    { type = 'image';    txt = txt || '[📷 Image]'; }
    if (content.audio)    { type = 'audio';    txt = txt || '[🎙 Voice]'; }
    if (content.video)    { type = 'video';    txt = txt || '[🎬 Video]'; }
    if (content.sticker)  { type = 'sticker';  txt = '[🎭 Sticker]'; }
    if (content.document) { type = 'document'; txt = txt || `[📄 ${content.fileName||'File'}]`; }

    // Flatten buttons
    const btns = content.buttons || content.templateButtons || [];
    if (btns.length) {
      const bl = btns.map(b => `▸ ${b.buttonText?.displayText||b.displayText||''}`).filter(Boolean).join('\n');
      txt = [txt, bl].filter(Boolean).join('\n\n');
    }
    // Flatten list
    if (content.list) {
      const rows = (content.list.sections||[]).flatMap(s => s.rows||[]);
      txt = [content.list.title||'', content.list.description||'',
             rows.map(r => `▸ ${r.title}`).join('\n')].filter(Boolean).join('\n');
    }

    _pushReply(txt || '[Message]', type);
    return { key: { id: `apk_${Date.now()}`, fromMe: true, remoteJid: jid } };
  };

  // ── Run plugin ────────────────────────────────────────────
  console.log(`[APP-CHAT] running plugin for "${cmdName}"...`);
  try {
    await plugin.run({ sock, m, user: { isBanned:false, isMuted:false, points:0 }, group: null, cfg, db });
    console.log(`[APP-CHAT] plugin "${cmdName}" completed OK`);
  } catch (err) {
    console.error(`[APP-CHAT] plugin "${cmdName}" threw:`, err.message, err.stack?.split('\n')[1]);
    _pushReply(`⚠️ *${cmdName}* error: ${err.message}`);
  } finally {
    sock.sendMessage = _orig; // always restore
  }
}

// ── GET /api/app/chat/messages/:phone ─────────────────────────
router.get('/chat/messages/:phone', appAuth, async (req, res) => {
  try {
    const cleanPhone = normalizePhone(req.params.phone);
    const messages   = chatStore.get(cleanPhone) || [];
    res.json({ ok: true, messages });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
