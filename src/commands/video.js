'use strict';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║   🎬  UNITY-MD — VIDEO COMMANDS  v5 (2026)           ║
 * ║   APIs : Eporner (official) + HQPorner + xVideos     ║
 * ║   ONE message, 3 download buttons, auto upload       ║
 * ╚══════════════════════════════════════════════════════╝
 */

const axios    = require('axios');
const fs       = require('fs-extra');
const cfg      = require('../../config');
const { sendButtons, tmpFile } = require('./helper');

const RESULT_COUNT = 3;

// In-memory cache: sender__chat → { results, ts }
if (!global.videoResultsCache) global.videoResultsCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 min

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickMultipleRandom(arr, count) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(count, arr.length));
}
function cacheKey(sender, chat) {
  return `${sender}__${chat}`;
}

// ─── MP4 URL EXTRACTOR ────────────────────────────────────────────────────────

// ─── MP4 URL EXTRACTOR ────────────────────────────────────────────────────────

async function getEpornerMp4(videoId) {
  // Method 1: Eporner official video API
  try {
    const api = await axios.get(`https://www.eporner.com/api/v2/video/id/${videoId}/`, {
      params: { format: 'json' },
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const sources = api.data?.sources || [];
    const hd = sources.find(s => s.quality === '720p') ||
               sources.find(s => s.quality === '480p') ||
               sources[sources.length - 1];
    if (hd?.src) return hd.src;
  } catch {}

  // Method 2: Embed page scrape
  const res = await axios.get(`https://www.eporner.com/embed/${videoId}/`, {
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.eporner.com/',
    },
  });
  const html = res.data;
  const matches = [
    ...[...html.matchAll(/"(https?:\/\/[^"]+\.mp4[^"]{0,80})"/g)].map(m => m[1]),
    ...[...html.matchAll(/src:\s*['"]?(https?:\/\/[^'">\s]+\.mp4[^'">\s]*)/g)].map(m => m[1]),
    ...[...html.matchAll(/file["']?\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)/g)].map(m => m[1]),
  ].filter(u => !u.includes('thumb') && !u.includes('poster'));
  if (!matches.length) throw new Error('mp4 not found in embed');
  return matches.find(u => /720|1080/i.test(u)) || matches[0];
}

async function getEpornerMp4Fallback(pageUrl) {
  const res = await axios.get(pageUrl, {
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.eporner.com/',
    },
  });
  const matches = [
    ...[...res.data.matchAll(/"(https?:\/\/[^"]+\.mp4[^"]{0,80})"/g)].map(m => m[1]),
    ...[...res.data.matchAll(/file["']?\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)/g)].map(m => m[1]),
  ].filter(u => !u.includes('thumb') && !u.includes('poster'));
  if (!matches.length) throw new Error('mp4 not found on page');
  return matches.find(u => /720|1080/i.test(u)) || matches[0];
}

// ─── API METHODS ──────────────────────────────────────────────────────────────

async function fetchEporner({ query = '', order = 'top-weekly', gay = 0, count = RESULT_COUNT } = {}) {
  const res = await axios.get('https://www.eporner.com/api/v2/video/search/', {
    params: {
      per_page: 30, page: randomInt(1, 5),
      thumbsize: 'big', order, gay, lq: 0, format: 'json',
      query: query || pickRandom(['hot', 'sexy', 'beautiful', 'amateur', 'hd']),
    },
    timeout: 20000,
  });
  const videos = res.data?.videos || [];
  if (!videos.length) throw new Error('No videos found');
  return pickMultipleRandom(videos, count).map(v => ({
    id:       v.id || '',
    title:    v.title || 'No Title',
    duration: v.length_min ? `${v.length_min} min` : '-',
    views:    v.views ? Number(v.views).toLocaleString() : '-',
    tags:     Array.isArray(v.keywords) ? v.keywords.slice(0, 4).join(', ') : (v.keywords || '-'),
    url:      v.url ? `https://www.eporner.com${v.url}` : '',
    source:   'Eporner',
  }));
}

async function fetchHQPorner(query = '', count = RESULT_COUNT) {
  try {
    const base = 'https://hqporner.com';
    const path = query
      ? `/hdporn/${encodeURIComponent(query.replace(/\s+/g, '-'))}/`
      : `/all-porn/page/${randomInt(1, 20)}/`;
    const res = await axios.get(base + path, {
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UnityMD/5.0)' },
    });
    const html   = res.data;
    const titles = [...html.matchAll(/<h3[^>]*>([^<]{5,})<\/h3>/gi)].map(m => m[1].trim());
    const hrefs  = [...html.matchAll(/href="(\/hdporn\/[a-z0-9-]+\/)"/gi)].map(m => m[1]);
    const durs   = [...html.matchAll(/(\d{1,2}:\d{2})/g)].map(m => m[1]);
    if (!titles.length) throw new Error('parse failed');
    const indices = pickMultipleRandom([...Array(Math.min(titles.length, count * 3)).keys()], count);
    return indices.map(idx => ({
      id: '', title: titles[idx] || 'No Title', duration: durs[idx] || '-',
      views: '-', tags: '-',
      url: hrefs[idx] ? `${base}${hrefs[idx]}` : base,
      source: 'HQPorner',
    }));
  } catch {
    return fetchEporner({ query, order: 'top-monthly', count });
  }
}

async function fetchXVideos(query = '', count = RESULT_COUNT) {
  try {
    const searchQ = query || pickRandom(['amateur', 'homemade', 'hd', 'beautiful']);
    const res = await axios.get(
      `https://www.xvideos.com/?k=${encodeURIComponent(searchQ)}&p=${randomInt(0, 5)}`,
      { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UnityMD/5.0)' } }
    );
    const html   = res.data;
    const titles = [...html.matchAll(/data-title="([^"]+)"/g)].map(m => m[1]);
    const hrefs  = [...html.matchAll(/href="(\/video[^"]+)"/g)].map(m => m[1]);
    const durs   = [...html.matchAll(/(\d{1,2}:\d{2})/g)].map(m => m[1]);
    if (!titles.length) throw new Error('parse failed');
    const indices = pickMultipleRandom([...Array(Math.min(titles.length, count * 3)).keys()], count);
    return indices.map(idx => ({
      id: '', title: titles[idx] || 'No Title', duration: durs[idx] || '-',
      views: '-', tags: '-',
      url: hrefs[idx] ? `https://www.xvideos.com${hrefs[idx]}` : 'https://www.xvideos.com',
      source: 'xVideos',
    }));
  } catch {
    return fetchEporner({ query, order: 'top-weekly', count });
  }
}

// ─── COMMAND MAP ──────────────────────────────────────────────────────────────

const COMMAND_MAP = {
  video2: (q) => fetchEporner({ query: q, order: 'top-weekly' }),
  v2:     (q) => fetchEporner({ query: q, order: 'top-weekly' }),
  video3: (q) => fetchEporner({ query: q, order: 'top-monthly' }),
  v3:     (q) => fetchEporner({ query: q, order: 'top-monthly' }),
  video4: (q) => fetchHQPorner(q),
  v4:     (q) => fetchHQPorner(q),
  video5: (q) => fetchXVideos(q),
  v5:     (q) => fetchXVideos(q),
  video6: (q) => fetchEporner({ query: q, order: 'top-weekly', gay: 1 }),
  v6:     (q) => fetchEporner({ query: q, order: 'top-weekly', gay: 1 }),
  video7: (q) => fetchEporner({ query: q, order: 'top-rated' }),
  v7:     (q) => fetchEporner({ query: q, order: 'top-rated' }),
  video8: (q) => fetchEporner({ query: q, order: 'latest' }),
  v8:     (q) => fetchEporner({ query: q, order: 'latest' }),
};

// ─── DOWNLOAD + SEND ──────────────────────────────────────────────────────────

async function downloadAndSend(sock, chat, m, data) {
  const MAX_BYTES = 60 * 1024 * 1024; // 60 MB

  await sock.sendMessage(chat, { react: { text: '⏬', key: m.key } });
  await m.reply(`⏳ *Downloading...*\n\n🎬 ${data.title.slice(0, 60)}`);

  // ── Try to get direct mp4 URL ──────────────────────────────
  let mp4Url = null;

  if (data.source === 'Eporner' && data.id) {
    try { mp4Url = await getEpornerMp4(data.id); } catch {}
  }
  if (!mp4Url && data.url) {
    try { mp4Url = await getEpornerMp4Fallback(data.url); } catch {}
  }

  if (!mp4Url) {
    await sock.sendMessage(chat, { react: { text: '🔗', key: m.key } });
    return m.reply(
      `⚠️ *Direct download available නැ*\n\n` +
      `🎬 *${data.title}*\n🔗 ${data.url}\n\n` +
      `Browser open කර download කරන්න.\n\n${cfg.footer}`
    );
  }

  // ── Check file size ────────────────────────────────────────
  try {
    const head = await axios.head(mp4Url, { timeout: 10000 });
    const size  = parseInt(head.headers['content-length'] || '0', 10);
    if (size > MAX_BYTES) {
      await sock.sendMessage(chat, { react: { text: '🔗', key: m.key } });
      return m.reply(
        `⚠️ *File too large (${(size / 1024 / 1024).toFixed(1)} MB)*\n\n` +
        `WhatsApp limit 60 MB. Page link:\n🔗 ${data.url}\n\n${cfg.footer}`
      );
    }
  } catch {}

  // ── Download ───────────────────────────────────────────────
  const tmpPath = tmpFile('mp4');
  try {
    await fs.ensureDir('./temp');
    const response = await axios({
      method: 'get', url: mp4Url, responseType: 'stream',
      timeout: 120000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(tmpPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const buf = await fs.readFile(tmpPath);
    await fs.remove(tmpPath).catch(() => {});

    await sock.sendMessage(chat, {
      video:    buf,
      caption:  `🎬 *${data.title}*\n⏱️ ${data.duration}  👁️ ${data.views}  📌 ${data.source}\n\n${cfg.footer}`,
      mimetype: 'video/mp4',
    }, { quoted: m.msg });

    await sock.sendMessage(chat, { react: { text: '✅', key: m.key } });

  } catch {
    await fs.remove(tmpPath).catch(() => {});
    await sock.sendMessage(chat, { react: { text: '❌', key: m.key } });
    return m.reply(`❌ *Download failed!*\n\n🔗 ${data.url}\n\n${cfg.footer}`);
  }
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

module.exports = {
  commands: [...Object.keys(COMMAND_MAP), 'vdl_1', 'vdl_2', 'vdl_3'],

  async run({ sock, m }) {
    const cmd  = m.command;
    const chat = m.chat;

    // ── Handle download button taps ────────────────────────────
    if (cmd === 'vdl_1' || cmd === 'vdl_2' || cmd === 'vdl_3') {
      const idx    = parseInt(cmd.split('_')[1]) - 1;
      const key    = cacheKey(m.sender, chat);
      const cached = global.videoResultsCache.get(key);

      if (!cached || !cached.results?.[idx]) {
        return m.reply(`⚠️ *Results not found.*\nCommand දවත් run කරන්න.\n\n${cfg.footer}`);
      }
      if (Date.now() - cached.ts > CACHE_TTL) {
        global.videoResultsCache.delete(key);
        return m.reply(`⚠️ *Results expired (10 min).*\nCommand දවත් run කරන්න.\n\n${cfg.footer}`);
      }
      return downloadAndSend(sock, chat, m, cached.results[idx]);
    }

    // ── Handle search commands ─────────────────────────────────
    const fetchFn = COMMAND_MAP[cmd];
    if (!fetchFn) return;

    const query = m.text?.trim() || '';
    await sock.sendMessage(chat, { react: { text: '🔍', key: m.key } });

    let results;
    try {
      results = await fetchFn(query);
    } catch (err) {
      await sock.sendMessage(chat, { react: { text: '❌', key: m.key } });
      const status = err?.response?.status;
      return m.reply(
        status === 429 ? '⚠️ Too many requests. Please wait.'
        : status === 502 || status === 503 ? '⚠️ Video service unavailable. Try again.'
        : `❌ Failed to fetch video.\n\`${err.message}\``
      );
    }

    if (!results?.length) {
      await sock.sendMessage(chat, { react: { text: '❌', key: m.key } });
      return m.reply(`❌ *No results found${query ? ` for: "${query}"` : ''}*`);
    }

    // ── Store in cache ─────────────────────────────────────────
    const key = cacheKey(m.sender, chat);
    global.videoResultsCache.set(key, { results, ts: Date.now() });

    // ── Build combined message body ────────────────────────────
    const lines = results.map((d, i) =>
      `*[${i + 1}] ${d.title.slice(0, 55)}${d.title.length > 55 ? '…' : ''}*\n` +
      `⏱️ ${d.duration}  👁️ ${d.views}  📌 ${d.source}`
    ).join('\n\n');

    const bodyText =
      `🎬 *Video Results${query ? ` — "${query}"` : ''}*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${lines}\n\n` +
      `⬇️ Download button tap කරන්න`;

    // ── Send ONE message with 3 buttons ────────────────────────
    await sendButtons(sock, chat, {
      text:    bodyText,
      footer:  cfg.footer,
      buttons: [
        { label: '⬇️ Download 1', id: 'vdl_1' },
        { label: '⬇️ Download 2', id: 'vdl_2' },
        { label: '⬇️ Download 3', id: 'vdl_3' },
      ],
      quoted: m.msg,
    });

    await sock.sendMessage(chat, { react: { text: '✅', key: m.key } });
  },
};
