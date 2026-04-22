'use strict';
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const cfg   = require('../../config');
const { getT } = require('../lang');

const MENU_DIR      = path.join(__dirname, '../../database/menucards');
const FETCH_TIMEOUT = 30000;

// Ensure menucards directory exists
if (!fs.existsSync(MENU_DIR)) fs.mkdirSync(MENU_DIR, { recursive: true });

// nekos.best image category mapped to each menu section (1-15)
// Available image categories on nekos.best: neko, waifu, kitsune, husbando
// Rotated across sections so each menu card gets a different style
const NEKO_CATEGORY_MAP = {
  1:  'neko',       // Bot Controls
  2:  'waifu',      // Group Management
  3:  'kitsune',    // Downloads
  4:  'neko',       // AI
  5:  'waifu',      // Sticker / Media
  6:  'kitsune',    // Fun
  7:  'neko',       // Tools
  8:  'waifu',      // Anime
  9:  'kitsune',    // Games
  10: 'neko',       // Protection
  11: 'waifu',      // Auto Systems
  12: 'kitsune',    // Channel
  13: 'neko',       // Sri Lanka
  14: 'waifu',      // Stats
  15: 'kitsune',    // Public APIs & Info
};

// Per-category pools so we don't mix URLs
const nekoPools = {};

/** Fetch image URLs using the same APIs that work for .neko/.waifu commands */
async function fetchImageFromWorkingAPIs(category) {
  // Try multiple APIs in order — same ones used by the .neko/.waifu commands
  const axios = require('axios');

  // 1. waifu.pics — returns JPEG images, no auth needed
  try {
    const type = category === 'waifu' ? 'waifu' : 'neko';
    const r = await axios.get(`https://api.waifu.pics/sfw/${type}`, { timeout: 15000 });
    const url = r.data?.url;
    if (url) return url;
  } catch {}

  // 2. nekos.life — image endpoint
  try {
    const type = category === 'waifu' ? 'waifu' : 'neko';
    const r = await axios.get(`https://nekos.life/api/v2/img/${type}`, { timeout: 15000 });
    const url = r.data?.url;
    if (url) return url;
  } catch {}

  // 3. otakugifs.xyz
  try {
    const r = await axios.get(`https://api.otakugifs.xyz/gif?reaction=neko`, { timeout: 15000 });
    const url = r.data?.url;
    if (url) return url;
  } catch {}

  // 4. some-random-api
  try {
    const r = await axios.get(`https://some-random-api.com/animu/wink`, { timeout: 15000 });
    const url = r.data?.link;
    if (url) return url;
  } catch {}

  // 5. nekos.best (last resort — may 403 on some servers)
  try {
    const type = NEKO_CATEGORY_MAP[1] || 'neko';
    const response = await axios.get(`https://nekos.best/api/v2/${type}`, { timeout: 15000 });
    const url = response.data?.results?.[0]?.url;
    if (url) return url;
  } catch {}

  throw new Error('All image APIs failed');
}

/** Get one image URL for a given section index */
async function fetchNekoImage(sectionIndex) {
  const category = NEKO_CATEGORY_MAP[sectionIndex] || 'neko';
  // Use pool to avoid hammering APIs
  if (!nekoPools[category] || nekoPools[category].length === 0) {
    nekoPools[category] = [];
    // Pre-fetch 5 URLs into pool
    let filled = 0;
    for (let i = 0; i < 5; i++) {
      try {
        const url = await fetchImageFromWorkingAPIs(category);
        if (url) { nekoPools[category].push(url); filled++; }
      } catch {}
    }
    if (filled === 0) throw new Error('Could not pre-fill image pool from any API');
  }
  return nekoPools[category].pop();
}


async function downloadImage(url, destPath, redirects = 0) {
  if (redirects > 5) throw new Error('Too many redirects');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Download timeout')), FETCH_TIMEOUT);
    const lib = url.startsWith('https') ? require('https') : require('http');
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UNITY-MD/2.0)' } }, res => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        clearTimeout(timer);
        res.resume();
        return downloadImage(res.headers.location, destPath, redirects + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timer);
        const buf = Buffer.concat(chunks);
        // Validate: must be at least 10KB and start with JPEG/PNG magic bytes
        const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
        const isPng  = buf[0] === 0x89 && buf[1] === 0x50;
        if (buf.length < 10000) {
          return reject(new Error(`File too small (${buf.length} bytes) — likely not a real image`));
        }
        if (!isJpeg && !isPng) {
          return reject(new Error(`Not a valid image (magic bytes: ${buf[0].toString(16)} ${buf[1].toString(16)})`));
        }
        fs.writeFileSync(destPath, buf);
        resolve(true);
      });
    }).on('error', e => { clearTimeout(timer); reject(e); });
  });
}

/** Validate that a file is a real JPEG (checks magic bytes and minimum size) */
function isValidJpeg(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    const size = fs.statSync(filePath).size;
    // JPEG magic: FF D8 FF, minimum real image ~10KB
    return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF && size > 10000;
  } catch { return false; }
}

/** Refresh all 15 menu images using the same APIs as .neko/.waifu commands */
async function refreshMenuImages() {
  const results = [];
  for (let i = 1; i <= 15; i++) {
    const file = `menu_${String(i).padStart(2, '0')}.jpg`;
    const dest = path.join(MENU_DIR, file);
    let success = false;
    // Retry up to 6 times — nekos.best only, no other fallback
    for (let attempt = 1; attempt <= 6 && !success; attempt++) {
      try {
        const url = await fetchNekoImage(i);
        await downloadImage(url, dest);
        if (!isValidJpeg(dest)) {
          try { fs.unlinkSync(dest); } catch {}
          throw new Error('Not a valid JPEG');
        }
        console.log(`[imenu] ✅ ${file} saved from nekos.best (attempt ${attempt})`);
        success = true;
      } catch (err) {
        console.error(`[imenu] ❌ ${file} attempt ${attempt} failed:`, err.message);
        if (attempt < 6) await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    results.push({ section: i, success });
  }
  return results;
}


// ── Section definitions (uses string keys for i18n) ──────────
const SECTIONS = [
  { file: 'menu_01.jpg', icon: '🤖', titleKey: 'imenu_title_bot',     cmd: 'botmenu',      labelKey: 'imenu_open_bot',     cmds: ['alive','bot','ping','runtime','speed','block','unblock','settings','setprefix','setname','setbio','setppbot','setownerdp','delownerdp','botmode','groupmode','inboxmode','privatemode','publicmode'] },
  { file: 'menu_02.jpg', icon: '👥', titleKey: 'imenu_title_group',   cmd: 'groupmenu',    labelKey: 'imenu_open_group',   cmds: ['tagall', 'hidetag', 'add', 'kick', 'promote', 'demote', 'welcome', 'setname', 'setdesc', 'grouplink', 'glink', 'warn', 'warnings', 'resetwarn', 'ban', 'unban', 'mute', 'unmute', 'unwarn', 'remove', 'everyone', 'tgall', 'tgna', 'tagnotadmin', 'tag', 'del', 'delete', 'ginfo', 'resetlink', 'newlink', 'poll', 'pin', 'unpin', 'disappearing', 'topmembers', 'topmsg', 'approve', 'acceptreq', 'reject', 'rejectreq', 'viewreq', 'joinrequests', 'addmember', 'removeall', 'kickall', 'kickme', 'leavegroup', 'setsubject', 'setdescription', 'invitelink', 'link', 'tagadmin', 'tgadmin', 'opentime', 'closetime', 'open', 'close', 'rules', 'setrules', 'faq', 'setfaq', 'copygc', 'linkgc', 'revoke', 'membercount', 'members', 'kickinactive', 'setkeyword', 'addkeyword', 'delkeyword', 'antitag', 'staff'] },
  { file: 'menu_03.jpg', icon: '📥', titleKey: 'imenu_title_dl',      cmd: 'downloadmenu', labelKey: 'imenu_open_dl',      cmds: ['song', 'mp3', 'play', 'tiktok', 'mp4', 'video', 'filmdownload', 'instagram', 'facebook', 'twitter', 'twdl', 'mediafire', 'mfire', 'ig', 'fb', 'gdrive', 'gdrive2', 'googledrive', 'downurl', 'down', 'dlurl', 'apk', 'apkdl', 'rw', 'wallpaper', 'wall', 'randomwall', 'ytmp3', 'tomp3', 'toaudio', 'tovn', 'tovoice', 'aivoice', 'vai', 'voicex', 'voiceai', 'ytmp4', 'ytvideo', 'vid', 'ytsong', 'song2', 'play2', 'play3', 'ttdl', 'tt', 'ttmp4', 'ttsearch', 'pinsearch', 'pinterest', 'fdl', 'fdownload', 'movie', 'cinesubz', 'sinhalafilm', 'sinhalamovie'] },
  { file: 'menu_04.jpg', icon: '🤖', titleKey: 'imenu_title_ai',      cmd: 'aimenu',       labelKey: 'imenu_open_ai',      cmds: ['ai', 'gpt', 'llama3', 'chatai', 'clearai', 'imagine', 'flux', 'sora', 'gemini', 'openai', 'chatgpt', 'gpt3', 'gpt5', 'deepseek', 'deep', 'seekai', 'mistral', 'unity', 'resetai', 'gimage', 'googleimage', 'wiki', 'wikipedia', 'whatsappstalk', 'wastalk', 'githubstalk', 'github', 'github2', 'imdb', 'cricket', 'ytstalk', 'ytinfo', 'xstalk', 'twitterstalk', 'twtstalk', 'tiktokstalk', 'tstalk', 'ttstalk', 'npm', 'npmsearch', 'npminfo', 'srepo', 'repo', 'source'] },
  { file: 'menu_05.jpg', icon: '🎨', titleKey: 'imenu_title_sticker', cmd: 'stickermenu',  labelKey: 'imenu_open_sticker', cmds: ['sticker', 'attp', 'crop', 'take', 'emojimix', 'rmbg', 'blur', 'remini', 'toimg', 's', 'stiker', 'stickerfit', 'stickercrop', 'stickertoimg', 'removebg', 'nobg', 'rvo', 'viewonce', 'vv', 'retrive', 'revealvo', 'invert', 'negative', 'grayscale', 'resize', 'compress', 'colorize', 'circle', 'square', 'imgpdf', 'topdf', 'toqr'] },
  { file: 'menu_06.jpg', icon: '😂', titleKey: 'imenu_title_fun',     cmd: 'funmenu',      labelKey: 'imenu_open_fun',     cmds: ['joke', 'quote', 'fact', 'meme', 'flirt', 'compliment', 'insult', 'wasted', 'hack', 'ship', 'confess', 'confession', 'fakescreenshot', 'fakechat', 'afk', 'delafk', 'joke2', 'comrade', 'namecard', 'character', 'oogway', 'tweet', 'ytcomment', 'triggered', 'spam', 'fakenumber', 'fakeno', 'genfake', 'simp', 'stupid', 'goodnight', 'shayari', 'roseday', 'chatcount', 'nokia', 'nokiamsg', 'jail', 'wanted', 'chuck', 'chucknorris', 'advice', 'activity', 'bored', 'uselessfact', 'kanye', 'catfact', 'catpic', 'dogpic', 'foxpic'] },
  { file: 'menu_07.jpg', icon: '🛠️', titleKey: 'imenu_title_tools',   cmd: 'toolsmenu',    labelKey: 'imenu_open_tools',   cmds: ['tts', 'tr', 'qr', 'ping', 'runtime', 'calc', 'weather', 'shorturl', 'jid', 'privacy', 'texttospeech', 'translate', 'toqr', 'calculate', 'bmi', 'age', 'pass', 'password', 'ascii', 'fancy', 'styletext', 'morse', 'unmorse', 'binary', 'unbinary', 'mirror', 'reverse', 'zalgo', 'glitch', 'bold', 'italic', 'mono', 'flip', 'sinhalafont', 'uppercase', 'lowercase', 'snake', 'camel', 'logo', 'textlogo', 'url', 'country', 'countryinfo', 'nation', 'simdata', 'siminfo', 'checknum', 'checkwa', 'wacheck', 'wavalidate', 'wanumber', 'numinfo', 'exchange', 'convert', 'crypto', 'cryptoprice', 'colorinfo', 'numfact', 'screenshot', 'ss'] },
  { file: 'menu_08.jpg', icon: '🎌', titleKey: 'imenu_title_anime',   cmd: 'animemenu',    labelKey: 'imenu_open_anime',   cmds: ['animeinfo','manga','dragonball','dbz'] },
  { file: 'menu_09.jpg', icon: '🎮', titleKey: 'imenu_title_games',   cmd: 'gamemenu',     labelKey: 'imenu_open_games',   cmds: ['ttt', 'hangman', 'trivia', 'truth', 'dare', 'slots', 'slot', 'riddle', 'eightball', 'calc', 'blackjack', 'bj', 'bjhit', 'bjstand', 'guess', 'answer', 'tictactoe', 'tttmove', 'snake'] },
  { file: 'menu_10.jpg', icon: '🛡️', titleKey: 'imenu_title_protection', cmd: 'protectionmenu', labelKey: 'imenu_open_protection', cmds: ['antilink', 'antispam', 'antidelete', 'anticall', 'antitoxic', 'antiforward', 'antiraid', 'flooddetect', 'badwords', 'addbadword', 'delbadword', 'antibadword', 'badword', 'slowmode', 'captcha', 'pmblocker', 'pmblock', 'setwelcome', 'goodbye', 'setgoodbye', 'moroccoblock', 'autoblock'] },
  { file: 'menu_11.jpg', icon: '⚡', titleKey: 'imenu_title_auto',    cmd: 'automenu',     labelKey: 'imenu_open_auto',    cmds: ['autoread', 'autoreact', 'setreactemojis', 'autopresence', 'setpresencetype', 'autovoice', 'addautovoice', 'listautovoice', 'delautovoice', 'autostickerreply', 'addautosticker', 'listautosticker', 'delautosticker', 'autoreply', 'addautoreply', 'listautoreply', 'delautoreply', 'autoapprove', 'autobio', 'autoonline', 'autorecording'] },
  { file: 'menu_12.jpg', icon: '📡', titleKey: 'imenu_title_channel', cmd: 'channelmenu',  labelKey: 'imenu_open_channel', cmds: ['chpost', 'channelpost', 'chaudio', 'chvideo', 'chschedule', 'channelschedule', 'chdel', 'channeldel', 'chstats', 'channelstats', 'chdesc', 'channeldesc', 'chname', 'channelname', 'chlist', 'channellist', 'chpromo', 'channelpromo', 'setmychannel', 'chr', 'creact', 'cid', 'channelreact', 'reactchannel', 'followchannel', 'boost', 'view', 'forwardall', 'fwdall', 'fwdg', 'fwdgroup', 'massdm', 'msg', 'schedule', 'forward', 'upsw', 'readsw', 'statuslist', 'statusreact', 'statusview', 'wastatus', 'wstatus', 'broadcast', 'bc'] },
  { file: 'menu_13.jpg', icon: '🇱🇰', titleKey: 'imenu_title_srilanka', cmd: 'srilankmenu', labelKey: 'imenu_open_srilanka', cmds: ['news', 'adarana', 'esana', 'esananews', 'lyrics', 'lyric', 'sinhalalyrics', 'wthr', 'holiday', 'holidays', 'cinema', 'define', 'dict', 'dictionary', 'meaning', 'sinhaladict'] },
  { file: 'menu_14.jpg', icon: '📊', titleKey: 'imenu_title_stats',   cmd: 'statsmenu',   labelKey: 'imenu_open_stats',   cmds: ['mystats', 'rank', 'leaderboard', 'topcmds', 'botstats', 'botinfo', 'groupstats', 'screenshot', 'ss', 'cinfo', 'staff', 'status', 'presence', 'setonline', 'settyping', 'setrecording', 'runtime', 'version', 'cmds', 'help', 'owner', 'sysinfo', 'dbstats'] },
  { file: 'menu_15.jpg', icon: '🌐', titleKey: 'imenu_title_apis',    cmd: 'apismenu',    labelKey: 'imenu_open_apis',    cmds: ['recipe', 'cocktail', 'drink', 'nasa', 'apod', 'book', 'openlibrary', 'onthisday', 'histday', 'nba', 'nbascore', 'phonespec', 'exchange', 'convert', 'crypto', 'cryptoprice', 'colorinfo', 'numfact', 'catfact', 'catpic', 'dogpic', 'foxpic', 'chuck', 'advice', 'activity', 'uselessfact', 'kanye', 'animeinfo', 'manga', 'dragonball', 'dbz'] },
];

function buildCardBody(sec, idx, total, date, time, tr) {
  const cmdLines = sec.cmds.map(c => `› .${c}`).join('\n');
  return (
    `━━━━━━━━━━━━━━━━━━━\n` +
    `${sec.icon} *${tr(sec.titleKey)}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `${cmdLines}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `${tr('imenu_tap')} ${sec.icon}\n` +
    `📅 ${date}  🕐 ${time}  |  ${idx + 1}/${total}`
  );
}

function getNow(tz = 'Asia/Colombo') {
  try {
    const now  = new Date();
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    return { date, time };
  } catch {
    const d = new Date();
    return {
      date: d.toLocaleDateString('en-GB'),
      time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
  }
}

module.exports = {
  refreshMenuImages,
  commands: ['imenu', 'menu2', 'imrefresh'],
  ownerOnly: true,

  async run({ sock, m }) {
    const chat     = m.chat;

    // ── .imrefresh — force redownload all menu images ─────────
    if (m.command === 'imrefresh') {
      await m.reply('🔄 Refreshing menu images... please wait.');
      try {
        const results = await refreshMenuImages();
        const ok  = results.filter(r => r.success).length;
        const fail = results.length - ok;
        await m.reply(
          `✅ *Menu Images Refreshed*\n\n` +
          `📸 Downloaded: ${ok}/15\n` +
          (fail ? `❌ Failed: ${fail}\n` : '') +
          `\nRun *.imenu* to see the updated menu.`
        );
      } catch (e) {
        await m.reply(`❌ Refresh failed: ${e.message}`);
      }
      return;
    }

    const prefix   = cfg.prefix   || '.';
    const botName  = cfg.botName  || 'UNITY-MD';
    const timezone = cfg.timezone || 'Asia/Colombo';
    const userName = m.pushName   || 'User';
    const { date, time } = getNow(timezone);
    const total = SECTIONS.length;

    // ── Load translator for current session language (en/si/ta) ──
    const tr = await getT(m.sessionOwner);

    // ── Time-based greeting ───────────────────────────────────
    const hour = new Date().getHours();
    const greeting = hour < 12
      ? tr('menu_greeting_morn')
      : hour < 17
        ? tr('menu_greeting_aft')
        : tr('menu_greeting_eve');

    try { await sock.sendMessage(chat, { delete: m.key }); } catch {}

    try {
      const {
        generateWAMessageFromContent,
        prepareWAMessageMedia,
        proto,
      } = require('@whiskeysockets/baileys');

      // ── Build carousel cards (one per section) ────────────────
      const cards = [];

      for (let i = 0; i < SECTIONS.length; i++) {
        const sec     = SECTIONS[i];
        const imgPath = path.join(MENU_DIR, sec.file);

        if (!fs.existsSync(imgPath)) {
          console.warn(`[imenu] Missing image: ${imgPath}`);
          continue;
        }

        // Skip corrupt/invalid files (e.g. API error pages saved as jpg)
        if (!isValidJpeg(imgPath)) {
          console.warn(`[imenu] Invalid JPEG, skipping: ${imgPath} — run .imrefresh to redownload`);
          try { fs.unlinkSync(imgPath); } catch {}
          continue;
        }

        const imgBuf = fs.readFileSync(imgPath);

        // Upload image to WhatsApp CDN
        let media;
        try {
          media = await prepareWAMessageMedia(
            { image: imgBuf },
            { upload: sock.waUploadToServer }
          );
        } catch (uploadErr) {
          console.error(`[imenu] Upload failed for ${sec.file}:`, uploadErr.message);
          continue;
        }

        const card = proto.Message.InteractiveMessage.create({
          header: proto.Message.InteractiveMessage.Header.create({
            hasMediaAttachment: true,
            imageMessage: media.imageMessage,
          }),
          body: proto.Message.InteractiveMessage.Body.create({
            text: buildCardBody(sec, i, total, date, time, tr),
          }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [{
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({
                display_text: tr(sec.labelKey),
                id: `${prefix}${sec.cmd}`,
              }),
            }],
          }),
        });

        cards.push(card);
      }

      if (cards.length === 0) {
        // Auto-trigger background download if images are missing
        setImmediate(async () => {
          try {
            console.log('[imenu] Auto-fetching missing menu images...');
            await refreshMenuImages();
            console.log('[imenu] Auto-fetch complete.');
          } catch (e) {
            console.error('[imenu] Auto-fetch failed:', e.message);
          }
        });
        return await m.reply(tr('imenu_no_imgs'));
      }

      // ── Carousel cover text ───────────────────────────────────
      const headerText =
        `╔══════════════════════╗\n` +
        `║   🧲 *${botName} Menu*   ║\n` +
        `╚══════════════════════╝\n\n` +
        `${greeting}, *${userName}*!\n` +
        `📅 ${tr('imenu_date_lbl')} ${date}  🕐 ${tr('imenu_time_lbl')} ${time}\n\n` +
        `${tr('imenu_swipe')}`;

      // ── Send as side-scroll carousel ──────────────────────────
      const carouselMsg = await generateWAMessageFromContent(chat, {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: proto.Message.InteractiveMessage.create({
              body: proto.Message.InteractiveMessage.Body.create({ text: headerText }),
              footer: proto.Message.InteractiveMessage.Footer.create({ text: `® UNITY TEAM | ${botName}` }),
              header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
              carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({ cards }),
            }),
          },
        },
      }, {});

      await sock.relayMessage(carouselMsg.key.remoteJid, carouselMsg.message, {
        messageId: carouselMsg.key.id,
        additionalNodes: [{
          tag: 'biz',
          attrs: {},
          content: [{
            tag: 'interactive',
            attrs: { type: 'native_flow', v: '1' },
            content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
          }],
        }],
      });

    } catch (e) {
      console.error('[imenu] Carousel error:', e);
      // ── Fallback: individual image messages ───────────────────
      try {
        for (let i = 0; i < SECTIONS.length; i++) {
          const sec = SECTIONS[i];
          const imgPath = path.join(MENU_DIR, sec.file);
          if (!fs.existsSync(imgPath)) continue;
          const imgBuf = fs.readFileSync(imgPath);
          await new Promise(r => setTimeout(r, 300));
          await sock.sendMessage(chat, {
            image: imgBuf,
            caption: buildCardBody(sec, i, SECTIONS.length, date, time, tr),
          });
        }
      } catch (fallbackErr) {
        await m.reply(`❌ ${fallbackErr.message}`);
      }
    }
  },
};

// ── Auto-reload on file change ──────────────────────────────
const _fs   = require('fs');
const _file = require.resolve(__filename);
_fs.watchFile(_file, () => {
  _fs.unwatchFile(_file);
  delete require.cache[_file];
  require(_file);
});
