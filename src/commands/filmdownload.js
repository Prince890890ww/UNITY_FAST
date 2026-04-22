'use strict';
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cfg = require('../../config');
const { sendButtons, sendUrlButtons } = require('./helper');
const { getT } = require('../lang');

const TEMP_DIR = path.join(process.cwd(), 'database', 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function cleanTemp(file) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
}

function chunks(arr, n) {
  const result = [];
  for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
  return result;
}

async function sendLinkGroup(sock, chat, { header, links, footer, quoted = null }) {
  const groups = chunks(links, 3);
  for (let i = 0; i < groups.length; i++) {
    const text = i === 0 ? header : `${header} (${i + 1}/${groups.length})`;
    try {
      await sendUrlButtons(sock, chat, {
        text,
        footer,
        buttons: groups[i],
        quoted: i === 0 ? quoted : null,
      });
    } catch {
      const fallback = groups[i].map((l, j) => `${j + 1}. ${l.label}\n   ${l.url}`).join('\n\n');
      await sock.sendMessage(chat, { text: `${text}\n\n${fallback}\n\n${footer}` }, { quoted: i === 0 ? quoted : null });
    }
    await new Promise(r => setTimeout(r, 600));
  }
}

// ── Film Info Search ──────────────────────────────────────────
async function searchFilmInfo(query) {
  const enc = encodeURIComponent(query);
  const methods = [
    async () => {
      const r = await axios.get(
        `https://api.themoviedb.org/3/search/movie?api_key=2dca580c2a14b55200e784d157207b4d&query=${enc}&include_adult=false`,
        { timeout: 15000 }
      );
      const res = r.data?.results;
      if (!res?.length) return null;
      const sorted = res.filter(x => x.vote_count > 10).sort((a, b) => b.popularity - a.popularity);
      const list = (sorted.length ? sorted : res).slice(0, 5);
      return list.map(x => ({
        title: x.title,
        year: x.release_date?.split('-')[0] || 'N/A',
        rating: x.vote_average?.toFixed(1) || 'N/A',
        thumb: x.poster_path ? `https://image.tmdb.org/t/p/w500${x.poster_path}` : null,
        tmdb_id: String(x.id),
        source: 'TMDB',
      }));
    },
    async () => {
      const r = await axios.get(`https://www.omdbapi.com/?t=${enc}&type=movie&apikey=trilogy`, { timeout: 12000 });
      if (!r.data?.Title) return null;
      return [{
        title: r.data.Title, year: r.data.Year || 'N/A',
        rating: r.data.imdbRating || 'N/A',
        thumb: r.data.Poster !== 'N/A' ? r.data.Poster : null,
        imdb_id: r.data.imdbID, genre: r.data.Genre, runtime: r.data.Runtime,
        source: 'OMDB',
      }];
    },
    async () => {
      const r = await axios.get(`https://yts.mx/api/v2/list_movies.json?query_term=${enc}&limit=5`, { timeout: 12000 });
      const movies = r.data?.data?.movies;
      if (!movies?.length) return null;
      return movies.map(x => ({
        title: x.title_long, year: String(x.year),
        rating: String(x.rating),
        thumb: x.large_cover_image, torrents: x.torrents, source: 'YTS',
      }));
    },
    async () => [{ title: query, year: 'N/A', rating: 'N/A', source: 'Search' }],
  ];
  for (const fn of methods) { try { const r = await fn(); if (r?.length) return r; } catch {} }
  return [{ title: query, year: 'N/A', rating: 'N/A', source: 'Search' }];
}

async function getImdbId(title, year) {
  try {
    const r = await axios.get(`https://www.omdbapi.com/?t=${encodeURIComponent(title)}${year && year !== 'N/A' ? `&y=${year}` : ''}&apikey=trilogy`, { timeout: 10000 });
    return r.data?.imdbID || null;
  } catch { return null; }
}

async function getTmdbId(imdbId) {
  try {
    const r = await axios.get(`https://api.themoviedb.org/3/find/${imdbId}?api_key=2dca580c2a14b55200e784d157207b4d&external_source=imdb_id`, { timeout: 10000 });
    return String(r.data?.movie_results?.[0]?.id || '') || null;
  } catch { return null; }
}

// ── Extract download URL from various API response shapes ─────
function extractUrl(d) {
  if (!d) return null;
  if (typeof d === 'string' && d.startsWith('http')) return d;
  const candidates = [
    d.url, d.download_url, d.downloadUrl, d.link, d.stream_url,
    d.streamUrl, d.file, d.fileUrl, d.direct, d.directUrl,
    d.data?.url, d.data?.download_url, d.data?.link,
    d.result?.url, d.result?.download_url, d.result?.link,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  // Sometimes it's a nested object with quality keys e.g. { '720p': 'https://...' }
  if (typeof d === 'object') {
    for (const val of Object.values(d)) {
      if (typeof val === 'string' && val.startsWith('http')) return val;
    }
  }
  return null;
}

// ── All download APIs (updated + new) ────────────────────────
//  Returns: { url, label, quality } or null
async function tryDownloadAPIs(title, enc, imdbId, tmdbId) {
  const apiList = [
    // ── Mr Nima / Paxsenix (updated endpoints) ────────────────
    {
      label: 'Paxsenix Movie DL',
      fn: async () => {
        const r = await axios.get(`https://api.paxsenix.biz.id/movie/download?q=${enc}`, { timeout: 25000 });
        return extractUrl(r.data);
      },
    },
    {
      label: 'Paxsenix Stream',
      fn: async () => {
        const r = await axios.get(`https://api.paxsenix.biz.id/movie/stream?q=${enc}`, { timeout: 25000 });
        return extractUrl(r.data);
      },
    },
    {
      label: 'Paxsenix IMDB',
      fn: async () => {
        if (!imdbId) return null;
        const r = await axios.get(`https://api.paxsenix.biz.id/movie/download?imdb=${imdbId}`, { timeout: 25000 });
        return extractUrl(r.data);
      },
    },
    {
      label: 'Paxsenix TMDB',
      fn: async () => {
        if (!tmdbId) return null;
        const r = await axios.get(`https://api.paxsenix.biz.id/movie/download?tmdb=${tmdbId}`, { timeout: 25000 });
        return extractUrl(r.data);
      },
    },
    // ── RyzenDesu ─────────────────────────────────────────────
    {
      label: 'RyzenDesu',
      fn: async () => {
        const r = await axios.get(`https://api.ryzendesu.vip/api/downloader/movie?query=${enc}`, { timeout: 20000 });
        return extractUrl(r.data);
      },
    },
    // ── XTeam ─────────────────────────────────────────────────
    {
      label: 'XTeam',
      fn: async () => {
        const r = await axios.get(`https://api.xteam.xyz/movie?q=${enc}`, { timeout: 20000 });
        return extractUrl(r.data);
      },
    },
    // ── Agatz ─────────────────────────────────────────────────
    {
      label: 'Agatz',
      fn: async () => {
        const r = await axios.get(`https://api.agatz.xyz/api/movie?q=${enc}`, { timeout: 20000 });
        return extractUrl(r.data);
      },
    },
    // ── LolHuman ──────────────────────────────────────────────
    {
      label: 'LolHuman',
      fn: async () => {
        const r = await axios.get(`https://api.lolhuman.xyz/api/moviedl?apikey=&query=${enc}`, { timeout: 20000 });
        return extractUrl(r.data);
      },
    },
    // ── Nima API (alternative) ────────────────────────────────
    {
      label: 'Nima Movies',
      fn: async () => {
        const r = await axios.get(`https://nima-api.vercel.app/movie?q=${enc}`, { timeout: 20000 });
        return extractUrl(r.data);
      },
    },
    // ── DL-API ────────────────────────────────────────────────
    {
      label: 'DL-API',
      fn: async () => {
        const r = await axios.get(`https://api.ferryhax.my.id/api/dl/movie?query=${enc}`, { timeout: 20000 });
        return extractUrl(r.data);
      },
    },
    // ── Zoro / Uziel ──────────────────────────────────────────
    {
      label: 'Uziel API',
      fn: async () => {
        const r = await axios.get(`https://api.uzielmovie.com/movie?title=${enc}`, { timeout: 20000 });
        return extractUrl(r.data);
      },
    },
    // ── Velixapi ──────────────────────────────────────────────
    {
      label: 'Velixapi',
      fn: async () => {
        const r = await axios.get(`https://api.velixapi.com/api/movie/download?q=${enc}`, { timeout: 20000 });
        return extractUrl(r.data);
      },
    },
    // ── SiputMerah ────────────────────────────────────────────
    {
      label: 'SiputMerah',
      fn: async () => {
        const r = await axios.get(`https://apis.siputmerah.com/movie?q=${enc}`, { timeout: 20000 });
        return extractUrl(r.data);
      },
    },
    // ── IMDB-based scraper ────────────────────────────────────
    {
      label: 'IMDB Direct',
      fn: async () => {
        if (!imdbId) return null;
        const r = await axios.get(`https://api.paxsenix.biz.id/movie/download?imdb=${imdbId}`, { timeout: 25000 });
        return extractUrl(r.data);
      },
    },
  ];

  for (const api of apiList) {
    try {
      const url = await api.fn();
      if (url && typeof url === 'string' && url.startsWith('http')) {
        return { url, label: api.label };
      }
    } catch {}
  }
  return null;
}

// ── Build all link groups ─────────────────────────────────────
async function buildLinkGroups(filmInfo) {
  const title  = filmInfo.title || '';
  const enc    = encodeURIComponent(title);
  const year   = filmInfo.year;
  let imdbId   = filmInfo.imdb_id || null;
  let tmdbId   = filmInfo.tmdb_id || null;

  if (!imdbId) imdbId = await getImdbId(title, year);
  if (!tmdbId && imdbId) tmdbId = await getTmdbId(imdbId);

  // Try all download APIs
  const directResult = await tryDownloadAPIs(title, enc, imdbId, tmdbId);

  const groups = [];

  if (directResult) {
    groups.push({ type: 'direct', url: directResult.url, apiLabel: directResult.label, title });
  }

  // ── YTS torrents ───────────────────────────────────────────
  try {
    let torrents   = filmInfo.torrents;
    let movieTitle = title;
    if (!torrents?.length) {
      const r = await axios.get(`https://yts.mx/api/v2/list_movies.json?query_term=${enc}&limit=1`, { timeout: 12000 });
      const movie = r.data?.data?.movies?.[0];
      if (movie?.torrents?.length) { torrents = movie.torrents; movieTitle = movie.title_long; }
    }
    if (torrents?.length) {
      const links = [];
      for (const q of ['720p', '1080p', '2160p', '480p']) {
        const t = torrents.find(x => x.quality === q);
        if (t) links.push({
          label: `📦 ${t.quality} – ${t.size} (${t.type})`,
          url: `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movieTitle)}&tr=udp://open.demonii.com:1337/announce&tr=udp://tracker.openbittorrent.com:80`,
        });
      }
      if (links.length) groups.push({ label: '🎬 YTS Torrents', links });
    }
  } catch {}

  // ── Pirate Bay ─────────────────────────────────────────────
  try {
    const r = await axios.get(`https://apibay.org/q.php?q=${enc}&cat=207`, { timeout: 15000 });
    const res = Array.isArray(r.data)
      ? r.data.filter(t => t.info_hash && t.info_hash !== '0000000000000000000000000000000000000000' && parseInt(t.seeders) > 0)
          .sort((a, b) => parseInt(b.seeders) - parseInt(a.seeders)).slice(0, 6)
      : [];
    if (res.length) {
      groups.push({ label: '🏴‍☠️ Pirate Bay', links: res.map(t => ({
        label: `🧲 ${t.name?.slice(0, 35)}… [${(parseInt(t.size)/1073741824).toFixed(1)}GB ↑${t.seeders}]`,
        url: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(t.name)}&tr=udp://tracker.openbittorrent.com:80&tr=udp://open.demonii.com:1337`,
      }))});
    }
  } catch {}

  // ── IMDB embed streams ─────────────────────────────────────
  if (imdbId) {
    groups.push({ label: '▶️ Stream Links (IMDB)', links: [
      { label: '▶️ VidSrc HD',    url: `https://vidsrc.to/embed/movie/${imdbId}` },
      { label: '▶️ VidSrc.me',    url: `https://vidsrc.me/embed/movie?imdb=${imdbId}` },
      { label: '▶️ VidSrc.xyz',   url: `https://vidsrc.xyz/embed/movie?imdb=${imdbId}` },
      { label: '▶️ VidSrc.cc',    url: `https://vidsrc.cc/v2/embed/movie/${imdbId}` },
      { label: '▶️ 2embed',       url: `https://www.2embed.cc/embed/${imdbId}` },
      { label: '▶️ MoviesAPI',    url: `https://moviesapi.club/movie/${imdbId}` },
      { label: '▶️ SuperEmbed',   url: `https://multiembed.mov/?video_id=${imdbId}&tmdb=1` },
      { label: '▶️ Cineby',       url: `https://www.cineby.app/movie/${imdbId}` },
      { label: '▶️ Braflix',      url: `https://www.braflix.video/movie/${imdbId}` },
    ]});
  }

  // ── TMDB embed streams ─────────────────────────────────────
  if (tmdbId) {
    groups.push({ label: '▶️ Stream Links (TMDB)', links: [
      { label: '▶️ Autoembed',    url: `https://player.autoembed.cc/embed/movie/${tmdbId}` },
      { label: '▶️ EmbedSu',      url: `https://embed.su/embed/movie/${tmdbId}` },
      { label: '▶️ SmashyStream', url: `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}` },
      { label: '▶️ MultiEmbed',   url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1` },
      { label: '▶️ VidLink',      url: `https://vidlink.pro/movie/${tmdbId}` },
    ]});
  }

  // ── Archive.org ────────────────────────────────────────────
  try {
    const r = await axios.get(`https://archive.org/advancedsearch.php?q=${enc}+mediatype:movies&fl[]=identifier,title&rows=6&output=json`, { timeout: 15000 });
    const docs = r.data?.response?.docs;
    if (docs?.length) {
      groups.push({ label: '🎞️ Archive.org (Free)', links: docs.map(d => ({
        label: `🎬 ${String(d.title || d.identifier).slice(0, 40)}`,
        url: `https://archive.org/details/${d.identifier}`,
      }))});
    }
  } catch {}

  // ── SL Sites ──────────────────────────────────────────────
  groups.push({ label: '🇱🇰 Sri Lanka Sites', links: [
    { label: '🇱🇰 Cinesubz',    url: `https://cinesubz.co/?s=${enc}` },
    { label: '🇱🇰 BaiscopeLK',  url: `https://baiscopelk.com/?s=${enc}` },
    { label: '🇱🇰 SinhalaSub',  url: `https://sinhalasub.lk/?s=${enc}` },
    { label: '🇱🇰 Cineru.lk',   url: `https://cineru.lk/?s=${enc}` },
    { label: '🇱🇰 ZooLanka',    url: `https://www.zoolanka.com/?s=${enc}` },
    { label: '🇱🇰 FilmLK',      url: `https://www.filmlk.com/?s=${enc}` },
    { label: '🇱🇰 Sinhala2u',   url: `https://sinhala2u.com/?s=${enc}` },
  ]});

  // ── General streaming ──────────────────────────────────────
  groups.push({ label: '🌐 Streaming Sites', links: [
    { label: '🎬 FlixHQ',        url: `https://flixhq.to/search/${enc}` },
    { label: '🎬 FMovies',       url: `https://fmovies.ps/search?keyword=${enc}` },
    { label: '🎬 123Movies',     url: `https://ww4.123moviesfree.net/search/?s=${enc}` },
    { label: '🎬 LookMovie',     url: `https://lookmovie2.to/movies/search/?q=${enc}` },
    { label: '🎬 SolarMovie',    url: `https://solarmoviez.to/search?keyword=${enc}` },
    { label: '📥 YIFY',          url: `https://yifyhdmovies.net/search?keyword=${enc}` },
    { label: '📥 1337x',         url: `https://1337x.to/search/${enc}/1/` },
    { label: '📥 TorrentGalaxy', url: `https://torrentgalaxy.to/torrents.php?search=${enc}&cat=3` },
  ]});

  return groups;
}

// ── Download file to temp ─────────────────────────────────────
async function downloadToFile(url) {
  const tmpFile = path.join(TEMP_DIR, `film_${Date.now()}.mp4`);
  try {
    const r = await axios({
      method: 'GET', url, responseType: 'stream', timeout: 300000,
      maxContentLength: 150 * 1024 * 1024,
      headers: { 'User-Agent': UA, 'Referer': url },
    });
    const contentLen = parseInt(r.headers['content-length'] || '0');
    if (contentLen > 150 * 1024 * 1024) return null;
    const writer = fs.createWriteStream(tmpFile);
    await new Promise((res, rej) => { r.data.pipe(writer); writer.on('finish', res); writer.on('error', rej); });
    const stat = fs.statSync(tmpFile);
    if (stat.size < 500000) { cleanTemp(tmpFile); return null; }
    return tmpFile;
  } catch { cleanTemp(tmpFile); return null; }
}

module.exports = {
  commands: ['filmdownload', 'fdl', 'fdownload', 'film', 'movie'],

  async run({ sock, m }) {
    const query  = m.text?.trim();
    const chat   = m.chat;
    const tr     = await getT(m.sessionOwner);
    const footer = cfg.footer;

    if (!query) {
      return sendButtons(sock, chat, {
        text: `🎬 *Film Downloader*\n━━━━━━━━━━━━━━━━━━━━━━\n📌 Usage: *.film* [movie name]\nAliases: .film  .movie  .fdl  .fdownload\n\nExamples:\n• .film Avengers Endgame\n• .film Oppenheimer 2023\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`,
        footer, buttons: [{ label: tr('btn_menu'), id: '.menu' }], quoted: m.msg,
      });
    }

    await m.react('🎬');

    const waitMsg = await sock.sendMessage(chat, {
      text: `${tr('film_searching')}\n━━━━━━━━━━━━━━━━━━━━━━\n${tr('film_query')} *${query}*\n${tr('please_wait')}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, _noImage: true,
    }, { quoted: m.msg });

    // Step 1: Film info
    const searchResults = await searchFilmInfo(query);
    const filmInfo = searchResults?.[0] || { title: query, year: 'N/A', rating: 'N/A' };

    try {
      await sock.sendMessage(chat, {
        text: `${tr('film_found')}\n━━━━━━━━━━━━━━━━━━━━━━\n${tr('film_title')} *${filmInfo.title}*\n${tr('film_year')} ${filmInfo.year || 'N/A'}\n${tr('film_rating')} ${filmInfo.rating || 'N/A'} ⭐\n${filmInfo.genre ? `🎭 *Genre:* ${filmInfo.genre}\n` : ''}${filmInfo.runtime ? `⏱️ *Runtime:* ${filmInfo.runtime}\n` : ''}📡 *Info via:* ${filmInfo.source}\n\n${tr('film_finding_dl')}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`,
        edit: waitMsg.key,
      });
    } catch {}

    // Thumbnail
    if (filmInfo.thumb) {
      try {
        const imgBuf = await axios.get(filmInfo.thumb, { responseType: 'arraybuffer', timeout: 10000 });
        await sock.sendMessage(chat, {
          image: Buffer.from(imgBuf.data),
          caption: `🎬 *${filmInfo.title}* (${filmInfo.year || 'N/A'})\n⭐ ${filmInfo.rating || 'N/A'} | 📡 ${filmInfo.source}`,
        }, { quoted: m.msg });
      } catch {}
    }

    // Step 2: Build links + try direct download APIs
    const groups = await buildLinkGroups(filmInfo);

    if (!groups?.length) {
      await m.react('❌');
      try { await sock.sendMessage(chat, { text: `${tr('film_no_dl')} *${filmInfo.title}*\n\n${tr('film_diff_spell')}\n\n${footer}`, edit: waitMsg.key }); } catch {}
      return;
    }

    // ── Handle direct download ────────────────────────────────
    const directGroup = groups.find(g => g.type === 'direct');
    if (directGroup) {
      await m.react('⏬');
      try {
        await sock.sendMessage(chat, {
          text: `✅ *Direct link found!* (via ${directGroup.apiLabel})\n🎬 *${filmInfo.title}*\n⏬ Trying to send file directly...\n${footer}`,
          edit: waitMsg.key,
        });
      } catch {}

      const filePath = await downloadToFile(directGroup.url);
      if (filePath) {
        try {
          const stat = fs.statSync(filePath);
          if (stat.size > 100 * 1024 * 1024) {
            await sock.sendMessage(chat, {
              document: fs.readFileSync(filePath),
              mimetype: 'video/mp4',
              fileName: `${filmInfo.title}.mp4`,
              caption: `🎬 *${filmInfo.title}*\n✅ Downloaded via ${directGroup.apiLabel}!\n${footer}`,
            }, { quoted: m.msg });
          } else {
            await sock.sendMessage(chat, {
              video: fs.readFileSync(filePath),
              caption: `🎬 *${filmInfo.title}*\n✅ Downloaded via ${directGroup.apiLabel}!\n${footer}`,
              mimetype: 'video/mp4',
            }, { quoted: m.msg });
          }
          await m.react('✅');
          try { await sock.sendMessage(chat, { delete: waitMsg.key }); } catch {}
        } catch {
          // Upload failed — send as button
          await m.react('🔗');
          await sendUrlButtons(sock, chat, {
            text: `🎬 *${filmInfo.title}*\n━━━━━━━━━━━━━━━━━━━━━━\n✅ Direct link found!\n📡 Source: ${directGroup.apiLabel}\n⚠️ File too large to send directly — tap to download:`,
            footer,
            buttons: [{ label: '📥 Download Film', url: directGroup.url }],
            quoted: m.msg,
          });
          try { await sock.sendMessage(chat, { delete: waitMsg.key }); } catch {}
        } finally { cleanTemp(filePath); }
        // Also send remaining link groups after direct send
        const linkGroups = groups.filter(g => !g.type);
        if (linkGroups.length) {
          await new Promise(r => setTimeout(r, 800));
          for (const g of linkGroups) {
            const header = `🎬 *${filmInfo.title}*\n━━━━━━━━━━━━━━━━━━━━━━\n*${g.label}*`;
            await sendLinkGroup(sock, chat, { header, links: g.links, footer, quoted: m.msg });
            await new Promise(r => setTimeout(r, 700));
          }
        }
        return;
      }

      // File download failed — send direct link as button + all other groups
      await sendUrlButtons(sock, chat, {
        text: `🎬 *${filmInfo.title}*\n━━━━━━━━━━━━━━━━━━━━━━\n✅ Direct link found! (via ${directGroup.apiLabel})\nTap the button below to download:`,
        footer,
        buttons: [{ label: '📥 Download Film', url: directGroup.url }],
        quoted: m.msg,
      });
      await m.react('✅');
      try { await sock.sendMessage(chat, { delete: waitMsg.key }); } catch {}

      // Send remaining groups
      const linkGroups = groups.filter(g => !g.type);
      for (const g of linkGroups) {
        const header = `🎬 *${filmInfo.title}*\n━━━━━━━━━━━━━━━━━━━━━━\n*${g.label}*`;
        await sendLinkGroup(sock, chat, { header, links: g.links, footer, quoted: m.msg });
        await new Promise(r => setTimeout(r, 700));
      }
      return;
    }

    // ── No direct download — send all link groups ─────────────
    await m.react('🔗');
    try { await sock.sendMessage(chat, { delete: waitMsg.key }); } catch {}

    const linkGroups = groups.filter(g => !g.type);
    for (const g of linkGroups) {
      const header = `🎬 *${filmInfo.title}*\n━━━━━━━━━━━━━━━━━━━━━━\n*${g.label}*`;
      await sendLinkGroup(sock, chat, { header, links: g.links, footer, quoted: m.msg });
      await new Promise(r => setTimeout(r, 700));
    }
  },
};
