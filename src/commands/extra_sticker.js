'use strict';
const { getT } = require('../lang');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const cfg = require('../../config');
const { sendButtons, tmpFile } = require('./helper');
const webp = require('node-webpmux');
const crypto = require('crypto');

async function makeSticker(sock, m, square = false) {
  const chat = m.chat;
  const msg = m.msg;

  let targetMessage = msg;
  if (msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
    const quotedInfo = msg.message.extendedTextMessage.contextInfo;
    targetMessage = {
      key: { remoteJid: chat, id: quotedInfo.stanzaId, participant: quotedInfo.participant },
      message: quotedInfo.quotedMessage,
    };
  }

  const mediaMessage = targetMessage?.message?.imageMessage ||
    targetMessage?.message?.videoMessage ||
    targetMessage?.message?.documentMessage ||
    targetMessage?.message?.stickerMessage;

  if (!mediaMessage) {
    return sendButtons(sock, chat, {
      text: `📌 *STICKER MAKER*\n\n❌ Please send/reply to an image or video!\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [{ label: '📋 Menu', id: '.menu' }],
      quoted: msg,
    });
  }

  await m.react('⏳');
  try {
    const mediaBuffer = await downloadMediaMessage(targetMessage, 'buffer', {}, {
      logger: undefined,
      reuploadRequest: sock.updateMediaMessage,
    });

    if (!mediaBuffer) throw new Error('Failed to download media');

    const tmpDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const tempInput = path.join(tmpDir, `temp_${Date.now()}`);
    const tempOutput = path.join(tmpDir, `sticker_${Date.now()}.webp`);

    fs.writeFileSync(tempInput, mediaBuffer);

    const isAnimated = mediaMessage.mimetype?.includes('gif') ||
      mediaMessage.mimetype?.includes('video') ||
      mediaMessage.seconds > 0;

    const scaleFilter = square
      ? 'scale=512:512,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000'
      : 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000';

    const ffmpegCmd = isAnimated
      ? `ffmpeg -i "${tempInput}" -vf "${scaleFilter},fps=15" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOutput}"`
      : `ffmpeg -i "${tempInput}" -vf "${scaleFilter}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOutput}"`;

    await new Promise((resolve, reject) => {
      exec(ffmpegCmd, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    let webpBuffer = fs.readFileSync(tempOutput);

    const img = new webp.Image();
    await img.load(webpBuffer);

    const json = {
      'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
      'sticker-pack-name': cfg.botName || 'UNITY-MD',
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

    try { fs.unlinkSync(tempInput); } catch {}
    try { fs.unlinkSync(tempOutput); } catch {}

  } catch (e) {
    await m.react('❌');
    return sendButtons(sock, chat, {
      text: `❌ *Sticker Failed!*\n\n${e.message}\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [{ label: '📋 Menu', id: '.menu' }],
      quoted: msg,
    });
  }
}

module.exports = {
  commands: ['sticker', 'stiker', 's', 'stickerfit', 'crop', 'stickercrop'],

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd = m.command;
    const isSquare = ['stickerfit', 'crop', 'stickercrop'].includes(cmd);
    await makeSticker(sock, m, isSquare);
  },
};
