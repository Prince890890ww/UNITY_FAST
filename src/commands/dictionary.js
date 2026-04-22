'use strict';
const { getT } = require('../lang');
const axios = require('axios');
const cheerio = require('cheerio');
const cfg = require('../../config');

// ── English dictionary ────────────────────────────────────────
async function englishDefine(word) {
  const r = await axios.get(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    { timeout: 15000 }
  );
  const data = r.data[0];
  const meanings = data.meanings.slice(0, 2).map(m =>
    `*${m.partOfSpeech}*\n` +
    m.definitions.slice(0, 2).map((d, i) =>
      `${i + 1}. ${d.definition}` +
      (d.example ? `\n   _"${d.example}"_` : '')
    ).join('\n')
  ).join('\n\n');
  return {
    word: data.word,
    phonetic: data.phonetic || '',
    meanings,
  };
}

// ── Sinhala dictionary (madura) ───────────────────────────────
async function sinhalaDefine(word) {
  const r = await axios.get(
    `https://www.maduraonline.com/?s=${encodeURIComponent(word)}`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    }
  );
  const $   = cheerio.load(r.data);
  const results = [];
  $('.entry-content, .definition, p').each((i, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 10 && text.length < 500) {
      results.push(text);
    }
  });
  return results.slice(0, 3);
}

// ── Sinhala to English ────────────────────────────────────────
async function translateSI(word) {
  const r = await axios.get(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=si|en`,
    { timeout: 10000 }
  );
  return r.data?.responseData?.translatedText;
}

module.exports = {
  commands: ['define', 'dictionary', 'dict', 'meaning', 'sinhaladict'],

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd  = m.command;
    const text = m.text?.trim();

    if (!text) {
      return m.reply(
        `📚 *Dictionary*\n\n` +
        `📌 Usage:\n` +
        `*.define* [english word]\n` +
        `*.sinhaladict* [sinhala word]\n\n` +
        `Examples:\n` +
        `*.define* ephemeral\n` +
        `*.sinhaladict* ආදරය\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Sinhala dictionary ────────────────────────────────────
    if (cmd === 'sinhaladict') {
      await m.react('🔍');
      try {
        // Try translation first
        const translated = await translateSI(text);
        const defs = await sinhalaDefine(text);

        await m.react('✅');
        return m.reply(
          `📚 *Sinhala Dictionary*\n\n` +
          `🔤 Word: *${text}*\n` +
          (translated ? `🌐 English: *${translated}*\n` : '') +
          (defs.length ? `\n📝 Definition:\n${defs.join('\n')}` : '') +
          `\n\n${cfg.footer}`
        );
      } catch (e) {
        await m.react('❌');
        return m.reply(
          `❌ *Not found:* ${text}\n\n${cfg.footer}`
        );
      }
    }

    // ── English dictionary ────────────────────────────────────
    await m.react('🔍');
    try {
      const data = await englishDefine(text);
      await m.react('✅');
      return m.reply(
        `📚 *Dictionary*\n\n` +
        `🔤 *${data.word}*` +
        (data.phonetic ? ` ${data.phonetic}` : '') +
        `\n\n${data.meanings}\n\n` +
        `${cfg.footer}`
      );
    } catch (e) {
      // Try Sinhala translation as fallback
      try {
        const translated = await translateSI(text);
        await m.react('✅');
        return m.reply(
          `📚 *Translation*\n\n` +
          `🔤 *${text}*\n` +
          `🌐 *${translated}*\n\n` +
          `${cfg.footer}`
        );
      } catch {
        await m.react('❌');
        return m.reply(
          `❌ *Not found:* ${text}\n\n${cfg.footer}`
        );
      }
    }
  },
};