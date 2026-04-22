'use strict';
const { getT } = require('../lang');
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const cfg = require('../../config');
const { sendButtons } = require('./helper');

// ── Helpers ───────────────────────────────────────────────────
const databaseDir = path.join(process.cwd(), 'data');
const warningsPath = path.join(databaseDir, 'warnings.json');
const bannedPath = path.join(databaseDir, 'banned.json');

function ensureDir() {
  if (!fs.existsSync(databaseDir)) fs.mkdirSync(databaseDir, { recursive: true });
}

function loadWarnings() {
  ensureDir();
  if (!fs.existsSync(warningsPath)) fs.writeFileSync(warningsPath, '{}');
  try { return JSON.parse(fs.readFileSync(warningsPath, 'utf8')); } catch { return {}; }
}

function saveWarnings(w) {
  ensureDir();
  fs.writeFileSync(warningsPath, JSON.stringify(w, null, 2));
}

function loadBanned() {
  ensureDir();
  if (!fs.existsSync(bannedPath)) fs.writeFileSync(bannedPath, '[]');
  try { return JSON.parse(fs.readFileSync(bannedPath, 'utf8')); } catch { return []; }
}

function saveBanned(b) {
  ensureDir();
  fs.writeFileSync(bannedPath, JSON.stringify(b, null, 2));
}

async function getAdminStatus(sock, chat, senderId) {
  try {
    const meta = await sock.groupMetadata(chat);
    const participants = meta.participants || [];

    // Bot phone number (e.g. "94771234567")
    const botId  = sock.user?.id  || '';
    const botNum = botId.split('@')[0].split(':')[0];

    // Bot LID — newer WhatsApp groups store participants as @lid JIDs
    // sock.user.lid looks like "123456789:0@lid"
    const botLid    = sock.user?.lid || '';
    const botLidNum = botLid.split('@')[0].split(':')[0];

    const senderNum = senderId.split('@')[0].split(':')[0];

    const isAdmin = (p) => p.admin === 'admin' || p.admin === 'superadmin';

    const isBotAdmin = participants.some(p => {
      const pRaw = p.id || '';
      const pNum = pRaw.split('@')[0].split(':')[0];
      // Match by phone number OR by LID (for newer WhatsApp versions)
      const matchesPhone = pNum === botNum;
      const matchesLid   = botLidNum && pRaw.includes('@lid') && pNum === botLidNum;
      return (matchesPhone || matchesLid) && isAdmin(p);
    });

    const isSenderAdmin = participants.some(p => {
      const pNum = (p.id || '').split('@')[0].split(':')[0];
      return pNum === senderNum && isAdmin(p);
    });

    return { isBotAdmin, isSenderAdmin };
  } catch {
    return { isBotAdmin: false, isSenderAdmin: false };
  }
}

async function downloadMedia(msg, mediaType) {
  const stream = await downloadContentFromMessage(msg, mediaType);
  let buf = Buffer.from([]);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  const tmpDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `${Date.now()}.${mediaType}`);
  fs.writeFileSync(filePath, buf);
  return filePath;
}

module.exports = {
  commands: [
    'warn', 'warnings', 'resetwarn',
    'kick', 'remove',
    'ban', 'unban',
    'promote', 'demote',
    'mute', 'unmute',
    'tag', 'tagall', 'tgall',
    'tagnotadmin', 'tgna',
    'hidetag', 'htag',
    'del', 'delete',
    'groupinfo', 'ginfo',
    'resetlink',
    'topmembers', 'topmsg',
    // ── Unity group features ──────────────────────────────────
    'approve', 'acceptreq',
    'reject', 'rejectreq',
    'viewreq', 'joinrequests',
    'add', 'addmember',
    'removeall', 'kickall',
    'kickme', 'leavegroup',
    'setname', 'setsubject',
    'setdesc', 'setdescription',
    'grouplink', 'glink', 'invitelink', 'link',
    'tagadmin', 'tgadmin',
    'opentime',
    'closetime',
    'joingroup', 'joininvite',
  ],

  adminOnly: false,
  groupOnly: true,

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd = m.command;
    const chat = m.chat;
    const msg = m.msg;
    const senderId = m.sender;
    const text = m.text?.trim();
    const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const repliedParticipant = msg?.message?.extendedTextMessage?.contextInfo?.participant;
    const quotedMessage = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!m.isGroup) {
      return sendButtons(sock, chat, {
        text: `👥 *This command only works in groups!*\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: '📋 Menu', id: '.menu' }],
        quoted: msg,
      });
    }

    const { isBotAdmin, isSenderAdmin } = await getAdminStatus(sock, chat, senderId);

    // ── WARN ──────────────────────────────────────────────────
    if (cmd === 'warn') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);

      const target = mentioned[0] || repliedParticipant;
      if (!target) {
        return sendButtons(sock, chat, {
          text: `📌 Usage: *.warn* @user or reply to a message\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }

      const warnings = loadWarnings();
      if (!warnings[chat]) warnings[chat] = {};
      if (!warnings[chat][target]) warnings[chat][target] = 0;
      warnings[chat][target]++;
      saveWarnings(warnings);

      const count = warnings[chat][target];
      await sock.sendMessage(chat, {
        text: `⚠️ *WARNING ALERT*\n\n👤 *User:* @${target.split('@')[0]}\n⚠️ *Warnings:* ${count}/3\n👑 *By:* @${senderId.split('@')[0]}\n\n${cfg.footer}`,
        mentions: [target, senderId],
      }, { quoted: msg });

      if (count >= 3) {
        await sock.groupParticipantsUpdate(chat, [target], 'remove');
        delete warnings[chat][target];
        saveWarnings(warnings);
        await sock.sendMessage(chat, {
          text: `⛔ @${target.split('@')[0]} auto-kicked after 3 warnings!\n\n${cfg.footer}`,
          mentions: [target],
        });
      }
      return;
    }

    // ── WARNINGS ──────────────────────────────────────────────
    if (cmd === 'warnings') {
      const target = mentioned[0] || repliedParticipant;
      if (!target) return m.reply(`📌 Usage: *.warnings* @user\n\n${cfg.footer}`);
      const warnings = loadWarnings();
      const count = warnings[chat]?.[target] || 0;
      return sendButtons(sock, chat, {
        text: `📊 *Warnings for @${target.split('@')[0]}*\n\n⚠️ *Count:* ${count}/3\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: '📋 Menu', id: '.menu' }],
        quoted: msg,
      });
    }

    // ── RESETWARN ─────────────────────────────────────────────
    if (cmd === 'resetwarn') {
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const target = mentioned[0] || repliedParticipant;
      if (!target) return m.reply(`📌 Usage: *.resetwarn* @user\n\n${cfg.footer}`);
      const warnings = loadWarnings();
      if (warnings[chat]) delete warnings[chat][target];
      saveWarnings(warnings);
      return m.reply(`✅ Warnings reset for @${target.split('@')[0]}!\n\n${cfg.footer}`);
    }

    // ── KICK ──────────────────────────────────────────────────
    if (cmd === 'kick' || cmd === 'remove') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const targets = mentioned.length > 0 ? mentioned : (repliedParticipant ? [repliedParticipant] : []);
      if (targets.length === 0) return m.reply(`📌 Mention or reply to a user!\n\n${cfg.footer}`);
      await sock.groupParticipantsUpdate(chat, targets, 'remove');
      return sock.sendMessage(chat, {
        text: `✅ Kicked: ${targets.map(t => `@${t.split('@')[0]}`).join(', ')}\n\n${cfg.footer}`,
        mentions: targets,
      }, { quoted: msg });
    }

    // ── BAN ───────────────────────────────────────────────────
    if (cmd === 'ban') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const target = mentioned[0] || repliedParticipant;
      if (!target) return m.reply(`📌 Usage: *.ban* @user\n\n${cfg.footer}`);
      const banned = loadBanned();
      if (!banned.includes(target)) { banned.push(target); saveBanned(banned); }
      await sock.groupParticipantsUpdate(chat, [target], 'remove');
      return sock.sendMessage(chat, {
        text: `⛔ *BANNED*\n\n@${target.split('@')[0]} has been banned!\n\n${cfg.footer}`,
        mentions: [target],
      }, { quoted: msg });
    }

    // ── UNBAN ─────────────────────────────────────────────────
    if (cmd === 'unban') {
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const target = mentioned[0] || repliedParticipant;
      if (!target) return m.reply(`📌 Usage: *.unban* @user\n\n${cfg.footer}`);
      const banned = loadBanned();
      const idx = banned.indexOf(target);
      if (idx > -1) { banned.splice(idx, 1); saveBanned(banned); }
      return m.reply(`✅ @${target.split('@')[0]} has been unbanned!\n\n${cfg.footer}`);
    }

    // ── PROMOTE ───────────────────────────────────────────────
    if (cmd === 'promote') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const targets = mentioned.length > 0 ? mentioned : (repliedParticipant ? [repliedParticipant] : []);
      if (targets.length === 0) return m.reply(`📌 Mention or reply to a user!\n\n${cfg.footer}`);
      await sock.groupParticipantsUpdate(chat, targets, 'promote');
      return sock.sendMessage(chat, {
        text: `👑 *PROMOTED*\n\n${targets.map(t => `@${t.split('@')[0]}`).join('\n')}\n\n${cfg.footer}`,
        mentions: targets,
      }, { quoted: msg });
    }

    // ── DEMOTE ────────────────────────────────────────────────
    if (cmd === 'demote') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const targets = mentioned.length > 0 ? mentioned : (repliedParticipant ? [repliedParticipant] : []);
      if (targets.length === 0) return m.reply(`📌 Mention or reply to a user!\n\n${cfg.footer}`);
      await sock.groupParticipantsUpdate(chat, targets, 'demote');
      return sock.sendMessage(chat, {
        text: `📉 *DEMOTED*\n\n${targets.map(t => `@${t.split('@')[0]}`).join('\n')}\n\n${cfg.footer}`,
        mentions: targets,
      }, { quoted: msg });
    }

    // ── MUTE ──────────────────────────────────────────────────
    if (cmd === 'mute') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      await sock.groupSettingUpdate(chat, 'announcement');
      const mins = parseInt(text);
      if (!isNaN(mins) && mins > 0) {
        await m.reply(`🔇 *Group muted for ${mins} minute(s)!*\n\n${cfg.footer}`);
        setTimeout(async () => {
          try {
            await sock.groupSettingUpdate(chat, 'not_announcement');
            await sock.sendMessage(chat, { text: `🔊 *Group automatically unmuted!*\n\n${cfg.footer}` });
          } catch {}
        }, mins * 60 * 1000);
      } else {
        return m.reply(`🔇 *Group muted!*\n\n${cfg.footer}`);
      }
      return;
    }

    // ── UNMUTE ────────────────────────────────────────────────
    if (cmd === 'unmute') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      await sock.groupSettingUpdate(chat, 'not_announcement');
      return m.reply(`🔊 *Group unmuted!*\n\n${cfg.footer}`);
    }

    // ── TAG ───────────────────────────────────────────────────
    if (cmd === 'tag') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const meta = await sock.groupMetadata(chat);
      const participants = meta.participants;
      const mentionedJidList = participants.map(p => p.id);
      const tagText = text || 'Tagged message';

      if (quotedMessage?.imageMessage) {
        const filePath = await downloadMedia(quotedMessage.imageMessage, 'image');
        await sock.sendMessage(chat, { image: { url: filePath }, caption: tagText, mentions: mentionedJidList });
      } else if (quotedMessage?.videoMessage) {
        const filePath = await downloadMedia(quotedMessage.videoMessage, 'video');
        await sock.sendMessage(chat, { video: { url: filePath }, caption: tagText, mentions: mentionedJidList });
      } else {
        await sock.sendMessage(chat, { text: tagText, mentions: mentionedJidList });
      }
      return;
    }

    // ── TAGALL ────────────────────────────────────────────────
    if (cmd === 'tagall' || cmd === 'tgall') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const meta = await sock.groupMetadata(chat);
      const participants = meta.participants;
      let tagText = `🔊 *Hello Everyone!*\n\n`;
      participants.forEach(p => { tagText += `@${p.id.split('@')[0]}\n`; });
      return sock.sendMessage(chat, { text: tagText, mentions: participants.map(p => p.id) });
    }

    // ── TAGNOTADMIN ───────────────────────────────────────────
    if (cmd === 'tagnotadmin' || cmd === 'tgna') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const meta = await sock.groupMetadata(chat);
      const nonAdmins = meta.participants.filter(p => !p.admin).map(p => p.id);
      if (nonAdmins.length === 0) return m.reply(`${tr('grp_no_members')}\n\n${cfg.footer}`);
      let tagText = `🔊 *Non-Admin Members*\n\n`;
      nonAdmins.forEach(jid => { tagText += `@${jid.split('@')[0]}\n`; });
      return sock.sendMessage(chat, { text: tagText, mentions: nonAdmins }, { quoted: msg });
    }

    // ── HIDETAG ───────────────────────────────────────────────
    if (cmd === 'hidetag' || cmd === 'htag') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const meta = await sock.groupMetadata(chat);
      const nonAdmins = meta.participants.filter(p => !p.admin).map(p => p.id);

      if (quotedMessage?.imageMessage) {
        const filePath = await downloadMedia(quotedMessage.imageMessage, 'image');
        await sock.sendMessage(chat, { image: { url: filePath }, caption: text || '', mentions: nonAdmins });
      } else if (quotedMessage?.videoMessage) {
        const filePath = await downloadMedia(quotedMessage.videoMessage, 'video');
        await sock.sendMessage(chat, { video: { url: filePath }, caption: text || '', mentions: nonAdmins });
      } else if (quotedMessage?.conversation || quotedMessage?.extendedTextMessage) {
        const qText = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '';
        await sock.sendMessage(chat, { text: qText, mentions: nonAdmins });
      } else {
        await sock.sendMessage(chat, { text: text || 'Tagged', mentions: nonAdmins });
      }
      return;
    }

    // ── DELETE ────────────────────────────────────────────────
    if (cmd === 'del' || cmd === 'delete') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const ctxInfo = msg?.message?.extendedTextMessage?.contextInfo;
      if (ctxInfo?.stanzaId) {
        try {
          await sock.sendMessage(chat, { delete: { remoteJid: chat, fromMe: false, id: ctxInfo.stanzaId, participant: ctxInfo.participant } });
          await m.react('✅');
        } catch {
          await m.react('❌');
          return m.reply(`❌ Failed to delete!\n\n${cfg.footer}`);
        }
      } else {
        return sendButtons(sock, chat, {
          text: `📌 *DELETE*\n\nReply to a message with *.del* to delete it\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      return;
    }

    // ── GROUPINFO ─────────────────────────────────────────────
    if (cmd === 'groupinfo' || cmd === 'ginfo') {
      const meta = await sock.groupMetadata(chat);
      const participants = meta.participants;
      const admins = participants.filter(p => p.admin);
      const listAdmin = admins.map((v, i) => `${i + 1}. @${v.id.split('@')[0]}`).join('\n');

      let pp;
      try { pp = await sock.profilePictureUrl(chat, 'image'); }
      catch { pp = null; }

      const infoText =
        `┌──「 *GROUP INFO* 」\n` +
        `│\n` +
        `│ 🔖 *Name:* ${meta.subject}\n` +
        `│ 👥 *Members:* ${participants.length}\n` +
        `│ 🕵️ *Admins:*\n${listAdmin}\n` +
        `│\n` +
        `│ 📌 *Description:*\n│ ${meta.desc?.toString() || 'No description'}\n` +
        `└───────────\n\n${cfg.footer}`;

      if (pp) {
        await sock.sendMessage(chat, { image: { url: pp }, caption: infoText, mentions: admins.map(v => v.id) }, { quoted: msg });
      } else {
        await sock.sendMessage(chat, { text: infoText, mentions: admins.map(v => v.id) }, { quoted: msg });
      }
      return;
    }

    // ── RESETLINK ─────────────────────────────────────────────
    if (cmd === 'resetlink') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`❌ *Failed:* Only admins can reset the group link.\n\n${cfg.footer}`);

      // ── Confirmed reset ───────────────────────────────────
      if (text === 'confirm') {
        try {
          await sock.groupRevokeInvite(chat);
          const code = await sock.groupInviteCode(chat);
          const link  = `https://chat.whatsapp.com/${code}`;
          return sendButtons(sock, chat, {
            text: `✅ *Group link reset!*\n\n🔗 *New Link:*\n${link}\n\n${cfg.footer}`,
            footer: cfg.footer,
            buttons: [{ label: '📋 Menu', id: '.menu' }],
            quoted: msg,
          });
        } catch (e) {
          return m.reply(`❌ Failed: ${e.message}\n\n${cfg.footer}`);
        }
      }

      // ── Ask for confirmation ───────────────────────────────
      return sendButtons(sock, chat, {
        text:
          `⚠️ *Reset Group Link?*\n\n` +
          `The current invite link will be *invalid* and a new one will be created.\n\n` +
          `Are you sure?\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: '✅ Yes, Reset',  id: '.resetlink confirm' },
          { label: '❌ Cancel',      id: '.menu' },
        ],
        quoted: msg,
      });
    }

    // ── TOPMEMBERS ────────────────────────────────────────────
    if (cmd === 'topmembers' || cmd === 'topmsg') {
      const dataPath = path.join(process.cwd(), 'data', 'messageCount.json');
      let data = {};
      try {
        if (fs.existsSync(dataPath)) data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      } catch {}
      const groupData = data[chat] || {};
      const sorted = Object.entries(groupData).sort(([, a], [, b]) => b - a).slice(0, 10);
      if (sorted.length === 0) return m.reply(`📊 No message data yet!\n\n${cfg.footer}`);
      let topText = `🏆 *TOP MEMBERS*\n\n`;
      sorted.forEach(([jid, count], i) => {
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        topText += `${medals[i] || `${i + 1}.`} @${jid.split('@')[0]} — *${count}* msgs\n`;
      });
      topText += `\n${cfg.footer}`;
      return sock.sendMessage(chat, { text: topText, mentions: sorted.map(([jid]) => jid) }, { quoted: msg });
    }

    // ══════════════════════════════════════════════════════════
    // UNITY GROUP FEATURES
    // ══════════════════════════════════════════════════════════

    // ── ADD MEMBER ────────────────────────────────────────────
    if (cmd === 'add' || cmd === 'addmember') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const number = text?.split(' ')[0]?.replace(/[^0-9]/g, '');
      if (!number) return m.reply(`📌 Usage: *.add* 94771234567\n\n${cfg.footer}`);
      const jidToAdd = number + '@s.whatsapp.net';
      try {
        const result = await sock.groupParticipantsUpdate(chat, [jidToAdd], 'add');
        const status = String(result?.[0]?.status || '');

        if (status === '403') {
          // Privacy settings — send invite link instead
          const inv = await sock.groupInviteCode(chat).catch(() => null);
          const invMsg = inv
            ? `🔒 *${number}* has privacy settings that prevent direct add.\n\n📩 Send them this invite link:\nhttps://chat.whatsapp.com/${inv}\n\n${cfg.footer}`
            : `🔒 *${number}* could not be added (privacy settings).\n\n${cfg.footer}`;
          return m.reply(invMsg);
        }

        if (status === '408') {
          return m.reply(`⏳ *Request timed out.* The user may need to accept an invite.\n\n${cfg.footer}`);
        }

        if (status && status !== '200') {
          return m.reply(`❌ Could not add *${number}* (status: ${status}).\n\n${cfg.footer}`);
        }

        return sock.sendMessage(chat, {
          text: `✅ @${number} has been added to the group!\n\n${cfg.footer}`,
          mentions: [jidToAdd],
        }, { quoted: msg });
      } catch (e) {
        return m.reply(`❌ Failed to add ${number}: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── REMOVE ALL (kickall) ──────────────────────────────────
    if (cmd === 'removeall' || cmd === 'kickall') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      try {
        const meta    = await sock.groupMetadata(chat);
        const botId   = sock.user?.id?.split('@')[0]?.split(':')[0];
        const owner   = meta.owner;
        const toKick  = meta.participants
          .filter(p => {
            const pNum = p.id.split('@')[0].split(':')[0];
            return pNum !== botId && p.id !== owner && !p.admin;
          })
          .map(p => p.id);
        if (toKick.length === 0) return m.reply(`❌ No non-admin members to remove!\n\n${cfg.footer}`);
        await sock.groupParticipantsUpdate(chat, toKick, 'remove');
        return m.reply(`✅ Removed *${toKick.length}* members (admins & owner kept).\n\n${cfg.footer}`);
      } catch (e) {
        return m.reply(`❌ Error: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── KICKME / LEAVE GROUP ──────────────────────────────────
    if (cmd === 'kickme' || cmd === 'leavegroup') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      try {
        await sock.sendMessage(chat, { text: `👋 Goodbye everyone!\n\n${cfg.footer}` });
        await sock.groupLeave(chat);
      } catch (e) {
        return m.reply(`❌ Error: ${e.message}\n\n${cfg.footer}`);
      }
      return;
    }

    // ── SET GROUP NAME ────────────────────────────────────────
    if (cmd === 'setname' || cmd === 'setsubject') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      if (!text) return m.reply(`📌 Usage: *.setname* New Group Name\n\n${cfg.footer}`);
      try {
        await sock.groupUpdateSubject(chat, text);
        return sendButtons(sock, chat, {
          text: `✅ Group name updated to:\n*${text}*\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      } catch (e) {
        return m.reply(`❌ Failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── SET GROUP DESCRIPTION ─────────────────────────────────
    if (cmd === 'setdesc' || cmd === 'setdescription') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      if (!text) return m.reply(`📌 Usage: *.setdesc* New description here\n\n${cfg.footer}`);
      try {
        await sock.groupUpdateDescription(chat, text);
        return sendButtons(sock, chat, {
          text: `✅ Group description updated!\n\n_${text}_\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      } catch (e) {
        return m.reply(`❌ Failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── GROUP INVITE LINK ─────────────────────────────────────
    if (['grouplink', 'glink', 'invitelink', 'link'].includes(cmd)) {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      try {
        const code = await sock.groupInviteCode(chat);
        const link  = `https://chat.whatsapp.com/${code}`;
        return sendButtons(sock, chat, {
          text: `🔗 *Group Invite Link*\n\n${link}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      } catch (e) {
        return m.reply(`❌ Failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── TAG ADMINS ────────────────────────────────────────────
    if (cmd === 'tagadmin' || cmd === 'tgadmin') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      try {
        const meta   = await sock.groupMetadata(chat);
        const admins = meta.participants.filter(p => p.admin).map(p => p.id);
        if (admins.length === 0) return m.reply(`${tr('grp_no_admins')}\n\n${cfg.footer}`);
        let tagText = `👑 *Tagging all admins:*\n\n`;
        admins.forEach(jid => { tagText += `@${jid.split('@')[0]}\n`; });
        tagText += `\n${cfg.footer}`;
        return sock.sendMessage(chat, { text: tagText, mentions: admins }, { quoted: msg });
      } catch (e) {
        return m.reply(`❌ Error: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── APPROVE JOIN REQUESTS ─────────────────────────────────
    if (cmd === 'approve' || cmd === 'acceptreq') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      try {
        const reqList = await sock.groupRequestParticipantsList(chat);
        if (!reqList || reqList.length === 0) return m.reply(`📭 No pending join requests.\n\n${cfg.footer}`);

        if (!text) {
          // Approve all
          for (const req of reqList) {
            await sock.groupRequestParticipantsUpdate(chat, [req.jid], 'approve').catch(() => {});
          }
          return m.reply(`✅ Approved all *${reqList.length}* join request(s).\n\n${cfg.footer}`);
        }

        // Approve specific numbers (comma-separated indices)
        const indices = text.split(',').map(s => parseInt(s.trim()) - 1).filter(i => i >= 0 && i < reqList.length);
        if (indices.length === 0) return m.reply(`❌ Invalid request number(s).\n\nPending: ${reqList.length}\n\n${cfg.footer}`);
        for (const i of indices) {
          await sock.groupRequestParticipantsUpdate(chat, [reqList[i].jid], 'approve').catch(() => {});
        }
        return m.reply(`✅ Approved *${indices.length}* join request(s).\n\n${cfg.footer}`);
      } catch (e) {
        return m.reply(`❌ Failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── REJECT JOIN REQUESTS ──────────────────────────────────
    if (cmd === 'reject' || cmd === 'rejectreq') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      try {
        const reqList = await sock.groupRequestParticipantsList(chat);
        if (!reqList || reqList.length === 0) return m.reply(`📭 No pending join requests.\n\n${cfg.footer}`);

        if (!text) {
          for (const req of reqList) {
            await sock.groupRequestParticipantsUpdate(chat, [req.jid], 'reject').catch(() => {});
          }
          return m.reply(`✅ Rejected all *${reqList.length}* join request(s).\n\n${cfg.footer}`);
        }

        const indices = text.split(',').map(s => parseInt(s.trim()) - 1).filter(i => i >= 0 && i < reqList.length);
        if (indices.length === 0) return m.reply(`❌ Invalid request number(s).\n\n${cfg.footer}`);
        for (const i of indices) {
          await sock.groupRequestParticipantsUpdate(chat, [reqList[i].jid], 'reject').catch(() => {});
        }
        return m.reply(`✅ Rejected *${indices.length}* join request(s).\n\n${cfg.footer}`);
      } catch (e) {
        return m.reply(`❌ Failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── VIEW JOIN REQUESTS ────────────────────────────────────
    if (cmd === 'viewreq' || cmd === 'joinrequests') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      try {
        const reqList = await sock.groupRequestParticipantsList(chat);
        if (!reqList || reqList.length === 0) return m.reply(`📭 No pending join requests.\n\n${cfg.footer}`);
        let listText = `📋 *Pending Join Requests* (${reqList.length})\n\n`;
        reqList.forEach((req, i) => {
          listText += `*${i+1}.* @${req.jid.split('@')[0]}\n`;
        });
        listText += `\n*.approve* 1,2 — Approve by number\n*.reject* 1,2 — Reject by number\n\n${cfg.footer}`;
        return sock.sendMessage(chat, { text: listText, mentions: reqList.map(r => r.jid) }, { quoted: msg });
      } catch (e) {
        return m.reply(`❌ Failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── JOIN GROUP VIA INVITE LINK ────────────────────────────
    if (cmd === 'joingroup' || cmd === 'joininvite') {
      if (!m.isOwner) return m.reply(`${tr('err_owner_only')}\n\n${cfg.footer}`);
      if (!text || !text.includes('https://')) return m.reply(`📌 Usage: *.joingroup* https://chat.whatsapp.com/...\n\n${cfg.footer}`);
      try {
        const code = text.split('/').pop();
        await sock.groupAcceptInvite(code);
        return m.reply(`✅ Successfully joined the group!\n\n${cfg.footer}`);
      } catch (e) {
        return m.reply(`❌ Failed to join: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── OPEN TIME (timed unlock) ──────────────────────────────
    if (cmd === 'opentime') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const parts = text?.split(' ');
      const amount = parseInt(parts?.[0]);
      const unit   = parts?.[1]?.toLowerCase();
      const unitMap = { second: 1000, seconds: 1000, minute: 60000, minutes: 60000, hour: 3600000, hours: 3600000, day: 86400000, days: 86400000 };
      if (!amount || !unit || !unitMap[unit]) {
        return sendButtons(sock, chat, {
          text: `📌 *OPEN TIME*\n\n*.opentime* [amount] [unit]\n\nUnits: second, minute, hour, day\n\n*Example:* .opentime 10 minute\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      const delay = amount * unitMap[unit];
      await sock.groupSettingUpdate(chat, 'not_announcement');
      await m.reply(`🔓 *Group opened!*\nWill close in *${amount} ${unit}*.\n\n${cfg.footer}`);
      setTimeout(async () => {
        try {
          await sock.groupSettingUpdate(chat, 'announcement');
          await sock.sendMessage(chat, { text: `🔒 *Close time!* Group closed automatically.\n\n${cfg.footer}` });
        } catch {}
      }, delay);
      return;
    }

    // ── CLOSE TIME (timed lock) ───────────────────────────────
    if (cmd === 'closetime') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const parts = text?.split(' ');
      const amount = parseInt(parts?.[0]);
      const unit   = parts?.[1]?.toLowerCase();
      const unitMap = { second: 1000, seconds: 1000, minute: 60000, minutes: 60000, hour: 3600000, hours: 3600000, day: 86400000, days: 86400000 };
      if (!amount || !unit || !unitMap[unit]) {
        return sendButtons(sock, chat, {
          text: `📌 *CLOSE TIME*\n\n*.closetime* [amount] [unit]\n\nUnits: second, minute, hour, day\n\n*Example:* .closetime 30 minute\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      const delay = amount * unitMap[unit];
      await sock.groupSettingUpdate(chat, 'announcement');
      await m.reply(`🔒 *Group closed!*\nWill open in *${amount} ${unit}*.\n\n${cfg.footer}`);
      setTimeout(async () => {
        try {
          await sock.groupSettingUpdate(chat, 'not_announcement');
          await sock.sendMessage(chat, { text: `🔓 *Open time!* Group opened automatically.\n\n${cfg.footer}` });
        } catch {}
      }, delay);
      return;
    }
  },
};
