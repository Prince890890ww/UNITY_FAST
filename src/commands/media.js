'use strict';
const { getT } = require('../lang');
const axios = require('axios');
const cfg = require('../../config');
const { tmpFile } = require('./helper');
const fs = require('fs-extra');
const sharp = require('sharp');

module.exports = {
  commands: [
    'toimg', 'stickertoimg',
    'rmbg',
    'compress', 'imgcompress',
    'resize', 'imgresize',
    'pdf', 'topdf', 'imgpdf',
    'getpp',
    'poll',
    'q', 'quoted',
    'disappearing',
    'pin', 'unpin',
    'react',
  ],

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd  = m.command;
    const text = m.text?.trim();
    const chat = m.chat;

    // ── Sticker to image ──────────────────────────────────────
    if (cmd === 'toimg' || cmd === 'stickertoimg') {
      const sticker =
        m.quoted?.message?.stickerMessage ||
        m.message?.stickerMessage;
      if (!sticker) return m.reply(`${tr('media_toimg_usage')}\n\n${cfg.footer}`);
      await m.react('⏳');
      try {
        const buf = await sock.downloadMediaMessage(
          sticker === m.message?.stickerMessage
            ? m.msg
            : { message: m.quoted.message, key: m.quoted.key }
        );
        const img = await sharp(buf).png().toBuffer();
        await m.react('✅');
        return sock.sendMessage(chat, {
          image: img,
          caption: `🖼️ *Converted!*\n\n${cfg.footer}`,
        }, { quoted: m.msg });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── Remove background ─────────────────────────────────────
    if (cmd === 'rmbg') {
      const img =
        m.quoted?.message?.imageMessage ||
        m.message?.imageMessage;
      if (!img) return m.reply(`${tr('media_rmbg_usage')}\n\n${cfg.footer}`);
      await m.react('⏳');
      try {
        const buf = await sock.downloadMediaMessage(
          img === m.message?.imageMessage
            ? m.msg
            : { message: m.quoted.message, key: m.quoted.key }
        );
        const FormData = require('form-data');
        const form = new FormData();
        form.append('image_file', buf, { filename: 'image.jpg' });
        form.append('size', 'auto');
        const r = await axios.post(
          'https://api.remove.bg/v1.0/removebg',
          form,
          {
            headers: {
              ...form.getHeaders(),
              'X-Api-Key': process.env.REMOVEBG_API_KEY || 'REMOVEBG_API_KEY',
            },
            responseType: 'arraybuffer',
            timeout: 30000,
          }
        );
        await m.react('✅');
        return sock.sendMessage(chat, {
          image: Buffer.from(r.data),
          caption: `✂️ *Background removed!*\n\n${cfg.footer}`,
        }, { quoted: m.msg });
      } catch (e) {
        await m.react('❌');
        return m.reply(
          `❌ *Failed!*\n\nAdd REMOVEBG_API_KEY in Render Environment.\nFree key: remove.bg/api\n\n${cfg.footer}`
        );
      }
    }

    // ── Compress image ────────────────────────────────────────
    if (cmd === 'compress' || cmd === 'imgcompress') {
      const img =
        m.quoted?.message?.imageMessage ||
        m.message?.imageMessage;
      if (!img) return m.reply(`📌 Send/reply image with *.compress*\n\n${cfg.footer}`);
      await m.react('⏳');
      try {
        const buf = await sock.downloadMediaMessage(
          img === m.message?.imageMessage
            ? m.msg
            : { message: m.quoted.message, key: m.quoted.key }
        );
        const quality    = parseInt(text) || 50;
        const compressed = await sharp(buf)
          .jpeg({ quality: Math.min(Math.max(quality, 10), 90) })
          .toBuffer();
        const before = (buf.length / 1024).toFixed(1);
        const after  = (compressed.length / 1024).toFixed(1);
        await m.react('✅');
        return sock.sendMessage(chat, {
          image: compressed,
          caption:
            `🗜️ *Compressed!*\n\n` +
            `📦 Before: ${before} KB\n` +
            `📦 After: ${after} KB\n` +
            `📉 Saved: ${((1 - compressed.length/buf.length)*100).toFixed(1)}%\n\n` +
            `${cfg.footer}`,
        }, { quoted: m.msg });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── Resize image ──────────────────────────────────────────
    if (cmd === 'resize' || cmd === 'imgresize') {
      const img =
        m.quoted?.message?.imageMessage ||
        m.message?.imageMessage;
      if (!img) return m.reply(
        `📌 Usage: *.resize* [width]x[height]\nExample: *.resize* 512x512\n\n${cfg.footer}`
      );
      await m.react('⏳');
      try {
        const buf = await sock.downloadMediaMessage(
          img === m.message?.imageMessage
            ? m.msg
            : { message: m.quoted.message, key: m.quoted.key }
        );
        const [w, h] = (text || '512x512').split('x').map(Number);
        const resized = await sharp(buf)
          .resize(w || 512, h || 512, { fit: 'inside' })
          .toBuffer();
        await m.react('✅');
        return sock.sendMessage(chat, {
          image: resized,
          caption: `📐 *Resized to ${w}x${h}!*\n\n${cfg.footer}`,
        }, { quoted: m.msg });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── Image to PDF ──────────────────────────────────────────
    if (cmd === 'pdf' || cmd === 'topdf' || cmd === 'imgpdf') {
      const img =
        m.quoted?.message?.imageMessage ||
        m.message?.imageMessage;
      if (!img) return m.reply(`📌 Send/reply image with *.pdf*\n\n${cfg.footer}`);
      await m.react('⏳');
      try {
        const buf = await sock.downloadMediaMessage(
          img === m.message?.imageMessage
            ? m.msg
            : { message: m.quoted.message, key: m.quoted.key }
        );
        const PDFDocument = require('pdfkit');
        const filePath = tmpFile('pdf');
        await new Promise((resolve, reject) => {
          const doc    = new PDFDocument({ size: 'A4', margin: 0 });
          const stream = fs.createWriteStream(filePath);
          doc.pipe(stream);
          doc.image(buf, 0, 0, { width: 595, height: 842 });
          doc.end();
          stream.on('finish', resolve);
          stream.on('error', reject);
        });
        const pdfBuf = await fs.readFile(filePath);
        await fs.remove(filePath);
        await m.react('✅');
        return sock.sendMessage(chat, {
          document: pdfBuf,
          mimetype: 'application/pdf',
          fileName: `unity_${Date.now()}.pdf`,
          caption: `📄 *Converted to PDF!*\n\n${cfg.footer}`,
        }, { quoted: m.msg });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── Get profile picture ───────────────────────────────────
    if (cmd === 'getpp') {
      const target =
        m.quoted?.sender ||
        (text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : m.sender);
      await m.react('⏳');
      try {
        const pp  = await sock.profilePictureUrl(target, 'image');
        const buf = await axios.get(pp, {
          responseType: 'arraybuffer', timeout: 15000,
        }).then(r => Buffer.from(r.data));
        await m.react('✅');
        return sock.sendMessage(chat, {
          image: buf,
          caption:
            `🖼️ *Profile Picture*\n` +
            `👤 +${target.replace('@s.whatsapp.net', '')}\n\n` +
            `${cfg.footer}`,
        }, { quoted: m.msg });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ No profile picture found.\n\n${cfg.footer}`);
      }
    }

    // ── Poll ──────────────────────────────────────────────────
    if (cmd === 'poll') {
      if (!text) return m.reply(
        `📌 Usage: *.poll* Question | Option1 | Option2\n\n` +
        `Example: *.poll* Best fruit? | Apple | Banana | Mango\n\n` +
        `${cfg.footer}`
      );
      const parts = text.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length < 3) return m.reply(
        `📌 Need at least: Question | Option1 | Option2\n\n${cfg.footer}`
      );
      const question = parts[0];
      const options  = parts.slice(1, 13);
      await m.react('⏳');
      try {
        await sock.sendMessage(chat, {
          poll: { name: question, values: options, selectableCount: 1 }
        });
        await m.react('✅');
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Poll failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── Quote ─────────────────────────────────────────────────
    if (cmd === 'q' || cmd === 'quoted') {
      if (!m.quoted) return m.reply(`${tr('media_q_usage')}\n\n${cfg.footer}`);
      const body   = m.quoted.body || '[media]';
      const sender = m.quoted.sender?.replace('@s.whatsapp.net', '');
      return m.reply(
        `💬 *Quoted Message*\n\n` +
        `👤 From: +${sender}\n` +
        `📝 "${body}"\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Disappearing messages ─────────────────────────────────
    if (cmd === 'disappearing') {
      if (!m.isGroupAdmin && !m.isOwner) return m.reply(`🔒 *Admin only!*\n\n${cfg.footer}`);
      const options = { off: 0, '24h': 86400, '7d': 604800, '90d': 7776000 };
      const choice  = text?.toLowerCase() || 'off';
      const seconds = options[choice];
      if (seconds === undefined) return m.reply(
        `📌 Usage: *.disappearing* [off/24h/7d/90d]\n\n${cfg.footer}`
      );
      await sock.groupToggleEphemeral(chat, seconds);
      return m.reply(
        `⏳ *Disappearing: ${choice === 'off' ? 'OFF' : choice}*\n\n${cfg.footer}`
      );
    }

    // ── Pin ───────────────────────────────────────────────────
    if (cmd === 'pin') {
      if (!m.isGroupAdmin && !m.isOwner) return m.reply(`🔒 *Admin only!*\n\n${cfg.footer}`);
      if (!m.quoted) return m.reply(`📌 Reply a message with *.pin*\n\n${cfg.footer}`);
      await sock.sendMessage(chat, {
        pin: { type: 1, time: 604800, key: m.quoted.key }
      });
      return m.reply(`📌 *Message pinned!*\n\n${cfg.footer}`);
    }

    // ── Unpin ─────────────────────────────────────────────────
    if (cmd === 'unpin') {
      if (!m.isGroupAdmin && !m.isOwner) return m.reply(`🔒 *Admin only!*\n\n${cfg.footer}`);
      if (!m.quoted) return m.reply(`📌 Reply pinned message with *.unpin*\n\n${cfg.footer}`);
      await sock.sendMessage(chat, {
        pin: { type: 2, time: 0, key: m.quoted.key }
      });
      return m.reply(`${tr('media_unpinned')}\n\n${cfg.footer}`);
    }

    // ── React ─────────────────────────────────────────────────
    if (cmd === 'react') {
      if (!m.quoted) return m.reply(
        `📌 Reply a message with *.react* [emoji]\n\n${cfg.footer}`
      );
      const emoji = text || '❤️';
      await sock.sendMessage(chat, {
        react: { text: emoji, key: m.quoted.key }
      });
    }
  },
};