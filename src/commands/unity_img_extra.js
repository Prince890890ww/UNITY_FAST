'use strict';
const { getT } = require('../lang');
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const { exec } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const cfg    = require('../../config');
const { sendButtons } = require('./helper');

// ══════════════════════════════════════════════════════
// UNITY IMAGE EFFECTS EXTRA
// Ported from Lara-3V (rebranded): img-grey, img-invert, img-jail,
//   img-wanted, img-nokia, img-ad, img-joke
// ══════════════════════════════════════════════════════

const TEMP = path.join(process.cwd(), 'database', 'temp');
if (!fs.existsSync(TEMP)) fs.mkdirSync(TEMP, { recursive: true });

function tmpPath(ext) { return path.join(TEMP, `img_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`); }

function execPromise(cmd) {
  return new Promise((res, rej) => exec(cmd, (err, out, err2) => err ? rej(err) : res(out)));
}

async function getImageBuffer(sock, msg) {
  const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const imgMsg = msg?.message?.imageMessage || quoted?.imageMessage;
  if (!imgMsg) return null;
  try {
    const buf = await downloadMediaMessage(
      { message: imgMsg ? { imageMessage: imgMsg } : msg.message },
      'buffer', {},
      { reuploadRequest: sock.updateMediaMessage }
    );
    return buf;
  } catch { return null; }
}

module.exports = {
  commands: [
    'grey',  'gray',  'greyscale', 'grayscale',
    'invert', 'negative',
    'jail',
    'wanted',
    'nokia',  'nokiamsg',
    'imgad',  'adimage',
    'imgjoke','joke2',
    'rmbgjoke','bgremove',
  ],

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd  = m.command;
    const chat = m.chat;
    const msg  = m.msg;

    // Helper: get quoted or current image
    const getImg = async () => {
      const quotedMsg = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const src = quotedMsg?.imageMessage || msg?.message?.imageMessage;
      if (!src) return null;
      try {
        return await downloadMediaMessage(
          { message: quotedMsg ? { imageMessage: quotedMsg.imageMessage } : msg.message, key: msg.key },
          'buffer', {},
          { logger: { info: () => {}, debug: () => {}, trace: () => {}, error: () => {}, warn: () => {} }, reuploadRequest: sock.updateMediaMessage }
        );
      } catch { return null; }
    };

    // ── GREYSCALE ─────────────────────────────────────
    if (['grey', 'gray', 'greyscale', 'grayscale'].includes(cmd)) {
      const buf = await getImg();
      if (!buf) {
        return sendButtons(sock, chat, {
          text: `🖤 *Greyscale Filter*\n\nReply to an image with *.grey* to convert it to greyscale.\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const inp = tmpPath('jpg');
        const out = tmpPath('jpg');
        fs.writeFileSync(inp, buf);
        await execPromise(`ffmpeg -i "${inp}" -vf "hue=s=0" "${out}"`);
        const result = fs.readFileSync(out);
        await sock.sendMessage(chat, { image: result, caption: `🖤 *Greyscale*\n\n${cfg.footer}` }, { quoted: msg });
        await m.react('✅');
        try { fs.unlinkSync(inp); fs.unlinkSync(out); } catch {}
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Greyscale failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── INVERT ────────────────────────────────────────
    if (['invert', 'negative'].includes(cmd)) {
      const buf = await getImg();
      if (!buf) {
        return sendButtons(sock, chat, {
          text: `🔄 *Invert Filter*\n\nReply to an image with *.invert* to invert its colors.\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const inp = tmpPath('jpg');
        const out = tmpPath('jpg');
        fs.writeFileSync(inp, buf);
        await execPromise(`ffmpeg -i "${inp}" -vf "negate" "${out}"`);
        const result = fs.readFileSync(out);
        await sock.sendMessage(chat, { image: result, caption: `🔄 *Inverted Colors*\n\n${cfg.footer}` }, { quoted: msg });
        await m.react('✅');
        try { fs.unlinkSync(inp); fs.unlinkSync(out); } catch {}
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Invert failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── JAIL ──────────────────────────────────────────
    if (cmd === 'jail') {
      const buf = await getImg();
      if (!buf) {
        return sendButtons(sock, chat, {
          text: `🔒 *Jail Effect*\n\nReply to an image with *.jail* to apply jail bars overlay.\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const jailUrl = 'https://i.ibb.co/0MGNPwz/jail.png';
        const inp     = tmpPath('jpg');
        const overlay = tmpPath('png');
        const out     = tmpPath('jpg');

        fs.writeFileSync(inp, buf);
        const jailRes = await axios.get(jailUrl, { responseType: 'arraybuffer', timeout: 15000 });
        fs.writeFileSync(overlay, Buffer.from(jailRes.data));

        await execPromise(`ffmpeg -i "${inp}" -i "${overlay}" -filter_complex "[0:v]scale=500:500[base];[1:v]scale=500:500[overlay];[base][overlay]overlay=0:0" "${out}"`);
        const result = fs.readFileSync(out);
        await sock.sendMessage(chat, { image: result, caption: `🔒 *Jailed!*\n\n${cfg.footer}` }, { quoted: msg });
        await m.react('✅');
        try { fs.unlinkSync(inp); fs.unlinkSync(overlay); fs.unlinkSync(out); } catch {}
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Jail effect failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── WANTED ────────────────────────────────────────
    if (cmd === 'wanted') {
      const buf = await getImg();
      if (!buf) {
        return sendButtons(sock, chat, {
          text: `🤠 *Wanted Poster*\n\nReply to an image with *.wanted* to create a wanted poster.\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const apiUrl = `https://api.popcat.xyz/wanted?image=data:image/jpeg;base64,${buf.toString('base64')}`;
        const res    = await axios.get(
          `https://api.popcat.xyz/wanted?image=${encodeURIComponent('https://i.ibb.co/default.jpg')}`,
          { timeout: 20000 }
        );
        // Fallback: use photofunia-style effect via public API
        const apiUrl2 = `https://some-random-api.com/canvas/wantedlevel?avatar=${encodeURIComponent('https://i.ibb.co/default.jpg')}`;

        // Try direct base64 approach with photofunia
        const wantedRes = await axios.get(
          `https://api.siputzx.my.id/api/efek/wanted?img=data:image/jpeg;base64,${buf.toString('base64')}`,
          { responseType: 'arraybuffer', timeout: 20000 }
        );
        const result = Buffer.from(wantedRes.data);
        await sock.sendMessage(chat, { image: result, caption: `🤠 *WANTED!*\n\n${cfg.footer}` }, { quoted: msg });
        await m.react('✅');
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Wanted effect failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── NOKIA MESSAGE ─────────────────────────────────
    if (['nokia', 'nokiamsg'].includes(cmd)) {
      const text = m.text?.trim();
      if (!text) {
        return sendButtons(sock, chat, {
          text: `📱 *Nokia Message*\n\nUsage: .nokia <your text>\n\n*Example:* .nokia Hello World!\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const res = await axios.get(
          `https://api.popcat.xyz/nokia?text=${encodeURIComponent(text)}`,
          { responseType: 'arraybuffer', timeout: 20000 }
        );
        await sock.sendMessage(chat, { image: Buffer.from(res.data), caption: `📱 *Nokia Message*\n\n${cfg.footer}` }, { quoted: msg });
        await m.react('✅');
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Nokia effect failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── AD IMAGE OVERLAY ──────────────────────────────
    if (['imgad', 'adimage'].includes(cmd)) {
      const buf = await getImg();
      if (!buf) {
        return sendButtons(sock, chat, {
          text: `📢 *Ad Overlay*\n\nReply to an image with *.imgad* to add an advertisement overlay.\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const res = await axios.get(
          `https://api.popcat.xyz/jokeoverlay?image=data:image/jpeg;base64,${buf.toString('base64')}`,
          { responseType: 'arraybuffer', timeout: 20000 }
        );
        await sock.sendMessage(chat, { image: Buffer.from(res.data), caption: `📢 *Advertisement Image*\n\n${cfg.footer}` }, { quoted: msg });
        await m.react('✅');
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Ad overlay failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── JOKE IMAGE ────────────────────────────────────
    if (['imgjoke', 'joke2'].includes(cmd)) {
      const buf = await getImg();
      if (!buf) {
        return sendButtons(sock, chat, {
          text: `😂 *Joke Image*\n\nReply to an image with *.imgjoke* to generate a funny meme-style image.\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const b64  = buf.toString('base64');
        const res  = await axios.get(
          `https://api.siputzx.my.id/api/efek/trigger?img=data:image/jpeg;base64,${b64}`,
          { responseType: 'arraybuffer', timeout: 20000 }
        );
        await sock.sendMessage(chat, { image: Buffer.from(res.data), caption: `😂 *Joke Image*\n\n${cfg.footer}` }, { quoted: msg });
        await m.react('✅');
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Joke image failed: ${e.message}\n\n${cfg.footer}`);
      }
    }
  },
};
