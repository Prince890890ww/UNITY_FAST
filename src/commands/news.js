'use strict';
const axios = require('axios');
const cheerio = require('cheerio');
const cfg = require('../../config');

// ── Ada Derana news ───────────────────────────────────────────
async function getAdarana() {
  const r = await axios.get('https://www.adaderana.lk/hot-news/', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
  });
  const $ = cheerio.load(r.data);
  const news = [];
  $('div.story').each((i, el) => {
    const title = $(el).find('a').first().text().trim();
    const link = $(el).find('a').first().attr('href');
    const time = $(el).find('span.comment-count').text().trim();
    if (title && link) {
      news.push({
        title,
        link: link.startsWith('http') ? link : `https://www.adaderana.lk${link}`,
        time,
      });
    }
  });
  return news.slice(0, 8);
}

// ── Esana news ────────────────────────────────────────────────
async function getEsana() {
  try {
    const r = await axios.get('https://www.esana.lk/', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    });
    const $ = cheerio.load(r.data);
    const news = [];
    $('article').each((i, el) => {
      const title = $(el).find('h2, h3').first().text().trim();
      const link = $(el).find('a').first().attr('href');
      if (title && link) {
        news.push({
          title,
          link: link.startsWith('http') ? link : `https://www.esana.lk${link}`,
        });
      }
    });
    return news.slice(0, 8);
  } catch (e) {
    return [];
  }
}

// ── Weather ───────────────────────────────────────────────────
async function getWeather(city = 'Colombo') {
  const r = await axios.get(
    `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
    { timeout: 15000 }
  );
  const d = r.data;
  const current = d.current_condition[0];
  const area = d.nearest_area[0];
  return {
    city: area.areaName[0].value,
    country: area.country[0].value,
    temp: current.temp_C,
    feels: current.FeelsLikeC,
    humidity: current.humidity,
    wind: current.windspeedKmph,
    desc: current.weatherDesc[0].value,
    uv: current.uvIndex,
  };
}

// ── Sinhala lyrics ────────────────────────────────────────────
async function getSinhalaLyrics(query) {
  const r = await axios.get(
    `https://www.sinhalyr.com/?s=${encodeURIComponent(query)}`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    }
  );
  const $ = cheerio.load(r.data);
  const results = [];
  $('article').each((i, el) => {
    const title = $(el).find('h2 a').text().trim();
    const link = $(el).find('h2 a').attr('href');
    if (title && link) results.push({ title, link });
  });
  return results.slice(0, 5);
}

// ── Sri Lanka holidays ────────────────────────────────────────
const SL_HOLIDAYS_2025 = [
  { date: '2025-01-14', name: 'Thai Pongal Day' },
  { date: '2025-01-15', name: 'Duruthu Full Moon Poya Day' },
  { date: '2025-02-04', name: 'Independence Day' },
  { date: '2025-02-12', name: 'Navam Full Moon Poya Day' },
  { date: '2025-03-14', name: 'Madin Full Moon Poya Day' },
  { date: '2025-04-13', name: 'Sinhala & Tamil New Year Eve' },
  { date: '2025-04-14', name: 'Sinhala & Tamil New Year' },
  { date: '2025-04-18', name: 'Good Friday' },
  { date: '2025-05-01', name: 'Labour Day' },
  { date: '2025-05-12', name: 'Vesak Full Moon Poya Day' },
  { date: '2025-06-11', name: 'Poson Full Moon Poya Day' },
  { date: '2025-07-10', name: 'Esala Full Moon Poya Day' },
  { date: '2025-08-09', name: 'Nikini Full Moon Poya Day' },
  { date: '2025-09-07', name: 'Binara Full Moon Poya Day' },
  { date: '2025-10-07', name: 'Vap Full Moon Poya Day' },
  { date: '2025-10-20', name: 'Deepavali' },
  { date: '2025-11-05', name: 'Ill Full Moon Poya Day' },
  { date: '2025-12-04', name: 'Unduvap Full Moon Poya Day' },
  { date: '2025-12-25', name: 'Christmas Day' },
];

module.exports = {
  commands: [
    'news', 'adarana',
    'esananews', 'esana',
    'weather',
    'sinhalalyrics', 'lyrics',
    'holiday', 'holidays',
    'cinema',
    'sinhalafont',
  ],

  async run({ sock, m }) {
    const cmd = m.command;
    const text = m.text?.trim();
    const chat = m.chat;

    // ── Ada Derana news ───────────────────────────────────────
    if (cmd === 'news' || cmd === 'adarana') {
      await m.react('📰');
      try {
        const news = await getAdarana();
        if (!news.length) throw new Error('No news found');
        const list = news.map((n, i) =>
          `${i + 1}. *${n.title}*\n   🔗 ${n.link}`
        ).join('\n\n');
        await m.react('✅');
        return m.reply(
          `📰 *Ada Derana — Latest News*\n\n` +
          `${list}\n\n` +
          `${cfg.footer}`
        );
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ News fetch failed.\n\n${cfg.footer}`);
      }
    }

    // ── Esana news ────────────────────────────────────────────
    if (cmd === 'esananews' || cmd === 'esana') {
      await m.react('📰');
      try {
        const news = await getEsana();
        if (!news.length) throw new Error('No news found');
        const list = news.map((n, i) =>
          `${i + 1}. *${n.title}*\n   🔗 ${n.link}`
        ).join('\n\n');
        await m.react('✅');
        return m.reply(
          `📰 *Esana — Latest News*\n\n` +
          `${list}\n\n` +
          `${cfg.footer}`
        );
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Esana news failed.\n\n${cfg.footer}`);
      }
    }

    // ── Weather ───────────────────────────────────────────────
    if (cmd === 'weather') {
      const city = text || 'Colombo';
      await m.react('🌤️');
      try {
        const w = await getWeather(city);
        await m.react('✅');
        return m.reply(
          `🌤️ *Weather — ${w.city}, ${w.country}*\n\n` +
          `🌡️ Temperature: ${w.temp}°C\n` +
          `🤔 Feels like: ${w.feels}°C\n` +
          `💧 Humidity: ${w.humidity}%\n` +
          `💨 Wind: ${w.wind} km/h\n` +
          `☀️ UV Index: ${w.uv}\n` +
          `📝 ${w.desc}\n\n` +
          `${cfg.footer}`
        );
      } catch (e) {
        await m.react('❌');
        return m.reply(
          `❌ Weather not found for: *${city}*\n\n` +
          `Try: *.weather* Colombo\n\n` +
          `${cfg.footer}`
        );
      }
    }

    // ── Sinhala lyrics ────────────────────────────────────────
    if (cmd === 'sinhalalyrics' || cmd === 'lyrics') {
      if (!text) return m.reply(
        `📌 Usage: *.lyrics* [song name]\n` +
        `Example: *.lyrics* Sudu Mudu Sihinaye\n\n` +
        `${cfg.footer}`
      );
      await m.react('🎵');
      try {
        const results = await getSinhalaLyrics(text);
        if (!results.length) throw new Error('Not found');
        const list = results.map((r, i) =>
          `${i + 1}. *${r.title}*\n   🔗 ${r.link}`
        ).join('\n\n');
        await m.react('✅');
        return m.reply(
          `🎵 *Sinhala Lyrics: ${text}*\n\n` +
          `${list}\n\n` +
          `${cfg.footer}`
        );
      } catch (e) {
        await m.react('❌');
        return m.reply(
          `❌ Lyrics not found: *${text}*\n\n${cfg.footer}`
        );
      }
    }

    // ── Holidays ──────────────────────────────────────────────
    if (cmd === 'holiday' || cmd === 'holidays') {
      const today = new Date();
      const upcoming = SL_HOLIDAYS_2025
        .filter(h => new Date(h.date) >= today)
        .slice(0, 5);

      const next = upcoming[0];
      const daysLeft = next
        ? Math.ceil((new Date(next.date) - today) / (1000 * 60 * 60 * 24))
        : 0;

      const list = upcoming.map(h => {
        const d = new Date(h.date);
        return `📅 *${h.name}*\n   ${d.toLocaleDateString('en-LK')}`;
      }).join('\n\n');

      return m.reply(
        `🇱🇰 *Sri Lanka Holidays 2025*\n\n` +
        `${list}\n\n` +
        `${next ? `⏰ Next holiday in *${daysLeft} days*` : ''}\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Cinema ────────────────────────────────────────────────
    if (cmd === 'cinema') {
      await m.react('🎬');
      try {
        const r = await axios.get('https://www.cinecity.lk/', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 15000,
        });
        const $ = cheerio.load(r.data);
        const movies = [];
        $('div.movie-item, div.film').each((i, el) => {
          const title = $(el).find('h3, h2, .title').first().text().trim();
          if (title) movies.push(title);
        });

        if (!movies.length) throw new Error('No movies found');

        const list = [...new Set(movies)].slice(0, 8)
          .map((m, i) => `${i + 1}. *${m}*`)
          .join('\n');

        await m.react('✅');
        return m.reply(
          `🎬 *Now Showing in Sri Lanka*\n\n` +
          `${list}\n\n` +
          `🔗 cinecity.lk\n\n` +
          `${cfg.footer}`
        );
      } catch (e) {
        await m.react('❌');
        return m.reply(
          `❌ Cinema data unavailable.\n\n` +
          `Visit: cinecity.lk\n\n` +
          `${cfg.footer}`
        );
      }
    }

    // ── Sinhala font styles ───────────────────────────────────
    if (cmd === 'sinhalafont') {
      if (!text) return m.reply(
        `📌 Usage: *.sinhalafont* [text]\n\n${cfg.footer}`
      );
      const styles = [
        `1. *${text}*`,
        `2. _${text}_`,
        `3. ~${text}~`,
        `4. \`${text}\``,
        `5. *_${text}_*`,
        `6. *~${text}~*`,
      ];
      return m.reply(
        `🔤 *Sinhala Font Styles*\n\n` +
        `${styles.join('\n')}\n\n` +
        `${cfg.footer}`
      );
    }
  },
};