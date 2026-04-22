'use strict';
const { t, getLang  } = require('../lang');
const fs = require('fs');
const path = require('path');
const cfg = require('../../config');
const db = require('./index');
const { sendButtons } = require('./helper');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const dataDir = path.join(process.cwd(), 'data');
const warningsPath = path.join(dataDir, 'warnings.json');
const bannedPath = path.join(dataDir, 'banned.json');

function ensureDir() { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); }
function loadWarnings() { ensureDir(); if (!fs.existsSync(warningsPath)) fs.writeFileSync(warningsPath,'{}'); try { return JSON.parse(fs.readFileSync(warningsPath,'utf8')); } catch { return {}; } }
function saveWarnings(w) { ensureDir(); fs.writeFileSync(warningsPath, JSON.stringify(w,null,2)); }
function loadBanned() { ensureDir(); if (!fs.existsSync(bannedPath)) fs.writeFileSync(bannedPath,'[]'); try { return JSON.parse(fs.readFileSync(bannedPath,'utf8')); } catch { return []; } }
function saveBanned(b) { ensureDir(); fs.writeFileSync(bannedPath, JSON.stringify(b,null,2)); }

async function getAdminStatus(sock, chat, senderId) {
  try {
    const meta = await sock.groupMetadata(chat);
    const participants = meta.participants || [];
    const botId = sock.user?.id || '';
    const botLid = sock.user?.lid || '';
    const botNum = botId.split('@')[0].split(':')[0];
    const botLidNum = botLid.split('@')[0].split(':')[0];
    const senderNum = senderId.split('@')[0].split(':')[0];
    const isAdminRole = p => p.admin === 'admin' || p.admin === 'superadmin';
    const pNum = p => (p.id || '').split('@')[0].split(':')[0];
    const pLidNum = p => (p.lid || '').split('@')[0].split(':')[0];
    const isBotAdmin = participants.some(p =>
      isAdminRole(p) && (
        pNum(p) === botNum ||
        (botLidNum && pLidNum(p) && pLidNum(p) === botLidNum) ||
        (botLidNum && pNum(p) === botLidNum)
      )
    );
    const isSenderAdmin = participants.some(p =>
      isAdminRole(p) && (
        pNum(p) === senderNum ||
        (pLidNum(p) && pLidNum(p) === senderNum)
      )
    );
    return { isBotAdmin, isSenderAdmin };
  } catch { return { isBotAdmin: false, isSenderAdmin: false }; }
}

module.exports = {
  commands: [
    'kick', 'remove',
    'promote', 'demote',
    'ban', 'unban',
    'mute', 'unmute',
    'warn', 'warnings', 'resetwarn',
    'tagall', 'everyone', 'tgall',
    'tagnotadmin', 'tgna',
    'tag',
    'del', 'delete',
    'groupinfo', 'ginfo',
    'resetlink', 'newlink',
    'topmembers', 'topmsg',
    'open', 'close',
    'setdesc', 'setsubject', 'setppgc',
    'rules', 'setrules', 'faq', 'setfaq',
    'linkgc', 'revoke',
    'membercount', 'members',
    'kickinactive', 'copygc',
    'setkeyword', 'addkeyword', 'delkeyword',
    'add',
    'antitag',
  ],

  groupOnly: true,

  async run({ sock, m, db: database }) {
    const lang = await getLang(m.sessionOwner);
    const cmd    = m.command;
    const text   = m.text?.trim();
    const chat   = m.chat;
    const msg    = m.msg;
    const sender = m.sender;
    const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const repliedParticipant = msg?.message?.extendedTextMessage?.contextInfo?.participant;
    const quotedMessage = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isAdmin = m.isGroupAdmin || m.isOwner;

    if (!m.isGroup) return sendButtons(sock, chat, { text: `👥 *Group only!*\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });

    const { isBotAdmin, isSenderAdmin } = await getAdminStatus(sock, chat, sender);

    // ── KICK ──────────────────────────────────────────────────
    if (cmd === 'kick' || cmd === 'remove') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const targets = mentioned.length > 0 ? mentioned : (repliedParticipant ? [repliedParticipant] : []);
      if (!targets.length) return sendButtons(sock, chat, { text: `📌 Mention or reply to a user!\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
      await sock.groupParticipantsUpdate(chat, targets, 'remove');
      return sock.sendMessage(chat, { text: `✅ *Kicked:* ${targets.map(t=>`@${t.split('@')[0]}`).join(', ')}\n\n${cfg.footer}`, mentions: targets }, { quoted: msg });
    }

    // ── PROMOTE ───────────────────────────────────────────────
    if (cmd === 'promote') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const targets = mentioned.length > 0 ? mentioned : (repliedParticipant ? [repliedParticipant] : []);
      if (!targets.length) return m.reply(`📌 Mention or reply to a user!\n\n${cfg.footer}`);
      await sock.groupParticipantsUpdate(chat, targets, 'promote');
      return sock.sendMessage(chat, { text: `👑 *PROMOTED*\n\n${targets.map(t=>`@${t.split('@')[0]}`).join('\n')}\n\n${cfg.footer}`, mentions: targets }, { quoted: msg });
    }

    // ── DEMOTE ────────────────────────────────────────────────
    if (cmd === 'demote') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const targets = mentioned.length > 0 ? mentioned : (repliedParticipant ? [repliedParticipant] : []);
      if (!targets.length) return m.reply(`📌 Mention or reply to a user!\n\n${cfg.footer}`);
      await sock.groupParticipantsUpdate(chat, targets, 'demote');
      return sock.sendMessage(chat, { text: `📉 *DEMOTED*\n\n${targets.map(t=>`@${t.split('@')[0]}`).join('\n')}\n\n${cfg.footer}`, mentions: targets }, { quoted: msg });
    }

    // ── BAN ───────────────────────────────────────────────────
    if (cmd === 'ban') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const target = mentioned[0] || repliedParticipant;
      if (!target) return m.reply(`📌 Mention or reply to a user!\n\n${cfg.footer}`);
      const banned = loadBanned();
      if (!banned.includes(target)) { banned.push(target); saveBanned(banned); }
      await sock.groupParticipantsUpdate(chat, [target], 'remove');
      return sock.sendMessage(chat, { text: `⛔ *BANNED*\n\n@${target.split('@')[0]}\n\n${cfg.footer}`, mentions: [target] }, { quoted: msg });
    }

    // ── UNBAN ─────────────────────────────────────────────────
    if (cmd === 'unban') {
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const target = mentioned[0] || repliedParticipant;
      if (!target) return m.reply(`📌 Mention or reply to a user!\n\n${cfg.footer}`);
      const banned = loadBanned(); const idx = banned.indexOf(target);
      if (idx > -1) { banned.splice(idx, 1); saveBanned(banned); }
      return m.reply(`✅ @${target.split('@')[0]} unbanned!\n\n${cfg.footer}`);
    }

    // ── MUTE ──────────────────────────────────────────────────
    if (cmd === 'mute') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      await sock.groupSettingUpdate(chat, 'announcement');
      const mins = parseInt(text);
      if (!isNaN(mins) && mins > 0) {
        await m.reply(`🔇 *Muted for ${mins} min!*\n\n${cfg.footer}`);
        setTimeout(async () => { try { await sock.groupSettingUpdate(chat, 'not_announcement'); await sock.sendMessage(chat, { text: `🔊 *Auto unmuted!*\n\n${cfg.footer}` }); } catch {} }, mins * 60000);
      } else return m.reply(`🔇 *Group muted!*\n\n${cfg.footer}`);
      return;
    }

    // ── UNMUTE ────────────────────────────────────────────────
    if (cmd === 'unmute') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      await sock.groupSettingUpdate(chat, 'not_announcement');
      return m.reply(`🔊 *Group unmuted!*\n\n${cfg.footer}`);
    }

    // ── WARN ──────────────────────────────────────────────────
    if (cmd === 'warn') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const target = mentioned[0] || repliedParticipant;
      if (!target) return sendButtons(sock, chat, { text: `📌 Usage: *.warn* @user\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
      const warnings = loadWarnings();
      if (!warnings[chat]) warnings[chat] = {};
      if (!warnings[chat][target]) warnings[chat][target] = 0;
      warnings[chat][target]++;
      saveWarnings(warnings);
      const count = warnings[chat][target];
      await sock.sendMessage(chat, { text: `⚠️ *WARNING*\n\n👤 @${target.split('@')[0]}\n⚠️ Count: ${count}/3\n👑 By: @${sender.split('@')[0]}\n\n${cfg.footer}`, mentions: [target, sender] }, { quoted: msg });
      if (count >= 3) {
        await sock.groupParticipantsUpdate(chat, [target], 'remove');
        delete warnings[chat][target]; saveWarnings(warnings);
        await sock.sendMessage(chat, { text: `⛔ @${target.split('@')[0]} auto-kicked after 3 warnings!\n\n${cfg.footer}`, mentions: [target] });
      }
      return;
    }

    // ── WARNINGS ──────────────────────────────────────────────
    if (cmd === 'warnings') {
      const target = mentioned[0] || repliedParticipant;
      if (!target) return m.reply(`📌 Usage: *.warnings* @user\n\n${cfg.footer}`);
      const warnings = loadWarnings();
      return sendButtons(sock, chat, { text: `📊 *Warnings for @${target.split('@')[0]}*\n\n⚠️ Count: ${warnings[chat]?.[target]||0}/3\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
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

    // ── TAGALL ────────────────────────────────────────────────
    if (['tagall', 'everyone', 'tgall'].includes(cmd)) {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const meta = await sock.groupMetadata(chat);
      let tagText = `🔊 *Hello Everyone!*\n\n`;
      meta.participants.forEach(p => { tagText += `@${p.id.split('@')[0]}\n`; });
      return sock.sendMessage(chat, { text: tagText, mentions: meta.participants.map(p=>p.id) });
    }

    // ── TAGNOTADMIN ───────────────────────────────────────────
    if (cmd === 'tagnotadmin' || cmd === 'tgna') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const meta = await sock.groupMetadata(chat);
      const nonAdmins = meta.participants.filter(p=>!p.admin).map(p=>p.id);
      if (!nonAdmins.length) return m.reply(`${tr('grp_no_members')}\n\n${cfg.footer}`);
      let tagText2 = `🔊 *Members:*\n\n`;
      nonAdmins.forEach(jid => { tagText2 += `@${jid.split('@')[0]}\n`; });
      return sock.sendMessage(chat, { text: tagText2, mentions: nonAdmins }, { quoted: msg });
    }

    // ── TAG ───────────────────────────────────────────────────
    if (cmd === 'tag') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const meta = await sock.groupMetadata(chat);
      const mentionedJidList = meta.participants.map(p=>p.id);
      const tagText3 = text || 'Tagged message';
      if (quotedMessage?.imageMessage) {
        const stream = await downloadContentFromMessage(quotedMessage.imageMessage, 'image');
        let buf = Buffer.from([]); for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
        await sock.sendMessage(chat, { image: buf, caption: tagText3, mentions: mentionedJidList });
      } else if (quotedMessage?.videoMessage) {
        const stream = await downloadContentFromMessage(quotedMessage.videoMessage, 'video');
        let buf = Buffer.from([]); for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
        await sock.sendMessage(chat, { video: buf, caption: tagText3, mentions: mentionedJidList });
      } else {
        await sock.sendMessage(chat, { text: tagText3, mentions: mentionedJidList });
      }
      return;
    }

    // ── DELETE ────────────────────────────────────────────────
    if (cmd === 'del' || cmd === 'delete') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const ctxInfo = msg?.message?.extendedTextMessage?.contextInfo;
      if (ctxInfo?.stanzaId) {
        try { await sock.sendMessage(chat, { delete: { remoteJid: chat, fromMe: false, id: ctxInfo.stanzaId, participant: ctxInfo.participant } }); await m.react('✅'); }
        catch { await m.react('❌'); return m.reply(`${tr('err_failed')}\n\n${cfg.footer}`); }
      } else return sendButtons(sock, chat, { text: `📌 Reply to a message with *.del*\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
      return;
    }

    // ── GROUPINFO ─────────────────────────────────────────────
    if (cmd === 'groupinfo' || cmd === 'ginfo') {
      const meta = await sock.groupMetadata(chat);
      const admins = meta.participants.filter(p=>p.admin);
      const listAdmin = admins.map((v,i)=>`${i+1}. @${v.id.split('@')[0]}`).join('\n');
      let pp; try { pp = await sock.profilePictureUrl(chat, 'image'); } catch { pp = null; }
      const infoText = `┌──「 *GROUP INFO* 」\n│\n│ 🔖 *Name:* ${meta.subject}\n│ 👥 *Members:* ${meta.participants.length}\n│ 🕵️ *Admins:*\n│ ${listAdmin}\n│\n│ 📌 *Description:*\n│ ${meta.desc?.toString()||'No description'}\n└───────────\n\n${cfg.footer}`;
      if (pp) await sock.sendMessage(chat, { image: { url: pp }, caption: infoText, mentions: admins.map(v=>v.id) }, { quoted: msg });
      else await sock.sendMessage(chat, { text: infoText, mentions: admins.map(v=>v.id) }, { quoted: msg });
      return;
    }

    // ── RESETLINK ─────────────────────────────────────────────
    if (cmd === 'resetlink' || cmd === 'revoke') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      await sock.groupRevokeInvite(chat);
      const code = await sock.groupInviteCode(chat);
      return sendButtons(sock, chat, { text: `🔗 *Link reset!*\n\nhttps://chat.whatsapp.com/${code}\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
    }

    if (cmd === 'newlink' || cmd === 'linkgc') {
      const code = await sock.groupInviteCode(chat);
      return sendButtons(sock, chat, { text: `🔗 *Group Link*\n\nhttps://chat.whatsapp.com/${code}\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
    }

    // ── TOPMEMBERS ────────────────────────────────────────────
    if (cmd === 'topmembers' || cmd === 'topmsg') {
      const dataPath = path.join(process.cwd(), 'data', 'messageCount.json');
      let data = {};
      try { if (fs.existsSync(dataPath)) data = JSON.parse(fs.readFileSync(dataPath, 'utf8')); } catch {}
      const groupData = data[chat] || {};
      const sorted = Object.entries(groupData).sort(([,a],[,b])=>b-a).slice(0,10);
      if (!sorted.length) return m.reply(`📊 No message data yet!\n\n${cfg.footer}`);
      let topText = `🏆 *TOP MEMBERS*\n\n`;
      sorted.forEach(([jid,count],i) => { const medals=['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']; topText += `${medals[i]||`${i+1}.`} @${jid.split('@')[0]} — *${count}* msgs\n`; });
      return sock.sendMessage(chat, { text: topText + `\n${cfg.footer}`, mentions: sorted.map(([jid])=>jid) }, { quoted: msg });
    }

    // ── MEMBERCOUNT ───────────────────────────────────────────
    if (cmd === 'membercount' || cmd === 'members') {
      const meta = await sock.groupMetadata(chat);
      return sendButtons(sock, chat, { text: `👥 *Members:* ${meta.participants.length}\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
    }

    // ── OPEN/CLOSE ────────────────────────────────────────────
    if (cmd === 'open') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      await sock.groupSettingUpdate(chat, 'not_announcement');
      return m.reply(`${tr('grp_opened2')}\n\n${cfg.footer}`);
    }

    if (cmd === 'close') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      await sock.groupSettingUpdate(chat, 'announcement');
      return m.reply(`${tr('grp_closed2')}\n\n${cfg.footer}`);
    }

    // ── SETDESC ───────────────────────────────────────────────
    if (cmd === 'setdesc') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      if (!text) return m.reply(`📌 Usage: *.setdesc* [description]\n\n${cfg.footer}`);
      await sock.groupUpdateDescription(chat, text);
      return m.reply(`✅ Description updated!\n\n${cfg.footer}`);
    }

    // ── SETSUBJECT ────────────────────────────────────────────
    if (cmd === 'setsubject') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      if (!text) return m.reply(`📌 Usage: *.setsubject* [name]\n\n${cfg.footer}`);
      await sock.groupUpdateSubject(chat, text);
      return m.reply(`✅ Group name updated!\n\n${cfg.footer}`);
    }

    // ── RULES ─────────────────────────────────────────────────
    if (cmd === 'rules' || cmd === 'setrules') {
      const rulesPath = path.join(dataDir, 'rules.json');
      let rules = {};
      try { if (fs.existsSync(rulesPath)) rules = JSON.parse(fs.readFileSync(rulesPath,'utf8')); } catch {}
      if (cmd === 'setrules') {
        if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
        if (!text) return m.reply(`📌 Usage: *.setrules* [rules text]\n\n${cfg.footer}`);
        rules[chat] = text; fs.writeFileSync(rulesPath, JSON.stringify(rules,null,2));
        return m.reply(`✅ Rules set!\n\n${cfg.footer}`);
      }
      return sendButtons(sock, chat, { text: `📜 *GROUP RULES*\n\n${rules[chat]||'No rules set yet.'}\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
    }

    // ── ADD ───────────────────────────────────────────────────
    if (cmd === 'add') {
      if (!isBotAdmin) return m.reply(`${tr('err_need_admin')}\n\n${cfg.footer}`);
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      if (!text) return m.reply(`📌 Usage: *.add* 94771234567\n\nNumber will be added to the group.\n\n${cfg.footer}`);
      // Clean number - remove spaces, +, dashes
      const rawNum = text.replace(/[^0-9]/g, '').trim();
      if (!rawNum || rawNum.length < 7) return m.reply(`❌ Invalid number! Usage: *.add* 94771234567\n\n${cfg.footer}`);
      const jid = rawNum + '@s.whatsapp.net';
      try {
        const result = await sock.groupParticipantsUpdate(chat, [jid], 'add');
        const status = result?.[0]?.status;
        if (status === '200' || status === 200) {
          return sock.sendMessage(chat, { text: `✅ *Added!*\n\n📱 @${rawNum}\n\n${cfg.footer}`, mentions: [jid] }, { quoted: msg });
        } else if (status === '403') {
          return m.reply(`❌ @${rawNum} 's privacy settings prevent adding!\n\n${cfg.footer}`);
        } else if (status === '408') {
          return m.reply(`❌ @${rawNum} does not use WhatsApp!\n\n${cfg.footer}`);
        } else if (status === '409') {
          return m.reply(`⚠️ @${rawNum} is already a group member!\n\n${cfg.footer}`);
        } else {
          return m.reply(`⚠️ Cannot add (status: ${status})\n\n${cfg.footer}`);
        }
      } catch (err) {
        return m.reply(`❌ Error: ${err.message}\n\n${cfg.footer}`);
      }
    }

    // ── ANTITAG ───────────────────────────────────────────────
    if (cmd === 'antitag') {
      if (!isSenderAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const antitagPath = path.join(dataDir, 'antitag.json');
      let state = {};
      try { if (fs.existsSync(antitagPath)) state = JSON.parse(fs.readFileSync(antitagPath, 'utf8')); } catch {}
      const sub = text?.toLowerCase();
      if (!sub || !['on','off','status'].includes(sub)) {
        return m.reply(`📌 *Anti Tag Usage:*\n\n*.antitag on* — Enable\n*.antitag off* — Disable\n*.antitag status* — Current status\n\n⚠️ 5+ mention = warning\n❌ 3rd warning = kick\n\n${cfg.footer}`);
      }
      if (sub === 'status') {
        const on = state[chat]?.enabled || false;
        return m.reply(`🏷️ *Anti Tag:* ${on ? '✅ ON' : '❌ OFF'}\n\n${cfg.footer}`);
      }
      state[chat] = { enabled: sub === 'on' };
      fs.writeFileSync(antitagPath, JSON.stringify(state, null, 2));
      return m.reply(`${sub === 'on' ? '✅ Anti Tag ON' : '❌ Anti Tag OFF'}\n\n${sub === 'on' ? '5+ mentions triggers a warning. 3 warnings = kick!' : ''}\n\n${cfg.footer}`);
    }

    // Fallback for remaining commands
    if (['faq','setfaq','setppgc','kickinactive','copygc','setkeyword','addkeyword','delkeyword'].includes(cmd)) {
      return sendButtons(sock, chat, { text: `🔧 *Coming Soon!*\n\n⏳ This feature is under development.\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
    }
  },
};
