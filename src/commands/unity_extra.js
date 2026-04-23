'use strict';
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const cfg = require('../../config');
const { sendButtons } = require('./helper');
const { getT } = require('../lang');

// ── Temp dir for downloads ────────────────────────────────────
const TEMP_MEDIA_DIR = path.join(process.cwd(), 'database', 'temp');
if (!fs.existsSync(TEMP_MEDIA_DIR)) fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });

// ── Pending download state (per user) ────────────────────────
const pendingDownload = new Map();

// ── Multi-method fetch helper ─────────────────────────────────
async function tryFetch(methods) {
  for (const method of methods) {
    try { const r = await method(); if (r) return r; } catch {}
  }
  return null;
}

// ════════════════════════════════════════════════════════════
// MusicDownloader — ported from NMD AXIS (multi-method)
// ════════════════════════════════════════════════════════════
class MusicDownloader {
  constructor() {
    this.tempDir = TEMP_MEDIA_DIR;
    this.timeout = 120000;
  }

  async downloadMp3(input) {
    const methods = [
      // ── Free APIs first — work even when Railway IP is blocked ──
      { name: 'vevioz-api',              cmd: () => this._veviozApi(input) },
      { name: 'ndownloader',             cmd: () => this._nDownloader(input) },
      { name: 'cobalt-api',              cmd: () => this._cobaltApi(input) },
      { name: 'piped-api',               cmd: () => this._pipedApi(input) },
      { name: 'invidious-api',           cmd: () => this._invidiousApi(input) },
      { name: 'y2mate-audio',            cmd: () => this._y2mateAudio(input) },
      { name: 'yt5s-audio',              cmd: () => this._yt5sAudio(input) },
      { name: 'yt1s',                    cmd: () => this._yt1s(input) },
      { name: 'cnvmp3',                  cmd: () => this._cnvMp3(input) },
      { name: 'loader.to',               cmd: () => this._loaderTo(input) },
      { name: 'rapidapi-mp36',           cmd: () => this._rapidApiMp36(input) },
      { name: 'savefrom',                cmd: () => this._savefrom(input) },
      // ── yt-dlp fallbacks (may be blocked on Railway) ────────
      { name: 'yt-dlp (tv_embedded)',    cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=tv_embedded" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null` },
      { name: 'yt-dlp (android_music)',  cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=android_music" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null` },
      { name: 'yt-dlp (android)',        cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=android" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null` },
      { name: 'yt-dlp (ios)',            cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=ios" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null` },
      { name: 'yt-dlp (default)',        cmd: () => `yt-dlp -x --audio-format mp3 --audio-quality 0 "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null` },
      { name: 'ytdl-core',               cmd: () => this._ytdlCore(input) },
      { name: 'yt-dlp (mweb)',           cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=mweb" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null` },
      { name: 'yt-dlp (web)',            cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=web" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null` },
    ];
    return this._tryMethods(methods);
  }

  async searchAndDownload(query) {
    const yts = require('yt-search');
    const res = await yts(query);
    const video = res?.videos?.[0];
    if (!video) throw new Error('YouTube search returned nothing');
    const url = `https://www.youtube.com/watch?v=${video.videoId}`;
    return this.downloadMp3(url);
  }

  async downloadByUrl(url) { return this.downloadMp3(url); }

  _getVideoId(url) {
    return url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^&\n?#]+)/)?.[1] || null;
  }

  async _downloadUrlToFile(dlUrl) {
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const filePath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
    const res = await (await fetch)(dlUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
    return filePath;
  }

  async _ytdlCore(url) {
    return new Promise((resolve, reject) => {
      try {
        const ytdl = require('@distube/ytdl-core');
        const ffmpeg = require('fluent-ffmpeg');
        ytdl.getInfo(url, { requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } })
          .then(info => {
            const stream = ytdl.downloadFromInfo(info, { quality: 'highestaudio' });
            const audioPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
            ffmpeg(stream).audioBitrate(128).format('mp3').save(audioPath)
              .on('end', () => { if (fs.existsSync(audioPath)) resolve(audioPath); else reject(new Error('File not created')); })
              .on('error', reject);
          }).catch(reject);
      } catch (err) { reject(err); }
    });
  }

  async _cobaltApi(url) {
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const fn = await fetch;
    for (const inst of ['https://api.cobalt.tools', 'https://cobalt.oisd.nl']) {
      try {
        const r = await fn(`${inst}/`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ url, downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '128' }), signal: AbortSignal.timeout(12000) });
        const d = await r.json();
        if (d?.url) return await this._downloadUrlToFile(d.url);
      } catch {}
    }
    throw new Error('cobalt: all failed');
  }

  async _invidiousApi(url) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YT URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const fn = await fetch;
    for (const inst of ['https://inv.nadeko.net', 'https://invidious.privacyredirect.com']) {
      try {
        const r = await fn(`${inst}/api/v1/videos/${videoId}?fields=adaptiveFormats`, { signal: AbortSignal.timeout(8000) });
        const d = await r.json();
        const fmt = (d.adaptiveFormats || []).filter(f => f.type?.includes('audio')).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        if (fmt?.url) return await this._downloadUrlToFile(fmt.url.replace(/^https:\/\/[^/]+/, inst));
      } catch {}
    }
    throw new Error('invidious: all failed');
  }

  async _rapidApiMp36(url) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YT URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const r = await (await fetch)(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, { headers: { 'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com', 'x-rapidapi-key': '3bde5a3ca1msh6a3c2e0e02d1fdap142e7bjsn8f5a2e0e3c4a' }, signal: AbortSignal.timeout(30000) });
    const d = await r.json();
    if (!d?.link) throw new Error('no link');
    return await this._downloadUrlToFile(d.link);
  }

  async _yt1s(url) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YT URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const fn = await fetch;
    const r1 = await fn('https://yt1s.com/api/ajaxSearch/index', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, body: new URLSearchParams({ q: `https://www.youtube.com/watch?v=${videoId}`, vt: 'mp3' }), signal: AbortSignal.timeout(15000) });
    const d1 = await r1.json();
    const kId = d1?.links?.mp3?.mp3128?.k;
    if (!kId) throw new Error('no key');
    const r2 = await fn('https://yt1s.com/api/ajaxConvert/convert', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ vid: videoId, k: kId }), signal: AbortSignal.timeout(30000) });
    const d2 = await r2.json();
    if (!d2?.dlink) throw new Error('no link');
    return await this._downloadUrlToFile(d2.dlink);
  }

  async _loaderTo(url) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YT URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const fn = await fetch;
    const r = await fn(`https://loader.to/ajax/download.php?format=mp3&url=https://www.youtube.com/watch?v=${videoId}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
    const d = await r.json();
    if (!d?.success || !d?.id) throw new Error('no id');
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const r2 = await fn(`https://loader.to/ajax/progress.php?id=${d.id}`, { signal: AbortSignal.timeout(10000) });
      const d2 = await r2.json();
      if (d2?.download_url) return await this._downloadUrlToFile(d2.download_url);
    }
    throw new Error('loader.to timeout');
  }

  async _savefrom(url) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YT URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const r = await (await fetch)(`https://worker.sf-tools.com/savefrom.php?sf_url=https://www.youtube.com/watch?v=${videoId}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
    const d = await r.json();
    const link = d?.url?.[0]?.url || d?.url;
    if (!link) throw new Error('no link');
    return await this._downloadUrlToFile(link);
  }

  async _cnvMp3(url) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YT URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const r = await (await fetch)(`https://cnvmp3.com/api.php?url=https://www.youtube.com/watch?v=${videoId}&format=mp3&quality=128`, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://cnvmp3.com/' }, signal: AbortSignal.timeout(20000) });
    const d = await r.json();
    if (!d?.url) throw new Error('no link');
    return await this._downloadUrlToFile(d.url);
  }

  async _y2mateAudio(url) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YT URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const fn = await fetch;
    const r1 = await fn('https://www.y2mate.com/mates/analyzeV2/ajax', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body: new URLSearchParams({ k_query: `https://www.youtube.com/watch?v=${videoId}`, k_page: 'home', hl: 'en', q_auto: '0' }),
      signal: AbortSignal.timeout(20000),
    });
    const d1 = await r1.json();
    const mp3Links = d1?.links?.mp3;
    if (!mp3Links) throw new Error('y2mate: no mp3 links');
    const best = mp3Links['mp3128'] || mp3Links['mp3192'] || Object.values(mp3Links)[0];
    if (!best?.k) throw new Error('y2mate: no key');
    const r2 = await fn('https://www.y2mate.com/mates/convertV2/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ vid: videoId, k: best.k }),
      signal: AbortSignal.timeout(30000),
    });
    const d2 = await r2.json();
    if (!d2?.dlink) throw new Error('y2mate: no download link');
    return await this._downloadUrlToFile(d2.dlink);
  }

  async _yt5sAudio(url) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YT URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const fn = await fetch;
    for (const host of ['https://yt5s.io', 'https://yt5s.com']) {
      try {
        const r1 = await fn(`${host}/api/ajaxSearch/index`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', Referer: host },
          body: new URLSearchParams({ q: `https://www.youtube.com/watch?v=${videoId}`, vt: 'mp3' }),
          signal: AbortSignal.timeout(15000),
        });
        const d1 = await r1.json();
        const kId = d1?.links?.mp3?.mp3128?.k;
        if (!kId) continue;
        const r2 = await fn(`${host}/api/ajaxConvert/convert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ vid: videoId, k: kId }),
          signal: AbortSignal.timeout(30000),
        });
        const d2 = await r2.json();
        if (d2?.dlink) return await this._downloadUrlToFile(d2.dlink);
      } catch {}
    }
    throw new Error('yt5s: all failed');
  }

  async _veviozApi(url) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YT URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const fn = await fetch;
    // Step 1: get download link
    const r1 = await fn(`https://api.vevioz.com/api/button/mp3/${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    const d1 = await r1.json();
    const dlUrl = d1?.url || d1?.link || d1?.download;
    if (!dlUrl) throw new Error('vevioz: no url');
    return await this._downloadUrlToFile(dlUrl);
  }

  async _nDownloader(url) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YT URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const fn = await fetch;
    for (const host of [
      'https://ndownloader.xyz',
      'https://ytmp3x.com',
    ]) {
      try {
        const r = await fn(`${host}/api?url=https://www.youtube.com/watch?v=${videoId}&format=mp3`, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': host },
          signal: AbortSignal.timeout(20000),
        });
        const d = await r.json();
        const dlUrl = d?.url || d?.link || d?.download || d?.downloadUrl;
        if (dlUrl) return await this._downloadUrlToFile(dlUrl);
      } catch {}
    }
    throw new Error('ndownloader: all failed');
  }

  async _pipedApi(url) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YT URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const fn = await fetch;
    for (const inst of ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://piped-api.garudalinux.org']) {
      try {
        const r = await fn(`${inst}/streams/${videoId}`, { signal: AbortSignal.timeout(10000) });
        const d = await r.json();
        const audioStreams = d?.audioStreams || [];
        const best = audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        if (best?.url) return await this._downloadUrlToFile(best.url);
      } catch {}
    }
    throw new Error('piped: all instances failed');
  }

  async _tryMethods(methods) {
    for (const method of methods) {
      try {
        let cmd = typeof method.cmd === 'function' ? await method.cmd() : method.cmd;
        if (typeof cmd === 'string' && cmd.startsWith('/')) {
          if (fs.existsSync(cmd)) return { success: true, method: method.name, filePath: cmd, fileName: path.basename(cmd) };
          continue;
        }
        if (typeof cmd === 'string') {
          await this._exec(cmd);
          const files = fs.readdirSync(this.tempDir);
          const audioFile = files.find(f => f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.wav'));
          if (audioFile) return { success: true, method: method.name, filePath: path.join(this.tempDir, audioFile), fileName: audioFile };
        } else {
          // cmd is a Promise (internal method)
          const filePath = await cmd;
          if (filePath && fs.existsSync(filePath)) return { success: true, method: method.name, filePath, fileName: path.basename(filePath) };
        }
      } catch {}
    }
    return { success: false, error: 'All download methods failed' };
  }

  _exec(cmd) {
    return new Promise((resolve, reject) => {
      exec(cmd, { maxBuffer: 1024 * 1024 * 500, timeout: this.timeout, shell: '/bin/bash' }, (err, stdout) => {
        if (err) reject(err); else resolve(stdout);
      });
    });
  }

  cleanTemp() {
    try {
      const files = fs.readdirSync(this.tempDir);
      let size = 0;
      for (const f of files) size += fs.statSync(path.join(this.tempDir, f)).size;
      if (size > 100 * 1024 * 1024) for (const f of files) try { fs.unlinkSync(path.join(this.tempDir, f)); } catch {}
    } catch {}
  }
}

const musicDownloader = new MusicDownloader();

// ════════════════════════════════════════════════════════════
// VideoDownloader — multi-method fallback for video downloads
// ════════════════════════════════════════════════════════════
class VideoDownloader {
  constructor() {
    this.tempDir = TEMP_MEDIA_DIR;
    this.timeout = 150000;
  }

  _getVideoId(url) {
    return url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^&\n?#]+)/)?.[1] || null;
  }

  async _downloadUrlToFile(dlUrl, ext = 'mp4') {
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const filePath = path.join(this.tempDir, `video_${Date.now()}.${ext}`);
    const res = await (await fetch)(dlUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 10000) throw new Error('File too small, likely invalid');
    fs.writeFileSync(filePath, buf);
    return filePath;
  }

  _exec(cmd) {
    return new Promise((resolve, reject) => {
      exec(cmd, { maxBuffer: 1024 * 1024 * 500, timeout: this.timeout, shell: '/bin/bash' }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr?.split('\n').filter(l => l.includes('ERROR')).join(' ') || err.message));
        else resolve(stdout);
      });
    });
  }

  async _ytdlpCmd(url, outputPath, qualityFilter, extraArgs = '') {
    await this._exec(
      `yt-dlp -f "${qualityFilter}" --merge-output-format mp4 --no-playlist --no-warnings ${extraArgs} -o "${outputPath}" "${url}"`
    );
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 10000) throw new Error('yt-dlp: file not created');
    return outputPath;
  }

  async _cobaltVideo(url, quality) {
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const fn = await fetch;
    const qMap = { '144': '144', '360': '360', '720': '720' };
    for (const inst of ['https://api.cobalt.tools', 'https://cobalt.oisd.nl']) {
      try {
        const r = await fn(`${inst}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ url, videoQuality: qMap[quality] || '360', downloadMode: 'auto' }),
          signal: AbortSignal.timeout(15000),
        });
        const d = await r.json();
        if (d?.url) return await this._downloadUrlToFile(d.url);
      } catch {}
    }
    throw new Error('cobalt: all instances failed');
  }

  async _y2mateVideo(url, quality) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YouTube URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const fn = await fetch;
    const r1 = await fn('https://www.y2mate.com/mates/analyzeV2/ajax', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body: new URLSearchParams({ k_query: url, k_page: 'home', hl: 'en', q_auto: '0' }),
      signal: AbortSignal.timeout(20000),
    });
    const d1 = await r1.json();
    const links = d1?.links?.mp4;
    if (!links) throw new Error('y2mate: no mp4 links');
    // Find closest quality
    const qMap = { '144': ['144p', '144'], '360': ['360p', '360'], '720': ['720p', '720'] };
    const targets = qMap[quality] || qMap['360'];
    let chosen = null;
    for (const t of targets) { if (links[t]) { chosen = links[t]; break; } }
    if (!chosen) chosen = Object.values(links)[0];
    if (!chosen?.k) throw new Error('y2mate: no key found');
    const r2 = await fn('https://www.y2mate.com/mates/convertV2/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ vid: videoId, k: chosen.k }),
      signal: AbortSignal.timeout(30000),
    });
    const d2 = await r2.json();
    if (!d2?.dlink) throw new Error('y2mate: no download link');
    return await this._downloadUrlToFile(d2.dlink);
  }

  async _loaderToVideo(url, quality) {
    const videoId = this._getVideoId(url);
    if (!videoId) throw new Error('Invalid YouTube URL');
    const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
    const fn = await fetch;
    const formatMap = { '144': '144', '360': '360', '720': '720' };
    const fmt = formatMap[quality] || '360';
    const r = await fn(`https://loader.to/ajax/download.php?format=${fmt}&url=https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20000),
    });
    const d = await r.json();
    if (!d?.success || !d?.id) throw new Error('loader.to: no id');
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const r2 = await fn(`https://loader.to/ajax/progress.php?id=${d.id}`, { signal: AbortSignal.timeout(10000) });
      const d2 = await r2.json();
      if (d2?.download_url) return await this._downloadUrlToFile(d2.download_url);
    }
    throw new Error('loader.to: timeout');
  }

  async _ytdlCoreVideo(url, quality) {
    return new Promise((resolve, reject) => {
      try {
        const ytdl = require('@distube/ytdl-core');
        const ffmpeg = require('fluent-ffmpeg');
        const qMap = { '144': '144p', '360': '360p', '720': '720p' };
        const outputPath = path.join(this.tempDir, `video_${Date.now()}.mp4`);
        ytdl.getInfo(url, { requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } })
          .then(info => {
            const format = ytdl.chooseFormat(info.formats, {
              quality: qMap[quality] || '360p',
              filter: 'videoandaudio',
            });
            const stream = ytdl.downloadFromInfo(info, { format });
            ffmpeg(stream).outputOptions('-c copy').save(outputPath)
              .on('end', () => {
                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000) resolve(outputPath);
                else reject(new Error('ytdl-core: file not created'));
              })
              .on('error', reject);
          }).catch(reject);
      } catch (err) { reject(err); }
    });
  }

  async download(url, quality) {
    const outputPath = path.join(this.tempDir, `video_${Date.now()}.mp4`);
    const qMap = {
      '144': 'bestvideo[height<=144][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=144]+bestaudio/worst[ext=mp4]/worst',
      '360': 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360][ext=mp4]/best[height<=360]',
      '720': 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720][ext=mp4]/best[height<=720]',
    };
    const qFilter = qMap[quality] || qMap['360'];

    const methods = [
      { name: 'yt-dlp (default)',      fn: () => this._ytdlpCmd(url, outputPath, qFilter) },
      { name: 'yt-dlp (android)',      fn: () => this._ytdlpCmd(url, outputPath, qFilter, '--extractor-args "youtube:player_client=android"') },
      { name: 'yt-dlp (web)',          fn: () => this._ytdlpCmd(url, outputPath, qFilter, '--extractor-args "youtube:player_client=web"') },
      { name: 'yt-dlp (ios)',          fn: () => this._ytdlpCmd(url, outputPath, qFilter, '--extractor-args "youtube:player_client=ios"') },
      { name: 'yt-dlp (tv_embedded)',  fn: () => this._ytdlpCmd(url, outputPath, qFilter, '--extractor-args "youtube:player_client=tv_embedded"') },
      { name: 'cobalt-api',            fn: () => this._cobaltVideo(url, quality) },
      { name: 'y2mate-api',            fn: () => this._y2mateVideo(url, quality) },
      { name: 'loader.to',             fn: () => this._loaderToVideo(url, quality) },
      { name: 'ytdl-core',             fn: () => this._ytdlCoreVideo(url, quality) },
    ];

    for (const method of methods) {
      try {
        const filePath = await method.fn();
        if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).size > 10000) {
          return { success: true, method: method.name, filePath };
        }
      } catch {}
    }
    return { success: false, error: 'All video download methods failed' };
  }
}

const videoDownloader = new VideoDownloader();

// ── Anime GIF helper ──────────────────────────────────────────
async function getAnimeGif(action) {
  return tryFetch([
    async () => { const r = await axios.get(`https://api.otakugifs.xyz/gif?reaction=${action}`, { timeout: 10000 }); return r.data?.url || null; },
    async () => { const r = await axios.get(`https://nekos.life/api/v2/img/${action}`, { timeout: 10000 }); return r.data?.url || null; },
    async () => { const r = await axios.get(`https://api.waifu.pics/sfw/${action}`, { timeout: 10000 }); return r.data?.url || null; },
    async () => { const r = await axios.get(`https://some-random-api.com/animu/${action}`, { timeout: 10000 }); return r.data?.link || null; },
    async () => { const r = await axios.get(`https://nekos.best/api/v2/${action}`, { timeout: 10000 }); return r.data?.results?.[0]?.url || null; },
  ]);
}

// ── Misc image generators ─────────────────────────────────────
async function getMiscImage(type, params = {}) {
  return tryFetch([
    async () => {
      const base = 'https://api.paxsenix.biz.id';
      const endpoints = {
        tweet:     `${base}/tools/tweet?username=${params.username || 'User'}&tweet=${encodeURIComponent(params.text || '')}`,
        ytcomment: `${base}/tools/ytcomment?username=${params.username || 'User'}&comment=${encodeURIComponent(params.text || '')}`,
        jail:      `${base}/overlay/jail?image=${params.imageUrl || ''}`,
        triggered: `${base}/overlay/triggered?image=${params.imageUrl || ''}`,
        wasted:    `${base}/overlay/wasted?image=${params.imageUrl || ''}`,
        ship:      `${base}/tools/ship?user1=${params.user1 || ''}&user2=${params.user2 || ''}`,
        namecard:  `${base}/tools/namecard?name=${params.name || ''}&subtitle=${params.subtitle || ''}`,
        oogway:    `${base}/canvas/oogway?quote=${encodeURIComponent(params.text || '')}`,
      };
      if (!endpoints[type]) return null;
      const r = await axios.get(endpoints[type], { responseType: 'arraybuffer', timeout: 15000 });
      return Buffer.from(r.data);
    },
    async () => {
      const base = 'https://some-random-api.com';
      const endpoints = { jail: `${base}/canvas/jail?avatar=${params.imageUrl}`, tweet: `${base}/canvas/tweet?username=${params.username || 'User'}&tweet=${encodeURIComponent(params.text || '')}` };
      if (!endpoints[type]) return null;
      const r = await axios.get(endpoints[type], { responseType: 'arraybuffer', timeout: 15000 });
      return Buffer.from(r.data);
    },
  ]);
}

const RAPID_KEY = '3bde5a3ca1msh6a3c2e0e02d1fdap142e7bjsn8f5a2e0e3c4a';

// ════════════════════════════════════════════════════════════════
// TikTok Downloader — ported from NMD-AXIS (10 fallback methods)
// ════════════════════════════════════════════════════════════════
async function tiktokDownload(url) {
  const nfetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

  // Resolve short links (vt.tiktok, vm.tiktok)
  let resolvedUrl = url;
  let videoId = url.match(/\/video\/(\d+)/)?.[1] || null;
  if (!videoId) {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'TikTok/26.2.0 (iPhone; iOS 17.0; Scale/3.00)',
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36',
    ]) {
      try {
        const r = await (await nfetch)(url, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': ua } });
        const ru = r.url || '';
        if (ru.includes('/video/')) { resolvedUrl = ru; videoId = ru.match(/\/video\/(\d+)/)?.[1] || null; break; }
      } catch {}
    }
  }
  const _url = resolvedUrl || url;

  const methods = [
    // 1: tikwm (original url)
    { name: 'tikwm-orig', fn: async () => {
      const fn = await nfetch;
      const r = await fn('https://tikwm.com/api/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, body: new URLSearchParams({ url, count: '12', cursor: '0', web: '1', hd: '1' }), signal: AbortSignal.timeout(25000) });
      const d = (await r.json())?.data; if (!d) throw new Error('no data');
      if (d.images?.length) return { type: 'slideshow', items: d.images, audio: d.music, title: d.title || '', author: d.author?.nickname || '' };
      let v = d.hdplay || d.play; if (!v) throw new Error('no url');
      let vWm = d.play || v;
      if (v.startsWith('/')) v = 'https://tikwm.com' + v;
      if (vWm.startsWith('/')) vWm = 'https://tikwm.com' + vWm;
      return { type: 'video', url: v, urlWatermark: vWm, title: d.title || '', author: d.author?.nickname || '' };
    }},
    // 2: tikwm (resolved url)
    { name: 'tikwm-resolved', fn: async () => {
      if (_url === url) throw new Error('same, skip');
      const fn = await nfetch;
      const r = await fn('https://tikwm.com/api/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, body: new URLSearchParams({ url: _url, count: '12', cursor: '0', web: '1', hd: '1' }), signal: AbortSignal.timeout(25000) });
      const d = (await r.json())?.data; if (!d) throw new Error('no data');
      if (d.images?.length) return { type: 'slideshow', items: d.images, audio: d.music, title: d.title || '', author: d.author?.nickname || '' };
      let v = d.hdplay || d.play; if (!v) throw new Error('no url');
      if (v.startsWith('/')) v = 'https://tikwm.com' + v;
      return { type: 'video', url: v, title: d.title || '', author: d.author?.nickname || '' };
    }},
    // 3: TikTok official API v2
    { name: 'tiktok-api-v2', fn: async () => {
      if (!videoId) throw new Error('no id');
      const fn = await nfetch;
      const r = await fn(`https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}&iid=7318518857994389254&device_id=7318517321748022790&channel=googleplay&app_name=musical_ly&version_code=300904&device_platform=android&device_type=Pixel+7`, { headers: { 'User-Agent': 'okhttp/4.9.0' }, signal: AbortSignal.timeout(20000) });
      const data = await r.json(); const v = data?.aweme_list?.[0]; if (!v) throw new Error('no data');
      const pu = v.video?.play_addr_h264?.url_list?.[0] || v.video?.download_addr?.url_list?.[0]; if (!pu) throw new Error('no url');
      return { type: 'video', url: pu, title: v.desc || '', author: v.author?.nickname || '' };
    }},
    // 4: TikTok API alisg
    { name: 'tiktok-api-alisg', fn: async () => {
      if (!videoId) throw new Error('no id');
      const fn = await nfetch;
      const r = await fn(`https://api22-normal-c-alisg.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}&iid=7318518857994389254&device_id=7318517321748022790&channel=googleplay&app_name=musical_ly&version_code=300904&device_platform=android`, { headers: { 'User-Agent': 'okhttp/4.9.0' }, signal: AbortSignal.timeout(20000) });
      const data = await r.json(); const v = data?.aweme_list?.[0]; if (!v) throw new Error('no data');
      const pu = v.video?.play_addr?.url_list?.[0] || v.video?.download_addr?.url_list?.[0]; if (!pu) throw new Error('no url');
      return { type: 'video', url: pu, title: v.desc || '', author: v.author?.nickname || '' };
    }},
    // 5: ssstik
    { name: 'ssstik', fn: async () => {
      const fn = await nfetch;
      const h1 = await (await fn('https://ssstik.io/en', { signal: AbortSignal.timeout(12000) })).text();
      const token = h1.match(/s_tt\s*=\s*"([^"]+)"/)?.[1]; if (!token) throw new Error('no token');
      const h2 = await (await fn('https://ssstik.io/abc?url=dl', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://ssstik.io/en' }, body: new URLSearchParams({ id: url, locale: 'en', tt: token }), signal: AbortSignal.timeout(30000) })).text();
      const u = h2.match(/href="(https:\/\/tikcdn[^"]+\.mp4[^"]*)"/)?.[1] || h2.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/)?.[1]; if (!u) throw new Error('no link');
      return { type: 'video', url: u, title: '', author: '' };
    }},
    // 6: snaptik
    { name: 'snaptik', fn: async () => {
      const fn = await nfetch;
      const h1 = await (await fn('https://snaptik.app/en', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) })).text();
      const token = h1.match(/name="token"\s+value="([^"]+)"/)?.[1]; if (!token) throw new Error('no token');
      const d = await (await fn('https://snaptik.app/action_v2.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://snaptik.app/' }, body: new URLSearchParams({ url, token, lang: 'en' }), signal: AbortSignal.timeout(25000) })).json();
      const links = [...(d?.data || '').matchAll(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/g)].map(m => m[1]); if (!links.length) throw new Error('no links');
      return { type: 'video', url: links[0], title: '', author: '' };
    }},
    // 7: musicaldown
    { name: 'musicaldown', fn: async () => {
      const fn = await nfetch;
      const h1 = await (await fn('https://musicaldown.com/en', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) })).text();
      const inputs = [...h1.matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/g)].reduce((a, m) => ({ ...a, [m[1]]: m[2] }), {}); inputs.link = _url;
      const h2 = await (await fn('https://musicaldown.com/download', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://musicaldown.com/en' }, body: new URLSearchParams(inputs), signal: AbortSignal.timeout(25000) })).text();
      const u = h2.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/)?.[1]; if (!u) throw new Error('no link');
      return { type: 'video', url: u, title: '', author: '' };
    }},
    // 8: tikmate
    { name: 'tikmate', fn: async () => {
      const fn = await nfetch;
      const d = await (await fn('https://api.tikmate.app/api/lookup', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ url }), signal: AbortSignal.timeout(20000) })).json();
      if (!d?.token || !d?.id) throw new Error('no token');
      const u = `https://api.tikmate.app/api/download?id=${d.id}&token=${d.token}&hd=1`;
      return { type: 'video', url: u, title: d.text || '', author: d.authorName || '' };
    }},
    // 9: cobalt
    { name: 'cobalt', fn: async () => {
      const fn = await nfetch;
      for (const inst of ['https://api.cobalt.tools', 'https://cobalt.oisd.nl', 'https://cobalt-api.hydrax.net']) {
        try {
          const d = await (await fn(`${inst}/`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ url, downloadMode: 'auto', videoQuality: '720' }), signal: AbortSignal.timeout(15000) })).json();
          if (d?.url) return { type: 'video', url: d.url, title: '', author: '' };
        } catch {}
      }
      throw new Error('all cobalt failed');
    }},
    // 10: rapidapi-tiktok-scraper
    { name: 'rapidapi-tiktok', fn: async () => {
      const fn = await nfetch;
      const d = await (await fn(`https://tiktok-scraper7.p.rapidapi.com/video/info?url=${encodeURIComponent(url)}&hd=1`, { headers: { 'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com', 'x-rapidapi-key': RAPID_KEY }, signal: AbortSignal.timeout(25000) })).json();
      const u = d?.data?.hdplay || d?.data?.play; if (!u) throw new Error('no url');
      return { type: 'video', url: u, urlWatermark: d?.data?.wmplay, title: d?.data?.title || '', author: d?.data?.author?.nickname || '' };
    }},
  ];

  for (const { name, fn } of methods) {
    try {
      const result = await fn();
      if (result) { console.log(`[TT] success: ${name}`); return result; }
    } catch (e) { console.log(`[TT] ${name} failed: ${e.message}`); }
  }
  throw new Error('All TikTok download methods failed');
}

const ANIME_CMDS = [
  'neko', 'waifu', 'nom', 'poke', 'cry', 'kiss', 'pat', 'hug', 'wink',
  'facepalm', 'loli', 'punch', 'slap', 'dance', 'happy', 'blush',
  // New reactions from 5993-95 bot
  'cuddle', 'bully', 'awoo', 'lick', 'smug', 'bonk', 'yeet', 'glomp',
  'bite', 'cringe', 'wave', 'smile', 'highfive', 'handhold', 'kill',
];
const TEXT_ART_CMDS = ['metallic', 'ice', 'snow', 'impressive', 'matrix', 'light', 'neon', 'devil', 'purple', 'thunder', 'leaves', '1917', 'arena', 'hacker', 'sand', 'blackpink', 'fire'];
const OVERLAY_CMDS = ['heart', 'circle', 'lgbt', 'horny', 'lolice', 'gay', 'glass', 'passed'];

module.exports = {
  commands: [
    'cinfo', 'screenshot', 'ss', 'privacy',
    'oogway', 'tweet', 'ytcomment', 'jail', 'triggered', 'namecard',
    'character', 'goodnight', 'roseday', 'shayari', 'its-so-stupid', 'comrade',
    'blur', 'simage',
    'gpt', 'llama3', 'chatai', 'imagine', 'flux', 'sora',
    'mp3', 'song', 'play', 'ytmp3', 'mp4', 'video', 'ytmp4', 'ytvideo',
    'tiktok', 'tt', 'ttdl', 'ttmp4',
    '_tt_nowm', '_tt_wm',
    'apk', 'apkdl',
    '_dl_mp3', '_dl_vn', '_dl_doc', '_dl_144', '_dl_360', '_dl_720', '_dl_d144', '_dl_d360', '_dl_d720',
    ...ANIME_CMDS,
    ...TEXT_ART_CMDS,
    ...OVERLAY_CMDS,
  ],

  // Expose pendingDownload so messageHandler can check button clicks
  pendingDownload,

  async run({ sock, m, cfg: _cfg }) {
    const cmd  = m.command;
    const chat = m.chat;
    const q    = m.text?.trim() || '';
    const footer = cfg.footer;

    // ════════════════════════════════════════════════════════
    // PENDING DOWNLOAD BUTTON HANDLER (__dl_* commands)
    // ════════════════════════════════════════════════════════
    if (cmd.startsWith('_dl_')) {
      const type = cmd.replace('_dl_', '');  // mp3 / vn / doc / 144 / 360 / 720 / d144 / d360 / d720
      const videoUrl = q;
      const pending = pendingDownload.get(m.sender);

      if (!videoUrl && !pending) return;

      const displayTitle = pending?.displayTitle || 'Media';
      const btnKey       = pending?.btnKey || null;

      // Clean up pending
      pendingDownload.delete(m.sender);

      // Delete button message
      if (btnKey) try { await sock.sendMessage(chat, { delete: btnKey }); } catch {}

      // ── Audio types ──────────────────────────────────────
      if (['mp3', 'vn', 'doc'].includes(type)) {
        const fmtName = type === 'mp3' ? '🎵 MP3 Audio' : type === 'vn' ? '🎤 Voice Note' : '📄 Document';

        // Send fresh Downloading status message
        const statusMsg = await sock.sendMessage(chat, {
          text: `⬇️ *Downloading...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎵 *Song:* ${displayTitle}\n🎶 *Format:* ${fmtName}\n⏳ Connecting...\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, _noImage: true
        }, { quoted: m.msg });
        const statusKey = statusMsg?.key || null;

        try {
          let result;
          if (videoUrl && videoUrl.match(/https?:\/\//)) result = await musicDownloader.downloadByUrl(videoUrl);
          else if (pending?.input) result = await musicDownloader.searchAndDownload(pending.input);
          else return;

          if (!result?.success) {
            if (statusKey) try { await sock.sendMessage(chat, { text: `❌ *Download Failed!*\n━━━━━━━━━━━━━━━━━━━━━━\n🎵 ${displayTitle}\n⚠️ ${result?.error || 'Error'}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}
            return;
          }

          const fileSizeMB = (fs.statSync(result.filePath).size / (1024 * 1024)).toFixed(2);

          // Uploading msg
          if (statusKey) try { await sock.sendMessage(chat, { text: `📤 *Uploading...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎵 *Song:* ${displayTitle}\n🎶 *Format:* ${fmtName}\n⏳ Sending to WhatsApp...\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}

          const audioBuffer = fs.readFileSync(result.filePath);

          if (type === 'mp3') {
            await sock.sendMessage(chat, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: false, fileName: `${displayTitle.substring(0, 40)}.mp3` }, { quoted: m.msg });
          } else if (type === 'vn') {
            await sock.sendMessage(chat, { audio: audioBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: m.msg });
          } else {
            await sock.sendMessage(chat, { document: audioBuffer, mimetype: 'audio/mpeg', fileName: `${displayTitle.substring(0, 40)}.mp3`, caption: `🎵 *${displayTitle}*\n${footer}` }, { quoted: m.msg });
          }

          try { fs.unlinkSync(result.filePath); } catch {}

          // Done msg — delete after 10s
          if (statusKey) try { await sock.sendMessage(chat, { text: `✅ *Done!*\n━━━━━━━━━━━━━━━━━━━━━━\n🎵 *Song:* ${displayTitle}\n🎶 *Format:* ${fmtName}\n📦 *Size:* ${fileSizeMB} MB\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}
          setTimeout(() => { try { sock.sendMessage(chat, { delete: statusKey }); } catch {} }, 10000);

        } catch (err) {
          if (statusKey) try { await sock.sendMessage(chat, { text: `❌ *Error!*\n━━━━━━━━━━━━━━━━━━━━━━\n⚠️ ${err.message?.substring(0, 150)}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}
        }
        return;
      }

      // ── Video types ──────────────────────────────────────
      if (['144', '360', '720', 'd144', 'd360', 'd720'].includes(type)) {
        const isDoc    = type.startsWith('d');
        const quality  = type.replace('d', '');
        const fmtName  = `${quality}p${isDoc ? ' (Document)' : ''}`;

        // Send fresh Downloading status message
        const statusMsg = await sock.sendMessage(chat, {
          text: `⬇️ *Downloading Video...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎬 *Video:* ${displayTitle}\n📺 *Quality:* ${fmtName}\n⏳ Fetching...\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, _noImage: true
        }, { quoted: m.msg });
        const statusKey = statusMsg?.key || null;

        try {
          // Update status with method attempts
          if (statusKey) try { await sock.sendMessage(chat, { text: `⬇️ *Downloading Video...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎬 *Video:* ${displayTitle}\n📺 *Quality:* ${fmtName}\n⏳ Trying multiple methods...\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}

          const result = await videoDownloader.download(videoUrl, quality);

          if (!result.success) {
            if (statusKey) try { await sock.sendMessage(chat, { text: `❌ *Video Error!*\n━━━━━━━━━━━━━━━━━━━━━━\n⚠️ All download methods failed\n💡 Try a different quality or video\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}
            return;
          }

          const outputPath = result.filePath;
          const fileStat   = fs.statSync(outputPath);
          const fileSizeMB = (fileStat.size / (1024 * 1024)).toFixed(1);

          if (parseFloat(fileSizeMB) > 150) {
            try { fs.unlinkSync(outputPath); } catch {}
            if (statusKey) try { await sock.sendMessage(chat, { text: `❌ *File too large!*\n━━━━━━━━━━━━━━━━━━━━━━\n📦 Size: ${fileSizeMB}MB (Limit: 150MB)\n💡 Try 144p or 360p\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}
            return;
          }

          // Uploading msg
          if (statusKey) try { await sock.sendMessage(chat, { text: `📤 *Uploading...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎬 *Video:* ${displayTitle}\n📺 *Quality:* ${fmtName}\n📦 *Size:* ${fileSizeMB}MB\n⏳ Sending...\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}

          const videoBuffer = fs.readFileSync(outputPath);
          try { fs.unlinkSync(outputPath); } catch {}

          const caption = `🎬 *${displayTitle}*\n📺 Quality: ${fmtName}\n📦 Size: ${fileSizeMB}MB\n🔧 via: ${result.method}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`;
          if (isDoc) {
            await sock.sendMessage(chat, { document: videoBuffer, mimetype: 'video/mp4', fileName: `${displayTitle.substring(0, 40)}.mp4`, caption }, { quoted: m.msg });
          } else {
            await sock.sendMessage(chat, { video: videoBuffer, caption }, { quoted: m.msg });
          }

          // Done msg — delete after 10s
          if (statusKey) try { await sock.sendMessage(chat, { text: `✅ *Done!*\n━━━━━━━━━━━━━━━━━━━━━━\n🎬 *Video:* ${displayTitle}\n📺 *Quality:* ${fmtName}\n📦 *Size:* ${fileSizeMB}MB\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}
          setTimeout(() => { try { sock.sendMessage(chat, { delete: statusKey }); } catch {} }, 10000);

        } catch (err) {
          const friendly = err.message?.includes('ffmpeg') ? 'ffmpeg not installed'
            : err.message?.includes('unavailable') ? 'Video unavailable or private'
            : err.message?.substring(0, 150);
          if (statusKey) try { await sock.sendMessage(chat, { text: `❌ *Video Error!*\n━━━━━━━━━━━━━━━━━━━━━━\n⚠️ ${friendly}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}
        }
        return;
      }
    }

    // ════════════════════════════════════════════════════════
    // TIKTOK BUTTON HANDLER (_tt_nowm / _tt_wm)
    // ════════════════════════════════════════════════════════
    if (cmd === '_tt_nowm' || cmd === '_tt_wm') {
      const isNoWm  = cmd === '_tt_nowm';
      const pending = pendingDownload.get(m.sender);
      const ttUrl   = q || pending?.url;
      if (!ttUrl) return;

      const btnKey = pending?.btnKey || null;
      if (btnKey) try { await sock.sendMessage(chat, { delete: btnKey }); } catch {}
      pendingDownload.delete(m.sender);

      const statusMsg = await sock.sendMessage(chat, {
        text: `⬇️ *Downloading...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎵 *TikTok Video*\n${isNoWm ? '✅ Watermark නැතිව' : '💧 Watermark සමඟ'}\n⏳ Please wait...\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, _noImage: true,
      }, { quoted: pending?.quotedMsg || m.msg });
      const statusKey = statusMsg?.key || null;

      try {
        const hasil = await tiktokDownload(ttUrl);
        const nfetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

        const fixUrl = (u) => {
          if (!u) return null;
          if (u.startsWith('http')) return u;
          if (u.startsWith('/')) return 'https://tikwm.com' + u;
          return null;
        };

        if (hasil.type === 'slideshow') {
          try { await sock.sendMessage(chat, { text: `📸 *Slideshow (${hasil.items.length} images)*\n🎵 ${hasil.title || ''}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}
          for (const imgUrl of hasil.items) {
            const fu = fixUrl(imgUrl);
            if (fu) await sock.sendMessage(chat, { image: { url: fu }, caption: hasil.title || '' }, { quoted: m.msg }).catch(() => {});
          }
          try { await sock.sendMessage(chat, { text: `✅ *Done!*\n━━━━━━━━━━━━━━━━━━━━━━\n📸 ${hasil.items.length} images sent\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}
        } else {
          const rawUrl   = isNoWm ? hasil.url : (hasil.urlWatermark || hasil.url);
          const videoUrl = fixUrl(rawUrl);
          if (!videoUrl) throw new Error('Invalid video URL');

          try { await sock.sendMessage(chat, { text: `⬇️ *Downloading...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎵 ${hasil.title || 'TikTok Video'}\n👤 ${hasil.author || ''}\n⏳ Buffering...\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}

          let videoPayload;
          try {
            const vRes = await (await nfetch)(videoUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tiktok.com/' }, signal: AbortSignal.timeout(60000) });
            if (!vRes.ok) throw new Error(`HTTP ${vRes.status}`);
            const vBuf = Buffer.from(await vRes.arrayBuffer());
            if (vBuf.length < 10000) throw new Error('file too small');
            videoPayload = vBuf;
          } catch (dlErr) {
            console.log('[TT] buffer fail, using url:', dlErr.message);
            videoPayload = { url: videoUrl };
          }

          try { await sock.sendMessage(chat, { text: `⬆️ *Uploading...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎵 ${hasil.title || 'TikTok Video'}\n⏳ Sending...\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}

          await sock.sendMessage(chat, {
            video: videoPayload,
            caption: `🎵 *${hasil.title || 'TikTok Video'}*\n👤 ${hasil.author || ''}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`,
            mimetype: 'video/mp4',
          }, { quoted: pending?.quotedMsg || m.msg });

          try { await sock.sendMessage(chat, { text: `✅ *Done!*\n━━━━━━━━━━━━━━━━━━━━━━\n🎵 ${hasil.title || 'TikTok Video'}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}
        }
        setTimeout(() => { try { sock.sendMessage(chat, { delete: statusKey }); } catch {} }, 15000);
      } catch (err) {
        console.log('[TT] Error:', err.message);
        try { await sock.sendMessage(chat, { text: `❌ *TikTok Download Failed!*\n━━━━━━━━━━━━━━━━━━━━━━\n⚠️ ${err.message?.substring(0, 120)}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: statusKey }); } catch {}
        setTimeout(() => { try { sock.sendMessage(chat, { delete: statusKey }); } catch {} }, 20000);
      }
      return;
    }

    // ── Country Info ──────────────────────────────────────────
    if (cmd === 'cinfo') {
      if (!q) return sendButtons(sock, chat, { text: `📌 Usage: *.cinfo* [country]\n\nExample: .cinfo Sri Lanka\n\n${footer}`, footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: m.msg });
      await m.react('🌍');
      const info = await tryFetch([
        async () => {
          const r = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(q)}?fullText=false`, { timeout: 10000 });
          const c = r.data?.[0];
          if (!c) return null;
          return `🌍 *Country Info: ${c.name?.common}*\n━━━━━━━━━━━━━━━━━━━━━━\n🏳️ *Official:* ${c.name?.official}\n🗺️ *Capital:* ${c.capital?.[0] || 'N/A'}\n🌏 *Region:* ${c.region} — ${c.subregion}\n👥 *Population:* ${c.population?.toLocaleString()}\n💱 *Currency:* ${Object.values(c.currencies || {})[0]?.name || 'N/A'}\n🗣️ *Languages:* ${Object.values(c.languages || {}).join(', ')}\n📞 *Calling:* +${c.idd?.root?.replace('+', '')}${c.idd?.suffixes?.[0] || ''}\n🏖️ *Area:* ${c.area?.toLocaleString()} km²`;
        },
      ]);
      return sendButtons(sock, chat, {
        text: info ? `${info}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}` : `❌ Country "${q}" not found.\n\n${footer}`,
        footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: m.msg,
      });
    }

    // ── Screenshot ────────────────────────────────────────────
    if (cmd === 'ss' || cmd === 'screenshot') {
      if (!q || !q.match(/https?:\/\//)) return m.reply(`📌 Usage: *.ss* [URL]\n\nExample: .ss https://google.com\n\n${footer}`);
      await m.react('📸');
      const waitMsg = await sock.sendMessage(chat, { text: `📸 *Taking screenshot...*\n🔗 ${q}\n⏳ Please wait...\n${footer}`, _noImage: true }, { quoted: m.msg });
      const imgBuffer = await tryFetch([
        async () => { const r = await axios.get(`https://api.screenshotmachine.com/?key=demo&url=${encodeURIComponent(q)}&dimension=1024x768&format=jpg`, { responseType: 'arraybuffer', timeout: 20000 }); return Buffer.from(r.data); },
        async () => { const r = await axios.get(`https://image.thum.io/get/width/1280/crop/800/${encodeURIComponent(q)}`, { responseType: 'arraybuffer', timeout: 20000 }); return Buffer.from(r.data); },
        async () => { const r = await axios.get(`https://s0.wordpress.com/mshots/v1/${encodeURIComponent(q)}?w=1280`, { responseType: 'arraybuffer', timeout: 20000 }); return Buffer.from(r.data); },
      ]);
      if (imgBuffer) {
        await sock.sendMessage(chat, { image: imgBuffer, caption: `📸 *Screenshot*\n🔗 ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}` }, { quoted: m.msg });
        try { await sock.sendMessage(chat, { delete: waitMsg.key }); } catch {}
      } else {
        try { await sock.sendMessage(chat, { text: `❌ Could not take screenshot.\n\n${footer}`, edit: waitMsg.key }); } catch {}
      }
      return;
    }

    // ── Privacy Manager ───────────────────────────────────────
    if (cmd === 'privacy') {
      if (!m.isOwner) return m.reply(`🔒 Owner only command.\n\n${footer}`);

      // ── Sub-command handler (privacy settings actually applied) ──
      const args = q.split(' ');
      const sub  = args[0]?.toLowerCase();
      const val  = args[1]?.toLowerCase();

      if (sub && val) {
        try {
          const mapValue = (v) => v === 'all' ? 'all' : v === 'contacts' ? 'contacts' : 'none';
          if (sub === 'lastseen') {
            await sock.updateLastSeenPrivacy(mapValue(val));
            return m.reply(`✅ *Last Seen* set to *${val.toUpperCase()}*\n\n${footer}`);
          }
          if (sub === 'online') {
            await sock.updateOnlinePrivacy(mapValue(val));
            return m.reply(`✅ *Online Status* set to *${val.toUpperCase()}*\n\n${footer}`);
          }
          if (sub === 'profilepic') {
            await sock.updateProfilePicturePrivacy(mapValue(val));
            return m.reply(`✅ *Profile Pic* set to *${val.toUpperCase()}*\n\n${footer}`);
          }
          if (sub === 'status') {
            await sock.updateStatusPrivacy(mapValue(val));
            return m.reply(`✅ *Status* set to *${val.toUpperCase()}*\n\n${footer}`);
          }
          if (sub === 'receipts') {
            await sock.updateReadReceiptsPrivacy(val === 'on' ? 'all' : 'none');
            return m.reply(`✅ *Read Receipts* turned *${val.toUpperCase()}*\n\n${footer}`);
          }
          if (sub === 'groups') {
            await sock.updateGroupsAddPrivacy(mapValue(val));
            return m.reply(`✅ *Groups Add* set to *${val.toUpperCase()}*\n\n${footer}`);
          }
        } catch (e) {
          return m.reply(`❌ Failed to update privacy: ${e.message}\n\n${footer}`);
        }
      }

      // ── Show privacy menu (single message) ──
      await sendButtons(sock, chat, {
        text: `🔐 *Privacy Manager*\n━━━━━━━━━━━━━━━━━━━━━━\n👁️ *Last Seen* | 🟢 *Online* | 🖼️ *Profile Pic*\n📊 *Status* | ✅ *Read Receipts* | 👥 *Groups Add*\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`,
        footer,
        buttons: [
          { label: '👁️ Last Seen: All',        id: '.privacy lastseen all' },
          { label: '👁️ Last Seen: Contacts',   id: '.privacy lastseen contacts' },
          { label: '👁️ Last Seen: Nobody',     id: '.privacy lastseen none' },
          { label: '🟢 Online: All',            id: '.privacy online all' },
          { label: '🖼️ Profile Pic: All',       id: '.privacy profilepic all' },
          { label: '🖼️ Profile Pic: Contacts',  id: '.privacy profilepic contacts' },
          { label: '📊 Status: All',             id: '.privacy status all' },
          { label: '📊 Status: Contacts',        id: '.privacy status contacts' },
          { label: '✅ Read Receipts: On',       id: '.privacy receipts on' },
          { label: '❌ Read Receipts: Off',      id: '.privacy receipts off' },
          { label: '👥 Groups Add: All',         id: '.privacy groups all' },
          { label: '👥 Groups Add: Contacts',    id: '.privacy groups contacts' },
          { label: '📋 Menu',                    id: '.menu' },
        ],
      });
      return;
    }

    // ── Hack animation ────────────────────────────────────────
    if (cmd === 'hack') {
      const target = m.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        ? `@${m.msg.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0]}`
        : (q || 'Target');
      const stages = [
        `💻 *HACKING INITIATED...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 Target: ${target}\n⚡ [▓░░░░░░░░░] 10%`,
        `💻 *HACKING...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 Target: ${target}\n⚡ [▓▓▓▓░░░░░░] 40%`,
        `💻 *HACKING...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 Target: ${target}\n⚡ [▓▓▓▓▓▓▓░░░] 70%`,
        `✅ *HACK COMPLETE!*\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 Target: ${target}\n⚡ [▓▓▓▓▓▓▓▓▓▓] 100%\n📊 Password: 1234567890\n📧 Email: hacked@fake.com\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`,
      ];
      let hackMsg = await sock.sendMessage(chat, { text: stages[0], _noImage: true }, { quoted: m.msg });
      for (let i = 1; i < stages.length; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try { await sock.sendMessage(chat, { text: stages[i], edit: hackMsg.key }); } catch {}
      }
      return;
    }

    // ── Oogway ────────────────────────────────────────────────
    if (cmd === 'oogway') {
      if (!q) return m.reply(`📌 Usage: *.oogway* [quote]\n\n${footer}`);
      await m.react('🐢');
      const imgBuffer = await getMiscImage('oogway', { text: q });
      if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `🐢 *Oogway:*\n"${q}"\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}` }, { quoted: m.msg });
      return m.reply(`🐢 *Oogway says:*\n"${q}"\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`);
    }

    // ── Tweet ─────────────────────────────────────────────────
    if (cmd === 'tweet') {
      if (!q) return m.reply(`📌 Usage: *.tweet* [text]\n\n${footer}`);
      const username = m.pushName || 'User';
      const imgBuffer = await getMiscImage('tweet', { text: q, username });
      if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `🐦 *Tweet*\n@${username}: ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}` }, { quoted: m.msg });
      return m.reply(`🐦 *@${username}:* ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`);
    }

    // ── YT Comment ────────────────────────────────────────────
    if (cmd === 'ytcomment') {
      if (!q) return m.reply(`📌 Usage: *.ytcomment* [text]\n\n${footer}`);
      const username = m.pushName || 'User';
      const imgBuffer = await getMiscImage('ytcomment', { text: q, username });
      if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `💬 *YT Comment*\n${username}: ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}` }, { quoted: m.msg });
      return m.reply(`💬 *${username}:* ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`);
    }

    // ── Jail ──────────────────────────────────────────────────
    if (cmd === 'jail') {
      const mentioned = m.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.sender;
      await m.react('🚔');
      try {
        const pp = await sock.profilePictureUrl(mentioned, 'image').catch(() => null);
        if (pp) { const imgBuffer = await getMiscImage('jail', { imageUrl: pp }); if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `🚔 *JAILED!*\n@${mentioned.split('@')[0]}\n${footer}`, mentions: [mentioned] }, { quoted: m.msg }); }
        return sock.sendMessage(chat, { text: `🚔 *@${mentioned.split('@')[0]} is now in JAIL!*\n${footer}`, mentions: [mentioned] }, { quoted: m.msg });
      } catch (e) { return m.reply(`❌ Error: ${e.message}\n\n${footer}`); }
    }

    // ── Triggered ─────────────────────────────────────────────
    if (cmd === 'triggered') {
      const mentioned = m.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.sender;
      await m.react('😤');
      try {
        const pp = await sock.profilePictureUrl(mentioned, 'image').catch(() => null);
        if (pp) { const imgBuffer = await getMiscImage('triggered', { imageUrl: pp }); if (imgBuffer) return sock.sendMessage(chat, { video: imgBuffer, gifPlayback: true, caption: `😤 *TRIGGERED!*\n@${mentioned.split('@')[0]}\n${footer}`, mentions: [mentioned] }, { quoted: m.msg }); }
        return sock.sendMessage(chat, { text: `😤 *@${mentioned.split('@')[0]} is TRIGGERED!*\n${footer}`, mentions: [mentioned] }, { quoted: m.msg });
      } catch (e) { return m.reply(`❌ Error: ${e.message}\n\n${footer}`); }
    }

    // ── Name Card ─────────────────────────────────────────────
    if (cmd === 'namecard') {
      const name = m.pushName || q || 'User';
      const imgBuffer = await getMiscImage('namecard', { name, subtitle: `WhatsApp: ${m.sender.split('@')[0]}` });
      if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `🪪 *Name Card*\n👤 ${name}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}` }, { quoted: m.msg });
      return m.reply(`🪪 *Name Card*\n👤 *Name:* ${name}\n📱 +${m.sender.split('@')[0]}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`);
    }

    // ── Character ─────────────────────────────────────────────
    if (cmd === 'character') {
      const mentioned = m.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.sender;
      const traits = ['Smart 🧠', 'Funny 😂', 'Kind ❤️', 'Creative 🎨', 'Brave 💪', 'Loyal 🤝', 'Mysterious 🔮', 'Energetic ⚡', 'Calm 🌊', 'Caring 🌸'];
      const selected = traits.sort(() => 0.5 - Math.random()).slice(0, 3);
      return sock.sendMessage(chat, { text: `🎭 *Character Analysis*\n━━━━━━━━━━━━━━━━━━━━━━\n👤 @${mentioned.split('@')[0]}\n\n✨ *Traits:*\n${selected.map(t => `• ${t}`).join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, mentions: [mentioned] }, { quoted: m.msg });
    }

    // ── Good Night ────────────────────────────────────────────
    if (cmd === 'goodnight') {
      const msgs = ['🌙 Good night! Sweet dreams! 💭', '🌛 Sleep well! The stars watch over you! ⭐', '🌜 May your dreams be magical! ✨'];
      return sendButtons(sock, chat, { text: `🌙 *Good Night!*\n━━━━━━━━━━━━━━━━━━━━━━\n${msgs[Math.floor(Math.random() * msgs.length)]}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: m.msg });
    }

    // ── Rose Day ──────────────────────────────────────────────
    if (cmd === 'roseday') {
      return sendButtons(sock, chat, { text: `🌹 *Happy Rose Day!*\n━━━━━━━━━━━━━━━━━━━━━━\n🌹🌹🌹🌹🌹\nRoses are red,\nViolets are blue,\nThis bot is amazing,\nAnd so are you! 💕\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: m.msg });
    }

    // ── Shayari ───────────────────────────────────────────────
    if (cmd === 'shayari') {
      const shayaris = [
        'Love is a prayer,\nThat comes from the heart,\nThinking of it makes one smile. 🌹',
        'Life is a journey, strange indeed,\nNo one could understand its creed. 💫',
        'Let love stay love,\nGive it no other name. 💕',
      ];
      return sendButtons(sock, chat, { text: `🌹 *Shayari*\n━━━━━━━━━━━━━━━━━━━━━━\n${shayaris[Math.floor(Math.random() * shayaris.length)]}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, footer, buttons: [{ label: '🌹 Another', id: '.shayari' }, { label: '📋 Menu', id: '.menu' }], quoted: m.msg });
    }

    // ── Its-so-stupid / Comrade ───────────────────────────────
    if (cmd === 'its-so-stupid' || cmd === 'comrade') {
      const mentioned = m.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.sender;
      try {
        const pp = await sock.profilePictureUrl(mentioned, 'image').catch(() => '');
        const imgBuffer = await tryFetch([
          async () => { const r = await axios.get(`https://api.paxsenix.biz.id/meme/${cmd}?image=${encodeURIComponent(pp)}`, { responseType: 'arraybuffer', timeout: 15000 }); return Buffer.from(r.data); },
        ]);
        if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `😂 *${cmd.toUpperCase()}*\n@${mentioned.split('@')[0]}\n${footer}`, mentions: [mentioned] }, { quoted: m.msg });
      } catch {}
      return sock.sendMessage(chat, { text: `😂 *${cmd.toUpperCase()}*\n@${mentioned.split('@')[0]}\n${footer}`, mentions: [mentioned] }, { quoted: m.msg });
    }

    // ── Blur ──────────────────────────────────────────────────
    if (cmd === 'blur') {
      const quotedMsg = m.quoted;
      let imageBuffer = null;
      try {
        if (quotedMsg?.message?.imageMessage) imageBuffer = await sock.downloadMediaMessage(quotedMsg);
        else if (m.msg?.message?.imageMessage) imageBuffer = await sock.downloadMediaMessage(m.msg);
        if (!imageBuffer) return m.reply(`📌 Reply to an image with *.blur*\n\n${footer}`);
        await m.react('🌫️');
        const sharp = require('sharp');
        const blurred = await sharp(imageBuffer).blur(15).toBuffer();
        return sock.sendMessage(chat, { image: blurred, caption: `🌫️ *Blurred Image*\n${footer}` }, { quoted: m.msg });
      } catch (e) { return m.reply(`❌ Error: ${e.message}\n\n${footer}`); }
    }

    // ── Sticker to Image ──────────────────────────────────────
    if (cmd === 'simage') {
      const quotedMsg = m.quoted;
      if (!quotedMsg?.message?.stickerMessage) return m.reply(`📌 Reply to a sticker with *.simage*\n\n${footer}`);
      try {
        const buffer = await sock.downloadMediaMessage(quotedMsg);
        return sock.sendMessage(chat, { image: buffer, caption: `🖼️ *Sticker → Image*\n${footer}` }, { quoted: m.msg });
      } catch (e) { return m.reply(`❌ Error: ${e.message}\n\n${footer}`); }
    }

    // ── AI Chat ───────────────────────────────────────────────
    if (['gpt', 'llama3', 'chatai'].includes(cmd)) {
      if (!q) return m.reply(`📌 Usage: *.${cmd}* [question]\n\n${footer}`);
      await m.react('🤖');
      const waitMsg = await sock.sendMessage(chat, { text: `🤖 *AI thinking...*\n❓ *Q:* ${q}\n⏳ Please wait...\n${footer}`, _noImage: true }, { quoted: m.msg });
      const answer = await tryFetch([
        async () => { const r = await axios.post('https://text.pollinations.ai/', { messages: [{ role: 'user', content: q }], model: cmd === 'llama3' ? 'llama' : 'openai', seed: 42 }, { timeout: 20000 }); return typeof r.data === 'string' ? r.data.trim() : null; },
        async () => { const r = await axios.get(`https://api.paxsenix.biz.id/ai/gpt4o?text=${encodeURIComponent(q)}`, { timeout: 15000 }); return r.data?.message || r.data?.result || null; },
      ]);
      try { await sock.sendMessage(chat, { text: answer ? `🤖 *AI (${cmd.toUpperCase()})*\n━━━━━━━━━━━━━━━━━━━━━━\n❓ *Q:* ${q}\n\n💡 *A:* ${answer}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}` : `❌ Could not get AI response.\n\n${footer}`, edit: waitMsg.key }); } catch {}
      return;
    }

    // ── AI Image ──────────────────────────────────────────────
    if (['imagine', 'flux', 'sora'].includes(cmd)) {
      if (!q) return m.reply(`📌 Usage: *.${cmd}* [prompt]\n\n${footer}`);
      await m.react('🎨');
      const waitMsg = await sock.sendMessage(chat, { text: `🎨 *Generating AI image...*\n✨ *Prompt:* ${q}\n⏳ Please wait...\n${footer}`, _noImage: true }, { quoted: m.msg });
      const imgBuffer = await tryFetch([
        async () => { const r = await axios.get(`https://api.paxsenix.biz.id/ai/flux?prompt=${encodeURIComponent(q)}`, { responseType: 'arraybuffer', timeout: 30000 }); return Buffer.from(r.data); },
        async () => { const r = await axios.get(`https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=1024&height=1024&nologo=true`, { responseType: 'arraybuffer', timeout: 30000 }); return Buffer.from(r.data); },
      ]);
      if (imgBuffer) {
        await sock.sendMessage(chat, { image: imgBuffer, caption: `🎨 *AI Image*\n✨ *Prompt:* ${q}\n🤖 *Model:* ${cmd}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}` }, { quoted: m.msg });
        try { await sock.sendMessage(chat, { delete: waitMsg.key }); } catch {}
      } else {
        try { await sock.sendMessage(chat, { text: `❌ Could not generate image.\n\n${footer}`, edit: waitMsg.key }); } catch {}
      }
      return;
    }

    // ── APK Download ──────────────────────────────────────────
    // .apk <q>              → search + show source buttons
    // .apkdl apkpure <q>   → download from APKPure → send
    // .apkdl uptodown <q>  → download from Uptodown → send
    // .apkdl softonic <q>  → download from Softonic → send
    if (cmd === 'apk' || cmd === 'apkdl') {
      const tr  = await getT(m.sessionOwner);

      if (!q) return sendButtons(sock, chat, {
        text: `📌 ${tr('usage')}: *.apk* [app name]\n\nExample: .apk WhatsApp\n\n${footer}`,
        footer,
        buttons: [{ label: tr('btn_menu'), id: '.menu' }],
        quoted: m.msg,
      });

      await m.react('📱');

      // ── Helper: scrape APKPure ─────────────────────────────
      async function scrapeApkPure(appQuery) {
        const enc2 = encodeURIComponent(appQuery);
        const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
        const apiList = [
          // Method 1: paxsenix apkpure
          async () => {
            const r = await axios.get(`https://api.paxsenix.biz.id/dl/apkpure?q=${enc2}`, { timeout: 20000 });
            if (r.data?.url) return { url: r.data.url, title: r.data.title, version: r.data.version, size: r.data.size };
            return null;
          },
          // Method 2: ryzendesu
          async () => {
            const r = await axios.get(`https://api.ryzendesu.vip/api/downloader/apkpure?query=${enc2}`, { timeout: 20000 });
            const d = r.data?.data || r.data;
            if (d?.url) return { url: d.url, title: d.name || d.title, version: d.version, size: d.size };
            return null;
          },
          // Method 3: lolhuman
          async () => {
            const r = await axios.get(`https://api.lolhuman.xyz/api/apkdl?apikey=&query=${enc2}`, { timeout: 20000 });
            const d = r.data?.result;
            if (d?.link) return { url: d.link, title: d.name, version: d.version, size: d.size };
            return null;
          },
          // Method 4: xteam
          async () => {
            const r = await axios.get(`https://api.xteam.xyz/apk?q=${enc2}`, { timeout: 20000 });
            const d = r.data?.result;
            if (d?.link) return { url: d.link, title: d.name, version: d.version, size: d.size };
            return null;
          },
          // Method 5: agatz
          async () => {
            const r = await axios.get(`https://api.agatz.xyz/api/apk?url=https://apkpure.com/search?q=${enc2}`, { timeout: 20000 });
            const d = r.data?.data;
            if (d?.link) return { url: d.link, title: d.name, version: d.version, size: d.size };
            return null;
          },
          // Method 6: APKPure scrape v2
          async () => {
            const sRes = await axios.get(`https://apkpure.net/search?q=${enc2}`, { timeout: 25000, headers: { 'User-Agent': UA } });
            const slugMatch = sRes.data.match(/href="(\/[^"]+\/[a-z][a-z0-9.]+)"[\s\S]{0,200}?class="[^"]*first-info/);
            if (!slugMatch) {
              const alt = sRes.data.match(/href="(\/[a-z][a-z0-9._-]+\/[a-z][a-z0-9.]+)"/);
              if (!alt) return null;
              slugMatch = alt;
            }
            const dRes = await axios.get(`https://apkpure.net${slugMatch[1]}/download`, { timeout: 25000, headers: { 'User-Agent': UA } });
            const html = dRes.data;
            const dlMatch = html.match(/href="(https:\/\/[^"]+\.apk[^"]*)"/i)
                         || html.match(/data-url="(https:\/\/[^"]+\.apk[^"]*)"/i);
            if (!dlMatch) return null;
            const nameMatch = html.match(/<title>Download ([^<]+?) APK/i);
            const verMatch  = html.match(/Version[^>]*>[^>]*>([0-9][^\s<]+)/i);
            return { url: dlMatch[1], title: nameMatch?.[1]?.trim() || appQuery, version: verMatch?.[1]?.trim() || 'Latest', size: 'N/A' };
          },
          // Method 7: APKCombo
          async () => {
            const sRes = await axios.get(`https://apkcombo.com/search/?q=${enc2}`, { timeout: 25000, headers: { 'User-Agent': UA } });
            const slugMatch = sRes.data.match(/href="(\/[a-z][a-z0-9._-]+\/download\/apk)"/i);
            if (!slugMatch) return null;
            const dRes = await axios.get(`https://apkcombo.com${slugMatch[1]}`, { timeout: 25000, headers: { 'User-Agent': UA } });
            const dlMatch = dRes.data.match(/href="(https:\/\/download\.apkcombo\.com\/[^"]+\.apk[^"]*)"/i);
            if (!dlMatch) return null;
            const nameMatch = dRes.data.match(/<h1[^>]*>([^<]+)<\/h1>/i);
            return { url: dlMatch[1], title: nameMatch?.[1]?.trim() || appQuery, version: 'Latest', size: 'N/A' };
          },
        ];
        for (const fn of apiList) { try { const r = await fn(); if (r?.url) return r; } catch {} }
        return null;
      }

      // ── Helper: scrape Uptodown ────────────────────────────
      async function scrapeUptodown(appQuery) {
        const enc2 = encodeURIComponent(appQuery);
        const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
        const methods = [
          // Method 1: paxsenix uptodown
          async () => {
            const r = await axios.get(`https://api.paxsenix.biz.id/dl/uptodown?q=${enc2}`, { timeout: 20000 });
            if (r.data?.url) return { url: r.data.url, title: r.data.title, version: r.data.version, size: r.data.size };
            return null;
          },
          // Method 2: scrape uptodown search
          async () => {
            const sRes = await axios.get(`https://en.uptodown.com/android/search?q=${enc2}`, { timeout: 25000, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
            const appMatch = sRes.data.match(/href="(https:\/\/[a-z0-9-]+\.en\.uptodown\.com\/android\/download[^"]*)"/);
            if (!appMatch) return null;
            const dRes = await axios.get(appMatch[1], { timeout: 25000, headers: { 'User-Agent': UA } });
            const dlMatch = dRes.data.match(/href="(https:\/\/dw\.uptodown\.com\/dwn\/[^"]+)"/);
            if (!dlMatch) return null;
            const nameMatch = dRes.data.match(/<h1[^>]*>([^<]+)<\/h1>/);
            const verMatch  = dRes.data.match(/class="[^"]*version[^"]*"[^>]*>([^<]+)</);
            return { url: dlMatch[1], title: nameMatch?.[1]?.trim() || appQuery, version: verMatch?.[1]?.trim() || 'Latest', size: 'N/A' };
          },
          // Method 3: uptodown direct app slug
          async () => {
            const slug = appQuery.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const dRes = await axios.get(`https://${slug}.en.uptodown.com/android/download`, { timeout: 25000, headers: { 'User-Agent': UA } });
            const dlMatch = dRes.data.match(/href="(https:\/\/dw\.uptodown\.com\/dwn\/[^"]+)"/);
            if (!dlMatch) return null;
            const verMatch = dRes.data.match(/class="[^"]*version[^"]*"[^>]*>([^<]+)</);
            return { url: dlMatch[1], title: appQuery, version: verMatch?.[1]?.trim() || 'Latest', size: 'N/A' };
          },
        ];
        for (const fn of methods) { try { const r = await fn(); if (r?.url) return r; } catch {} }
        return null;
      }

      // ── STEP 1: .apk → show source buttons ────────────────
      if (cmd === 'apk') {
        await sendButtons(sock, chat, {
          text: `${tr('apk_searching')}\n━━━━━━━━━━━━━━━━━━━━━━\n${tr('apk_app')} ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`,
          footer, buttons: [], quoted: m.msg,
        });

        // Quick info fetch (no download yet)
        let info = null;
        try { info = await scrapeApkPure(q); } catch {}
        const appName = info?.title || q;
        const version  = info?.version || 'Latest';
        const size     = info?.size || 'N/A';

        return sendButtons(sock, chat, {
          text: `${tr('apk_found')}\n━━━━━━━━━━━━━━━━━━━━━━\n${tr('apk_app')} ${appName}\n${tr('apk_version')} ${version}\n${tr('apk_size')} ${size}\n━━━━━━━━━━━━━━━━━━━━━━\n📲 ${tr('apk_try')}\n${footer}`,
          footer,
          buttons: [
            { label: '📦 APKPure',   id: `.apkdl apkpure ${q}` },
            { label: '⬇️ Uptodown', id: `.apkdl uptodown ${q}` },
            { label: tr('btn_menu'), id: '.menu' },
          ],
          quoted: m.msg,
        });
      }

      // ── STEP 2: .apkdl <source> <query> → download & send ─
      const parts   = q.split(' ');
      const source  = parts[0].toLowerCase(); // apkpure / uptodown
      const appQuery = parts.slice(1).join(' ');

      if (!appQuery) return m.reply(`📌 Usage: *.apk* [app name]\n\n${footer}`);

      await sendButtons(sock, chat, {
        text: `${tr('downloading')}\n━━━━━━━━━━━━━━━━━━━━━━\n📱 ${appQuery}\n📦 Source: ${source}\n⏳ ${tr('please_wait')}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`,
        footer, buttons: [], quoted: m.msg,
      });

      let dlInfo = null;
      if (source === 'uptodown') {
        dlInfo = await scrapeUptodown(appQuery);
        if (!dlInfo?.url) dlInfo = await scrapeApkPure(appQuery); // fallback to apkpure
      } else {
        dlInfo = await scrapeApkPure(appQuery);
        if (!dlInfo?.url) dlInfo = await scrapeUptodown(appQuery); // fallback to uptodown
      }

      if (!dlInfo?.url) {
        await m.react('❌');
        return sendButtons(sock, chat, {
          text: `${tr('apk_not_found')}\n📱 *${appQuery}*\n${footer}`,
          footer,
          buttons: [
            { label: '📦 Try APKPure',   id: `.apkdl apkpure ${appQuery}` },
            { label: '⬇️ Try Uptodown', id: `.apkdl uptodown ${appQuery}` },
          ],
          quoted: m.msg,
        });
      }

      const appName = dlInfo.title   || appQuery;
      const version  = dlInfo.version || 'Latest';
      const size     = dlInfo.size    || 'N/A';

      // Download file
      let apkPath = null;
      try {
        if (!fs.existsSync(TEMP_MEDIA_DIR)) fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
        apkPath = path.join(TEMP_MEDIA_DIR, `${Date.now()}_${appName.replace(/[^a-zA-Z0-9]/g,'_')}.apk`);
        const dlRes = await axios({
          method: 'get', url: dlInfo.url, responseType: 'stream', timeout: 180000,
          maxContentLength: 100 * 1024 * 1024,
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': source === 'uptodown' ? 'https://uptodown.com' : 'https://apkpure.com' },
        });
        const contentLen = parseInt(dlRes.headers['content-length'] || '0');
        if (contentLen > 100 * 1024 * 1024) throw new Error('TOO_LARGE');
        const writer = fs.createWriteStream(apkPath);
        await new Promise((res, rej) => { dlRes.data.pipe(writer); writer.on('finish', res); writer.on('error', rej); });
      } catch (e) {
        if (apkPath && fs.existsSync(apkPath)) try { fs.unlinkSync(apkPath); } catch {}
        await m.react('❌');
        const msg = (e.message === 'TOO_LARGE' || e.message?.includes('maxContentLength'))
          ? `${tr('dl_too_large')}\n📱 *${appName}* (>100MB)\n\n${footer}`
          : `${tr('dl_error_msg')}\n📱 *${appName}*\n\n${footer}`;
        return sendButtons(sock, chat, { text: msg, footer, buttons: [{ label: tr('btn_menu'), id: '.menu' }], quoted: m.msg });
      }

      // Send as document
      try {
        await sendButtons(sock, chat, {
          text: `${tr('uploading')}\n━━━━━━━━━━━━━━━━━━━━━━\n📱 ${appName}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`,
          footer, buttons: [], quoted: m.msg,
        });
        await sock.sendMessage(chat, {
          document: fs.readFileSync(apkPath),
          mimetype: 'application/vnd.android.package-archive',
          fileName: `${appName}_${version}.apk`,
          caption: `📱 *${appName}*\n${tr('apk_version')} ${version}\n${tr('apk_size')} ${size}\n\n${footer}`,
        }, { quoted: m.msg });
        await m.react('✅');
      } catch {
        await m.react('❌');
        await sendButtons(sock, chat, { text: `${tr('dl_error_msg')}\n${footer}`, footer, buttons: [{ label: tr('btn_menu'), id: '.menu' }], quoted: m.msg });
      } finally {
        if (apkPath && fs.existsSync(apkPath)) try { fs.unlinkSync(apkPath); } catch {}
      }
      return;
    }
    // ════════════════════════════════════════════════════════
    // TIKTOK — URL validate → watermark choice → download
    // ════════════════════════════════════════════════════════
    if (['tiktok', 'tt', 'ttdl', 'ttmp4'].includes(cmd)) {
      if (!q) return m.reply(`📌 Usage: *.${cmd}* [TikTok URL]\n\nExample: .tiktok https://vm.tiktok.com/...\n\n${footer}`);
      const isTT = q.includes('tiktok.com') || q.includes('vm.tiktok') || q.includes('vt.tiktok');
      if (!isTT) return m.reply(`❌ *Invalid URL!*\n\nTikTok URL එකක් දෙන්න.\nExample: https://vm.tiktok.com/...\n\n${footer}`);
      await m.react('🎵');

      const ttBtnMsg = await sendButtons(sock, chat, {
        text: `🎵 *TikTok Download*\n━━━━━━━━━━━━━━━━━━━━━━\n🔗 ${q.substring(0, 60)}\n━━━━━━━━━━━━━━━━━━━━━━\n\nකෙසේ download කරන්නද?\n\n${footer}`,
        footer,
        buttons: [
          { label: '✅ Watermark නැතිව', id: `._tt_nowm ${q}` },
          { label: '💧 Watermark සමඟ',   id: `._tt_wm ${q}` },
        ],
        quoted: m.msg,
      });
      const ttBtnKey = ttBtnMsg?.key || null;
      pendingDownload.set(m.sender, { type: 'tiktok', url: q, btnKey: ttBtnKey, quotedMsg: m.msg });
      setTimeout(() => {
        if (pendingDownload.has(m.sender) && pendingDownload.get(m.sender).btnKey === ttBtnKey) {
          pendingDownload.delete(m.sender);
          try { if (ttBtnKey) sock.sendMessage(chat, { delete: ttBtnKey }); } catch {}
        }
      }, 300000);
      return;
    }

    // ════════════════════════════════════════════════════════
    // MP3 / SONG — Search → Found! → Buttons → Download
    // ════════════════════════════════════════════════════════
    if (['mp3', 'song', 'play', 'ytmp3'].includes(cmd)) {
      if (!q) return m.reply(`📌 Usage: *.${cmd}* [song name or YouTube URL]\n\nExample: .${cmd} Shape of You\n\n${footer}`);
      await m.react('🎵');

      // 1️⃣ Searching message
      const searchMsg = await sock.sendMessage(chat, {
        text: `🔍 *Searching...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎵 *Query:* ${q}\n⏳ Please wait...\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, _noImage: true
      }, { quoted: m.msg });
      const searchKey = searchMsg?.key || null;

      let videoUrl = q, displayTitle = q;
      if (!q.match(/https?:\/\//)) {
        try {
          const yts = require('yt-search');
          const res = await yts(q);
          const video = res?.videos?.[0];
          if (video) {
            const vid = video.videoId || video.url?.match(/(?:v=|youtu\.be\/)([^&?#]+)/)?.[1];
            if (vid) { videoUrl = `https://www.youtube.com/watch?v=${vid}`; displayTitle = video.title || q; }
          }
        } catch {}
      }

      // 2️⃣ Delete searching msg, show Found + buttons
      try { if (searchKey) await sock.sendMessage(chat, { delete: searchKey }); } catch {}

      const btnMsg = await sendButtons(sock, chat, {
        text: `🎯 *Found!*\n━━━━━━━━━━━━━━━━━━━━━━\n🎵 *Song:* ${displayTitle}\n🔗 ${videoUrl}\n━━━━━━━━━━━━━━━━━━━━━━\nChoose download format:\n${footer}`,
        footer,
        buttons: [
          { label: '🎵 MP3 Audio',  id: `._dl_mp3 ${videoUrl}` },
          { label: '🎤 Voice Note', id: `._dl_vn ${videoUrl}` },
          { label: '📄 Document',   id: `._dl_doc ${videoUrl}` },
        ],
        quoted: m.msg,
      });
      const btnKey = btnMsg?.key || null;

      // Re-use searchKey slot for status tracking during download
      pendingDownload.set(m.sender, { type: 'song', input: q, url: videoUrl, displayTitle, searchKey: null, btnKey });

      // Auto-expire after 5min
      setTimeout(() => {
        if (pendingDownload.has(m.sender) && pendingDownload.get(m.sender).btnKey === btnKey) {
          pendingDownload.delete(m.sender);
          try { if (btnKey) sock.sendMessage(chat, { delete: btnKey }); } catch {}
        }
      }, 300000);
      return;
    }

    // ════════════════════════════════════════════════════════
    // MP4 / VIDEO — Search → Found! → Buttons → Download
    // ════════════════════════════════════════════════════════
    if (['mp4', 'video', 'ytmp4', 'ytvideo'].includes(cmd)) {
      if (!q) return m.reply(`📌 Usage: *.${cmd}* [video name or URL]\n\nExample: .${cmd} Avengers trailer\n\n${footer}`);

      // TikTok URL detect — route to TikTok downloader
      if (q.includes('tiktok.com') || q.includes('vm.tiktok') || q.includes('vt.tiktok')) {
        await m.react('🎵');
        const _ttBtn = await sendButtons(sock, chat, {
          text: `🎵 *TikTok Download*\n━━━━━━━━━━━━━━━━━━━━━━\n🔗 ${q.substring(0, 60)}\n━━━━━━━━━━━━━━━━━━━━━━\n\nකෙසේ download කරන්නද?\n\n${footer}`,
          footer,
          buttons: [
            { label: '✅ Watermark නැතිව', id: `._tt_nowm ${q}` },
            { label: '💧 Watermark සමඟ',   id: `._tt_wm ${q}` },
          ],
          quoted: m.msg,
        });
        const _ttBtnKey = _ttBtn?.key || null;
        pendingDownload.set(m.sender, { type: 'tiktok', url: q, btnKey: _ttBtnKey, quotedMsg: m.msg });
        setTimeout(() => {
          if (pendingDownload.has(m.sender) && pendingDownload.get(m.sender).btnKey === _ttBtnKey) {
            pendingDownload.delete(m.sender);
            try { if (_ttBtnKey) sock.sendMessage(chat, { delete: _ttBtnKey }); } catch {}
          }
        }, 300000);
        return;
      }

      await m.react('🎬');

      // 1️⃣ Searching message
      const vidSearchMsg = await sock.sendMessage(chat, {
        text: `🔍 *Searching...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎬 *Query:* ${q}\n⏳ Please wait...\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, _noImage: true
      }, { quoted: m.msg });
      const vidSearchKey = vidSearchMsg?.key || null;

      let videoUrl = q, displayTitle = q;
      if (!q.match(/https?:\/\//)) {
        try {
          const yts = require('yt-search');
          const res = await yts(q);
          const video = res?.videos?.[0];
          if (!video) {
            if (vidSearchKey) try { await sock.sendMessage(chat, { text: `❌ *Not found!*\n━━━━━━━━━━━━━━━━━━━━━━\n🎬 *Query:* ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}`, edit: vidSearchKey }); } catch {}
            return;
          }
          const vid = video.videoId || video.url?.match(/(?:v=|youtu\.be\/)([^&?#]+)/)?.[1];
          if (vid) videoUrl = `https://www.youtube.com/watch?v=${vid}`;
          displayTitle = video.title || q;
        } catch {}
      }

      // 2️⃣ Delete searching msg, show Found + buttons
      try { if (vidSearchKey) await sock.sendMessage(chat, { delete: vidSearchKey }); } catch {}

      const vidBtnMsg = await sendButtons(sock, chat, {
        text: `🎯 *Found!*\n━━━━━━━━━━━━━━━━━━━━━━\n🎬 *Video:* ${displayTitle}\n🔗 ${videoUrl}\n━━━━━━━━━━━━━━━━━━━━━━\nChoose quality:\n${footer}`,
        footer,
        buttons: [
          { label: '📺 144p Video',   id: `._dl_144 ${videoUrl}` },
          { label: '📺 360p Video',   id: `._dl_360 ${videoUrl}` },
          { label: '📺 720p Video',   id: `._dl_720 ${videoUrl}` },
          { label: '📄 144p Doc',     id: `._dl_d144 ${videoUrl}` },
          { label: '📄 360p Doc',     id: `._dl_d360 ${videoUrl}` },
          { label: '📄 720p Doc',     id: `._dl_d720 ${videoUrl}` },
        ],
        quoted: m.msg,
      });
      const vidBtnKey = vidBtnMsg?.key || null;

      pendingDownload.set(m.sender, { type: 'video', input: q, url: videoUrl, displayTitle, searchKey: null, btnKey: vidBtnKey });

      setTimeout(() => {
        if (pendingDownload.has(m.sender) && pendingDownload.get(m.sender).btnKey === vidBtnKey) {
          pendingDownload.delete(m.sender);
          try { if (vidBtnKey) sock.sendMessage(chat, { delete: vidBtnKey }); } catch {}
        }
      }, 300000);
      return;
    }

    // ── Anime GIFs ────────────────────────────────────────────
    if (ANIME_CMDS.includes(cmd)) {
      await m.react('🎌');
      const gifUrl = await getAnimeGif(cmd);
      if (gifUrl) {
        const r = await axios.get(gifUrl, { responseType: 'arraybuffer', timeout: 15000 }).catch(() => null);
        if (r) {
          const isGif = gifUrl.endsWith('.gif') || r.headers['content-type']?.includes('gif');
          return sock.sendMessage(chat, { [isGif ? 'video' : 'image']: Buffer.from(r.data), gifPlayback: isGif, caption: `*${cmd.toUpperCase()}*\n${footer}` }, { quoted: m.msg });
        }
        return m.reply(`*${cmd.toUpperCase()}*\n🔗 ${gifUrl}\n${footer}`);
      }
      return m.reply(`❌ Could not get ${cmd} GIF.\n\n${footer}`);
    }

    // ── Text Art ──────────────────────────────────────────────
    if (TEXT_ART_CMDS.includes(cmd)) {
      if (!q) return m.reply(`📌 Usage: *.${cmd}* [text]\n\n${footer}`);
      await m.react('🎨');
      const waitMsg = await sock.sendMessage(chat, { text: `🎨 *Generating ${cmd} text art...*\n📝 *Text:* ${q}\n⏳ Please wait...\n${footer}`, _noImage: true }, { quoted: m.msg });
      const imgBuffer = await tryFetch([
        async () => { const r = await axios.get(`https://api.paxsenix.biz.id/text-effect/${cmd}?text=${encodeURIComponent(q)}`, { responseType: 'arraybuffer', timeout: 20000 }); return Buffer.from(r.data); },
        async () => { const r = await axios.get(`https://api.lolhuman.xyz/api/teks/${cmd}?apikey=demo&text=${encodeURIComponent(q)}`, { responseType: 'arraybuffer', timeout: 20000 }); return Buffer.from(r.data); },
      ]);
      if (imgBuffer) {
        await sock.sendMessage(chat, { image: imgBuffer, caption: `🎨 *${cmd.toUpperCase()} Text Art*\n📝 *Text:* ${q}\n━━━━━━━━━━━━━━━━━━━━━━\n${footer}` }, { quoted: m.msg });
        try { await sock.sendMessage(chat, { delete: waitMsg.key }); } catch {}
      } else {
        try { await sock.sendMessage(chat, { text: `❌ Could not generate text art.\n\n${footer}`, edit: waitMsg.key }); } catch {}
      }
      return;
    }

    // ── PP Overlay ────────────────────────────────────────────
    if (OVERLAY_CMDS.includes(cmd)) {
      const mentioned = m.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.sender;
      const emojiMap = { heart: '❤️', circle: '⭕', lgbt: '🏳️‍🌈', horny: '😏', lolice: '👮', gay: '🌈', glass: '👓', passed: '✅' };
      await m.react(emojiMap[cmd] || '✨');
      try {
        const pp = await sock.profilePictureUrl(mentioned, 'image').catch(() => null);
        if (pp) {
          const imgBuffer = await tryFetch([
            async () => { const r = await axios.get(`https://some-random-api.com/canvas/overlay/${cmd}?avatar=${encodeURIComponent(pp)}`, { responseType: 'arraybuffer', timeout: 15000 }); return Buffer.from(r.data); },
            async () => { const r = await axios.get(`https://api.paxsenix.biz.id/overlay/${cmd}?image=${encodeURIComponent(pp)}`, { responseType: 'arraybuffer', timeout: 15000 }); return Buffer.from(r.data); },
          ]);
          if (imgBuffer) return sock.sendMessage(chat, { image: imgBuffer, caption: `${emojiMap[cmd]} *${cmd.toUpperCase()}*\n@${mentioned.split('@')[0]}\n${footer}`, mentions: [mentioned] }, { quoted: m.msg });
        }
        return sock.sendMessage(chat, { text: `${emojiMap[cmd]} *${cmd.toUpperCase()}*\n@${mentioned.split('@')[0]}\n${footer}`, mentions: [mentioned] }, { quoted: m.msg });
      } catch (e) { return m.reply(`❌ Error: ${e.message}\n\n${footer}`); }
    }
  },
};
