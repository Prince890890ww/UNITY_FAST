'use strict';
const { getT } = require('../lang');
const axios = require('axios');
const fetch = require('node-fetch');
const cfg = require('../../config');
const { sendButtons } = require('./helper');

const compliments = [
  "You're amazing just the way you are! 🌟",
  "You have a great sense of humor! 😄",
  "You are more powerful than you know! 💪",
  "You light up the room! ✨",
  "You inspire me! 🎯",
  "Your creativity knows no bounds! 🎨",
  "You have a heart of gold! 💛",
  "Your smile brightens everyone's day! 😊",
  "You're so talented in everything you do! 🏆",
  "Your kindness makes the world a better place! 🌍",
  "You have a beautiful soul! 🦋",
  "Your enthusiasm is truly inspiring! 🔥",
  "You are an amazing listener! 👂",
  "You're stronger than you think! 💎",
  "You make the world a better place just by being in it! 🌈",
];

const insults = [
  "You're like a cloud. When you disappear, it's a beautiful day! ☁️",
  "I'd agree with you, but then we'd both be wrong. 🤷",
  "You're proof that even evolution takes a break sometimes. 🦕",
  "You're like a software update — nobody wants you right now. 💻",
  "You're like a penny — two-faced and not worth much. 🪙",
  "You're the reason they put directions on shampoo bottles. 🧴",
  "You're like a Wi-Fi signal — always weak when needed most. 📶",
  "You're like a broken pencil — pointless. ✏️",
  "You're like a traffic jam — nobody wants you, but here you are. 🚗",
  "Your brain's running Windows 95 — slow and outdated. 🖥️",
];

const eightBallResponses = [
  "✅ Yes, definitely!", "❌ No way!", "🤔 Ask again later.",
  "💯 It is certain.", "😬 Very doubtful.", "🎯 Without a doubt.",
  "🚫 My reply is no.", "⭐ Signs point to yes.",
  "🌟 Most likely!", "⚠️ Cannot predict now.",
];

module.exports = {
  commands: [
    'joke', 'quote', 'fact', 'flirt', 'compliment', 'insult',
    'meme', '8ball', 'eightball', 'ship', 'wasted',
    'truth', 'dare',
  ],

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd = m.command;
    const chat = m.chat;
    const msg = m.msg;
    const text = m.text?.trim();
    const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const repliedParticipant = msg?.message?.extendedTextMessage?.contextInfo?.participant;

    // ── JOKE ─────────────────────────────────────────────────
    if (cmd === 'joke') {
      await m.react('😄');
      try {
        const res = await axios.get('https://icanhazdadjoke.com/', {
          headers: { Accept: 'application/json' },
          timeout: 10000,
        });
        const joke = res.data.joke;
        return sendButtons(sock, chat, {
          text: `😄 *Random Joke*\n\n${joke}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '😄 Another Joke', id: '.joke' },
            { label: '😮 Random Fact', id: '.fact' },
          ],
          quoted: msg,
        });
      } catch {
        return m.reply(`${tr('fun_joke_fail')}\n\n${cfg.footer}`);
      }
    }

    // ── QUOTE ─────────────────────────────────────────────────
    if (cmd === 'quote') {
      await m.react('💬');
      try {
        const res = await fetch('https://shizoapi.onrender.com/api/texts/quotes?apikey=shizo', { timeout: 10000 });
        const json = await res.json();
        return sendButtons(sock, chat, {
          text: `💬 *Inspirational Quote*\n\n${json.result}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '💬 Another Quote', id: '.quote' },
            { label: '📋 Menu', id: '.menu' },
          ],
          quoted: msg,
        });
      } catch {
        return m.reply(`${tr('fun_quote_fail')}\n\n${cfg.footer}`);
      }
    }

    // ── FACT ──────────────────────────────────────────────────
    if (cmd === 'fact') {
      await m.react('🤓');
      try {
        const res = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en', { timeout: 10000 });
        const fact = res.data.text;
        return sendButtons(sock, chat, {
          text: `🤓 *Random Fact*\n\n${fact}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '🤓 Another Fact', id: '.fact' },
            { label: '😄 Joke', id: '.joke' },
          ],
          quoted: msg,
        });
      } catch {
        return m.reply(`${tr('fun_fact_fail')}\n\n${cfg.footer}`);
      }
    }

    // ── FLIRT ────────────────────────────────────────────────
    if (cmd === 'flirt') {
      await m.react('😍');
      try {
        const res = await fetch('https://shizoapi.onrender.com/api/texts/flirt?apikey=shizo', { timeout: 10000 });
        const json = await res.json();
        return sendButtons(sock, chat, {
          text: `😍 *Flirt Line*\n\n${json.result}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '😍 Another', id: '.flirt' },
            { label: '📋 Menu', id: '.menu' },
          ],
          quoted: msg,
        });
      } catch {
        return m.reply(`${tr('err_failed')}\n\n${cfg.footer}`);
      }
    }

    // ── COMPLIMENT ───────────────────────────────────────────
    if (cmd === 'compliment') {
      const target = mentioned[0] || repliedParticipant;
      if (!target) {
        return sendButtons(sock, chat, {
          text: `📌 Usage: *.compliment* @user\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      const compliment = compliments[Math.floor(Math.random() * compliments.length)];
      return sock.sendMessage(chat, {
        text: `💛 @${target.split('@')[0]}, ${compliment}\n\n${cfg.footer}`,
        mentions: [target],
      }, { quoted: msg });
    }

    // ── INSULT ───────────────────────────────────────────────
    if (cmd === 'insult') {
      const target = mentioned[0] || repliedParticipant;
      if (!target) {
        return sendButtons(sock, chat, {
          text: `📌 Usage: *.insult* @user\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      const insult = insults[Math.floor(Math.random() * insults.length)];
      return sock.sendMessage(chat, {
        text: `😂 @${target.split('@')[0]}, ${insult}\n\n${cfg.footer}`,
        mentions: [target],
      }, { quoted: msg });
    }

    // ── MEME ─────────────────────────────────────────────────
    if (cmd === 'meme') {
      await m.react('😂');
      try {
        const res = await fetch('https://shizoapi.onrender.com/api/memes/cheems?apikey=shizo', { timeout: 15000 });
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('image')) {
          const imageBuffer = await res.buffer();
          await sock.sendMessage(chat, {
            image: imageBuffer,
            caption: `😂 *Here's your meme!*\n\n${cfg.footer}`,
          }, { quoted: msg });
          return sendButtons(sock, chat, {
            text: '▸ 𝙒𝙖𝙣𝙩 𝙢𝙤𝙧𝙚?',
            footer: cfg.footer,
            buttons: [
              { label: '😂 Another Meme', id: '.meme' },
              { label: '😄 Joke', id: '.joke' },
            ],
            quoted: msg,
          });
        }
        throw new Error('Invalid response');
      } catch {
        return m.reply(`${tr('fun_meme_fail')}\n\n${cfg.footer}`);
      }
    }

    // ── 8BALL ────────────────────────────────────────────────
    if (cmd === '8ball' || cmd === 'eightball') {
      if (!text) {
        return sendButtons(sock, chat, {
          text: `📌 Usage: *.8ball* [question]\n\nExample: *.8ball* Will I be rich?\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      const response = eightBallResponses[Math.floor(Math.random() * eightBallResponses.length)];
      return sendButtons(sock, chat, {
        text: `🎱 *Magic 8-Ball*\n\n❓ *Question:* ${text}\n\n🔮 *Answer:* ${response}\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: '🎱 Ask Again', id: `.8ball ${text}` }],
        quoted: msg,
      });
    }

    // ── SHIP ─────────────────────────────────────────────────
    if (cmd === 'ship') {
      if (!m.isGroup) return m.reply(`${tr('err_use_in_group')}\n\n${cfg.footer}`);
      try {
        const meta = await sock.groupMetadata(chat);
        const ps = meta.participants.map(p => p.id);
        if (ps.length < 2) return m.reply(`${tr('grp_not_enough')}\n\n${cfg.footer}`);
        const first = ps[Math.floor(Math.random() * ps.length)];
        let second;
        do { second = ps[Math.floor(Math.random() * ps.length)]; } while (second === first);
        const percent = Math.floor(Math.random() * 101);
        const hearts = '❤️'.repeat(Math.ceil(percent / 20)).slice(0, 10);
        return sock.sendMessage(chat, {
          text: `💘 *SHIP MATCH*\n\n@${first.split('@')[0]} ❤️ @${second.split('@')[0]}\n\n💕 Compatibility: *${percent}%*\n${hearts}\n\n${cfg.footer}`,
          mentions: [first, second],
        }, { quoted: msg });
      } catch {
        return m.reply(`${tr('err_failed')}\n\n${cfg.footer}`);
      }
    }

    // ── WASTED ───────────────────────────────────────────────
    if (cmd === 'wasted') {
      const target = mentioned[0] || repliedParticipant;
      if (!target) {
        return sendButtons(sock, chat, {
          text: `📌 Usage: *.wasted* @user or reply to a message\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        let profilePic;
        try { profilePic = await sock.profilePictureUrl(target, 'image'); }
        catch { profilePic = 'https://i.imgur.com/2wzGhpF.jpeg'; }

        const wastedRes = await axios.get(
          `https://some-random-api.com/canvas/overlay/wasted?avatar=${encodeURIComponent(profilePic)}`,
          { responseType: 'arraybuffer', timeout: 15000 }
        );
        await sock.sendMessage(chat, {
          image: Buffer.from(wastedRes.data),
          caption: `⚰️ *WASTED* — @${target.split('@')[0]} 💀\n\nRest in pieces! 😂\n\n${cfg.footer}`,
          mentions: [target],
        }, { quoted: msg });
        await m.react('✅');
      } catch {
        await m.react('❌');
        return m.reply(`❌ Failed to create wasted image!\n\n${cfg.footer}`);
      }
    }


    // ── TRUTH ────────────────────────────────────────────────
    if (cmd === 'truth') {
      const truths = [
        "What's the most embarrassing thing you've done?",
        "Who is your secret crush?",
        "What's your biggest fear?",
        "Have you ever lied to your best friend?",
        "What's the worst thing you've ever done?",
        "Do you have a hidden talent?",
        "What's your most embarrassing memory?",
        "Have you ever cheated on a test?",
      ];
      const t = truths[Math.floor(Math.random() * truths.length)];
      return sendButtons(sock, chat, {
        text: `🎯 *TRUTH*\n\n${t}\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: '🎯 Another Truth', id: '.truth' },
          { label: '🔥 Dare', id: '.dare' },
        ],
        quoted: msg,
      });
    }

    // ── DARE ─────────────────────────────────────────────────
    if (cmd === 'dare') {
      const dares = [
        "Send a voice note singing your favorite song!",
        "Change your status to something embarrassing for 10 minutes!",
        "Send a selfie right now!",
        "Tell a joke to the group!",
        "Do 10 push-ups and send proof!",
        "Share your most cringe-worthy photo!",
        "Send a love message to the last person who texted you!",
        "Speak in a different accent for the next 5 messages!",
      ];
      const d = dares[Math.floor(Math.random() * dares.length)];
      return sendButtons(sock, chat, {
        text: `🔥 *DARE*\n\n${d}\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: '🔥 Another Dare', id: '.dare' },
          { label: '🎯 Truth', id: '.truth' },
        ],
        quoted: msg,
      });
    }
  },
};
