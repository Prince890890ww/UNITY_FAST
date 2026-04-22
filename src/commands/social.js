'use strict';
const { getT } = require('../lang');
const axios = require('axios');
const fetch = require('node-fetch');
const cfg = require('../../config');
const db = require('./index');
const { sendButtons } = require('./helper');

// ── Confessions store ─────────────────────────────────────────
const confessStore = new Map();
let confessId = 1;

// ── AFK store ─────────────────────────────────────────────────
const afkStore = new Map();

const compliments = [
  "You're amazing just the way you are! 🌟","You have a great sense of humor! 😄",
  "You are more powerful than you know! 💪","You light up the room! ✨",
  "You inspire me! 🎯","Your creativity knows no bounds! 🎨",
  "You have a heart of gold! 💛","Your smile brightens everyone's day! 😊",
  "You're so talented in everything you do! 🏆","Your kindness makes the world a better place! 🌍",
];

const insults = [
  "You're like a cloud. When you disappear, it's a beautiful day! ☁️",
  "I'd agree with you, but then we'd both be wrong. 🤷",
  "You're proof that even evolution takes a break sometimes. 🦕",
  "You're like a broken pencil — pointless. ✏️",
  "You're like a Wi-Fi signal — always weak when needed most. 📶",
  "You're like a traffic jam — nobody wants you, but here you are. 🚗",
  "Your brain's running Windows 95 — slow and outdated. 🖥️",
  "You bring everyone happiness... when you leave. 😂",
];

module.exports = {
  commands: [
    'confess', 'confession',
    'fakescreenshot', 'fakechat',
    'afk', 'delafk',
    // ── Fun commands ──
    'joke', 'quote', 'fact',
    'flirt', 'compliment', 'insult',
    'meme',     'ship', 'wasted',
    'simp', 'stupid',
    'goodnight', 'shayari', 'roseday',
    'hidetag', 'htag',
  ],

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd    = m.command;
    const text   = m.text?.trim();
    const chat   = m.chat;
    const sender = m.sender;
    const msg    = m.msg;
    const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const repliedParticipant = msg?.message?.extendedTextMessage?.contextInfo?.participant;

    // ── JOKE ──────────────────────────────────────────────────
    if (cmd === 'joke') {
      await m.react('😄');
      try {
        const res = await axios.get('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json' }, timeout: 10000 });
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `😄 *Random Joke*\n\n${res.data.joke}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '😄 Another Joke', id: '.joke' }, { label: '😮 Random Fact', id: '.fact' }],
          quoted: msg,
        });
      } catch { await m.react('❌'); return m.reply(`${tr('err_failed')}\n\n${cfg.footer}`); }
    }

    // ── QUOTE ─────────────────────────────────────────────────
    if (cmd === 'quote') {
      await m.react('💬');
      try {
        const res = await fetch('https://shizoapi.onrender.com/api/texts/quotes?apikey=shizo', { timeout: 10000 });
        const json = await res.json();
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `💬 *Quote*\n\n${json.result}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '💬 Another', id: '.quote' }, { label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      } catch { await m.react('❌'); return m.reply(`${tr('err_failed')}\n\n${cfg.footer}`); }
    }

    // ── FACT ──────────────────────────────────────────────────
    if (cmd === 'fact') {
      await m.react('🤓');
      try {
        const res = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en', { timeout: 10000 });
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `🤓 *Random Fact*\n\n${res.data.text}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '🤓 Another', id: '.fact' }, { label: '😄 Joke', id: '.joke' }],
          quoted: msg,
        });
      } catch { await m.react('❌'); return m.reply(`${tr('err_failed')}\n\n${cfg.footer}`); }
    }

    // ── FLIRT ─────────────────────────────────────────────────
    if (cmd === 'flirt') {
      await m.react('😍');
      try {
        const res = await fetch('https://shizoapi.onrender.com/api/texts/flirt?apikey=shizo', { timeout: 10000 });
        const json = await res.json();
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `😍 *Flirt Line*\n\n${json.result}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '😍 Another', id: '.flirt' }, { label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      } catch { await m.react('❌'); return m.reply(`${tr('err_failed')}\n\n${cfg.footer}`); }
    }

    // ── COMPLIMENT ────────────────────────────────────────────
    if (cmd === 'compliment') {
      const target = mentioned[0] || repliedParticipant;
      if (!target) return sendButtons(sock, chat, { text: `📌 Usage: *.compliment* @user\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
      const compliment = compliments[Math.floor(Math.random() * compliments.length)];
      return sock.sendMessage(chat, { text: `💛 @${target.split('@')[0]}, ${compliment}\n\n${cfg.footer}`, mentions: [target] }, { quoted: msg });
    }

    // ── INSULT ────────────────────────────────────────────────
    if (cmd === 'insult') {
      const target = mentioned[0] || repliedParticipant;
      if (!target) return sendButtons(sock, chat, { text: `📌 Usage: *.insult* @user\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
      const insult = insults[Math.floor(Math.random() * insults.length)];
      return sock.sendMessage(chat, { text: `😂 @${target.split('@')[0]}, ${insult}\n\n${cfg.footer}`, mentions: [target] }, { quoted: msg });
    }

    // ── MEME ──────────────────────────────────────────────────
    if (cmd === 'meme') {
      await m.react('😂');
      try {
        const res = await fetch('https://shizoapi.onrender.com/api/memes/cheems?apikey=shizo', { timeout: 15000 });
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('image')) {
          await sock.sendMessage(chat, { image: await res.buffer(), caption: `😂 *Meme!*\n\n${cfg.footer}` }, { quoted: msg });
          await m.react('✅');
          return sendButtons(sock, chat, { text: '▸ Want more?', footer: cfg.footer, buttons: [{ label: '😂 Another Meme', id: '.meme' }, { label: '😄 Joke', id: '.joke' }], quoted: msg });
        }
        throw new Error('Invalid');
      } catch { await m.react('❌'); return m.reply(`${tr('err_failed')}\n\n${cfg.footer}`); }
    }

    // ── 8BALL ─────────────────────────────────────────────────
    if (cmd === '8ball' || cmd === 'eightball') {
      if (!text) return sendButtons(sock, chat, { text: `📌 Usage: *.8ball* [question]\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
      const responses = ['✅ Yes!','❌ No!','🤔 Maybe...','💯 Definitely!','😬 Doubtful.','🎯 Without a doubt!','🚫 No way!','⭐ Signs point to yes!'];
      const response = responses[Math.floor(Math.random() * responses.length)];
      return sendButtons(sock, chat, {
        text: `🎱 *Magic 8-Ball*\n\n❓ ${text}\n\n🔮 *${response}*\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: '🎱 Ask Again', id: `.8ball ${text}` }],
        quoted: msg,
      });
    }

    // ── SHIP ──────────────────────────────────────────────────
    if (cmd === 'ship') {
      if (!m.isGroup) return m.reply(`${tr('err_group_only')}\n\n${cfg.footer}`);
      try {
        const meta = await sock.groupMetadata(chat);
        const ps = meta.participants.map(p => p.id);
        if (ps.length < 2) return m.reply(`${tr('grp_not_enough')}\n\n${cfg.footer}`);
        const first = ps[Math.floor(Math.random() * ps.length)];
        let second; do { second = ps[Math.floor(Math.random() * ps.length)]; } while (second === first);
        const percent = Math.floor(Math.random() * 101);
        return sock.sendMessage(chat, {
          text: `💘 *SHIP MATCH*\n\n@${first.split('@')[0]} ❤️ @${second.split('@')[0]}\n\n💕 Compatibility: *${percent}%*\n\n${cfg.footer}`,
          mentions: [first, second],
        }, { quoted: msg });
      } catch { return m.reply(`${tr('err_failed')}\n\n${cfg.footer}`); }
    }

    // ── WASTED ────────────────────────────────────────────────
    if (cmd === 'wasted') {
      const target = mentioned[0] || repliedParticipant;
      if (!target) return sendButtons(sock, chat, { text: `📌 Usage: *.wasted* @user\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
      await m.react('⏳');
      try {
        let pp; try { pp = await sock.profilePictureUrl(target, 'image'); } catch { pp = 'https://i.imgur.com/2wzGhpF.jpeg'; }
        const res = await axios.get(`https://some-random-api.com/canvas/overlay/wasted?avatar=${encodeURIComponent(pp)}`, { responseType: 'arraybuffer', timeout: 15000 });
        await sock.sendMessage(chat, { image: Buffer.from(res.data), caption: `⚰️ *WASTED* — @${target.split('@')[0]} 💀\n\n${cfg.footer}`, mentions: [target] }, { quoted: msg });
        await m.react('✅');
      } catch { await m.react('❌'); return m.reply(`${tr('err_failed')}\n\n${cfg.footer}`); }
      return;
    }

    // ── SIMP ──────────────────────────────────────────────────
    if (cmd === 'simp') {
      const target = mentioned[0] || repliedParticipant || sender;
      const percent = Math.floor(Math.random() * 101);
      const bar = '█'.repeat(Math.ceil(percent / 10)) + '░'.repeat(10 - Math.ceil(percent / 10));
      return sock.sendMessage(chat, {
        text: `😍 *SIMP METER*\n\n@${target.split('@')[0]}\n\n[${bar}] ${percent}%\n\n${percent > 70 ? '💘 Major simp!' : percent > 40 ? '😅 Mild simp energy' : '😎 Not simping!'}\n\n${cfg.footer}`,
        mentions: [target],
      }, { quoted: msg });
    }

    // ── STUPID ────────────────────────────────────────────────
    if (cmd === 'stupid') {
      const target = mentioned[0] || repliedParticipant || sender;
      const percent = Math.floor(Math.random() * 101);
      const bar = '█'.repeat(Math.ceil(percent / 10)) + '░'.repeat(10 - Math.ceil(percent / 10));
      return sock.sendMessage(chat, {
        text: `🤪 *STUPID METER*\n\n@${target.split('@')[0]}\n\n[${bar}] ${percent}%\n\n${percent > 70 ? '💀 Certified stupid!' : percent > 40 ? '😬 Kinda dumb' : '🧠 Actually smart!'}\n\n${cfg.footer}`,
        mentions: [target],
      }, { quoted: msg });
    }

    // ── GOODNIGHT ─────────────────────────────────────────────
    if (cmd === 'goodnight') {
      const msgs2 = ['🌙 Goodnight! Sweet dreams! 💤','😴 Rest well! Goodnight! 🌟','🌛 May you have beautiful dreams! 🦋','💤 Goodnight! 🌙','⭐ Tomorrow will be better! 🌈'];
      return sendButtons(sock, chat, { text: msgs2[Math.floor(Math.random() * msgs2.length)] + `\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
    }

    // ── SHAYARI ───────────────────────────────────────────────
    if (cmd === 'shayari') {
      await m.react('💝');
      try {
        const res = await fetch('https://shizoapi.onrender.com/api/texts/shayari?apikey=shizo', { timeout: 10000 });
        const json = await res.json();
        await m.react('✅');
        return sendButtons(sock, chat, { text: `💝 *Shayari*\n\n${json.result}\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '💝 Another', id: '.shayari' }], quoted: msg });
      } catch { await m.react('❌'); return m.reply(`${tr('err_failed')}\n\n${cfg.footer}`); }
    }

    // ── ROSEDAY ───────────────────────────────────────────────
    if (cmd === 'roseday') {
      const target = mentioned[0];
      if (!target) return sendButtons(sock, chat, { text: `📌 Usage: *.roseday* @user\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
      return sock.sendMessage(chat, { text: `🌹 *Happy Rose Day!*\n\n@${target.split('@')[0]}, here's a rose for you! 🌹🌹🌹\n\n${cfg.footer}`, mentions: [target] }, { quoted: msg });
    }

    // ── HIDETAG ───────────────────────────────────────────────
    if (cmd === 'hidetag' || cmd === 'htag') {
      if (!m.isGroup) return m.reply(`${tr('err_group_only')}\n\n${cfg.footer}`);
      if (!m.isGroupAdmin && !m.isOwner) return m.reply(`${tr('err_admins_only')}\n\n${cfg.footer}`);
      const meta2 = await sock.groupMetadata(chat);
      const nonAdmins = meta2.participants.filter(p => !p.admin).map(p => p.id);
      const qm = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (qm?.imageMessage) {
        const { downloadContentFromMessage: dlc } = require('@whiskeysockets/baileys');
        const stream = await dlc(qm.imageMessage, 'image');
        let buf = Buffer.from([]); for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
        await sock.sendMessage(chat, { image: buf, caption: text || '', mentions: nonAdmins });
      } else if (qm?.videoMessage) {
        const { downloadContentFromMessage: dlc } = require('@whiskeysockets/baileys');
        const stream = await dlc(qm.videoMessage, 'video');
        let buf = Buffer.from([]); for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
        await sock.sendMessage(chat, { video: buf, caption: text || '', mentions: nonAdmins });
      } else {
        await sock.sendMessage(chat, { text: text || 'Tagged', mentions: nonAdmins });
      }
      return;
    }

    // ── CONFESS ───────────────────────────────────────────────
    if (cmd === 'confess' || cmd === 'confession') {
      if (!text) return m.reply(`📌 Usage: *.confess* [your confession]\n\nYour identity stays anonymous.\n\n${cfg.footer}`);
      const id = confessId++;
      confessStore.set(id, { sender, msg: text, chat, time: Date.now() });
      if (m.isGroup) {
        await sock.sendMessage(chat, { text: `🤫 *Anonymous Confession #${id}*\n\n_"${text}"_\n\n${cfg.footer}` });
      }
      return m.reply(`${tr('social_confess_sent')}\n\n${cfg.footer}`);
    }

    // ── FAKECHAT ──────────────────────────────────────────────
    if (cmd === 'fakescreenshot' || cmd === 'fakechat') {
      return sendButtons(sock, chat, { text: `📌 *Fake Chat*\n\nUsage: *.fakechat* [name]|[message]\n\nExample: *.fakechat* John|Hello!\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
    }

    // ── AFK ───────────────────────────────────────────────────
    if (cmd === 'afk') {
      const reason = text || 'No reason';
      afkStore.set(sender, { reason, time: Date.now() });
      return m.reply(`😴 *AFK Mode ON*\n\nReason: ${reason}\n\n${cfg.footer}`);
    }

    if (cmd === 'delafk') {
      afkStore.delete(sender);
      return m.reply(`${tr('social_afk_off')}\n\n${cfg.footer}`);
    }
  },
};
