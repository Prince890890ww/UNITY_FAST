'use strict';
const { getT } = require('../lang');
const cfg = require('../../config');
const { fancyText, random } = require('./helper');

module.exports = {
  commands: [
    'fancy', 'styletext',
    'morse', 'unmorse',
    'binary', 'unbinary',
    'mirror', 'reverse',
    'zalgo', 'glitch',
    'bold', 'italic', 'mono',
    'circle', 'square', 'flip',
    'sinhalafont',
    'uppercase', 'lowercase',
    'snake', 'camel',
  ],

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd  = m.command;
    const text = m.text?.trim() || m.quoted?.body?.trim();

    if (!text) {
      return m.reply(
        `📌 Usage: *.${cmd}* [text]\n\n` +
        `Example: *.${cmd}* Hello World\n\n` +
        `${cfg.footer}`
      );
    }

    // ── All styles ────────────────────────────────────────────
    if (cmd === 'fancy' || cmd === 'styletext') {
      const styles = [
        { name: 'Bold',   result: fancyText('bold',   text) },
        { name: 'Italic', result: fancyText('italic', text) },
        { name: 'Mono',   result: fancyText('mono',   text) },
        { name: 'Circle', result: fancyText('circle', text) },
        { name: 'Square', result: fancyText('square', text) },
        { name: 'Flip',   result: fancyText('flip',   text) },
        { name: 'Mirror', result: fancyText('mirror', text) },
      ];
      const list = styles.map((s, i) =>
        `${i + 1}. *${s.name}:*\n${s.result}`
      ).join('\n\n');
      return m.reply(`✨ *Fancy Text Styles*\n\n${list}\n\n${cfg.footer}`);
    }

    if (cmd === 'bold')   return m.reply(`${fancyText('bold',   text)}\n\n${cfg.footer}`);
    if (cmd === 'italic') return m.reply(`${fancyText('italic', text)}\n\n${cfg.footer}`);
    if (cmd === 'mono')   return m.reply(`${fancyText('mono',   text)}\n\n${cfg.footer}`);
    if (cmd === 'circle') return m.reply(`${fancyText('circle', text)}\n\n${cfg.footer}`);
    if (cmd === 'square') return m.reply(`${fancyText('square', text)}\n\n${cfg.footer}`);
    if (cmd === 'flip')   return m.reply(`${fancyText('flip',   text)}\n\n${cfg.footer}`);

    if (cmd === 'mirror' || cmd === 'reverse') {
      return m.reply(`${fancyText('mirror', text)}\n\n${cfg.footer}`);
    }

    if (cmd === 'zalgo') {
      return m.reply(`${fancyText('zalgo', text)}\n\n${cfg.footer}`);
    }

    if (cmd === 'glitch') {
      return m.reply(`${fancyText('glitch', text)}\n\n${cfg.footer}`);
    }

    // ── Morse ─────────────────────────────────────────────────
    if (cmd === 'morse') {
      const result = fancyText('morse', text);
      return m.reply(
        `📡 *Morse Code*\n\n` +
        `📝 Input: ${text}\n` +
        `📡 Output: ${result}\n\n` +
        `${cfg.footer}`
      );
    }

    if (cmd === 'unmorse') {
      const morseMap = {
        '.-':'a', '-...':'b', '-.-.':'c', '-..':'d', '.':'e',
        '..-.':'f', '--.':'g', '....':'h', '..':'i', '.---':'j',
        '-.-':'k', '.-..':'l', '--':'m', '-.':'n', '---':'o',
        '.--.':'p', '--.-':'q', '.-.':'r', '...':'s', '-':'t',
        '..-':'u', '...-':'v', '.--':'w', '-..-':'x', '-.--':'y',
        '--..':'z', '/':' ',
      };
      const decoded = text.split(' ')
        .map(c => morseMap[c] || c)
        .join('');
      return m.reply(
        `📡 *Morse Decode*\n\n` +
        `📡 Input: ${text}\n` +
        `📝 Output: ${decoded}\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Binary ────────────────────────────────────────────────
    if (cmd === 'binary') {
      const result = fancyText('binary', text);
      return m.reply(
        `💻 *Binary*\n\n` +
        `📝 Input: ${text}\n` +
        `💻 Output:\n${result}\n\n` +
        `${cfg.footer}`
      );
    }

    if (cmd === 'unbinary') {
      try {
        const decoded = text.split(' ')
          .map(b => String.fromCharCode(parseInt(b, 2)))
          .join('');
        return m.reply(
          `💻 *Binary Decode*\n\n` +
          `📝 Output: ${decoded}\n\n` +
          `${cfg.footer}`
        );
      } catch {
        return m.reply(`${tr('fun_invalid_bin')}\n\n${cfg.footer}`);
      }
    }

    // ── Case converters ───────────────────────────────────────
    if (cmd === 'uppercase') return m.reply(`${text.toUpperCase()}\n\n${cfg.footer}`);
    if (cmd === 'lowercase') return m.reply(`${text.toLowerCase()}\n\n${cfg.footer}`);

    if (cmd === 'snake') {
      return m.reply(`${text.toLowerCase().replace(/\s+/g, '_')}\n\n${cfg.footer}`);
    }

    if (cmd === 'camel') {
      const result = text.toLowerCase()
        .split(/\s+/)
        .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
      return m.reply(`${result}\n\n${cfg.footer}`);
    }

    // ── Sinhala font ──────────────────────────────────────────
    if (cmd === 'sinhalafont') {
      const styles = [
        `1. *${text}*`,
        `2. _${text}_`,
        `3. ~${text}~`,
        `4. \`${text}\``,
        `5. *_${text}_*`,
        `6. *~${text}~*`,
        `7. _~${text}~_`,
      ];
      return m.reply(
        `🔤 *Text Styles*\n\n${styles.join('\n')}\n\n${cfg.footer}`
      );
    }
  },
};