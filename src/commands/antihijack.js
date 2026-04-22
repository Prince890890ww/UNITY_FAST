'use strict';
const cfg = require('../../config');
const db = require('./index');
const logger = require('./logger');
const { t, getLang } = require('./strings');

// ── Admin snapshot store ───────────────────────────────────────
const adminSnapshots = new Map(); // groupJid -> Set of admin jids

// ── Initialize hijack monitor ─────────────────────────────────
async function initHijackMonitor(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    for (const [jid, meta] of Object.entries(groups)) {
      const admins = new Set(
        meta.participants
          .filter(p => p.admin)
          .map(p => p.id)
      );
      adminSnapshots.set(jid, admins);
    }
    logger.info(`[HIJACK] Monitoring ${Object.keys(groups).length} groups`);
  } catch (e) {
    logger.warn('[HIJACK] Init failed: ' + e.message);
  }
}

// ── Handle group participant update ──────────────────────────
async function checkHijack(sock, update) {
  try {
    const { id, participants, action } = update;
    const ownerJid = cfg.ownerNumber + '@s.whatsapp.net';
    const botId = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
    const lang = await getLang(db, sock.sessionOwner);

    // ── Bot demoted alert ─────────────────────────────────────
    if (action === 'demote' && participants.includes(botId)) {
      logger.warn(`[HIJACK] Bot demoted in ${id}`);
      await sock.sendMessage(id, {
        text:
          `${t('hijack.bot_demoted_group', lang)}\n\n` +
          `${cfg.footer}`
      }).catch(() => {});
      await sock.sendMessage(ownerJid, {
        text:
          `${t('hijack.bot_demoted_owner', lang)}\n\n` +
          `${t('hijack.group_label', lang)} ${id}\n` +
          `${t('hijack.bot_demoted_detail', lang)}\n` +
          `${t('hijack.time_label', lang)} ${new Date().toLocaleString('en-LK', { timeZone: cfg.timezone })}\n\n` +
          `${cfg.footer}`
      }).catch(() => {});
      return;
    }

    // ── Mass promote detection ─────────────────────────────────
    if (action === 'promote') {
      const prev = adminSnapshots.get(id) || new Set();
      const newAdmins = participants.filter(p => !prev.has(p));

      if (newAdmins.length >= 3) {
        logger.warn(`[HIJACK] Mass promote in ${id}: ${newAdmins.length} new admins`);

        // Lock group immediately
        await sock.groupSettingUpdate(id, 'announcement').catch(() => {});

        await sock.sendMessage(id, {
          text:
            `${t('hijack.masspromote_group', lang)}\n\n` +
            `${t('hijack.masspromote_users', lang)(newAdmins.length)}\n` +
            `${t('hijack.group_locked', lang)}\n\n` +
            `${t('hijack.contact_admin', lang)}\n\n` +
            `${cfg.footer}`
        }).catch(() => {});

        await sock.sendMessage(ownerJid, {
          text:
            `${t('hijack.bot_demoted_owner', lang)}\n\n` +
            `${t('hijack.group_label', lang)} ${id}\n` +
            `${t('hijack.masspromote_owner', lang)(newAdmins.length)}\n` +
            `${t('hijack.autolocked', lang)}\n` +
            `${t('hijack.time_label', lang)} ${new Date().toLocaleString('en-LK', { timeZone: cfg.timezone })}\n\n` +
            `${cfg.footer}`
        }).catch(() => {});
      }

      // Update snapshot
      const updated = new Set([...prev, ...participants]);
      adminSnapshots.set(id, updated);
    }

    // ── All admins removed ─────────────────────────────────────
    if (action === 'demote') {
      try {
        const meta = await sock.groupMetadata(id);
        const remainingAdmins = meta.participants.filter(p => p.admin);

        if (remainingAdmins.length === 0) {
          await sock.sendMessage(ownerJid, {
            text:
              `${t('hijack.critical', lang)}\n\n` +
              `${t('hijack.group_label', lang)} ${id}\n` +
              `${t('hijack.all_admins_removed', lang)}\n\n` +
              `${cfg.footer}`
          }).catch(() => {});
        }

        // Update snapshot
        const prev = adminSnapshots.get(id) || new Set();
        participants.forEach(p => prev.delete(p));
        adminSnapshots.set(id, prev);

      } catch (e) {}
    }

    // ── Suspicious mass join ───────────────────────────────────
    if (action === 'add' && participants.length >= 10) {
      const group = await db.getGroup(id);
      if (!group?.settings?.antiRaid) return;

      await sock.groupSettingUpdate(id, 'announcement').catch(() => {});
      await sock.sendMessage(id, {
        text:
          `${t('hijack.raid', lang)}\n\n` +
          `${t('hijack.raid_users', lang)(participants.length)}\n` +
          `${t('hijack.raid_locked', lang)}\n\n` +
          `${cfg.footer}`
      }).catch(() => {});

      await sock.sendMessage(ownerJid, {
        text:
          `${t('hijack.raid_alert', lang)}\n\n` +
          `${t('hijack.group_label', lang)} ${id}\n` +
          `${t('hijack.raid_massjoin', lang)(participants.length)}\n` +
          `${t('hijack.raid_autolocked', lang)}\n\n` +
          `${cfg.footer}`
      }).catch(() => {});

      setTimeout(async () => {
        await sock.groupSettingUpdate(id, 'not_announcement').catch(() => {});
      }, 10 * 60 * 1000);
    }

  } catch (e) {
    logger.error('[HIJACK] Error: ' + e.message);
  }
}

// ── Periodic admin check every 30 min ────────────────────────
async function startPeriodicCheck(sock) {
  const cron = require('node-cron');
  cron.schedule('*/30 * * * *', async () => {
    try {
      const groups = await sock.groupFetchAllParticipating();
      const botId = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
      const lang = await getLang(db, sock.sessionOwner);

      for (const [jid, meta] of Object.entries(groups)) {
        const isBotAdmin = meta.participants.some(
          p => p.id === botId && p.admin
        );
        if (!isBotAdmin) {
          const ownerJid = cfg.ownerNumber + '@s.whatsapp.net';
          await sock.sendMessage(ownerJid, {
            text:
              `${t('hijack.bot_not_admin', lang)}\n\n` +
              `${t('hijack.group_label', lang)} ${meta.subject}\n` +
              `${t('hijack.jid_label', lang)} ${jid}\n\n` +
              `${t('hijack.make_admin', lang)}\n\n` +
              `${cfg.footer}`
          }).catch(() => {});
        }
      }
    } catch (e) {}
  });
}

module.exports = { initHijackMonitor, checkHijack, startPeriodicCheck };