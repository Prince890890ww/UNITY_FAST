'use strict';
const { getT } = require('../lang');
const axios = require('axios');
const cheerio = require('cheerio');
const cfg = require('../../config');

// ── Google image search ───────────────────────────────────────
async function googleImageSearch(query) {
  const r = await axios.get(
    `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 15000,
    }
  );
  const $ = cheerio.load(r.data);
  const images = [];
  $('img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src?.startsWith('http') && !src.includes('google')) {
      images.push(src);
    }
  });
  // Fallback: extract from script tags
  const matches = r.data.matchAll(/"(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/g);
  for (const m of matches) {
    if (!images.includes(m[1])) images.push(m[1]);
  }
  return images.slice(0, 5);
}

// ── Wikipedia search ──────────────────────────────────────────
async function wikiSearch(query, lang = 'en') {
  const r = await axios.get(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
    { timeout: 15000 }
  );
  return {
    title: r.data.title,
    extract: r.data.extract,
    url: r.data.content_urls?.desktop?.page,
    thumb: r.data.thumbnail?.source,
  };
}

// ── WhatsApp stalk ────────────────────────────────────────────
async function waStalk(sock, number) {
  const jid = number.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  const [result] = await sock.onWhatsApp(jid);
  if (!result?.exists) throw new Error('Number not on WhatsApp');
  const status = await sock.fetchStatus(jid).catch(() => null);
  const pp = await sock.profilePictureUrl(jid, 'image').catch(() => null);
  return { jid, exists: true, status: status?.status, pp };
}

// ── GitHub stalk ──────────────────────────────────────────────
async function githubStalk(username) {
  const r = await axios.get(
    `https://api.github.com/users/${username}`,
    { timeout: 15000 }
  );
  return r.data;
}

// ── IMDb search ───────────────────────────────────────────────
async function imdbSearch(query) {
  const r = await axios.get(
    `https://www.omdbapi.com/?s=${encodeURIComponent(query)}&apikey=trilogy`,
    { timeout: 15000 }
  );
  if (r.data.Response === 'False') throw new Error(r.data.Error);
  return r.data.Search?.slice(0, 5) || [];
}

// ── Cricket score ─────────────────────────────────────────────
async function cricketScore() {
  const r = await axios.get(
    'https://cricbuzz-cricket.p.rapidapi.com/matches/v1/live',
    {
      headers: {
        'X-RapidAPI-Key': 'free',
        'X-RapidAPI-Host': 'cricbuzz-cricket.p.rapidapi.com',
      },
      timeout: 15000,
    }
  );
  return r.data?.typeMatches?.[0]?.seriesMatches?.[0]?.seriesAdWrapper?.matches || [];
}

module.exports = {
  commands: [
    'gimage', 'googleimage',
    'wiki', 'wikipedia',
    'whatsappstalk', 'wastalk',
    'githubstalk', 'github',
    'imdb',
    'cricket',
    'define', 'dictionary',
  ],

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd = m.command;
    const text = m.text?.trim();
    const chat = m.chat;

    // ── Google image ──────────────────────────────────────────
    if (cmd === 'gimage' || cmd === 'googleimage') {
      if (!text) return m.reply(
        `📌 Usage: *.gimage* [query]\n\n${cfg.footer}`
      );
      await m.react('🔍');
      try {
        const images = await googleImageSearch(text);
        if (!images.length) throw new Error('No images found');
        const url = images[0];
        const buf = await axios.get(url, {
          responseType: 'arraybuffer', timeout: 15000
        }).then(r => Buffer.from(r.data));
        await m.react('✅');
        return sock.sendMessage(chat, {
          image: buf,
          caption: `🔍 *${text}*\n\n${cfg.footer}`,
        }, { quoted: m.msg });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Image search failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── Wikipedia ─────────────────────────────────────────────
    if (cmd === 'wiki' || cmd === 'wikipedia') {
      if (!text) return m.reply(
        `📌 Usage: *.wiki* [topic]\n\n${cfg.footer}`
      );
      await m.react('🔍');
      try {
        const data = await wikiSearch(text);
        await m.react('✅');
        return m.reply(
          `📖 *${data.title}*\n\n` +
          `${data.extract?.slice(0, 500)}${data.extract?.length > 500 ? '...' : ''}\n\n` +
          `🔗 ${data.url || ''}\n\n` +
          `${cfg.footer}`
        );
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Not found: *${text}*\n\n${cfg.footer}`);
      }
    }

    // ── WhatsApp stalk ────────────────────────────────────────
    if (cmd === 'whatsappstalk' || cmd === 'wastalk') {
      if (!text) return m.reply(
        `📌 Usage: *.wastalk* [number]\n` +
        `Example: *.wastalk* 94771234567\n\n${cfg.footer}`
      );
      await m.react('🔍');
      try {
        const data = await waStalk(sock, text);
        const num = data.jid.replace('@s.whatsapp.net', '');

        if (data.pp) {
          const buf = await axios.get(data.pp, {
            responseType: 'arraybuffer', timeout: 15000
          }).then(r => Buffer.from(r.data));
          await m.react('✅');
          return sock.sendMessage(chat, {
            image: buf,
            caption:
              `📱 *WhatsApp Stalk*\n\n` +
              `📞 Number: +${num}\n` +
              `✅ On WhatsApp: Yes\n` +
              `💬 Status: ${data.status || 'No status'}\n\n` +
              `${cfg.footer}`,
          }, { quoted: m.msg });
        }

        await m.react('✅');
        return m.reply(
          `📱 *WhatsApp Stalk*\n\n` +
          `📞 Number: +${num}\n` +
          `✅ On WhatsApp: Yes\n` +
          `💬 Status: ${data.status || 'No status'}\n` +
          `🖼️ Profile pic: Hidden\n\n` +
          `${cfg.footer}`
        );
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── GitHub stalk ──────────────────────────────────────────
    if (cmd === 'githubstalk' || cmd === 'github') {
      if (!text) return m.reply(
        `📌 Usage: *.github* [username]\n\n${cfg.footer}`
      );
      await m.react('🔍');
      try {
        const d = await githubStalk(text);
        const buf = d.avatar_url
          ? await axios.get(d.avatar_url, {
              responseType: 'arraybuffer', timeout: 15000
            }).then(r => Buffer.from(r.data))
          : null;

        const info =
          `👨‍💻 *GitHub: ${d.login}*\n\n` +
          `📛 Name: ${d.name || 'N/A'}\n` +
          `📝 Bio: ${d.bio || 'N/A'}\n` +
          `📍 Location: ${d.location || 'N/A'}\n` +
          `🏢 Company: ${d.company || 'N/A'}\n` +
          `📦 Repos: ${d.public_repos}\n` +
          `👥 Followers: ${d.followers}\n` +
          `👤 Following: ${d.following}\n` +
          `🔗 ${d.html_url}\n\n` +
          `${cfg.footer}`;

        await m.react('✅');
        if (buf) {
          return sock.sendMessage(chat, {
            image: buf, caption: info
          }, { quoted: m.msg });
        }
        return m.reply(info);
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ GitHub user not found: *${text}*\n\n${cfg.footer}`);
      }
    }

    // ── IMDb ──────────────────────────────────────────────────
    if (cmd === 'imdb') {
      if (!text) return m.reply(
        `📌 Usage: *.imdb* [movie/series name]\n\n${cfg.footer}`
      );
      await m.react('🔍');
      try {
        const results = await imdbSearch(text);
        if (!results.length) throw new Error('No results found');
        const list = results.map((r, i) =>
          `${i + 1}. *${r.Title}* (${r.Year})\n` +
          `   📽️ ${r.Type} | 🔖 ${r.imdbID}`
        ).join('\n\n');
        await m.react('✅');
        return m.reply(
          `🎬 *IMDb Search: ${text}*\n\n` +
          `${list}\n\n` +
          `${cfg.footer}`
        );
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ IMDb: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── Cricket ───────────────────────────────────────────────
    if (cmd === 'cricket') {
      await m.react('🏏');
      try {
        const matches = await cricketScore();
        if (!matches.length) {
          await m.react('✅');
          return m.reply(`${tr('cricket_no_live')}\n\n${cfg.footer}`);
        }
        const list = matches.slice(0, 3).map(match => {
          const info = match.matchInfo;
          const score = match.matchScore;
          return (
            `🏏 *${info?.seriesName || 'Match'}*\n` +
            `${info?.team1?.teamName} vs ${info?.team2?.teamName}\n` +
            `📍 ${info?.venueInfo?.ground || 'N/A'}\n` +
            `📊 ${score?.team1Score?.inngs1?.runs || 0}/${score?.team1Score?.inngs1?.wickets || 0} vs ${score?.team2Score?.inngs1?.runs || 0}/${score?.team2Score?.inngs1?.wickets || 0}`
          );
        }).join('\n\n─────────────\n\n');
        await m.react('✅');
        return m.reply(
          `🏏 *Live Cricket Scores*\n\n` +
          `${list}\n\n` +
          `${cfg.footer}`
        );
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Cricket data unavailable.\n\n${cfg.footer}`);
      }
    }

    // ── Dictionary ────────────────────────────────────────────
    if (cmd === 'define' || cmd === 'dictionary') {
      if (!text) return m.reply(
        `📌 Usage: *.define* [word]\n\n${cfg.footer}`
      );
      await m.react('🔍');
      try {
        const r = await axios.get(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`,
          { timeout: 15000 }
        );
        const data = r.data[0];
        const meanings = data.meanings.slice(0, 2).map(m =>
          `*${m.partOfSpeech}*\n` +
          m.definitions.slice(0, 2).map((d, i) =>
            `${i + 1}. ${d.definition}${d.example ? `\n   _"${d.example}"_` : ''}`
          ).join('\n')
        ).join('\n\n');
        await m.react('✅');
        return m.reply(
          `📚 *${data.word}*\n` +
          `🔊 ${data.phonetic || ''}\n\n` +
          `${meanings}\n\n` +
          `${cfg.footer}`
        );
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Word not found: *${text}*\n\n${cfg.footer}`);
      }
    }
  },
};