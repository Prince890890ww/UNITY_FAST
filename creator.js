'use strict';
const cfg = require('../../config');
const db = require('./index');
const logger = require('./logger');
const { proto, generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');
module.exports = {
  commands: [
    'globalbc', 'globalmaintenance', 'globalunmaintenance',
    'globalban', 'globalunban',
    'topusers', 'activeusers', 'newusers',
    'kill', 'restart',
    'dbstats', 'sysinfo',
  ],

  access: 'creator',
  description: 'Creator only commands — Channel 3 only',

  async run({ sock, m, db: database }) {
    const cmd  = m.command;
    const text = m.text?.trim();
    const args = m.args;

    const getTarget = () => {
      const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (mentions.length) return mentions[0];
      if (m.quoted?.sender) return m.quoted.sender;
      if (args[0]) return args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      return null;
    };

    // ── Global broadcast (all paired users YOU chat) ───────────
    if (cmd === 'globalbc') {
      if (!text) return m.reply(
        `📌 *Usage:* .globalbc [message]\n\n` +
        `Sends to all paired users' personal chat.\n\n` +
        `${cfg.footer}`
      );

      await m.reply(`📢 *Broadcasting to all users...*`);

      const pairedUsers = await db.User.find({ isPaired: true }).lean();
      let sent = 0, failed = 0;

      for (const user of pairedUsers) {
        try {
          await sock.sendMessage(user.jid, {
            text:
              `📢 *UNITY-MD Announcement*\n\n` +
              `${text}\n\n` +
              `${cfg.footer}`,
          });
          sent++;
          await new Promise(r => setTimeout(r, 500));
        } catch (e) { failed++; }
      }

      return m.reply(
        `✅ *Global Broadcast Done!*\n\n` +
        `📤 Sent: ${sent}\n` +
        `❌ Failed: ${failed}\n` +
        `👥 Total: ${pairedUsers.length}\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Global maintenance ON ─────────────────────────────────
    if (cmd === 'globalmaintenance') {
      const botCfg = await db.getBotConfig();
      botCfg.maintenance = true;
      await botCfg.save();

      // Notify all paired users
      const pairedUsers = await db.User.find({ isPaired: true }).lean();
      for (const user of pairedUsers) {
        try {
          await sock.sendMessage(user.jid, {
            text:
              `🔧 *UNITY-MD Maintenance*\n\n` +
              `Bot is under maintenance.\n` +
              `We'll be back shortly! ⏳\n\n` +
              `${cfg.footer}`,
          });
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {}
      }

      return m.reply(`🔧 *Maintenance Mode ON*\n\nAll users notified.\n\n${cfg.footer}`);
    }

    // ── Global maintenance OFF ────────────────────────────────
    if (cmd === 'globalunmaintenance') {
      const botCfg = await db.getBotConfig();
      botCfg.maintenance = false;
      await botCfg.save();

      const pairedUsers = await db.User.find({ isPaired: true }).lean();
      for (const user of pairedUsers) {
        try {
          await sock.sendMessage(user.jid, {
            text:
              `✅ *UNITY-MD is Back!*\n\n` +
              `Maintenance complete.\n` +
              `Bot is fully operational! 🚀\n\n` +
              `${cfg.footer}`,
          });
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {}
      }

      return m.reply(`✅ *Maintenance Mode OFF*\n\nAll users notified.\n\n${cfg.footer}`);
    }

    // ── Global ban ────────────────────────────────────────────
    if (cmd === 'globalban') {
      const target = getTarget();
      if (!target) return m.reply(`📌 Usage: .globalban @user\n\n${cfg.footer}`);
      await db.User.updateOne(
        { jid: target },
        { $set: { isBanned: true, isPaired: false } },
        { upsert: true }
      );
      logger.warn(`[CREATOR] Global ban: ${target}`);
      return m.reply(
        `🚫 *Global Banned!*\n\n` +
        `👤 +${target.replace('@s.whatsapp.net', '')}\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Global unban ──────────────────────────────────────────
    if (cmd === 'globalunban') {
      const target = getTarget();
      if (!target) return m.reply(`📌 Usage: .globalunban @user\n\n${cfg.footer}`);
      await db.User.updateOne(
        { jid: target },
        { $set: { isBanned: false } }
      );
      return m.reply(
        `✅ *Global Unbanned!*\n\n` +
        `👤 +${target.replace('@s.whatsapp.net', '')}\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Top users ─────────────────────────────────────────────
    if (cmd === 'topusers') {
      const users = await db.User
        .find({ totalCommands: { $gt: 0 } })
        .sort({ totalCommands: -1 })
        .limit(10)
        .lean();

      if (!users.length) return m.reply(`📊 No data yet.\n\n${cfg.footer}`);

      const list = users.map((u, i) => {
        const num = u.jid.replace('@s.whatsapp.net', '').replace('@lid', '');
        const paired = u.isPaired ? '🔗' : '👤';
        return `${i + 1}. ${paired} +${num} — ${u.totalCommands} cmds`;
      }).join('\n');

      return m.reply(
        `📊 *Top 10 Users*\n\n${list}\n\n${cfg.footer}`
      );
    }

    // ── Active users (last 24h) ───────────────────────────────
    if (cmd === 'activeusers') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const count = await db.User.countDocuments({
        lastCommand: { $gte: since },
      });
      const paired = await db.User.countDocuments({ isPaired: true });
      const total  = await db.User.countDocuments();

      return m.reply(
        `📊 *User Stats*\n\n` +
        `⚡ Active (24h): ${count}\n` +
        `🔗 Paired: ${paired}\n` +
        `👥 Total: ${total}\n\n` +
        `${cfg.footer}`
      );
    }

    // ── New users today ───────────────────────────────────────
    if (cmd === 'newusers') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const count = await db.User.countDocuments({
        createdAt: { $gte: today },
      });
      const paired = await db.User.countDocuments({
        createdAt: { $gte: today },
        isPaired: true,
      });

      return m.reply(
        `📊 *New Users Today*\n\n` +
        `👥 Total new: ${count}\n` +
        `🔗 Paired today: ${paired}\n\n` +
        `${cfg.footer}`
      );
    }

    // ── DB stats ──────────────────────────────────────────────
    if (cmd === 'dbstats') {
      const users   = await db.User.countDocuments();
      const paired  = await db.User.countDocuments({ isPaired: true });
      const banned  = await db.User.countDocuments({ isBanned: true });
      const groups  = await db.Group.countDocuments();
      const audits  = await db.Audit?.countDocuments() || 0;

      return m.reply(
        `🗄️ *Database Stats*\n\n` +
        `👥 Users: ${users}\n` +
        `🔗 Paired: ${paired}\n` +
        `🚫 Banned: ${banned}\n` +
        `👥 Groups: ${groups}\n` +
        `📋 Audit logs: ${audits}\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Sys info ──────────────────────────────────────────────
    if (cmd === 'sysinfo') {
      const os  = require('os');
      const mem = process.memoryUsage();
      const u   = process.uptime();
      const { plugins } = require('./messageHandler');

      return m.reply(
        `🖥️ *System Info*\n\n` +
        `⏱️ Uptime: ${Math.floor(u/3600)}h ${Math.floor((u%3600)/60)}m\n` +
        `💾 RAM: ${(mem.rss/1024/1024).toFixed(1)} MB\n` +
        `🧠 Heap: ${(mem.heapUsed/1024/1024).toFixed(1)}/${(mem.heapTotal/1024/1024).toFixed(1)} MB\n` +
        `🖥️ OS: ${os.platform()} ${os.arch()}\n` +
        `📦 Node: ${process.version}\n` +
        `🔢 Commands: ${plugins.size}+\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Kill ──────────────────────────────────────────────────
    if (cmd === 'kill') {
      await m.reply(`💀 *UNITY-MD shutting down...*\n\n${cfg.footer}`);
      logger.warn('[CREATOR] Kill command executed');
      process.exit(0);
    }

    // ── Restart ───────────────────────────────────────────────
    if (cmd === 'restart') {
      const os = require('os');
      const mem = process.memoryUsage();
      const uptime = process.uptime();
      const uptimeStr = `${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m ${Math.floor(uptime%60)}s`;

      // ── DB Stats ─────────────────────────────────────────────────
      let totalUsers = 0, pairedUsers = 0, bannedUsers = 0, totalGroups = 0, activeToday = 0;
      try {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        [totalUsers, pairedUsers, bannedUsers, totalGroups, activeToday] = await Promise.all([
          db.User.countDocuments(),
          db.User.countDocuments({ isPaired: true }),
          db.User.countDocuments({ isBanned: true }),
          db.Group.countDocuments(),
          db.User.countDocuments({ lastCommand: { $gte: since24h } }),
        ]);
      } catch (e) {}

      const restartMsg =
        `\`\`\`\n` +
        `╔══════════════════════════════╗\n` +
        `║  ██╗   ██╗███╗   ██╗██╗████████╗██╗   ██╗  ║\n` +
        `║  ██║   ██║████╗  ██║██║╚══██╔══╝╚██╗ ██╔╝  ║\n` +
        `║  ██║   ██║██╔██╗ ██║██║   ██║    ╚████╔╝   ║\n` +
        `║  ██║   ██║██║╚██╗██║██║   ██║     ╚██╔╝    ║\n` +
        `║  ╚██████╔╝██║ ╚████║██║   ██║      ██║     ║\n` +
        `║   ╚═════╝ ╚═╝  ╚═══╝╚═╝   ╚═╝      ╚═╝     ║\n` +
        `╚══════════════════════════════╝\n` +
        `\`\`\`\n\n` +
        `〔 *SYSTEM REBOOT INITIATED* 〕\n\n` +
        `▸ *Number  :* +${(m.sock?.user?.id || m.jid || 'N/A').replace(/[^0-9]/g, '')}\n` +
        `▸ *Date    :* ${new Date().toLocaleDateString('en-LK', { timeZone: cfg.timezone, weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' })}\n` +
        `▸ *Time    :* ${new Date().toLocaleTimeString('en-LK', { timeZone: cfg.timezone })} (SL)\n` +
        `▸ *Uptime  :* ${uptimeStr}\n\n` +
        `┌───── SYSTEM STATUS ─────\n` +
        `│ 🧠 *RAM     :* ${(mem.rss/1024/1024).toFixed(1)} MB\n` +
        `│ 📦 *Heap    :* ${(mem.heapUsed/1024/1024).toFixed(1)} MB\n` +
        `│ ⚙️  *Node    :* ${process.version}\n` +
        `│ 🖥️  *OS      :* ${os.platform()} ${os.arch()}\n` +
        `└─────────────────────────\n\n` +
        `┌───── DATABASE ──────────\n` +
        `│ 👥 *Total Users  :* ${totalUsers}\n` +
        `│ 🔗 *Paired       :* ${pairedUsers}\n` +
        `│ ⚡ *Active (24h) :* ${activeToday}\n` +
        `│ 🚫 *Banned       :* ${bannedUsers}\n` +
        `│ 👥 *Groups       :* ${totalGroups}\n` +
        `└─────────────────────────\n\n` +
        `_[ Shutting down processes... ]_\n` +
        `_[ Rebooting core systems...  ]_\n` +
        `_[ Back online in moments.    ]_\n\n` +
        `◈─────────────────────────◈\n` +
        `     ❪❪ *UNITY-MD* ❫❫  |  ® UNITY TEAM`;

      const THUMB_URL = 'https://i.ibb.co/W4zwVktH/1777104289725.jpg';
      const AUDIO_URL = 'https://files.catbox.moe/zmkssv.mp3';

      // Channel JID for "View channel" button
      const channelJid = cfg.channel1 || '120363419201971095@newsletter';
      const channelId  = channelJid.replace('@newsletter', '');
      const channelUrl = `https://whatsapp.com/channel/${channelId}`;

      // 1) Image + restartup text + "View channel" button — ONE message
      await m.sock.sendMessage(m.jid, {
        image: { url: THUMB_URL },
        caption: restartMsg,
        contextInfo: {
          externalAdReply: {
            title: 'UNITY',
            body: '® UNITY TEAM',
            thumbnailUrl: THUMB_URL,
            sourceUrl: channelUrl,
            mediaType: 1,
            renderLargerThumbnail: true,
            showAdAttribution: true,
          },
        },
      }, { quoted: m.msg }).catch(() => {});

      // 2) Audio
      await m.sock.sendMessage(m.jid, {
        audio: { url: AUDIO_URL },
        mimetype: 'audio/mp4',
        ptt: true,
      }).catch(() => {});

      logger.warn('[CREATOR] Restart command executed');
      setTimeout(() => process.exit(1), 1500);
    }
  },
};
