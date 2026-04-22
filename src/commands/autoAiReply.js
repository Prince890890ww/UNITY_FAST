'use strict';
const fs   = require('fs');
const path = require('path');
const cfg  = require('../../config');
const NodeCache = require('node-cache');
const { sendButtons } = require('./helper');

const dataDir = path.join(process.cwd(), 'data');
const genderCache = new NodeCache({ stdTTL: 86400 });

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}
function readState(sid) {
  ensureDir();
  const f = sid ? `${sid}_autoAiReply.json` : 'autoAiReply.json';
  const p = path.join(dataDir, f);
  if (!fs.existsSync(p)) return { inbox: false, groups: {}, chatData: {} };
  try {
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!s.chatData) s.chatData = {};
    return s;
  } catch { return { inbox: false, groups: {}, chatData: {} }; }
}
function writeState(sid, data) {
  ensureDir();
  const f = sid ? `${sid}_autoAiReply.json` : 'autoAiReply.json';
  fs.writeFileSync(path.join(dataDir, f), JSON.stringify(data, null, 2));
}
function getChatData(sid, jid) {
  return readState(sid).chatData?.[jid] || { gender: 'unknown' };
}
function saveChatData(sid, jid, data) {
  const s = readState(sid);
  if (!s.chatData) s.chatData = {};
  s.chatData[jid] = { ...(s.chatData[jid] || {}), ...data };
  writeState(sid, s);
}

function clearHistory(chat, sid) {
  genderCache.del(chat);
  if (sid) saveChatData(sid, chat, { gender: 'unknown' });
}

module.exports = {
  commands: ['autoaireply', 'aiauto', 'clearaichat', 'setaigender'],
  access: 'owner',
  description: 'Auto AI reply toggle',
  clearHistory,

  async run({ sock, m }) {
    if (!m.isOwner) return m.reply(`❌ Owner only.\n\n${cfg.footer}`);

    const cmd  = m.command;
    const text = m.text?.trim()?.toLowerCase();
    const sid  = m.sessionOwner || sock.sessionOwner || null;
    const chat = m.chat;

    if (cmd === 'clearaichat') {
      clearHistory(chat, sid);
      return m.reply(`🧹 *AI Chat Reset!*\n\nFresh start 🔄\n\n${cfg.footer}`);
    }

    if (cmd === 'setaigender') {
      const g = text;
      if (!['male', 'female', 'unknown'].includes(g)) {
        return m.reply(`📌 *.setaigender* male / female / unknown\n\n${cfg.footer}`);
      }
      saveChatData(sid, chat, { gender: g });
      genderCache.set(chat, g);
      const botName = g === 'male' ? 'සංජීවනී 👩' : g === 'female' ? 'නිමේෂ 👨' : 'Unity 🤖';
      return m.reply(`✅ Gender set!\n\nUser: *${g}* → Bot persona: *${botName}*\n\n${cfg.footer}`);
    }

    const state = readState(sid);

    if (!text || text === 'status') {
      const inboxOn = state.inbox ? '✅ ON' : '❌ OFF';
      const grpCnt  = Object.values(state.groups || {}).filter(Boolean).length;
      const thisOn  = m.isGroup ? (state.groups?.[chat] ? '✅ ON' : '❌ OFF') : inboxOn;
      return sendButtons(sock, chat, {
        text:
          `🤖 *AUTO AI REPLY*\n\n` +
          `📍 This ${m.isGroup ? 'group' : 'chat'}: *${thisOn}*\n` +
          `📊 Inbox: *${inboxOn}* | Groups active: *${grpCnt}*\n\n` +
          `• *.autoaireply on/off*\n• *.clearaichat*\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: m.isGroup ? (state.groups?.[chat] ? '🔴 OFF' : '🟢 ON') : (state.inbox ? '🔴 OFF' : '🟢 ON'), id: `.autoaireply ${m.isGroup ? (state.groups?.[chat] ? 'off' : 'on') : (state.inbox ? 'off' : 'on')}` },
          { label: '🧹 Reset', id: '.clearaichat' },
        ],
        quoted: m.msg,
      });
    }

    if (!['on','off'].includes(text)) return m.reply(`📌 Usage: *.autoaireply on/off*\n\n${cfg.footer}`);
    const enable = text === 'on';

    if (m.isGroup) {
      if (!state.groups) state.groups = {};
      state.groups[chat] = enable;
      writeState(sid, state);
      return sendButtons(sock, chat, {
        text: `🤖 *AI Reply — ${enable ? 'ON ✅' : 'OFF ❌'}* (This group)\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: enable ? '🔴 OFF' : '🟢 ON', id: `.autoaireply ${enable ? 'off' : 'on'}` }],
        quoted: m.msg,
      });
    } else {
      state.inbox = enable;
      writeState(sid, state);
      return sendButtons(sock, chat, {
        text: `🤖 *AI Reply — ${enable ? 'ON ✅' : 'OFF ❌'}* (All inbox)\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: enable ? '🔴 OFF' : '🟢 ON', id: `.autoaireply ${enable ? 'off' : 'on'}` }],
        quoted: m.msg,
      });
    }
  },
};
