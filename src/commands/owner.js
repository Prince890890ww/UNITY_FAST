'use strict';
const { t, getLang  } = require('../lang');
const cfg = require('../../config');
const db = require('./index');
const logger = require('./logger');

module.exports = {
  commands: [
    'ban', 'unban', 'mute', 'unmute',
    'warn', 'unwarn', 'resetwarn',
    'addowner', 'delowner', 'listowner',
    'addsubadmin', 'delsubadmin',
    'setname', 'setbio', 'setppbot', 'delppbot', 'setownerdp', 'delownerdp',
    'listgc', 'broadcast', 'bc',
    'version', 'clearcache', 'clearchat', 'chatclear', 'autodeletechat',
    'auditlog', 'ping', 'runtime',
    'refreshmenu', 'reloadmenu',
  ],

  access: 'owner',
  description: 'Owner commands — self chat only',

  async run({ sock, m, db: database }) {
    const lang = await getLang(m.sessionOwner);
    const cmd  = m.command;
    const text = m.text?.trim();
    const args = m.args;
    const chat = m.chat;

    const getTarget = () => {
      const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (mentions.length) return mentions[0];
      if (m.quoted?.sender) return m.quoted.sender;
      if (args[0]) return args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      return null;
    };

    // ── Ban ───────────────────────────────────────────────────
    if (cmd === 'ban') {
      const target = getTarget();
      if (!target) return m.reply(`📌 Usage: *.ban* @user\n\n${cfg.footer}`);
      await database.banUser(target);
      return m.reply(
        `🚫 *Banned!*\n\n` +
        `👤 @${target.split('@')[0]}\n\n` +
        `${cfg.footer}`,
        { mentions: [target] }
      );
    }

    // ── Unban ─────────────────────────────────────────────────
    if (cmd === 'unban') {
      const target = getTarget();
      if (!target) return m.reply(`📌 Usage: *.unban* @user\n\n${cfg.footer}`);
      await database.unbanUser(target);
      return m.reply(
        `✅ *Unbanned!*\n\n` +
        `👤 @${target.split('@')[0]}\n\n` +
        `${cfg.footer}`,
        { mentions: [target] }
      );
    }

    // ── Mute ──────────────────────────────────────────────────
    if (cmd === 'mute') {
      const target = getTarget();
      if (!target) return m.reply(`📌 Usage: *.mute* @user\n\n${cfg.footer}`);
      await db.User.updateOne({ jid: target }, { $set: { isMuted: true } }, { upsert: true });
      return m.reply(
        `🔇 *Muted!*\n\n` +
        `👤 @${target.split('@')[0]}\n\n` +
        `${cfg.footer}`,
        { mentions: [target] }
      );
    }

    // ── Unmute ────────────────────────────────────────────────
    if (cmd === 'unmute') {
      const target = getTarget();
      if (!target) return m.reply(`📌 Usage: *.unmute* @user\n\n${cfg.footer}`);
      await db.User.updateOne({ jid: target }, { $set: { isMuted: false } });
      return m.reply(
        `🔊 *Unmuted!*\n\n` +
        `👤 @${target.split('@')[0]}\n\n` +
        `${cfg.footer}`,
        { mentions: [target] }
      );
    }

    // ── Warn ──────────────────────────────────────────────────
    if (cmd === 'warn') {
      const target = getTarget();
      const reason = args.slice(1).join(' ') || 'No reason';
      if (!target) return m.reply(`📌 Usage: *.warn* @user [reason]\n\n${cfg.footer}`);
      const warns = await database.warnUser(target, reason);
      if (warns >= cfg.limits.warnLimit && m.isGroup) {
        await sock.groupParticipantsUpdate(m.chat, [target], 'remove').catch(() => {});
        return m.reply(
          `⚠️ *Auto-kicked!* ${warns} warnings reached.\n\n` +
          `👤 @${target.split('@')[0]}\n\n` +
          `${cfg.footer}`,
          { mentions: [target] }
        );
      }
      return m.reply(
        `⚠️ *Warned!*\n\n` +
        `👤 @${target.split('@')[0]}\n` +
        `📊 Warns: ${warns}/${cfg.limits.warnLimit}\n` +
        `📝 Reason: ${reason}\n\n` +
        `${cfg.footer}`,
        { mentions: [target] }
      );
    }

    // ── Unwarn / reset warn ───────────────────────────────────
    if (cmd === 'unwarn' || cmd === 'resetwarn') {
      const target = getTarget();
      if (!target) return m.reply(`📌 Usage: *.resetwarn* @user\n\n${cfg.footer}`);
      await database.resetWarn(target);
      return m.reply(
        `✅ *Warnings reset!*\n\n` +
        `👤 @${target.split('@')[0]}\n\n` +
        `${cfg.footer}`,
        { mentions: [target] }
      );
    }

    // ── Add owner ─────────────────────────────────────────────
    if (cmd === 'addowner') {
      const target = getTarget();
      if (!target) return m.reply(`📌 Usage: *.addowner* @user\n\n${cfg.footer}`);
      await db.User.updateOne({ jid: target }, { $set: { isOwner: true } }, { upsert: true });
      return m.reply(`✅ *Added as owner:* @${target.split('@')[0]}\n\n${cfg.footer}`, { mentions: [target] });
    }

    // ── Del owner ─────────────────────────────────────────────
    if (cmd === 'delowner') {
      const target = getTarget();
      if (!target) return m.reply(`📌 Usage: *.delowner* @user\n\n${cfg.footer}`);
      await db.User.updateOne({ jid: target }, { $set: { isOwner: false } });
      return m.reply(`✅ *Removed as owner:* @${target.split('@')[0]}\n\n${cfg.footer}`, { mentions: [target] });
    }

    // ── List owners ───────────────────────────────────────────
    if (cmd === 'listowner') {
      const owners = await db.User.find({ isOwner: true }).lean();
      if (!owners.length) return m.reply(`📋 *No extra owners set.*\n\n${cfg.footer}`);
      const list = owners.map((o, i) =>
        `${i + 1}. +${o.jid.replace('@s.whatsapp.net', '')}`
      ).join('\n');
      return m.reply(`👑 *Owners:*\n\n${list}\n\n${cfg.footer}`);
    }

    // ── Add sub-admin ─────────────────────────────────────────
    if (cmd === 'addsubadmin') {
      const target = getTarget();
      if (!target) return m.reply(`📌 Usage: *.addsubadmin* @user\n\n${cfg.footer}`);
      await db.User.updateOne({ jid: target }, { $set: { isSubAdmin: true } }, { upsert: true });
      return m.reply(`✅ *Sub-admin added:* @${target.split('@')[0]}\n\n${cfg.footer}`, { mentions: [target] });
    }

    // ── Del sub-admin ─────────────────────────────────────────
    if (cmd === 'delsubadmin') {
      const target = getTarget();
      if (!target) return m.reply(`📌 Usage: *.delsubadmin* @user\n\n${cfg.footer}`);
      await db.User.updateOne({ jid: target }, { $set: { isSubAdmin: false } });
      return m.reply(`✅ *Sub-admin removed:* @${target.split('@')[0]}\n\n${cfg.footer}`, { mentions: [target] });
    }

    // ── Set bot name ──────────────────────────────────────────
    if (cmd === 'setname') {
      if (!text) return m.reply(`📌 Usage: *.setname* [name]\n\n${cfg.footer}`);
      await sock.updateProfileName(text);
      return m.reply(`✅ *Bot name updated:* ${text}\n\n${cfg.footer}`);
    }

    // ── Set bio ───────────────────────────────────────────────
    if (cmd === 'setbio') {
      if (!text) return m.reply(`📌 Usage: *.setbio* [bio]\n\n${cfg.footer}`);
      await sock.updateProfileStatus(text);
      return m.reply(`✅ *Bio updated!*\n\n${cfg.footer}`);
    }

    // ── Set bot photo ─────────────────────────────────────────
    if (cmd === 'setppbot') {
      const img = m.quoted?.message?.imageMessage || m.message?.imageMessage;
      if (!img) return m.reply(`📌 Send/reply image with *.setppbot*\n\n${cfg.footer}`);
      const buf = await sock.downloadMediaMessage(
        img === m.message?.imageMessage
          ? m.msg
          : { message: m.quoted.message, key: m.quoted.key }
      );
      await sock.updateProfilePicture(sock.user.id, buf);
      return m.reply(`✅ *Bot photo updated!*\n\n${cfg.footer}`);
    }

    // ── Del bot photo ─────────────────────────────────────────
    if (cmd === 'delppbot') {
      await sock.removeProfilePicture(sock.user.id);
      return m.reply(`✅ *Bot photo removed!*\n\n${cfg.footer}`);
    }

    // ── Set owner DP ──────────────────────────────────────────
    if (cmd === 'setownerdp') {
      const img = m.quoted?.message?.imageMessage || m.message?.imageMessage;
      if (!img) return m.reply(`📌 Send/reply image with *.setownerdp*\n\nThis sets your WhatsApp profile picture via the bot.\n\n${cfg.footer}`);
      const buf = await sock.downloadMediaMessage(
        img === m.message?.imageMessage
          ? m.msg
          : { message: m.quoted.message, key: m.quoted.key }
      );
      const ownerJid = m.sender;
      await sock.updateProfilePicture(ownerJid, buf);
      return m.reply(`✅ *Owner profile photo updated!*\n\n${cfg.footer}`);
    }

    // ── Remove owner DP ───────────────────────────────────────
    if (cmd === 'delownerdp') {
      const ownerJid = m.sender;
      await sock.removeProfilePicture(ownerJid);
      return m.reply(`✅ *Owner profile photo removed!*\n\n${cfg.footer}`);
    }

    // ── List groups ───────────────────────────────────────────
    if (cmd === 'listgc') {
      const groups = await sock.groupFetchAllParticipating();
      const list = Object.values(groups)
        .map((g, i) => `${i + 1}. *${g.subject}* (${g.participants.length})`)
        .join('\n');
      return m.reply(
        `👥 *Groups (${Object.keys(groups).length}):*\n\n` +
        `${list}\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Broadcast (own groups only) ───────────────────────────
    if (cmd === 'bc' || cmd === 'broadcast') {
      if (!text) return m.reply(`📌 Usage: *.bc* [message]\n\n${cfg.footer}`);
      await m.reply(`${t('own_broadcasting',lang)}`);
      const groups = await sock.groupFetchAllParticipating();
      let sent = 0, failed = 0;
      for (const [jid] of Object.entries(groups)) {
        try {
          await sock.sendMessage(jid, {
            text: `📢 *Announcement*\n\n${text}\n\n${cfg.footer}`
          });
          sent++;
        } catch (e) { failed++; }
        await new Promise(r => setTimeout(r, 1000));
      }
      return m.reply(
        `✅ *Done!*\n\n` +
        `📤 Sent: ${sent}\n` +
        `❌ Failed: ${failed}\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Ping ──────────────────────────────────────────────────
    if (cmd === 'ping') {
      const start = Date.now();
      const sent  = await m.reply(t('tool_pinging',lang), { _noImage: true });
      const ms    = Date.now() - start;
      return sock.sendMessage(chat, {
        text:
          `🏓 *Pong!*\n\n` +
          `⚡ Speed: *${ms}ms*\n` +
          `✅ Bot: Online\n\n` +
          `${cfg.footer}`,
        edit: sent.key,
      });
    }

    // ── Runtime ───────────────────────────────────────────────
    if (cmd === 'runtime') {
      const u   = process.uptime();
      const h   = Math.floor(u / 3600);
      const min = Math.floor((u % 3600) / 60);
      const s   = Math.floor(u % 60);
      return m.reply(`⏱️ *Runtime:* ${h}h ${min}m ${s}s\n\n${cfg.footer}`);
    }

    // ── Version ───────────────────────────────────────────────
    if (cmd === 'version') {
      const pkg = require('../../../package.json');
      return m.reply(
        `🧲 *UNITY-MD v${pkg.version}*\n\n` +
        `📦 ${pkg.name}\n` +
        `👤 ${pkg.author}\n\n` +
        `${cfg.footer}`
      );
  }

    // ── Clear cache ───────────────────────────────────────────
    if (cmd === 'clearcache') {
      const fs = require('fs-extra');
      await fs.emptyDir('./temp').catch(() => {});
      if (global.gc) global.gc();
      return m.reply(`✅ *Cache cleared!*\n\n${cfg.footer}`);
    }

    // ── Clear chat ────────────────────────────────────────────
    if (cmd === 'clearchat' || cmd === 'chatclear') {
      if (m.isGroup) {
        // Group: delete for everyone (need bot to be admin)
        if (!m.isBotAdmin) {
          return m.reply(`❌ *Bot must be admin to delete group messages!*\n\n${cfg.footer}`);
        }
        try {
          // Fetch recent messages and delete for everyone
          const result = await sock.fetchMessagesFromWA(m.chat, 100).catch(() => null);
          const msgs = result?.messages || [];
          let deleted = 0;
          for (const message of msgs) {
            if (!message?.key) continue;
            try {
              await sock.sendMessage(m.chat, { delete: message.key });
              deleted++;
              await new Promise(r => setTimeout(r, 100)); // small delay to avoid rate limit
            } catch {}
          }
          return m.reply(`🗑️ *${deleted} messages deleted for everyone!*\n\n${cfg.footer}`);
        } catch (e) {
          return m.reply(`❌ *Failed:* ${e.message}\n\n${cfg.footer}`);
        }
      } else {
        // Private chat: delete for me (bot side)
        try {
          await sock.chatModify({ clear: { messages: true } }, m.chat);
          return m.reply(`🗑️ *Chat cleared (delete for me)!*\n\n${cfg.footer}`);
        } catch (e) {
          return m.reply(`❌ *Failed:* ${e.message}\n\n${cfg.footer}`);
        }
      }
    }

    // ── Auto delete chat toggle ──────────────────────────────
    if (cmd === 'autodeletechat') {
      const botCfg = await db.getBotConfig(m.sessionOwner);
      botCfg.features = botCfg.features || {};
      const current = !!botCfg.features.autoDeleteChat;
      const newVal  = !current;
      botCfg.features.autoDeleteChat = newVal;
      await botCfg.save();
      return m.reply(
        `🗑️ *Auto Delete Chat: ${newVal ? '✅ ON' : '❌ OFF'}*\n\n` +
        `${newVal
          ? 'Bot will delete command messages and bot replies automatically after each command.'
          : 'Bot will NOT delete messages automatically.'}\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Refresh menu images ──────────────────────────────────
    if (cmd === 'refreshmenu' || cmd === 'reloadmenu') {
      await m.reply('🔄 *Menu images refresh කරනවා...* section 9 ම ✅ වෙනකල් ඉන්න.');
      const { refreshMenuImages } = require('./imenu');
      const results = await refreshMenuImages();
      const ok     = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      let msg = `✅ *Menu Refresh Done!*

📁 Success: ${ok}/9`;
      if (failed > 0) msg += `
❌ Failed: ${failed}/9`;
      msg += `

${cfg.footer}`;
      return m.reply(msg);
    }

    // ── Audit log ─────────────────────────────────────────────
    if (cmd === 'auditlog') {
      const logs = await db.Audit
        ?.find()
        .sort({ timestamp: -1 })
        .limit(10)
        .lean() || [];
      if (!logs.length) return m.reply(`📋 *No audit logs yet.*\n\n${cfg.footer}`);
      const list = logs.map((l, i) =>
        `${i + 1}. *.${l.command}* — +${l.userJid?.replace('@s.whatsapp.net', '')}\n` +
        `   ${new Date(l.timestamp).toLocaleString('en-LK', { timeZone: cfg.timezone })}`
      ).join('\n\n');
      return m.reply(`📋 *Audit Log (Last 10)*\n\n${list}\n\n${cfg.footer}`);
    }

  },
};


