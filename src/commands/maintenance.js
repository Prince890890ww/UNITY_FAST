'use strict';
const cfg = require('../../config');
const db  = require('./index');

// ── Per-session maintenance — reads/writes DB only ────────────
// The old module-level `maintenanceMode` was a global variable
// shared across ALL sessions. Now every check goes to DB.

async function isMaintenance(sessionOwner) {
  try {
    const botCfg = await db.getBotConfig(sessionOwner || 'config');
    return !!botCfg?.maintenance;
  } catch { return false; }
}

async function getMaintenanceMsg(sessionOwner) {
  try {
    const botCfg = await db.getBotConfig(sessionOwner || 'config');
    return botCfg?.maintenanceMsg || '🔧 UNITY-MD is under maintenance. Back soon!';
  } catch { return '🔧 UNITY-MD is under maintenance. Back soon!'; }
}

module.exports = {
  commands: ['maintenance', 'maintain'],
  ownerOnly: true,

  isMaintenance,
  getMaintenanceMsg,

  async run({ sock, m }) {
    const cmd  = m.command;
    const args = m.args;

    if (cmd === 'maintenance' || cmd === 'maintain') {
      const action = args[0]?.toLowerCase();
      const botCfg = await db.getBotConfig(m.sessionOwner);

      // ── Status ────────────────────────────────────────────
      if (!action || action === 'status') {
        return m.reply(
          `🔧 *Maintenance Mode*\n\n` +
          `Status: ${botCfg.maintenance ? '🔴 ON' : '🟢 OFF'}\n` +
          `Message: ${botCfg.maintenanceMsg}\n\n` +
          `*.maintenance on* [message] — Enable\n` +
          `*.maintenance off* — Disable\n` +
          `*.maintenance notify* [message] — Notify all users\n\n` +
          `${cfg.footer}`
        );
      }

      // ── Enable ────────────────────────────────────────────
      if (action === 'on') {
        const custom = args.slice(1).join(' ');
        botCfg.maintenance = true;
        if (custom) botCfg.maintenanceMsg = custom;
        await botCfg.save();

        await m.reply(
          `🔧 *Maintenance Mode ON*\n\n` +
          `📝 Message: ${botCfg.maintenanceMsg}\n\n` +
          `All commands blocked for non-owners.\n\n` +
          `${cfg.footer}`
        );

        // Notify active users of THIS session
        try {
          const users = await db.User
            .find({ totalCommands: { $gt: 0 } })
            .limit(100)
            .lean();
          let notified = 0;
          for (const u of users) {
            if (u.jid === m.sender) continue;
            await sock.sendMessage(u.jid, {
              text:
                `🔧 *UNITY-MD Maintenance*\n\n` +
                `${botCfg.maintenanceMsg}\n\n` +
                `We'll be back shortly!\n\n` +
                `${cfg.footer}`
            }).catch(() => {});
            notified++;
            await new Promise(r => setTimeout(r, 500));
          }
          return m.reply(`✅ *Maintenance enabled!*\n📤 Notified ${notified} users.\n\n${cfg.footer}`);
        } catch {
          return m.reply(`✅ *Maintenance enabled!*\n\n${cfg.footer}`);
        }
      }

      // ── Disable ───────────────────────────────────────────
      if (action === 'off') {
        botCfg.maintenance = false;
        await botCfg.save();

        await m.reply(
          `✅ *Maintenance Mode OFF*\n\nBot is back online!\n\n${cfg.footer}`
        );

        try {
          const users = await db.User
            .find({ totalCommands: { $gt: 0 } })
            .limit(100)
            .lean();
          let notified = 0;
          for (const u of users) {
            if (u.jid === m.sender) continue;
            await sock.sendMessage(u.jid, {
              text: `✅ *UNITY-MD is Back Online!*\n\nAll commands are now available.\n\n${cfg.footer}`
            }).catch(() => {});
            notified++;
            await new Promise(r => setTimeout(r, 500));
          }
          return m.reply(`✅ *Maintenance disabled!*\n📤 Notified ${notified} users.\n\n${cfg.footer}`);
        } catch {
          return m.reply(`✅ *Maintenance disabled!*\n\n${cfg.footer}`);
        }
      }

      // ── Manual notify ─────────────────────────────────────
      if (action === 'notify') {
        const msg = args.slice(1).join(' ');
        if (!msg) return m.reply(`📌 Usage: *.maintenance notify* [message]\n\n${cfg.footer}`);

        await m.reply(`📤 *Sending notification...*`);

        const users = await db.User
          .find({ totalCommands: { $gt: 0 } })
          .limit(100)
          .lean();

        let sent = 0;
        for (const u of users) {
          if (u.jid === m.sender) continue;
          await sock.sendMessage(u.jid, {
            text: `📢 *UNITY-MD Notice*\n\n${msg}\n\n${cfg.footer}`
          }).catch(() => {});
          sent++;
          await new Promise(r => setTimeout(r, 500));
        }

        return m.reply(`✅ *Notified ${sent} users!*\n\n${cfg.footer}`);
      }
    }
  },
};
