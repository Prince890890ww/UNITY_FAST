'use strict';
const axios = require('axios');
const cheerio = require('cheerio');
const cfg = require('../../config');
const { getT } = require('../lang');

async function cinesubzSearch(query) {
  const r = await axios.get(
    `https://cinesubz.co/?s=${encodeURIComponent(query)}`,
    {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    }
  );
  const $ = cheerio.load(r.data);
  const results = [];
  $('article.post').each((i, el) => {
    const title = $(el).find('h2.entry-title a').text().trim();
    const link  = $(el).find('h2.entry-title a').attr('href');
    const thumb = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
    const date  = $(el).find('.entry-date').text().trim();
    if (title && link) results.push({ title, link, thumb, date });
  });
  return results.slice(0, 8);
}

async function cinesubzGetLinks(pageUrl) {
  const r = await axios.get(pageUrl, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const $ = cheerio.load(r.data);
  const links = [];
  $('a').each((i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (
      href.includes('drive.google') ||
      href.includes('mega.nz') ||
      href.includes('mediafire') ||
      href.includes('.mp4') ||
      href.includes('gdtot') ||
      text.toLowerCase().includes('download') ||
      text.includes('1080') ||
      text.includes('720') ||
      text.includes('480')
    ) {
      if (href && !links.find(l => l.href === href)) {
        links.push({ text: text || 'Download', href });
      }
    }
  });
  const title = $('h1.entry-title').text().trim() || $('title').text().trim();
  const desc  = $('div.entry-content p').first().text().trim().slice(0, 200);
  const thumb = $('div.entry-content img').first().attr('src');
  return { title, desc, links: links.slice(0, 8), thumb };
}

module.exports = {
  commands: ['movie', 'cinesubz', 'sinhalafilm', 'film', 'sinhalamovie'],

  async run({ sock, m }) {
    const cmd   = m.command;
    const query = m.text?.trim();
    const tr    = await getT(m.sessionOwner);

    if (!query) {
      return m.reply(
        `🎬 *Cinesubz Movie Search*\n\n` +
        `📌 Usage: *.movie* [name]\n\n` +
        `Examples:\n` +
        `*.movie* Spider-Man\n` +
        `*.movie* https://cinesubz.co/...\n\n` +
        `${cfg.footer}`
      );
    }

    // Direct URL — get download links
    if (query.startsWith('http')) {
      await m.react('⏳');
      try {
        const data = await cinesubzGetLinks(query);
        if (!data.links.length) throw new Error('No download links found');
        const linkText = data.links.map((l, i) =>
          `${i + 1}. *${l.text}*\n   🔗 ${l.href}`
        ).join('\n\n');
        await m.react('✅');
        return m.reply(
          `🎬 *${data.title}*\n\n` +
          (data.desc ? `📝 ${data.desc}...\n\n` : '') +
          `*Download Links:*\n\n${linkText}\n\n` +
          `${cfg.footer}`
        );
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Failed: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // Search
    await m.react('🔍');
    try {
      const results = await cinesubzSearch(query);
      if (!results.length) {
        await m.react('❌');
        return m.reply(
          `${tr('cinesubz_notfound')} ${query}\n\n` +
          `${tr('cinesubz_try_diff')}\n\n` +
          `${cfg.footer}`
        );
      }

      const list = results.map((r, i) =>
        `${i + 1}. *${r.title}*\n` +
        `   📅 ${r.date || 'N/A'}\n` +
        `   🔗 ${r.link}`
      ).join('\n\n');

      await m.react('✅');
      return m.reply(
        `${tr('cinesubz_results')}\n` +
        `🔍 _${query}_\n\n` +
        `${list}\n\n` +
        `📌 Get links: *.movie* [URL]\n\n` +
        `${cfg.footer}`
      );
    } catch (e) {
      await m.react('❌');
      return m.reply(`❌ Search failed: ${e.message}\n\n${cfg.footer}`);
    }
  },
};