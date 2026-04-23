'use strict';
const { getT } = require('../lang');
const axios = require('axios');
const cfg = require('../../config');
const { sendButtons } = require('./helper');

// ── Multi-method fetch helper ─────────────────────────────────
async function tryFetch(methods) {
  for (const method of methods) {
    try { const r = await method(); if (r) return r; } catch {}
  }
  return null;
}

// ── Anime GIF helper ──────────────────────────────────────────
async function getAnimeGif(action) {
  return tryFetch([
    async () => {
      const r = await axios.get(`https://api.otakugifs.xyz/gif?reaction=${action}`, { timeout: 10000 });
      return r.data?.url || null;
    },
    async () => {
      const r = await axios.get(`https://nekos.life/api/v2/img/${action}`, { timeout: 10000 });
      return r.data?.url || null;
    },
    async () => {
      const r = await axios.get(`https://api.waifu.pics/sfw/${action}`, { timeout: 10000 });
      return r.data?.url || null;
    },
    async () => {
      const r = await axios.get(`https://some-random-api.com/animu/${action}`, { timeout: 10000 });
      return r.data?.link || null;
    },
  ]);
}

// ── Misc image helper ─────────────────────────────────────────
async function getMiscImage(type, params = {}) {
  return tryFetch([
    async () => {
      const q = new URLSearchParams(params).toString();
      const r = await axios.get(`https://api.paxsenix.biz.id/misc/${type}?${q}`, { responseType: 'arraybuffer', timeout: 20000 });
      return Buffer.from(r.data);
    },
    async () => {
      if (type === 'oogway' && params.text) {
        const r = await axios.get(`https://some-random-api.com/canvas/misc/oogway?quote=${encodeURIComponent(params.text)}`, { responseType: 'arraybuffer', timeout: 15000 });
        return Buffer.from(r.data);
      }
      if (type === 'wasted' && params.imageUrl) {
        const r = await axios.get(`https://some-random-api.com/canvas/overlay/wasted?avatar=${encodeURIComponent(params.imageUrl)}`, { responseType: 'arraybuffer', timeout: 15000 });
        return Buffer.from(r.data);
      }
      if (type === 'jail' && params.imageUrl) {
        const r = await axios.get(`https://some-random-api.com/canvas/overlay/jail?avatar=${encodeURIComponent(params.imageUrl)}`, { responseType: 'arraybuffer', timeout: 15000 });
        return Buffer.from(r.data);
      }
      if (type === 'triggered' && params.imageUrl) {
        const r = await axios.get(`https://some-random-api.com/canvas/overlay/triggered?avatar=${encodeURIComponent(params.imageUrl)}`, { responseType: 'arraybuffer', timeout: 15000 });
        return Buffer.from(r.data);
      }
      if (type === 'tweet' && params.text) {
        const r = await axios.get(`https://some-random-api.com/canvas/misc/tweet?avatar=${encodeURIComponent(params.imageUrl || '')}&displayname=${encodeURIComponent(params.username || 'User')}&username=${encodeURIComponent(params.username || 'user')}&comment=${encodeURIComponent(params.text)}`, { responseType: 'arraybuffer', timeout: 15000 });
        return Buffer.from(r.data);
      }
      if (type === 'ytcomment' && params.text) {
        const r = await axios.get(`https://some-random-api.com/canvas/misc/youtube-comment?avatar=${encodeURIComponent(params.imageUrl || '')}&username=${encodeURIComponent(params.username || 'User')}&comment=${encodeURIComponent(params.text)}`, { responseType: 'arraybuffer', timeout: 15000 });
        return Buffer.from(r.data);
      }
      return null;
    },
  ]);
}

const ANIME_CMDS = ['neko', 'waifu', 'nom', 'poke', 'cry', 'kiss', 'pat', 'hug', 'wink', 'facepalm', 'loli', 'punch', 'slap', 'dance', 'happy', 'blush'];
const TEXT_ART_CMDS = ['metallic', 'ice', 'snow', 'impressive', 'matrix', 'light', 'neon', 'devil', 'purple', 'thunder', 'leaves', '1917', 'arena', 'hacker', 'sand', 'blackpink', 'fire'];
const OVERLAY_CMDS = ['heart', 'circle', 'lgbt', 'horny', 'lolice', 'gay', 'glass', 'passed'];

module.exports = {
  commands: [
    // Info
    'cinfo', 'screenshot', 'ss', 'privacy',
    // Fun/image
    'oogway', 'tweet', 'ytcomment', 'jail', 'triggered', 'namecard',
    'character', 'goodnight', 'roseday', 'shayari', 'its-so-stupid', 'comrade',
    // Media
    'blur', 'simage',
    // AI
    'gpt', 'llama3', 'chatai', 'imagine', 'flux', 'sora',
    // Music/Video downloads
    'mp3', 'song', 'play', 'ytmp3', 'mp4', 'video', 'ytmp4', 'ytvideo',
    // APK
    'apk',
    // Anime GIFs
    ...ANIME_CMDS,
    // Text art
    ...TEXT_ART_CMDS,
    // PP overlays
    ...OVERLAY_CMDS,
  ],

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd  = m.command;
    const chat = m.chat;
    const q    = m.text?.trim() || '';
    const args = q.split(' ');

    // ── Country Info ──────────────────────────────────────────
    if (cmd === 'cinfo') {
      if (!q) return sendButtons(sock, chat, { text: `📌 Usage: *.cinfo* [country]\n\nExample: .cinfo Sri Lanka\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: m.msg });
      await m.react('🌍');
      const info = await tryFetch([
        async () => {
          const r = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(q)}?fullText=false`, { timeout: 10000 });
          const c = r.data?.[0];
          if (!c) return null;
          return `🌍 *Country Info: ${c.name?.common}*\n━━━━━━━━━━━━━━━━━━━━━━\n🏳️ *Official:* ${c.name?.official}\n🗺️ *Capital:* ${c.capital?.[0] || 'N/A'}\n🌏 *Region:* ${c.region} — ${c.subregion}\n👥 *Population:* ${c.population?.toLocaleString()}\n💱 *Currency:* ${Object.values(c.currencies || {})[0]?.name || 'N/A'}\n🗣️ *Languages:* ${Object.values(c.languages || {}).join(', ')}\n📞 *Calling:* +${c.idd?.root?.replace('+', '')}${c.idd?.suffixes?.[0] || ''}\n🏖️ *Area:* ${c.area?.toLocaleString()} km²`;
        },
      ]);
      return sendButtons(sock, chat, {
        text: info ? `${info}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}` : `❌ Country "${q}" not found.\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: '📋 Menu', id: '.menu' }],
        quoted: m.msg,
      });
    }

    // ── Screenshot ────────────────────────────────────────────
    if (cmd === 'ss' || cmd === 'screenshot') {
      if (!q || !q.match(/https?:\/\//)) return m.reply(`📌 Usage: *.ss* [URL]\n\nExample: .ss https://google.com\n\n${cfg.footer}`);
      await m.react('📸');
      const waitMsg = await sock.sendMessage(chat, { text: `📸 *Taking screenshot...*\n🔗 ${q}\n⏳ Please wait...\n${cfg.footer}`, _noImage: true }, { quoted: m.msg });
      const imgBuffer = await tryFetch([
        async () => { const r = await axios.get(`https://api.screenshotmachine.com/?key=demo&url=${encodeURIComponent(q)}&dimension=1024x768&format=jpg`, { responseType: 'arraybuffer', timeout: 20000 }); return Buffer.from(r.data); },
        async () => { const r = await axios.get(`https://image.thum.io/get/width/1280/crop/800/${encodeURIComponent(q)}`, { responseType: 'arraybuffer', timeout: 20000 }); return Buffer.from(r.data); },
        async () => { const r = await axios.get(`https://api.thumbnail.ws/api/abc123/thumbnail/get?url=${encodeURIComponent(q)}&width=1280`, { responseType: 'arraybuffer', timeout: 20000 }); return Buffer.from(r.data); },
        async () => { const r = await axios.get(`https://s0.wordpress.com/mshots/v1/${encodeURIComponent(q)}?w=1280`, { responseType: 'arraybuffer', timeout: 20000 }); return Buffer.from(r.data); },
      ]);
      if (imgBuffer) {
        await sock.sendMessage(chat, { image: imgBuffer, caption: `📸 *Screenshot*\n🔗 ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}` }, { quoted: m.msg });
        try { await sock.sendMessage(chat, { delete: waitMsg.key }); } catch {}
      } else {
        try { await sock.sendMessage(chat, { text: `❌ Could not take screenshot.\n\n${cfg.footer}`, edit: waitMsg.key }); } catch {}
      }
      return;
    }

    // ── Privacy Manager ───────────────────────────────────────
    if (cmd === 'privacy') {
      if (!m.isOwner) return m.reply(`🔒 Owner only command.\n\n${cfg.footer}`);

      // ── Sub-command handler (privacy settings actually applied) ──
      const sub  = args[0]?.toLowerCase();
      const val  = args[1]?.toLowerCase();

      if (sub && val) {
        try {
          const mapValue = (v) => v === 'all' ? 'all' : v === 'contacts' ? 'contacts' : 'none';

          if (sub === 'lastseen') {
            await sock.updateLastSeenPrivacy(mapValue(val));
            return m.reply(`✅ *Last Seen* set to *${val.toUpperCase()}*\n\n${cfg.footer}`);
          }
          if (sub === 'online') {
            await sock.updateOnlinePrivacy(mapValue(val));
            return m.reply(`✅ *Online Status* set to *${val.toUpperCase()}*\n\n${cfg.footer}`);
          }
          if (sub === 'profilepic') {
            await sock.updateProfilePicturePrivacy(mapValue(val));
            return m.reply(`✅ *Profile Pic* set to *${val.toUpperCase()}*\n\n${cfg.footer}`);
          }
          if (sub === 'status') {
            await sock.updateStatusPrivacy(mapValue(val));
            return m.reply(`✅ *Status* set to *${val.toUpperCase()}*\n\n${cfg.footer}`);
          }
          if (sub === 'receipts') {
            await sock.updateReadReceiptsPrivacy(val === 'on' ? 'all' : 'none');
            return m.reply(`✅ *Read Receipts* turned *${val.toUpperCase()}*\n\n${cfg.footer}`);
          }
          if (sub === 'groups') {
            await sock.updateGroupsAddPrivacy(mapValue(val));
            return m.reply(`✅ *Groups Add* set to *${val.toUpperCase()}*\n\n${cfg.footer}`);
          }
        } catch (e) {
          return m.reply(`❌ Failed to update privacy: ${e.message}\n\n${cfg.footer}`);
        }
      }

      // ── Show privacy menu (single message) ──
      await sendButtons(sock, chat, {
        text: `🔐 *Privacy Manager*\n━━━━━━━━━━━━━━━━━━━━━━\n👁️ *Last Seen* | 🟢 *Online* | 🖼️ *Profile Pic*\n📊 *Status* | ✅ *Read Receipts* | 👥 *Groups Add*\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: '👁️ Last Seen: All',        id: '.privacy lastseen all' },
          { label: '👁️ Last Seen: Contacts',   id: '.privacy lastseen contacts' },
          { label: '👁️ Last Seen: Nobody',     id: '.privacy lastseen none' },
          { label: '🟢 Online: All',            id: '.privacy online all' },
          { label: '🖼️ Profile Pic: All',       id: '.privacy profilepic all' },
          { label: '🖼️ Profile Pic: Contacts',  id: '.privacy profilepic contacts' },
          { label: '📊 Status: All',             id: '.privacy status all' },
          { label: '📊 Status: Contacts',        id: '.privacy status contacts' },
          { label: '✅ Read Receipts: On',       id: '.privacy receipts on' },
          { label: '❌ Read Receipts: Off',      id: '.privacy receipts off' },
          { label: '👥 Groups Add: All',         id: '.privacy groups all' },
          { label: '👥 Groups Add: Contacts',    id: '.privacy groups contacts' },
          { label: '📋 Menu',                    id: '.menu' },
        ],
      });
      return;
    }

    // ── Hack animation ────────────────────────────────────────
    if (cmd === 'hack') {
      const target = m.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        ? `@${m.msg.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0]}`
        : (q || 'Target');
      const stages = [
        `💻 *HACKING INITIATED...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 Target: ${target}\n⚡ [▓░░░░░░░░░] 10% — Connecting...`,
        `💻 *HACKING IN PROGRESS...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 Target: ${target}\n⚡ [▓▓▓▓░░░░░░] 40% — Bypassing firewall...`,
        `💻 *HACKING IN PROGRESS...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 Target: ${target}\n⚡ [▓▓▓▓▓▓▓░░░] 70% — Extracting data...`,
        `✅ *HACK COMPLETE!*\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 Target: ${target}\n⚡ [▓▓▓▓▓▓▓▓▓▓] 100%\n📊 Password: 1234567890\n📧 Email: hacked@fake.com\n💰 Balance: $999,999\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`,
      ];
      let hackMsg = await sock.sendMessage(chat, { text: stages[0], _noImage: true }, { quoted: m.msg });
      for (let i = 1; i < stages.length; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try { await sock.sendMessage(chat, { text: stages[i], edit: hackMsg.key }); } catch {}
      }
      return;
    }

    // ── Oogway quote image ────────────────────────────────────
    if (cmd === 'oogway') {
      if (!q) return m.reply(`📌 Usage: *.oogway* [quote text]\n\nExample: .oogway Yesterday is history\n\n${cfg.footer}`);
      await m.react('🐢');
      const imgBuffer = await getMiscImage('oogway', { text: q });
      if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `🐢 *Oogway says:*\n"${q}"\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}` }, { quoted: m.msg });
      return m.reply(`🐢 *Oogway says:*\n"${q}"\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`);
    }

    // ── Fake Tweet image ──────────────────────────────────────
    if (cmd === 'tweet') {
      if (!q) return m.reply(`📌 Usage: *.tweet* [text]\n\nExample: .tweet Hello World!\n\n${cfg.footer}`);
      const username = m.pushName || 'User';
      const imgBuffer = await getMiscImage('tweet', { text: q, username });
      if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `🐦 *Tweet*\n@${username}: ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}` }, { quoted: m.msg });
      return m.reply(`🐦 *@${username}:* ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`);
    }

    // ── Fake YouTube Comment ──────────────────────────────────
    if (cmd === 'ytcomment') {
      if (!q) return m.reply(`📌 Usage: *.ytcomment* [text]\n\nExample: .ytcomment This video is amazing!\n\n${cfg.footer}`);
      const username = m.pushName || 'User';
      const imgBuffer = await getMiscImage('ytcomment', { text: q, username });
      if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `💬 *YouTube Comment*\n${username}: ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}` }, { quoted: m.msg });
      return m.reply(`💬 *YouTube Comment*\n👤 ${username}: ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`);
    }

    // ── Jail ──────────────────────────────────────────────────
    if (cmd === 'jail') {
      const mentioned = m.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.sender;
      await m.react('🚔');
      try {
        const pp = await sock.profilePictureUrl(mentioned, 'image').catch(() => null);
        if (pp) {
          const imgBuffer = await getMiscImage('jail', { imageUrl: pp });
          if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `🚔 *JAILED!*\n@${mentioned.split('@')[0]}\n${cfg.footer}`, mentions: [mentioned] }, { quoted: m.msg });
        }
        return sock.sendMessage(chat, { text: `🚔 *@${mentioned.split('@')[0]} is now in JAIL!*\n${cfg.footer}`, mentions: [mentioned] }, { quoted: m.msg });
      } catch (e) { return m.reply(`❌ Error: ${e.message}\n\n${cfg.footer}`); }
    }

    // ── Triggered GIF ─────────────────────────────────────────
    if (cmd === 'triggered') {
      const mentioned = m.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.sender;
      await m.react('😤');
      try {
        const pp = await sock.profilePictureUrl(mentioned, 'image').catch(() => null);
        if (pp) {
          const imgBuffer = await getMiscImage('triggered', { imageUrl: pp });
          if (imgBuffer) return sock.sendMessage(chat, { video: imgBuffer, gifPlayback: true, caption: `😤 *TRIGGERED!*\n@${mentioned.split('@')[0]}\n${cfg.footer}`, mentions: [mentioned] }, { quoted: m.msg });
        }
        return sock.sendMessage(chat, { text: `😤 *@${mentioned.split('@')[0]} is TRIGGERED!*\n${cfg.footer}`, mentions: [mentioned] }, { quoted: m.msg });
      } catch (e) { return m.reply(`❌ Error: ${e.message}\n\n${cfg.footer}`); }
    }

    // ── Name Card ─────────────────────────────────────────────
    if (cmd === 'namecard') {
      const name = m.pushName || q || 'User';
      const imgBuffer = await getMiscImage('namecard', { name, subtitle: `WhatsApp: ${m.sender.split('@')[0]}` });
      if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `🪪 *Name Card*\n👤 ${name}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}` }, { quoted: m.msg });
      return m.reply(`🪪 *Name Card*\n👤 *Name:* ${name}\n📱 *Number:* +${m.sender.split('@')[0]}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`);
    }

    // ── Character Analysis ────────────────────────────────────
    if (cmd === 'character') {
      const mentioned = m.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.sender;
      const traits = ['Smart 🧠', 'Funny 😂', 'Kind ❤️', 'Creative 🎨', 'Brave 💪', 'Loyal 🤝', 'Mysterious 🔮', 'Energetic ⚡', 'Calm 🌊', 'Caring 🌸'];
      const selected = traits.sort(() => 0.5 - Math.random()).slice(0, 3);
      return sock.sendMessage(chat, { text: `🎭 *Character Analysis*\n━━━━━━━━━━━━━━━━━━━━━━\n👤 @${mentioned.split('@')[0]}\n\n✨ *Personality Traits:*\n${selected.map(t => `• ${t}`).join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`, mentions: [mentioned] }, { quoted: m.msg });
    }

    // ── Good Night ────────────────────────────────────────────
    if (cmd === 'goodnight') {
      const msgs = ['🌙 Good night! Sweet dreams! 💭', '🌛 Sleep well! The stars will watch over you! ⭐', '🌜 May your dreams be magical tonight! ✨', '🌚 Rest well, tomorrow is a new day! 🌅'];
      return sendButtons(sock, chat, { text: `🌙 *Good Night!*\n━━━━━━━━━━━━━━━━━━━━━━\n${msgs[Math.floor(Math.random() * msgs.length)]}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: m.msg });
    }

    // ── Rose Day ──────────────────────────────────────────────
    if (cmd === 'roseday') {
      return sendButtons(sock, chat, { text: `🌹 *Happy Rose Day!*\n━━━━━━━━━━━━━━━━━━━━━━\n🌹🌹🌹🌹🌹\n\nRoses are red,\nViolets are blue,\nThis bot is amazing,\nAnd so are you! 💕\n\n🌹🌹🌹🌹🌹\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: m.msg });
    }

    // ── Shayari ───────────────────────────────────────────────
    if (cmd === 'shayari') {
      const shayaris = [
        'Love is a prayer,\nThat comes from the heart,\nThinking of it makes one smile,\nKnowing someone else holds a place too. 🌹',
        'Life is a journey, strange indeed,\nNo one could understand its creed,\nSome weep alone, some laugh and play,\nBut heart\'s true words stay hidden away. 💫',
        'Let love stay love,\nGive it no other name,\nThe bond that the heart has built,\nNeeds no words to proclaim. 💕',
      ];
      return sendButtons(sock, chat, { text: `🌹 *Shayari*\n━━━━━━━━━━━━━━━━━━━━━━\n${shayaris[Math.floor(Math.random() * shayaris.length)]}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🌹 Another', id: '.shayari' }, { label: '📋 Menu', id: '.menu' }], quoted: m.msg });
    }

    // ── Its-so-stupid / Comrade ───────────────────────────────
    if (cmd === 'its-so-stupid' || cmd === 'comrade') {
      const mentioned = m.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.sender;
      try {
        const pp = await sock.profilePictureUrl(mentioned, 'image').catch(() => '');
        const imgBuffer = await tryFetch([
          async () => { const r = await axios.get(`https://api.paxsenix.biz.id/meme/${cmd}?image=${encodeURIComponent(pp)}`, { responseType: 'arraybuffer', timeout: 15000 }); return Buffer.from(r.data); },
        ]);
        if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `😂 *${cmd.toUpperCase()}*\n@${mentioned.split('@')[0]}\n${cfg.footer}`, mentions: [mentioned] }, { quoted: m.msg });
      } catch {}
      return sock.sendMessage(chat, { text: `😂 *${cmd.toUpperCase()}*\n@${mentioned.split('@')[0]}\n${cfg.footer}`, mentions: [mentioned] }, { quoted: m.msg });
    }

    // ── Blur image ────────────────────────────────────────────
    if (cmd === 'blur') {
      const quotedMsg = m.quoted;
      let imageBuffer = null;
      try {
        if (quotedMsg?.message?.imageMessage) imageBuffer = await sock.downloadMediaMessage(quotedMsg);
        else if (m.msg?.message?.imageMessage) imageBuffer = await sock.downloadMediaMessage(m.msg);
        if (!imageBuffer) return m.reply(`📌 Reply to an image with *.blur*\n\n${cfg.footer}`);
        await m.react('🌫️');
        try {
          const sharp = require('sharp');
          const blurred = await sharp(imageBuffer).blur(15).toBuffer();
          return sock.sendMessage(chat, { image: blurred, caption: `🌫️ *Blurred Image*\n${cfg.footer}` }, { quoted: m.msg });
        } catch {
          const blurred = await tryFetch([
            async () => { const r = await axios.get(`https://api.paxsenix.biz.id/filter/blur?image=${encodeURIComponent('placeholder')}`, { responseType: 'arraybuffer', timeout: 15000 }); return Buffer.from(r.data); },
          ]);
          if (blurred) return sock.sendMessage(chat, { image: blurred, caption: `🌫️ *Blurred Image*\n${cfg.footer}` }, { quoted: m.msg });
          return m.reply(`❌ Blur failed. sharp module not installed.\n\n${cfg.footer}`);
        }
      } catch (e) { return m.reply(`❌ Error: ${e.message}\n\n${cfg.footer}`); }
    }

    // ── Sticker to Image ──────────────────────────────────────
    if (cmd === 'simage') {
      const quotedMsg = m.quoted;
      if (!quotedMsg?.message?.stickerMessage) return m.reply(`📌 Reply to a sticker with *.simage*\n\n${cfg.footer}`);
      try {
        const buffer = await sock.downloadMediaMessage(quotedMsg);
        return sock.sendMessage(chat, { image: buffer, caption: `🖼️ *Sticker → Image*\n${cfg.footer}` }, { quoted: m.msg });
      } catch (e) { return m.reply(`❌ Error: ${e.message}\n\n${cfg.footer}`); }
    }

    // ── AI Chat (gpt / llama3 / chatai) ──────────────────────
    if (['gpt', 'llama3', 'chatai'].includes(cmd)) {
      if (!q) return m.reply(`📌 Usage: *.${cmd}* [your question]\n\nExample: .${cmd} What is love?\n\n${cfg.footer}`);
      await m.react('🤖');
      const waitMsg = await sock.sendMessage(chat, { text: `🤖 *AI is thinking...*\n❓ *Question:* ${q}\n⏳ Please wait...\n${cfg.footer}`, _noImage: true }, { quoted: m.msg });
      const answer = await tryFetch([
        async () => {
          const r = await axios.post('https://text.pollinations.ai/', {
            messages: [{ role: 'system', content: 'You are a helpful assistant. Answer clearly and concisely in English.' }, { role: 'user', content: q }],
            model: cmd === 'llama3' ? 'llama' : 'openai', seed: 42,
          }, { timeout: 20000 });
          return typeof r.data === 'string' ? r.data.trim() : null;
        },
        async () => {
          const r = await axios.get(`https://api.paxsenix.biz.id/ai/gpt4o?text=${encodeURIComponent(q)}`, { timeout: 15000 });
          return r.data?.message || r.data?.result || r.data?.response || r.data?.text || null;
        },
        async () => {
          const vqdRes = await axios.get('https://duckduckgo.com/duckchat/v1/status', { headers: { 'x-vqd-accept': '1' }, timeout: 8000 });
          const vqd = vqdRes.headers['x-vqd-4'];
          if (!vqd) return null;
          const r = await axios.post('https://duckduckgo.com/duckchat/v1/chat', { model: 'gpt-4o-mini', messages: [{ role: 'user', content: q }] }, { headers: { 'x-vqd-4': vqd, 'Content-Type': 'application/json' }, timeout: 15000, responseType: 'text' });
          const lines = String(r.data).split('\n').filter(l => l.startsWith('data:'));
          let result = '';
          for (const line of lines) { try { const d = JSON.parse(line.replace('data: ', '')); if (d.message) result += d.message; } catch {} }
          return result.trim() || null;
        },
      ]);
      try { await sock.sendMessage(chat, { text: answer ? `🤖 *AI Answer (${cmd.toUpperCase()})*\n━━━━━━━━━━━━━━━━━━━━━━\n❓ *Q:* ${q}\n\n💡 *A:* ${answer}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}` : `❌ Could not get AI response.\n\n${cfg.footer}`, edit: waitMsg.key }); } catch {}
      return;
    }

    // ── AI Image generation ───────────────────────────────────
    if (['imagine', 'flux', 'sora'].includes(cmd)) {
      if (!q) return m.reply(`📌 Usage: *.${cmd}* [prompt]\n\nExample: .${cmd} a beautiful sunset\n\n${cfg.footer}`);
      await m.react('🎨');
      const waitMsg = await sock.sendMessage(chat, { text: `🎨 *Generating AI image...*\n✨ *Prompt:* ${q}\n⏳ Please wait...\n${cfg.footer}`, _noImage: true }, { quoted: m.msg });
      const imgBuffer = await tryFetch([
        async () => { const r = await axios.get(`https://api.paxsenix.biz.id/ai/flux?prompt=${encodeURIComponent(q)}`, { responseType: 'arraybuffer', timeout: 30000 }); return Buffer.from(r.data); },
        async () => { const r = await axios.get(`https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=1024&height=1024&nologo=true`, { responseType: 'arraybuffer', timeout: 30000 }); return Buffer.from(r.data); },
        async () => { const r = await axios.get(`https://nexra.aryahcr.cc/api/image/completeai?prompt=${encodeURIComponent(q)}&model=flux`, { responseType: 'arraybuffer', timeout: 30000 }); return Buffer.from(r.data); },
      ]);
      if (imgBuffer) {
        await sock.sendMessage(chat, { image: imgBuffer, caption: `🎨 *AI Generated Image*\n✨ *Prompt:* ${q}\n🤖 *Model:* ${cmd}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}` }, { quoted: m.msg });
        try { await sock.sendMessage(chat, { delete: waitMsg.key }); } catch {}
      } else {
        try { await sock.sendMessage(chat, { text: `❌ Could not generate image.\n\n${cfg.footer}`, edit: waitMsg.key }); } catch {}
      }
      return;
    }

    // ── APK Download ──────────────────────────────────────────
    if (cmd === 'apk') {
      if (!q) return m.reply(`📌 Usage: *.apk* [app name]\n\nExample: .apk WhatsApp\n\n${cfg.footer}`);
      await m.react('📱');
      const waitMsg = await sock.sendMessage(chat, { text: `🔍 *Searching APK...*\n📱 *App:* ${q}\n⏳ Please wait...\n${cfg.footer}`, _noImage: true }, { quoted: m.msg });
      const apkInfo = await tryFetch([
        async () => { const r = await axios.get(`https://api.paxsenix.biz.id/dl/apkpure?q=${encodeURIComponent(q)}`, { timeout: 20000 }); return r.data?.title ? { title: r.data.title, url: r.data.url, size: r.data.size, version: r.data.version } : null; },
        async () => ({ title: q, url: `https://apkpure.com/search?q=${encodeURIComponent(q)}`, size: 'N/A', version: 'Latest' }),
      ]);
      try {
        await sock.sendMessage(chat, {
          text: apkInfo
            ? `📱 *APK Found!*\n━━━━━━━━━━━━━━━━━━━━━━\n📦 *App:* ${apkInfo.title || q}\n📌 *Version:* ${apkInfo.version || 'Latest'}\n💾 *Size:* ${apkInfo.size || 'N/A'}\n🔗 *Link:* ${apkInfo.url || 'N/A'}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`
            : `❌ APK for "${q}" not found.\n🔗 Try: https://apkpure.com/search?q=${encodeURIComponent(q)}\n${cfg.footer}`,
          edit: waitMsg.key,
        });
      } catch {}
      return;
    }

    // ── YouTube MP3 ───────────────────────────────────────────
    if (['mp3', 'song', 'play', 'ytmp3'].includes(cmd)) {
      if (!q) return m.reply(`📌 Usage: *.${cmd}* [song name or YouTube URL]\n\nExample: .${cmd} Shape of You\n\n${cfg.footer}`);
      await m.react('🎵');
      const searchMsg = await sock.sendMessage(chat, { text: `🔍 *Searching...*\n🎵 *Query:* ${q}\n⏳ Please wait...\n${cfg.footer}`, _noImage: true }, { quoted: m.msg });

      let videoUrl = q, displayTitle = q;
      if (!q.match(/https?:\/\//)) {
        try {
          const yts = require('yt-search');
          const res = await yts(q);
          const video = res?.videos?.[0];
          if (video) {
            const vid = video.videoId || video.url?.match(/(?:v=|youtu\.be\/)([^&?#]+)/)?.[1];
            if (vid) { videoUrl = `https://www.youtube.com/watch?v=${vid}`; displayTitle = video.title || q; }
          }
        } catch {}
      }

      return sendButtons(sock, chat, {
        text: `🎯 *Found!*\n━━━━━━━━━━━━━━━━━━━━━━\n🎵 *Song:* ${displayTitle}\n🔗 ${videoUrl}\n━━━━━━━━━━━━━━━━━━━━━━\nChoose download format:\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: '🎵 MP3 Audio', id: `__dl_mp3 ${videoUrl}` },
          { label: '🎤 Voice Note', id: `__dl_vn ${videoUrl}` },
          { label: '📄 Document', id: `__dl_doc ${videoUrl}` },
        ],
        quoted: m.msg,
      });
    }

    // ── YouTube MP4 ───────────────────────────────────────────
    if (['mp4', 'video', 'ytmp4', 'ytvideo'].includes(cmd)) {
      if (!q) return m.reply(`📌 Usage: *.${cmd}* [video name or YouTube URL]\n\nExample: .${cmd} Avengers trailer\n\n${cfg.footer}`);
      await m.react('🎬');

      let videoUrl = q, displayTitle = q;
      if (!q.match(/https?:\/\//)) {
        try {
          const yts = require('yt-search');
          const res = await yts(q);
          const video = res?.videos?.[0];
          if (video) {
            const vid = video.videoId || video.url?.match(/(?:v=|youtu\.be\/)([^&?#]+)/)?.[1];
            if (vid) { videoUrl = `https://www.youtube.com/watch?v=${vid}`; displayTitle = video.title || q; }
          }
        } catch {}
      }

      return sendButtons(sock, chat, {
        text: `🎯 *Found!*\n━━━━━━━━━━━━━━━━━━━━━━\n🎬 *Video:* ${displayTitle}\n🔗 ${videoUrl}\n━━━━━━━━━━━━━━━━━━━━━━\nChoose quality:\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: '📺 360p Video', id: `__dl_360 ${videoUrl}` },
          { label: '📺 720p Video', id: `__dl_720 ${videoUrl}` },
          { label: '📄 360p Doc', id: `__dl_d360 ${videoUrl}` },
          { label: '📄 720p Doc', id: `__dl_d720 ${videoUrl}` },
        ],
        quoted: m.msg,
      });
    }

    // ── Anime GIFs ────────────────────────────────────────────
    if (ANIME_CMDS.includes(cmd)) {
      await m.react('🎌');
      const gifUrl = await getAnimeGif(cmd);
      if (gifUrl) {
        const r = await axios.get(gifUrl, { responseType: 'arraybuffer', timeout: 15000 }).catch(() => null);
        if (r) {
          const isGif = gifUrl.endsWith('.gif') || r.headers['content-type']?.includes('gif');
          return sock.sendMessage(chat, { [isGif ? 'video' : 'image']: Buffer.from(r.data), gifPlayback: isGif, caption: `*${cmd.toUpperCase()}*\n${cfg.footer}` }, { quoted: m.msg });
        }
        return m.reply(`*${cmd.toUpperCase()}*\n🔗 ${gifUrl}\n${cfg.footer}`);
      }
      return m.reply(`❌ Could not get ${cmd} GIF.\n\n${cfg.footer}`);
    }

    // ── Text Art Styles ───────────────────────────────────────
    if (TEXT_ART_CMDS.includes(cmd)) {
      if (!q) return m.reply(`📌 Usage: *.${cmd}* [text]\n\nExample: .${cmd} Hello\n\n${cfg.footer}`);
      await m.react('🎨');
      const waitMsg = await sock.sendMessage(chat, { text: `🎨 *Generating ${cmd} text art...*\n📝 *Text:* ${q}\n⏳ Please wait...\n${cfg.footer}`, _noImage: true }, { quoted: m.msg });
      const imgBuffer = await tryFetch([
        async () => { const r = await axios.get(`https://api.paxsenix.biz.id/text-effect/${cmd}?text=${encodeURIComponent(q)}`, { responseType: 'arraybuffer', timeout: 20000 }); return Buffer.from(r.data); },
        async () => { const r = await axios.get(`https://api.lolhuman.xyz/api/teks/${cmd}?apikey=demo&text=${encodeURIComponent(q)}`, { responseType: 'arraybuffer', timeout: 20000 }); return Buffer.from(r.data); },
        async () => { const r = await axios.get(`https://nekobot.xyz/api/text?type=${cmd}&text=${encodeURIComponent(q)}`, { responseType: 'arraybuffer', timeout: 20000 }); return Buffer.from(r.data); },
      ]);
      if (imgBuffer) {
        await sock.sendMessage(chat, { image: imgBuffer, caption: `🎨 *${cmd.toUpperCase()} Text Art*\n📝 *Text:* ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}` }, { quoted: m.msg });
        try { await sock.sendMessage(chat, { delete: waitMsg.key }); } catch {}
      } else {
        try { await sock.sendMessage(chat, { text: `❌ Could not generate text art.\n\n${cfg.footer}`, edit: waitMsg.key }); } catch {}
      }
      return;
    }

    // ── PP Overlay effects ────────────────────────────────────
    if (OVERLAY_CMDS.includes(cmd)) {
      const mentioned = m.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.sender;
      const emojiMap = { heart: '❤️', circle: '⭕', lgbt: '🏳️‍🌈', horny: '😏', lolice: '👮', gay: '🌈', glass: '👓', passed: '✅' };
      await m.react(emojiMap[cmd] || '✨');
      try {
        const pp = await sock.profilePictureUrl(mentioned, 'image').catch(() => null);
        if (pp) {
          const imgBuffer = await tryFetch([
            async () => { const r = await axios.get(`https://some-random-api.com/canvas/overlay/${cmd}?avatar=${encodeURIComponent(pp)}`, { responseType: 'arraybuffer', timeout: 15000 }); return Buffer.from(r.data); },
            async () => { const r = await axios.get(`https://api.paxsenix.biz.id/overlay/${cmd}?image=${encodeURIComponent(pp)}`, { responseType: 'arraybuffer', timeout: 15000 }); return Buffer.from(r.data); },
          ]);
          if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `${emojiMap[cmd]} *${cmd.toUpperCase()}*\n@${mentioned.split('@')[0]}\n${cfg.footer}`, mentions: [mentioned] }, { quoted: m.msg });
        }
        return sock.sendMessage(chat, { text: `${emojiMap[cmd]} *${cmd.toUpperCase()}*\n@${mentioned.split('@')[0]}\n${cfg.footer}`, mentions: [mentioned] }, { quoted: m.msg });
      } catch (e) { return m.reply(`❌ Error: ${e.message}\n\n${cfg.footer}`); }
    }
  },
};
