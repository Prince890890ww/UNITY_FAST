'use strict';
const cfg = require('../../config');
const db  = require('./index');
const logger = require('./logger');

module.exports = {
  commands: ['pair', 'unpair'],
  access: 'normal',

  async run({ sock, m }) {
    const cmd  = m.command;
    const text = m.text?.trim();

    // ── Pair ──────────────────────────────────────────────────
    if (cmd === 'pair') {

      // ── Resolve real phone number — @lid digits are NOT phone numbers ──────
      const dmJid = (!m.isGroup ? m.chat : m.sender) || '';
      const dmIsLid = dmJid.endsWith('@lid');   // LID = WhatsApp internal ID, not phone
      let chatPhone = null;

      if (dmJid.endsWith('@s.whatsapp.net')) {
        chatPhone = dmJid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
      } else if (dmIsLid) {
        // Try contacts store for LID→phone mapping
        const contact = sock.store?.contacts?.[dmJid];
        const resolved = contact?.phoneJid || contact?.id || '';
        if (resolved.endsWith('@s.whatsapp.net')) {
          chatPhone = resolved.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
        }
      }

      // Use text input first, then resolved phone. NEVER fall back to m.senderNum
      // when sender is @lid — those digits are LID, not a real phone number.
      const rawNum = text
        ? text.replace(/[^0-9]/g, '')
        : (chatPhone || (!dmIsLid ? (m.senderNum || '') : ''));

      // LID fail = sender is @lid and we got no real phone AND user typed nothing
      const isLidFail = dmIsLid && !chatPhone && !text;

      if (!rawNum || rawNum.length < 7 || isLidFail) {
        return m.reply(
          `▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜\n` +
          `◤◢ 🔗 𝙋𝘼𝙄𝙍 𝙔𝙊𝙐𝙍 𝘽𝙊𝙏 ◤◢\n` +
          `▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟\n\n` +
          (isLidFail ? `⚠️ *Could not auto-detect your number.*\nPlease type it manually:\n\n` : '') +
          `📌 *Usage:* .pair [your number]\n` +
          `Example: *.pair 94771234567*\n\n` +
          `*Steps:*\n` +
          `1️⃣ Use *.pair [number]* (include country code)\n` +
          `2️⃣ Get pairing code\n` +
          `3️⃣ WhatsApp → Settings\n` +
          `4️⃣ Linked Devices → Link Device\n` +
          `5️⃣ Enter the code ✅\n\n` +
          `${cfg.footer}`
        );
      }

      // sessionManager ready check — retry logic with inline require
      let sm = global.unitySessionManager;
      if (!sm) {
        try { sm = require('../sessionManager'); global.unitySessionManager = sm; } catch (_e) {}
      }
      if (!sm) {
        return m.reply(`❌ *Session manager not ready. Try again shortly.*\n\n${cfg.footer}`);
      }

      await m.react('⏳');
      const waitMsg = await sock.sendMessage(m.chat, {
        text:
          `▛▀▀▀▀▀▀▀▀▀▀▀▀▀▜\n` +
          `◤◢ 🧲 𝙐𝙉𝙄𝙏𝙔-𝙈𝘿 ◤◢\n` +
          `▙▄▄▄▄▄▄▄▄▄▄▄▄▄▟\n\n` +
          `⏳ *Generating pair code...*\n\n` +
          `📞 Number: *+${rawNum}*\n` +
          `Please wait...\n\n` +
          `${cfg.footer}`,
        _noImage: true,
      }, { quoted: m.raw || undefined });

      try {
        const sess = await sm.startSession(rawNum, () => {});

        // Wait up to 60s for pair code
        let waited = 0;
        while (!sess.pairCode && sess.status !== 'connected' && waited < 60000) {
          await new Promise(r => setTimeout(r, 500));
          waited += 500;
        }

        if (sess.status === 'connected') {
          return m.reply(`✅ *+${rawNum} is already connected!*\n\n${cfg.footer}`);
        }

        if (sess.pairCode) {
          const userJid = rawNum + '@s.whatsapp.net';

          await db.setPaired(userJid, true).catch(() => {});

          try {
            const { autoFollowChannels } = require('./autoHandler');
            await autoFollowChannels(userJid);
          } catch (_e) {}

          await m.react('✅');

          // ── Edit "Generating..." → "Pairing Code Ready!" ──
          const readyText =
            `▛▀▀▀▀▀▀▀▀▀▀▀▀▀▜\n` +
            `◤◢ 🧲 𝙐𝙉𝙄𝙏𝙔-𝙈𝘿 ◤◢\n` +
            `▙▄▄▄▄▄▄▄▄▄▄▄▄▄▟\n\n` +
            `✅ *Pairing Code Ready!*\n\n` +
            `📞 Number: *+${rawNum}*\n` +
            `🔑 Code: *${sess.pairCode}*\n\n` +
            `📌 *Steps:*\n` +
            `1. Open WhatsApp\n` +
            `2. Settings → Linked Devices\n` +
            `3. Link a Device\n` +
            `4. Enter code: *${sess.pairCode}*\n\n` +
            `⏱️ Expires in 60 seconds.\n\n` +
            `${cfg.footer}`;

          if (waitMsg?.key) {
            await sock.sendMessage(m.chat, {
              text: readyText,
              edit: waitMsg.key,
            }).catch(() => sock.sendMessage(m.chat, { text: readyText, _noImage: true }));
          } else {
            await sock.sendMessage(m.chat, { text: readyText, _noImage: true });
          }

          // ── Code only — easy to copy ───────────────────────
          return sock.sendMessage(m.chat, {
            text: `${sess.pairCode}`,
            _noImage: true,
          });
        }

        return m.reply(
          `❌ *Pair code timeout!*\n` +
          `Please try again: *.pair ${rawNum}*\n\n${cfg.footer}`
        );

      } catch (e) {
        await m.react('❌');
        logger.error(`[PAIR] Failed: ${e.message}`);
        return m.reply(
          `❌ *Pairing failed!*\n\n` +
          `${e.message}\n\n` +
          `◉ Check the number (include country code)\n` +
          `◉ The number must have WhatsApp\n` +
          `◉ Try again in 60s\n\n` +
          `${cfg.footer}`
        );
      }
    }

    // ── Unpair ────────────────────────────────────────────────
    if (cmd === 'unpair') {
      const user = await db.getUser(m.sender);
      if (!user?.isPaired) {
        return m.reply(`❌ *Not paired yet!*\n\nUse *.pair* to connect.\n\n${cfg.footer}`);
      }
      await db.setPaired(m.sender, false);
      return m.reply(
        `✅ *Unpaired successfully!*\n\n` +
        `Your session has been disconnected.\n` +
        `Use *.pair* to reconnect.\n\n` +
        `${cfg.footer}`
      );
    }
  },
};
