'use strict';
/**
 * UNITY-MD — .playaudio / .playvideo commands
 * ──────────────────────────────────────────────────────────────
 * HOW IT WORKS (Real Implementation):
 *
 * WhatsApp / Baileys හි native call-audio-streaming API නෑ.
 * (sock.sendCallAudio කියලා function officially exist නෑ)
 *
 * Real working approach:
 *  1. Bot call initiates → recipient sees incoming call
 *  2. Bot immediately hangs up (1.5s) → missed call notification
 *  3. Bot sends the audio/video as voice note / video msg
 *     to the same chat — so they hear/watch it right away.
 *
 *  BONUS MODE (.playaudio reply + number):
 *  - Calls a specific number, sends them the voice note directly.
 *
 * Usage:
 *   .playaudio              (reply to audio/video → voice note to sender)
 *   .playaudio 94XXXXXXXXX  (missed call + voice note to that number)
 *   .playvideo              (reply to video → video msg to sender)
 *   .playvideo 94XXXXXXXXX
 *
 *  ALSO works as YouTube downloader + play:
 *   .playaudio <song name>  (downloads from YT → sends as voice note)
 *   .playvideo <video name> (downloads from YT → sends as video msg)
 * ──────────────────────────────────────────────────────────────
 */

const cfg  = require('../../config');
const fs   = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { tmpFile } = require('./helper');
const { getLang } = require('../lang');
const axios = require('axios');

// ── Temp dir ──────────────────────────────────────────────────
const TEMP_DIR = path.join(process.cwd(), 'database', 'temp');
fs.ensureDirSync(TEMP_DIR);

// ── Localised strings ─────────────────────────────────────────
const STR = {
  usage_audio: {
    en: 'Reply to an audio/video/voice message with *.playaudio*\nOR type a song name: *.playaudio Shape of You*',
    si: 'Audio/video message එකක් reply කරල *.playaudio* ගහන්න\nහෝ song name type කරන්න: *.playaudio Shape of You*',
    ta: 'Audio/video message-ஐ reply செய்து *.playaudio* கொடுங்கள்\nஅல்லது பாடல் பெயர்: *.playaudio Shape of You*',
  },
  usage_video: {
    en: 'Reply to a video message with *.playvideo*\nOR type a video name: *.playvideo Funny cats*',
    si: 'Video message එකක් reply කරල *.playvideo* ගහන්න\nහෝ video name type කරන්න: *.playvideo Funny cats*',
    ta: 'Video message-ஐ reply செய்து *.playvideo* கொடுங்கள்\nஅல்லது video பெயர்: *.playvideo Funny cats*',
  },
  calling: {
    en: '📞 Calling...',
    si: '📞 Call ගෙනෙනවා...',
    ta: '📞 Call வருகிறது...',
  },
  sending: {
    en: '🎵 Sending media...',
    si: '🎵 Media send කරනවා...',
    ta: '🎵 Media அனுப்புகிறது...',
  },
  downloading: {
    en: '⬇️ Downloading from YouTube...',
    si: '⬇️ YouTube එකෙන් download කරනවා...',
    ta: '⬇️ YouTube-இல் இருந்து பதிவிறக்குகிறது...',
  },
  done_audio: {
    en: '✅ Voice note sent!',
    si: '✅ Voice note send කළා!',
    ta: '✅ Voice note அனுப்பப்பட்டது!',
  },
  done_video: {
    en: '✅ Video sent!',
    si: '✅ Video send කළා!',
    ta: '✅ Video அனுப்பப்பட்டது!',
  },
  failed: {
    en: '❌ Failed!',
    si: '❌ Fail වුණා!',
    ta: '❌ தோல்வியடைந்தது!',
  },
  example: {
    en: 'Example',
    si: 'උදාහරණ',
    ta: 'எடுத்துக்காட்டு',
  },
  diff_number: {
    en: 'Send to different number',
    si: 'වෙනත් number එකකට',
    ta: 'வேறு number-க்கு',
  },
  yt_found: {
    en: '🎯 Found on YouTube!',
    si: '🎯 YouTube එකේ හොයාගත්තා!',
    ta: '🎯 YouTube-இல் கிடைத்தது!',
  },
};

function s(key, lang) {
  const entry = STR[key];
  if (!entry) return key;
  return entry[lang] || entry['en'] || key;
}

// ── Resolve target JID ────────────────────────────────────────
function resolveTarget(m) {
  if (m.args && m.args[0]) {
    const num = m.args[0].replace(/[^0-9]/g, '');
    if (num.length >= 7) return num + '@s.whatsapp.net';
  }
  return m.sender;
}

// ── execPromise ────────────────────────────────────────────────
function execPromise(cmd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 200, timeout, shell: '/bin/bash' },
      (err, stdout) => err ? reject(err) : resolve(stdout));
  });
}

// ── Download media from quoted/attached message ───────────────
async function downloadMedia(sock, m, allowedTypes) {
  const quoted = m.quoted;
  if (quoted) {
    const qMsg = quoted.message;
    for (const type of allowedTypes) {
      if (qMsg?.[type]) {
        const buf = await sock.downloadMediaMessage({ message: qMsg, key: quoted.key });
        return { buf, type };
      }
    }
  }
  const ownMsg = m.message;
  for (const type of allowedTypes) {
    if (ownMsg?.[type]) {
      const buf = await sock.downloadMediaMessage(m.msg);
      return { buf, type };
    }
  }
  return null;
}

// ── Make WhatsApp call (initiates then auto-hangs) ────────────
// This gives the "missed call" notification effect so receiver
// knows to check the voice note / video we're about to send.
async function makeCallAndHang(sock, targetJid, isVideo = false) {
  try {
    // Try native Baileys sock.call() — available in some versions
    if (typeof sock.call === 'function') {
      const result = await sock.call([targetJid], { video: isVideo });
      const callId = result?.id || result?.[0]?.id;
      if (callId) {
        // Wait 1.5s then end the call → missed call effect
        await new Promise(r => setTimeout(r, 1500));
        try {
          if (typeof sock.rejectCall === 'function') {
            await sock.rejectCall(callId, targetJid);
          } else {
            // End via relayMessage
            await sock.relayMessage(targetJid, {
              call: {
                callKey: Buffer.from(callId.substring(0, 8).padEnd(8, '0'), 'hex'),
              }
            }, {});
          }
        } catch {}
        return true;
      }
    }

    // Fallback: relay a call offer message (works on older Baileys)
    const crypto = require('crypto');
    const callKey = crypto.randomBytes(8);
    const callId  = callKey.toString('hex').toUpperCase();

    // Send call offer
    await sock.relayMessage(targetJid, {
      call: { callKey }
    }, {});

    await new Promise(r => setTimeout(r, 1500));

    // Try to terminate it
    try {
      await sock.relayMessage(targetJid, {
        call: { callKey }
      }, {});
    } catch {}

    return true;
  } catch (e) {
    console.log('[CallPlay] call initiate failed:', e.message);
    return false;
  }
}

// ── Convert audio to OGG/Opus (WhatsApp PTT format) ──────────
async function toOpus(inputPath) {
  const outPath = path.join(TEMP_DIR, `ptt_${Date.now()}.ogg`);
  await execPromise(
    `ffmpeg -y -i "${inputPath}" -c:a libopus -b:a 64k -ar 48000 -ac 1 -vn "${outPath}" 2>/dev/null`,
    30000
  );
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 500) {
    throw new Error('Opus conversion failed');
  }
  return outPath;
}

// ── Convert audio to mp3 ──────────────────────────────────────
async function toMp3(inputPath) {
  const outPath = path.join(TEMP_DIR, `audio_${Date.now()}.mp3`);
  await execPromise(
    `ffmpeg -y -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a 128k "${outPath}" 2>/dev/null`,
    30000
  );
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 500) {
    throw new Error('MP3 conversion failed');
  }
  return outPath;
}

// ── Convert video to mp4 (strip if needed) ───────────────────
async function toMp4(inputPath) {
  const outPath = path.join(TEMP_DIR, `video_${Date.now()}.mp4`);
  await execPromise(
    `ffmpeg -y -i "${inputPath}" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 96k -movflags +faststart "${outPath}" 2>/dev/null`,
    120000
  );
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 500) {
    throw new Error('MP4 conversion failed');
  }
  return outPath;
}

// ── Get media duration via ffprobe ────────────────────────────
function getMediaDuration(filePath) {
  return new Promise((resolve) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      (err, stdout) => {
        const dur = parseFloat(stdout?.trim());
        resolve(isNaN(dur) ? 0 : Math.round(dur));
      }
    );
  });
}

// ── YouTube search ────────────────────────────────────────────
async function searchYouTube(query) {
  try {
    const yts = require('yt-search');
    const res = await yts(query);
    const video = res?.videos?.[0];
    if (!video) throw new Error('No results');
    const vid = video.videoId || video.url?.match(/(?:v=|youtu\.be\/)([^&?#]+)/)?.[1];
    return {
      url: `https://www.youtube.com/watch?v=${vid}`,
      title: video.title || query,
      duration: video.duration?.seconds || 0,
      author: video.author?.name || '',
    };
  } catch (e) {
    throw new Error('YouTube search failed: ' + e.message);
  }
}

// ── Download audio from YouTube (multi-API fallback) ─────────
async function downloadYTAudio(ytUrl) {
  const dest = path.join(TEMP_DIR, `ytaudio_${Date.now()}.mp3`);

  // Method 1: cobalt
  for (const inst of ['https://api.cobalt.tools', 'https://cobalt.oisd.nl', 'https://cobalt.catvibers.me']) {
    try {
      const r = await axios.post(`${inst}/`, {
        url: ytUrl, downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '128',
      }, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 15000,
      });
      if (r?.data?.url) {
        const dl = await axios.get(r.data.url, {
          responseType: 'arraybuffer', timeout: 90000,
          maxContentLength: Infinity, maxBodyLength: Infinity,
        });
        const buf = Buffer.from(dl.data);
        if (buf.length > 10000) { fs.writeFileSync(dest, buf); return dest; }
      }
    } catch {}
  }

  // Method 2: fresh APIs
  const apis = [
    `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(ytUrl)}`,
    `https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(ytUrl)}`,
    `https://nayan-video-downloader.vercel.app/ytmp3?url=${encodeURIComponent(ytUrl)}`,
    `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(ytUrl)}`,
  ];
  for (const apiUrl of apis) {
    try {
      const r = await axios.get(apiUrl, { timeout: 30000 });
      const dlUrl = r?.data?.download_url || r?.data?.data?.dl || r?.data?.url || r?.data?.dl
        || r?.data?.mp3 || r?.data?.result?.download;
      if (dlUrl) {
        const dl = await axios.get(dlUrl, {
          responseType: 'arraybuffer', timeout: 90000,
          maxContentLength: Infinity, maxBodyLength: Infinity,
        });
        const buf = Buffer.from(dl.data);
        if (buf.length > 10000) { fs.writeFileSync(dest, buf); return dest; }
      }
    } catch {}
  }

  // Method 3: yt-dlp CLI
  const ytdlpArgs = [
    '--extractor-args "youtube:player_client=web_creator,ios"',
    '--extractor-args "youtube:player_client=tv_embedded,web_creator"',
    '',
  ];
  for (const args of ytdlpArgs) {
    try {
      const out = path.join(TEMP_DIR, `ytdlp_audio_${Date.now()}`);
      await execPromise(
        `yt-dlp -x --audio-format mp3 --audio-quality 0 ${args} --no-check-certificates -o "${out}.%(ext)s" "${ytUrl}" 2>/dev/null`,
        120000
      );
      const found = fs.readdirSync(TEMP_DIR).find(f => f.startsWith(path.basename(out)) && (f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.webm')));
      if (found) {
        const fp = path.join(TEMP_DIR, found);
        if (fs.statSync(fp).size > 10000) return fp;
      }
    } catch {}
  }

  throw new Error('All YT audio download methods failed');
}

// ── Download video from YouTube (multi-API fallback) ─────────
async function downloadYTVideo(ytUrl) {
  const dest = path.join(TEMP_DIR, `ytvideo_${Date.now()}.mp4`);

  // Method 1: cobalt
  for (const inst of ['https://api.cobalt.tools', 'https://cobalt.oisd.nl', 'https://cobalt.catvibers.me']) {
    try {
      const r = await axios.post(`${inst}/`, {
        url: ytUrl, downloadMode: 'auto', videoQuality: '480', filenameStyle: 'basic',
      }, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 15000,
      });
      if (r?.data?.url) {
        const dl = await axios.get(r.data.url, {
          responseType: 'arraybuffer', timeout: 300000,
          maxContentLength: Infinity, maxBodyLength: Infinity,
        });
        const buf = Buffer.from(dl.data);
        if (buf.length > 50000) { fs.writeFileSync(dest, buf); return dest; }
      }
    } catch {}
  }

  // Method 2: yt video APIs
  const apis = [
    `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(ytUrl)}&quality=360p`,
    `https://api.agatz.xyz/api/ytmp4?url=${encodeURIComponent(ytUrl)}&quality=360`,
    `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodeURIComponent(ytUrl)}`,
  ];
  for (const apiUrl of apis) {
    try {
      const r = await axios.get(apiUrl, { timeout: 30000 });
      const dlUrl = r?.data?.data?.url || r?.data?.url || r?.data?.dl || r?.data?.download_url;
      if (dlUrl) {
        const dl = await axios.get(dlUrl, {
          responseType: 'arraybuffer', timeout: 300000,
          maxContentLength: Infinity, maxBodyLength: Infinity,
        });
        const buf = Buffer.from(dl.data);
        if (buf.length > 50000) { fs.writeFileSync(dest, buf); return dest; }
      }
    } catch {}
  }

  // Method 3: yt-dlp CLI
  const ytdlpArgs = [
    '--extractor-args "youtube:player_client=web_creator,ios"',
    '--extractor-args "youtube:player_client=tv_embedded,web_creator"',
    '',
  ];
  for (const args of ytdlpArgs) {
    try {
      await execPromise(
        `yt-dlp -f "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]" --merge-output-format mp4 ${args} --no-check-certificates --no-playlist -o "${dest}" "${ytUrl}" 2>/dev/null`,
        180000
      );
      if (fs.existsSync(dest) && fs.statSync(dest).size > 50000) return dest;
    } catch {}
  }

  throw new Error('All YT video download methods failed');
}

// ── Clean temp file ───────────────────────────────────────────
function cleanTemp(...files) {
  for (const f of files) {
    if (f) try { fs.removeSync(f); } catch {}
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN MODULE
// ─────────────────────────────────────────────────────────────
module.exports = {
  commands: ['playaudio', 'playvideo', 'audioplay', 'videoplay'],
  description: 'Play audio/video — missed call effect + sends as voice note / video',

  async run({ sock, m }) {
    const cmd      = m.command;
    const isVideo  = cmd === 'playvideo' || cmd === 'videoplay';
    const target   = resolveTarget(m);
    const targetNum = target.split('@')[0];
    const chat     = m.chat;
    const query    = m.text?.trim() || '';
    const lang     = await getLang(m.sessionId || 'config');

    await m.react('⏳');

    // ── Detect mode ───────────────────────────────────────────
    // Mode A: replied to media
    // Mode B: typed a song/video name (YT search + download)
    // Mode C: YouTube URL directly

    const isYtUrl   = query.match(/(?:youtube\.com|youtu\.be)/);
    const hasQuery  = query.length > 0 && !isYtUrl;

    const allowedTypes = isVideo
      ? ['videoMessage', 'documentMessage']
      : ['audioMessage', 'documentMessage', 'videoMessage'];

    const media = await downloadMedia(sock, m, allowedTypes);
    const isReplyMode = !!media;
    const isQueryMode = !isReplyMode && (hasQuery || isYtUrl);

    if (!isReplyMode && !isQueryMode) {
      await m.react('❌');
      return m.reply(
        `📌 *Usage:* *.${cmd}*\n\n` +
        `${s(isVideo ? 'usage_video' : 'usage_audio', lang)}\n\n` +
        `*${s('example', lang)}:*\n` +
        `➤ Reply to media → \`.${cmd}\`\n` +
        `➤ Song/video name → \`.${cmd} Shape of You\`\n` +
        `➤ ${s('diff_number', lang)}: \`.${cmd} 94XXXXXXXXX\`\n\n` +
        `${cfg.footer}`
      );
    }

    // ── Status message ────────────────────────────────────────
    const statusMsg = await sock.sendMessage(chat, {
      text: isQueryMode
        ? `${s('downloading', lang)}\n━━━━━━━━━━━━━━━━━━━━━━\n🔍 *Query:* ${query}\n⏳ Please wait...\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`
        : `${s('calling', lang)}\n━━━━━━━━━━━━━━━━━━━━━━\n📱 *To:* +${targetNum}\n⏳ Please wait...\n━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`,
    }, { quoted: m.msg });
    const statusKey = statusMsg?.key || null;

    const editStatus = async (text) => {
      if (!statusKey) return;
      try { await sock.sendMessage(chat, { text: `${text}\n${cfg.footer}`, edit: statusKey }); } catch {}
    };

    let tempFiles = [];

    try {
      let audioBuf = null;
      let videoBuf = null;
      let mediaTitle = '';
      let mediaDuration = 0;

      // ── A. Reply mode — use the quoted media ─────────────────
      if (isReplyMode) {
        if (isVideo) {
          // Convert to mp4 if needed
          const rawPath = path.join(TEMP_DIR, `raw_${Date.now()}.tmp`);
          fs.writeFileSync(rawPath, media.buf);
          tempFiles.push(rawPath);
          let mp4Path;
          try {
            mp4Path = await toMp4(rawPath);
            tempFiles.push(mp4Path);
            videoBuf = fs.readFileSync(mp4Path);
          } catch {
            videoBuf = media.buf; // use raw if conversion fails
          }
          mediaDuration = mp4Path ? await getMediaDuration(mp4Path) : 0;
          mediaTitle = 'Video';
        } else {
          // Convert to OGG/Opus for PTT
          const rawPath = path.join(TEMP_DIR, `raw_${Date.now()}.tmp`);
          fs.writeFileSync(rawPath, media.buf);
          tempFiles.push(rawPath);
          let oggPath;
          try {
            oggPath = await toOpus(rawPath);
            tempFiles.push(oggPath);
            audioBuf = fs.readFileSync(oggPath);
          } catch {
            audioBuf = media.buf;
          }
          mediaDuration = oggPath ? await getMediaDuration(oggPath) : 0;
          mediaTitle = 'Voice Note';
        }
      }

      // ── B/C. Query/URL mode — YouTube download ────────────────
      if (isQueryMode) {
        let ytInfo;
        if (isYtUrl) {
          ytInfo = { url: query, title: query, duration: 0, author: '' };
        } else {
          await editStatus(
            `🔍 *Searching YouTube...*\n━━━━━━━━━━━━━━━━━━━━━━\n🎵 *Query:* ${query}\n⏳ Please wait...`
          );
          ytInfo = await searchYouTube(query);
        }

        mediaTitle    = ytInfo.title;
        mediaDuration = ytInfo.duration;

        await editStatus(
          `${s('yt_found', lang)}\n━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${isVideo ? '🎬' : '🎵'} *${ytInfo.title}*\n` +
          `${ytInfo.author ? `👤 *${ytInfo.author}*\n` : ''}` +
          `⬇️ Downloading...`
        );

        if (isVideo) {
          const fp = await downloadYTVideo(ytInfo.url);
          tempFiles.push(fp);
          videoBuf = fs.readFileSync(fp);
          mediaDuration = await getMediaDuration(fp);
        } else {
          const fp = await downloadYTAudio(ytInfo.url);
          tempFiles.push(fp);
          // Convert to opus for PTT
          let oggPath;
          try {
            oggPath = await toOpus(fp);
            tempFiles.push(oggPath);
            audioBuf = fs.readFileSync(oggPath);
          } catch {
            // fallback: send as mp3
            audioBuf = fs.readFileSync(fp);
          }
          mediaDuration = await getMediaDuration(fp);
        }
      }

      // ── Step 1: Missed call effect ────────────────────────────
      await editStatus(
        `${s('calling', lang)}\n━━━━━━━━━━━━━━━━━━━━━━\n📱 *To:* +${targetNum}\n⏳ Initiating call...`
      );

      // Initiate call in background (non-blocking, best-effort)
      makeCallAndHang(sock, target, isVideo).catch(() => {});

      // Brief wait so call arrives before media
      await new Promise(r => setTimeout(r, 800));

      // ── Step 2: Send the actual media ─────────────────────────
      await editStatus(
        `${s('sending', lang)}\n━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${isVideo ? '🎬' : '🎵'} *${mediaTitle}*\n` +
        `📱 *To:* +${targetNum}\n` +
        `${mediaDuration ? `⏱️ *Duration:* ${mediaDuration}s\n` : ''}` +
        `⏳ Uploading...`
      );

      const caption =
        `${isVideo ? '🎬' : '🎵'} *${mediaTitle}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📱 *From:* UNITY-MD Bot\n` +
        `${mediaDuration ? `⏱️ *Duration:* ${mediaDuration}s\n` : ''}` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${cfg.footer}`;

      if (isVideo) {
        // Send video to target
        await sock.sendMessage(target, {
          video: videoBuf,
          caption,
          mimetype: 'video/mp4',
        });
        // If target ≠ chat (group or different user), also notify in chat
        if (target !== chat) {
          await sock.sendMessage(chat, {
            video: videoBuf,
            caption,
            mimetype: 'video/mp4',
          });
        }
      } else {
        // Send as PTT voice note to target
        await sock.sendMessage(target, {
          audio: audioBuf,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true,
        });
        // If called from group, also post in group
        if (target !== chat) {
          await sock.sendMessage(chat, {
            audio: audioBuf,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
          });
        }
      }

      // ── Step 3: Done ──────────────────────────────────────────
      await m.react('✅');

      const sizeKB = isVideo
        ? (videoBuf?.length / 1024).toFixed(0)
        : (audioBuf?.length / 1024).toFixed(0);

      await editStatus(
        `${s(isVideo ? 'done_video' : 'done_audio', lang)}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${isVideo ? '🎬' : '🎵'} *${mediaTitle}*\n` +
        `📱 *To:* +${targetNum}\n` +
        `${mediaDuration ? `⏱️ *Duration:* ${mediaDuration}s\n` : ''}` +
        `📦 *Size:* ${sizeKB} KB\n` +
        `━━━━━━━━━━━━━━━━━━━━━━`
      );

      // Auto-delete status msg after 20s
      setTimeout(async () => {
        try { if (statusKey) await sock.sendMessage(chat, { delete: statusKey }); } catch {}
      }, 20000);

    } catch (e) {
      console.error('[CallPlay] Error:', e.message);
      await m.react('❌');
      await editStatus(
        `${s('failed', lang)}\n━━━━━━━━━━━━━━━━━━━━━━\n⚠️ ${e.message?.substring(0, 150)}\n━━━━━━━━━━━━━━━━━━━━━━`
      );
      setTimeout(async () => {
        try { if (statusKey) await sock.sendMessage(chat, { delete: statusKey }); } catch {}
      }, 25000);
    } finally {
      cleanTemp(...tempFiles);
    }
  },
};
