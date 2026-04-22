'use strict';
const { getT } = require('../lang');
const axios = require('axios');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { downloadMediaMessage, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const cfg = require('../../config');
const { sendButtons, tmpFile } = require('./helper');
const { uploadImage } = require('./uploadImage');
const webp = require('node-webpmux');
const crypto = require('crypto');

// ── EMOJIMIX ─────────────────────────────────────────────────
async function runEmojimix(sock, m) {
  const chat = m.chat;
  const msg = m.msg;
  const text = m.text?.trim();

  if (!text || !text.includes('+')) {
    return sendButtons(sock, chat, {
      text: `📌 *EMOJI MIX*\n\nUsage: *.emojimix* 😎+🥰\n\nMix two emojis together!\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [{ label: '📋 Menu', id: '.menu' }],
      quoted: msg,
    });
  }

  const [emoji1, emoji2] = text.split('+').map(e => e.trim());
  await m.react('⏳');
  try {
    const url = `https://tenor.googleapis.com/v2/featured?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}`;
    const res = await fetch(url, { timeout: 15000 });
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      await m.react('❌');
      return m.reply(`${tr('media_emoji_err')}\n\n${cfg.footer}`);
    }

    const imageUrl = data.results[0].url;
    const tmpDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const tempFile2 = path.join(tmpDir, `emoji_${Date.now()}.png`);
    const outputFile = path.join(tmpDir, `emoji_sticker_${Date.now()}.webp`);

    const imgRes = await fetch(imageUrl, { timeout: 15000 });
    const buffer = await imgRes.buffer();
    fs.writeFileSync(tempFile2, buffer);

    await new Promise((resolve, reject) => {
      exec(`ffmpeg -i "${tempFile2}" -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" "${outputFile}"`, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    const img = new webp.Image();
    await img.load(fs.readFileSync(outputFile));
    const json = {
      'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
      'sticker-pack-name': cfg.botName || 'UNITY-MD',
      'emojis': [emoji1, emoji2],
    };
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);
    img.exif = exif;
    const finalBuffer = await img.save(null);

    await sock.sendMessage(chat, { sticker: finalBuffer }, { quoted: msg });
    await m.react('✅');

    try { fs.unlinkSync(tempFile2); } catch {}
    try { fs.unlinkSync(outputFile); } catch {}
  } catch (e) {
    await m.react('❌');
    return m.reply(`${tr('media_emoji_fail')}\n\n${cfg.footer}`);
  }
}

// ── ATTP ──────────────────────────────────────────────────────
async function runAttp(sock, m) {
  const chat = m.chat;
  const msg  = m.msg;
  const text = m.text?.trim();

  if (!text) {
    return sendButtons(sock, chat, {
      text: `📌 *ATTP - Animated Text Sticker*\n\nUsage: *.attp* Hello World\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [{ label: '📋 Menu', id: '.menu' }],
      quoted: msg,
    });
  }

  if (text.length > 50) return m.reply(`❌ Text too long! Max 50 characters.\n\n${cfg.footer}`);

  await m.react('⏳');
  try {
    const tmpDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const outputPath = path.join(tmpDir, `attp_${Date.now()}.webp`);

    // Font path detection — Alpine (ttf-dejavu), Ubuntu/Debian, Windows
    const fontPath = process.platform === 'win32'
      ? 'C:/Windows/Fonts/arialbd.ttf'
      : (() => {
          const candidates = [
            '/usr/share/fonts/ttf-dejavu/DejaVuSans-Bold.ttf',        // Alpine (ttf-dejavu pkg)
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',   // Ubuntu/Debian
            '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
            '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
          ];
          return candidates.find(p => fs.existsSync(p)) || null;  // null = use built-in
        })();

    const safeText = text
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/,/g, '\\,')
      .replace(/'/g, "\\'")
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/%/g, '\\%');

    // ── Single-step: lavfi → animated WebP directly (no MP4 intermediate) ──
    // Blinking red → blue → green every 0.3s for 1.8s (6 cycles)
    const cycle = 0.3;
    const dur   = 1.8;
    // fontfile only if font exists — otherwise ffmpeg uses built-in font
    const fontPart = fontPath ? `fontfile='${fontPath}':` : '';
    const base  = `${fontPart}text='${safeText}':borderw=2:bordercolor=black@0.6:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2`;
    const drawRed   = `drawtext=${base}:fontcolor=red:enable='lt(mod(t\\,${cycle})\\,0.1)'`;
    const drawBlue  = `drawtext=${base}:fontcolor=blue:enable='between(mod(t\\,${cycle})\\,0.1\\,0.2)'`;
    const drawGreen = `drawtext=${base}:fontcolor=green:enable='gte(mod(t\\,${cycle})\\,0.2)'`;

    try {
      await new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', [
          '-y',
          '-f', 'lavfi',
          '-i', `color=c=black:s=512x512:d=${dur}:r=20`,
          '-vf', `${drawRed},${drawBlue},${drawGreen}`,
          '-c:v', 'libwebp',
          '-preset', 'default',
          '-loop', '0',
          '-vsync', '0',
          '-pix_fmt', 'yuv420p',
          '-quality', '80',
          '-compression_level', '6',
          '-t', String(dur),
          outputPath,
        ]);
        const errs = [];
        ff.stderr.on('data', e => errs.push(e));
        ff.on('error', reject);
        ff.on('close', code => {
          if (code === 0) resolve();
          else reject(new Error(Buffer.concat(errs).toString() || `ffmpeg failed: ${code}`));
        });
      });

      // Send raw WebP directly — skip node-webpmux EXIF injection
      // (EXIF injection can corrupt animated WebP frames on WhatsApp)
      const webpBuffer = fs.readFileSync(outputPath);
      await sock.sendMessage(chat, { sticker: webpBuffer }, { quoted: msg });
      await m.react('✅');
    } finally {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  } catch (e) {
    await m.react('❌');
    return m.reply(`❌ ATTP failed: ${e.message}\n\n${cfg.footer}`);
  }
}

// ── REMOVEBG ──────────────────────────────────────────────────
async function runRemovebg(sock, m) {
  const chat = m.chat;
  const msg = m.msg;

  await m.react('⏳');
  try {
    let imageUrl = null;
    const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.imageMessage) {
      const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      imageUrl = await uploadImage(Buffer.concat(chunks));
    } else if (msg?.message?.imageMessage) {
      const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      imageUrl = await uploadImage(Buffer.concat(chunks));
    }

    if (!imageUrl) {
      await m.react('❌');
      return sendButtons(sock, chat, {
        text: `📌 *REMOVE BACKGROUND*\n\nReply to or send an image with *.removebg*\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: '📋 Menu', id: '.menu' }],
        quoted: msg,
      });
    }

    const apiUrl = `https://api.princetechn.com/api/tools/removebg?apikey=prince_tech_api_azfsbshfb&url=${encodeURIComponent(imageUrl)}`;
    const res = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 60000 });

    await sock.sendMessage(chat, {
      image: Buffer.from(res.data),
      caption: `✅ *Background Removed!*\n\n${cfg.footer}`,
    }, { quoted: msg });
    await m.react('✅');
  } catch (e) {
    await m.react('❌');
    return m.reply(`❌ Remove BG failed!\n\n${cfg.footer}`);
  }
}

// ── REMINI ────────────────────────────────────────────────────
async function runRemini(sock, m) {
  const chat = m.chat;
  const msg = m.msg;

  await m.react('⏳');
  try {
    let imageUrl = null;
    const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.imageMessage) {
      const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      imageUrl = await uploadImage(Buffer.concat(chunks));
    } else if (msg?.message?.imageMessage) {
      const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      imageUrl = await uploadImage(Buffer.concat(chunks));
    }

    if (!imageUrl) {
      await m.react('❌');
      return sendButtons(sock, chat, {
        text: `📌 *REMINI AI ENHANCE*\n\nReply to or send an image with *.remini*\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: '📋 Menu', id: '.menu' }],
        quoted: msg,
      });
    }

    const apiUrl = `https://api.princetechn.com/api/tools/remini?apikey=prince_tech_api_azfsbshfb&url=${encodeURIComponent(imageUrl)}`;
    const res = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 60000 });

    await sock.sendMessage(chat, {
      image: Buffer.from(res.data),
      caption: `✨ *AI Enhanced!*\n\n${cfg.footer}`,
    }, { quoted: msg });
    await m.react('✅');
  } catch (e) {
    await m.react('❌');
    return m.reply(`❌ Remini failed!\n\n${cfg.footer}`);
  }
}

// ── TAKE ──────────────────────────────────────────────────────
async function runTake(sock, m) {
  const chat = m.chat;
  const msg = m.msg;
  const packname = m.text?.trim() || (cfg.botName || 'UNITY-MD');

  const quotedMessage = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quotedMessage?.stickerMessage) {
    return sendButtons(sock, chat, {
      text: `📌 *TAKE STICKER*\n\nReply to a sticker with *.take* [packname]\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [{ label: '📋 Menu', id: '.menu' }],
      quoted: msg,
    });
  }

  await m.react('⏳');
  try {
    const stickerBuffer = await downloadMediaMessage(
      { key: msg.message.extendedTextMessage.contextInfo.stanzaId, message: quotedMessage, messageType: 'stickerMessage' },
      'buffer', {}, { logger: console, reuploadRequest: sock.updateMediaMessage }
    );

    if (!stickerBuffer) throw new Error('Failed to download sticker');

    const img = new webp.Image();
    await img.load(stickerBuffer);
    const json = {
      'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
      'sticker-pack-name': packname,
      'sticker-pack-publisher': cfg.ownerName || 'UNITY TEAM',
      'emojis': ['🤖'],
    };
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);
    img.exif = exif;
    const finalBuffer = await img.save(null);

    await sock.sendMessage(chat, { sticker: finalBuffer }, { quoted: msg });
    await m.react('✅');
  } catch (e) {
    await m.react('❌');
    return m.reply(`${tr('media_take_fail')}\n\n${cfg.footer}`);
  }
}

// ── VIEWONCE ──────────────────────────────────────────────────
async function runViewonce(sock, m) {
  const chat = m.chat;
  const msg = m.msg;
  const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;

  const quotedImage = quoted?.imageMessage;
  const quotedVideo = quoted?.videoMessage;

  if (quotedImage && quotedImage.viewOnce) {
    await m.react('⏳');
    const stream = await downloadContentFromMessage(quotedImage, 'image');
    let buf = Buffer.from([]);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
    await sock.sendMessage(chat, { image: buf, caption: quotedImage.caption || '' }, { quoted: msg });
    await m.react('✅');
  } else if (quotedVideo && quotedVideo.viewOnce) {
    await m.react('⏳');
    const stream = await downloadContentFromMessage(quotedVideo, 'video');
    let buf = Buffer.from([]);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
    await sock.sendMessage(chat, { video: buf, caption: quotedVideo.caption || '' }, { quoted: msg });
    await m.react('✅');
  } else {
    return sendButtons(sock, chat, {
      text: `📌 *REVEAL VIEW ONCE*\n\nReply to a view-once image or video with *.rvo*\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [{ label: '📋 Menu', id: '.menu' }],
      quoted: msg,
    });
  }
}

module.exports = {
  commands: ['emojimix', 'attp', 'removebg', 'rmbg', 'nobg', 'remini', 'take', 'rvo', 'viewonce', 'revealvo'],

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd = m.command;
    if (cmd === 'emojimix') return runEmojimix(sock, m);
    if (cmd === 'attp') return runAttp(sock, m);
    if (['removebg', 'rmbg', 'nobg'].includes(cmd)) return runRemovebg(sock, m);
    if (cmd === 'remini') return runRemini(sock, m);
    if (cmd === 'take') return runTake(sock, m);
    if (['rvo', 'viewonce', 'revealvo'].includes(cmd)) return runViewonce(sock, m);
  },
};
