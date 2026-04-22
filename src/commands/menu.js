'use strict';
const cfg = require('../../config');
const { plugins } = require('./messageHandler');
const { sendButtons } = require('./helper');
const moment = require('moment-timezone');
const fs = require('fs-extra');
const db = require('./index');
const { getT } = require('../lang');

const menuButtonKeys = new Map();
async function deleteMenuButtons(sock, chat) {
  const keys = menuButtonKeys.get(chat);
  if (!keys) return;
  menuButtonKeys.delete(chat);
  for (const key of keys) try { await sock.sendMessage(chat, { delete: key }); } catch {}
}

async function cmdEmoji(cmdName) {
  try {
    const on = await db.isCommandEnabled(cmdName);
    return on ? '✅' : '❌';
  } catch { return '❌'; }
}

async function buildCmdList(commands) {
  const lines = [];
  for (const [c, desc] of commands) {
    const e = await cmdEmoji(c.replace(/^\./, ''));
    lines.push(`${e} ${c} ⟶ ${desc}`);
  }
  return lines.join('\n');
}

const subMenus = {

  bot: {
    title: '🤖 𝘽𝙤𝙩 𝘾𝙤𝙣𝙩𝙧𝙤𝙡𝙨',
    commands: [
      ['.alive',      'Bot Status Check'],
      ['.bot',        'Bot Info'],
      ['.ping',       'Bot Speed Test'],
      ['.runtime',    'Bot Uptime'],
      ['.speed',      'Connection Speed'],
      ['.block',      'Block User'],
      ['.unblock',    'Unblock User'],
      ['.settings',   'Bot Settings'],
      ['.setprefix',  'Change Prefix'],
      ['.setname',    'Set Bot Name'],
      ['.setbio',     'Set Bot Bio'],
      ['.setppbot',   'Set Bot Profile Pic'],
      ['.setownerdp', 'Set Owner Profile Pic'],
      ['.delownerdp', 'Remove Owner Profile Pic'],
      ['.botmode',    'Bot Mode (public/private)'],
      ['.groupmode',  'Group Mode'],
      ['.inboxmode',  'Inbox Mode'],
      ['.privatemode','Private Mode'],
      ['.publicmode', 'Public Mode'],
    ],
  },

  group: {
    title: '👥 𝙂𝙧𝙤𝙪𝙥 𝙈𝙖𝙣𝙖𝙜𝙚𝙢𝙚𝙣𝙩',
    commands: [
      ['.tagall',        'Tag All Members'],
      ['.hidetag',       'Silent Tag All'],
      ['.add',           'Add Member'],
      ['.kick',          'Kick Member'],
      ['.promote',       'Make Admin'],
      ['.demote',        'Remove Admin'],
      ['.welcome',       'Welcome Message'],
      ['.setdesc',       'Set Description'],
      ['.grouplink',     'Get Group Link'],
      ['.warn',          'Warn Member'],
      ['.warnings',      'View Warnings'],
      ['.resetwarn',     'Reset Warnings'],
      ['.ban',           'Ban User'],
      ['.unban',         'Unban User'],
      ['.mute',          'Mute Group'],
      ['.unmute',        'Unmute Group'],
      ['.del',           'Delete Message'],
      ['.ginfo',         'Group Info'],
      ['.resetlink',     'Reset Group Link'],
      ['.poll',          'Create Poll'],
      ['.pin',           'Pin Message'],
      ['.unpin',         'Unpin Message'],
      ['.disappearing',  'Disappearing Messages'],
      ['.topmembers',    'Top Active Members'],
      ['.topmsg',        'Top Message Count'],
      ['.approve',       'Approve Join Request'],
      ['.reject',        'Reject Join Request'],
      ['.viewreq',       'View Join Requests'],
      ['.addmember',     'Add Member (Alt)'],
      ['.kickall',       'Kick All Members'],
      ['.kickme',        'Leave Group (Self)'],
      ['.leavegroup',    'Bot Leave Group'],
      ['.setsubject',    'Set Group Subject'],
      ['.setdescription','Set Group Description'],
      ['.invitelink',    'Get Invite Link'],
      ['.tagadmin',      'Tag Admins Only'],
      ['.opentime',      'Schedule Group Open'],
      ['.closetime',     'Schedule Group Close'],
      ['.open',          'Open Group'],
      ['.close',         'Close Group'],
      ['.rules',         'View Group Rules'],
      ['.setrules',      'Set Group Rules'],
      ['.faq',           'View FAQ'],
      ['.setfaq',        'Set FAQ'],
      ['.revoke',        'Revoke Group Link'],
      ['.membercount',   'Member Count'],
      ['.members',       'Member List'],
      ['.kickinactive',  'Kick Inactive Members'],
      ['.setkeyword',    'Set Keyword Reply'],
      ['.addkeyword',    'Add Keyword'],
      ['.delkeyword',    'Delete Keyword'],
      ['.antitag',       'Anti Tag Protection'],
      ['.copygc',        'Copy Group to New'],
      ['.staff',         'Group Admins List'],
      ['.glink',         'Group Link (Short)'],
    ],
  },

  download: {
    title: '📥 𝘿𝙤𝙬𝙣𝙡𝙤𝙖𝙙𝙨',
    commands: [
      ['.song',          'Download Song'],
      ['.mp3',           'YouTube MP3 Audio'],
      ['.play',          'Play / Download Song'],
      ['.tiktok',        'TikTok Video Download'],
      ['.mp4',           'YouTube MP4 Video'],
      ['.video',         'Download Video (YT/TikTok)'],
      ['.filmdownload',  'Film Downloader (50+ methods)'],
      ['.instagram',     'Instagram Download'],
      ['.facebook',      'Facebook Video'],
      ['.twitter',       'Twitter/X Media'],
      ['.mediafire',     'MediaFire Download'],
      ['.ig',            'Instagram (Short)'],
      ['.facebook',      'Facebook Download'],
      ['.gdrive',        'Google Drive Download'],
      ['.gdrive2',       'Google Drive (Alt)'],
      ['.downurl',       'Download from URL'],
      ['.apk',           'APK Downloader'],
      ['.rw',            'Reels / Shorts Download'],
      ['.wallpaper',     'Wallpaper Download'],
      ['.ytmp3',         'YouTube to MP3'],
      ['.tomp3',         'Convert to MP3'],
      ['.toaudio',       'Convert to Audio'],
      ['.tovn',          'Convert to Voice Note'],
      ['.aivoice',       'AI Voice Conversion'],
      ['.ytmp4',         'YouTube to MP4'],
      ['.ytvideo',       'YouTube Video Download'],
      ['.ytsong',        'YouTube Song Download'],
      ['.ttdl',          'TikTok Download (Alt)'],
      ['.ttsearch',      'TikTok Search'],
      ['.pinsearch',     'Pinterest Search'],
      ['.pinterest',     'Pinterest Download'],
      ['.fdl',           'Fast Download'],
      ['.movie',         'Movie Search / Download'],
      ['.cinesubz',      'Cinesubz Movies'],
      ['.sinhalafilm',   'Sinhala Film Search'],
      ['.sinhalamovie',  'Sinhala Movie Download'],
      ['.mfire',         'MediaFire (Short)'],
      ['.twdl',          'Twitter Download (Short)'],
      ['.play2',         'Play (Alt Method)'],
      ['.play3',         'Play (Alt Method 2)'],
      ['.song2',         'Song (Alt Method)'],
      ['.ttmp4',         'TikTok MP4'],
    ],
  },

  ai: {
    title: '🤖 𝘼𝙄 & 𝙎𝙚𝙖𝙧𝙘𝙝',
    commands: [
      ['.ai',           'Gemini AI Chat'],
      ['.gpt',          'GPT AI Chat'],
      ['.llama3',       'Llama3 AI Chat'],
      ['.chatai',       'ChatAI'],
      ['.clearai',      'Reset AI Memory'],
      ['.imagine',      'AI Image (Flux)'],
      ['.flux',         'AI Image (Flux)'],
      ['.sora',         'AI Image (Sora)'],
      ['.gemini',       'Gemini AI'],
      ['.openai',       'OpenAI Chat'],
      ['.chatgpt',      'ChatGPT'],
      ['.gpt3',         'GPT-3'],
      ['.gpt5',         'GPT-5'],
      ['.deepseek',     'DeepSeek AI'],
      ['.deep',         'DeepSeek (Short)'],
      ['.mistral',      'Mistral AI'],
      ['.unity',        'Unity AI'],
      ['.resetai',      'Reset AI Session'],
      ['.gimage',       'Google Image Search'],
      ['.googleimage',  'Google Image (Full)'],
      ['.wiki',         'Wikipedia'],
      ['.wikipedia',    'Wikipedia (Full)'],
      ['.whatsappstalk','WA Account Lookup'],
      ['.githubstalk',  'GitHub Profile'],
      ['.imdb',         'Movie Info (IMDB)'],
      ['.cricket',      'Live Cricket Scores'],
      ['.ytstalk',      'YouTube Channel Info'],
      ['.xstalk',       'X / Twitter Profile'],
      ['.tiktokstalk',  'TikTok Profile Info'],
      ['.npm',          'NPM Package Search'],
      ['.srepo',        'Search GitHub Repo'],
      ['.source',       'Bot Source Code'],
      ['.seekai',       'DeepSeek (Alt)'],
      ['.npmsearch',    'NPM Search'],
      ['.npminfo',      'NPM Package Info'],
      ['.repo',         'GitHub Repo Info'],
      ['.ytinfo',       'YouTube Info'],
      ['.twtstalk',     'Twitter Stalk (Alt)'],
      ['.tstalk',       'TikTok Stalk (Alt)'],
      ['.wastalk',      'WA Stalk (Short)'],
      ['.github2',      'GitHub (Alt)'],
    ],
  },

  sticker: {
    title: '🎨 𝙎𝙩𝙞𝙘𝙠𝙚𝙧 & 𝙈𝙚𝙙𝙞𝙖',
    commands: [
      ['.sticker',      'Make Sticker'],
      ['.attp',         'Text Sticker'],
      ['.crop',         'Crop Sticker'],
      ['.take',         'Steal Sticker Pack'],
      ['.emojimix',     'Mix Emojis'],
      ['.rmbg',         'Remove Background'],
      ['.blur',         'Blur Image'],
      ['.remini',       'AI Enhance Image'],
      ['.toimg',        'Sticker to Image'],
      ['.s',            'Sticker (Quick)'],
      ['.stickerfit',   'Sticker Fit'],
      ['.stickercrop',  'Sticker Crop'],
      ['.stickertoimg', 'Sticker to Image (Full)'],
      ['.removebg',     'Remove BG (Alt)'],
      ['.nobg',         'No Background'],
      ['.rvo',          'Reveal View Once'],
      ['.viewonce',     'View Once Media'],
      ['.vv',           'View Vanish Media'],
      ['.retrive',      'Retrieve VO Media'],
      ['.revealvo',     'Reveal VO (Alt)'],
      ['.stiker',       'Sticker (Alt Spelling)'],
      ['.invert',       'Invert Image Colors'],
      ['.negative',     'Negative Image'],
      ['.grayscale',    'Grayscale Image'],
      ['.resize',       'Resize Image'],
      ['.compress',     'Compress Image'],
      ['.colorize',     'Colorize Image'],
      ['.circle',       'Circle Crop Image'],
      ['.square',       'Square Crop Image'],
      ['.imgpdf',       'Image to PDF'],
      ['.topdf',        'Convert to PDF'],
      ['.toqr',         'Text to QR Code'],
    ],
  },

  fun: {
    title: '😂 𝙁𝙪𝙣 & 𝙈𝙚𝙢𝙚𝙨',
    commands: [
      ['.joke',          'Random Joke'],
      ['.quote',         'Inspirational Quote'],
      ['.fact',          'Random Fact'],
      ['.meme',          'Random Meme'],
      ['.flirt',         'Flirt Line'],
      ['.compliment',    'Compliment'],
      ['.insult',        'Insult'],
      ['.wasted',        'Wasted Effect'],
      ['.hack',          'Fake Hack Animation'],
      ['.ship',          'Ship Match %'],
      ['.confess',       'Confession Message'],
      ['.fakescreenshot','Fake Screenshot'],
      ['.fakechat',      'Fake Chat Image'],
      ['.afk',           'AFK Mode On'],
      ['.delafk',        'AFK Mode Off'],
      ['.joke2',         'Joke (Alt)'],
      ['.comrade',       'Comrade Image'],
      ['.namecard',      'Name Card Image'],
      ['.character',     'Character Analysis'],
      ['.oogway',        'Oogway Quote Image'],
      ['.tweet',         'Fake Tweet Image'],
      ['.ytcomment',     'Fake YT Comment'],
      ['.triggered',     'Triggered GIF'],
      ['.spam',          'Spam Messages'],
      ['.fakenumber',    'Fake Number Card'],
      ['.simp',          'Simp Meter'],
      ['.stupid',        'Stupid Meter'],
      ['.goodnight',     'Good Night Image'],
      ['.shayari',       'Shayari'],
      ['.roseday',       'Rose Day Image'],
      ['.chatcount',     'Chat Message Count'],
      ['.confession',    'Confession (Alt)'],
      ['.fakeno',        'Fake Number (Short)'],
      ['.genfake',       'Generate Fake Info'],
      ['.pair',          'Pair Match'],
      ['.nokia',         'Nokia Message Effect'],
      ['.nokiamsg',      'Nokia SMS Image'],
      ['.jail',          'Jail Effect'],
      ['.wanted',        'Wanted Poster'],
      // ── Public API Fun ──────────────────────────────────────
      ['.chuck',         'Chuck Norris Fact'],
      ['.chucknorris',   'Chuck Norris (Full)'],
      ['.advice',        'Random Life Advice'],
      ['.activity',      'Random Activity Idea'],
      ['.bored',         'Bored? Get Activity'],
      ['.uselessfact',   'Useless Fact'],
      ['.kanye',         'Kanye West Quote'],
      ['.catfact',       'Cat Facts'],
      ['.catpic',        'Random Cat Photo'],
      ['.dogpic',        'Random Dog Photo'],
      ['.foxpic',        'Random Fox Photo'],
    ],
  },

  tools: {
    title: '🛠️ 𝙏𝙤𝙤𝙡𝙨 & 𝙐𝙩𝙞𝙡𝙞𝙩𝙞𝙚𝙨',
    commands: [
      ['.tts',         'Text to Speech'],
      ['.tr',          'Translate'],
      ['.qr',          'QR Code Generator'],
      ['.calc',        'Calculator'],
      ['.weather',     'Weather Info'],
      ['.shorturl',    'URL Shortener'],
      ['.jid',         'Get WhatsApp JID'],
      ['.privacy',     'Privacy Manager'],
      ['.bmi',         'BMI Calculator'],
      ['.age',         'Age Calculator'],
      ['.pass',        'Password Generator'],
      ['.ascii',       'ASCII Art'],
      ['.fancy',       'Fancy Text'],
      ['.styletext',   'Style Text'],
      ['.morse',       'Text to Morse'],
      ['.unmorse',     'Morse to Text'],
      ['.binary',      'Text to Binary'],
      ['.unbinary',    'Binary to Text'],
      ['.mirror',      'Mirror Text'],
      ['.reverse',     'Reverse Text'],
      ['.zalgo',       'Zalgo Text'],
      ['.glitch',      'Glitch Text'],
      ['.bold',        'Bold Text'],
      ['.italic',      'Italic Text'],
      ['.mono',        'Monospace Text'],
      ['.flip',        'Flip Text'],
      ['.sinhalafont', 'Sinhala Font Style'],
      ['.uppercase',   'UPPERCASE Text'],
      ['.lowercase',   'lowercase text'],
      ['.snake',       'snake_case Text'],
      ['.camel',       'camelCase Text'],
      ['.logo',        'Text Logo'],
      ['.textlogo',    'Text Logo (Alt)'],
      ['.url',         'URL Info'],
      ['.country',     'Country Info'],
      ['.simdata',     'SIM Card Info'],
      ['.checkwa',     'Check WA Number'],
      ['.numinfo',     'Number Information'],
      ['.ping',        'Bot Speed'],
      ['.runtime',     'Bot Uptime'],
      ['.texttospeech','TTS (Full)'],
      ['.translate',   'Translate (Full)'],
      ['.toqr',        'Convert to QR'],
      ['.calculate',   'Calculate (Full)'],
      ['.password',    'Password (Full)'],
      ['.nation',      'Country (Alt)'],
      ['.siminfo',     'SIM Info (Full)'],
      ['.checknum',    'Check Number'],
      ['.wacheck',     'WA Check (Alt)'],
      ['.wavalidate',  'WA Validate'],
      ['.wanumber',    'WA Number Check'],
      ['.countryinfo', 'Country Info (Full)'],
      // ── Public API Tools ────────────────────────────────────
      ['.exchange',    'Currency Exchange'],
      ['.convert',     'Currency Convert'],
      ['.crypto',      'Crypto Prices'],
      ['.cryptoprice', 'Crypto Price (Full)'],
      ['.colorinfo',   'Color HEX Info'],
      ['.numfact',     'Number Fact'],
    ],
  },

  anime: {
    title: '🎌 𝘼𝙣𝙞𝙢𝙚 & 𝙈𝙖𝙣𝙜𝙖',
    commands: [
      // ── Public API Anime / Manga ─────────────────────────────
      ['.animeinfo', 'Anime Info (MAL/Jikan)'],
      ['.manga',     'Manga Info (MAL/Jikan)'],
      ['.dragonball','Random DBZ Character'],
      ['.dbz',       'Dragon Ball (Short)'],
    ],
  },

  games: {
    title: '🎮 𝙂𝙖𝙢𝙚𝙨',
    commands: [
      ['.ttt',        'Tic-Tac-Toe'],
      ['.hangman',    'Hangman'],
      ['.trivia',     'Trivia Quiz'],
      ['.truth',      'Truth Question'],
      ['.dare',       'Dare Challenge'],
      ['.slots',      'Slot Machine'],
      ['.riddle',     'Riddle Game'],
      ['.eightball',  'Magic 8-Ball'],
      ['.calc',       'Math Calculator'],
      ['.blackjack',  'Blackjack Game'],
      ['.bj',         'Blackjack (Short)'],
      ['.bjhit',      'Blackjack Hit'],
      ['.bjstand',    'Blackjack Stand'],
      ['.guess',      'Guess the Number'],
      ['.answer',     'Answer Game Question'],
      ['.tictactoe',  'Tic-Tac-Toe (Full)'],
      ['.tttmove',    'TicTacToe Move'],
    ],
  },

  protection: {
    title: '🛡️ 𝙋𝙧𝙤𝙩𝙚𝙘𝙩𝙞𝙤𝙣',
    commands: [
      ['.antilink',     'Anti Link'],
      ['.antispam',     'Anti Spam'],
      ['.antidelete',   'Anti Delete'],
      ['.anticall',     'Anti Call'],
      ['.antitoxic',    'Anti Toxic Words'],
      ['.antiforward',  'Anti Forward'],
      ['.antiraid',     'Anti Raid'],
      ['.flooddetect',  'Flood Detection'],
      ['.badwords',     'Bad Words List'],
      ['.addbadword',   'Add Bad Word'],
      ['.delbadword',   'Delete Bad Word'],
      ['.antibadword',  'Anti Bad Word Toggle'],
      ['.badword',      'Bad Word (Alt)'],
      ['.slowmode',     'Slow Mode'],
      ['.captcha',      'Captcha Mode'],
      ['.pmblocker',    'PM Blocker'],
      ['.pmblock',      'PM Block (Short)'],
      ['.setwelcome',   'Set Welcome Message'],
      ['.goodbye',      'Goodbye Message'],
      ['.setgoodbye',   'Set Goodbye Message'],
      ['.moroccoblock', 'Morocco Block'],
      ['.autoblock',    'Auto Block'],
    ],
  },

  privacy: {
    title: '🔒 𝙋𝙧𝙞𝙫𝙖𝙘𝙮 𝙎𝙚𝙩𝙩𝙞𝙣𝙜𝙨',
    commands: [
      ['.privacy',                    'Privacy Manager (All Settings)'],
      ['.privacy lastseen all',       'Last Seen → Everyone'],
      ['.privacy lastseen contacts',  'Last Seen → Contacts Only'],
      ['.privacy lastseen none',      'Last Seen → Nobody'],
      ['.privacy online all',         'Online Status → Everyone'],
      ['.privacy profilepic all',     'Profile Pic → Everyone'],
      ['.privacy profilepic contacts','Profile Pic → Contacts Only'],
      ['.privacy profilepic none',    'Profile Pic → Nobody'],
      ['.privacy status all',         'Status → Everyone'],
      ['.privacy status contacts',    'Status → Contacts Only'],
      ['.privacy receipts on',        'Read Receipts → On'],
      ['.privacy receipts off',       'Read Receipts → Off'],
      ['.privacy groups all',         'Groups Add → Everyone'],
      ['.privacy groups contacts',    'Groups Add → Contacts Only'],
    ],
  },

  auto: {
    title: '⚡ 𝘼𝙪𝙩𝙤 𝙎𝙮𝙨𝙩𝙚𝙢𝙨',
    commands: [
      ['.autoread',          'Auto Read Messages'],
      ['.autoreact',         'Auto React to Msgs'],
      ['.setreactemojis',    'Set React Emojis'],
      ['.autopresence',      'Auto Presence'],
      ['.setpresencetype',   'Set Presence Type'],
      ['.autovoice',         'Auto Voice Reply'],
      ['.addautovoice',      'Add Auto Voice'],
      ['.listautovoice',     'List Auto Voices'],
      ['.delautovoice',      'Delete Auto Voice'],
      ['.autostickerreply',  'Auto Sticker Reply'],
      ['.addautosticker',    'Add Auto Sticker'],
      ['.listautosticker',   'List Auto Stickers'],
      ['.delautosticker',    'Del Auto Sticker'],
      ['.autoreply',         'Auto Reply'],
      ['.addautoreply',      'Add Auto Reply'],
      ['.listautoreply',     'List Auto Replies'],
      ['.delautoreply',      'Delete Auto Reply'],
      ['.autoapprove',       'Auto Approve Joins'],
    ],
  },

  channel: {
    title: '📡 𝘾𝙝𝙖𝙣𝙣𝙚𝙡 & 𝘽𝙧𝙤𝙖𝙙𝙘𝙖𝙨𝙩',
    commands: [
      ['.chpost',         'Post to Channel'],
      ['.channelpost',    'Channel Post (Full)'],
      ['.chaudio',        'Channel Audio Post'],
      ['.chvideo',        'Channel Video Post'],
      ['.chschedule',     'Schedule Channel Post'],
      ['.chdel',          'Delete Channel Post'],
      ['.channeldel',     'Channel Delete (Full)'],
      ['.chstats',        'Channel Statistics'],
      ['.channelstats',   'Channel Stats (Full)'],
      ['.chdesc',         'Channel Description'],
      ['.channeldesc',    'Channel Desc (Full)'],
      ['.chname',         'Channel Name'],
      ['.channelname',    'Channel Name (Full)'],
      ['.chlist',         'List My Channels'],
      ['.channellist',    'Channel List (Full)'],
      ['.chpromo',        'Promote Channel Post'],
      ['.setmychannel',   'Set My Channel'],
      ['.chr',            'Channel React'],
      ['.creact',         'Channel React (Short)'],
      ['.cid',            'Channel ID'],
      ['.channelreact',   'Channel React (Full)'],
      ['.followchannel',  'Follow Channel'],
      ['.boost',          'Boost Channel'],
      ['.view',           'View Channel'],
      ['.forwardall',     'Forward All Posts'],
      ['.fwdall',         'Forward All (Short)'],
      ['.fwdg',           'Forward to Group'],
      ['.fwdgroup',       'Forward to Group (Full)'],
      ['.massdm',         'Mass DM Send'],
      ['.msg',            'Send Message'],
      ['.schedule',       'Schedule Message'],
      ['.forward',        'Forward Message'],
      ['.upsw',           'Upload Status'],
      ['.readsw',         'Read Status'],
      ['.statuslist',     'View Status List'],
      ['.statusreact',    'React to Status'],
      ['.statusview',     'View Status'],
      ['.wastatus',       'WA Status'],
      ['.wstatus',        'WA Status (Short)'],
      ['.reactchannel',   'React to Channel'],
      ['.channelschedule','Channel Schedule (Full)'],
      ['.channelpromo',   'Channel Promo (Full)'],
    ],
  },

  srilanka: {
    title: '🇱🇰 𝙎𝙧𝙞 𝙇𝙖𝙣𝙠𝙖',
    commands: [
      ['.news',        'Ada Derana News'],
      ['.adarana',     'Adarana News'],
      ['.esana',       'Esana News'],
      ['.esananews',   'Esana News (Full)'],
      ['.lyrics',      'Sinhala Lyrics'],
      ['.lyric',       'Lyrics (Short)'],
      ['.sinhalalyrics','Sinhala Lyrics (Full)'],
      ['.wthr',        'SL Weather'],
      ['.holiday',     'SL Holidays'],
      ['.holidays',    'Holidays (Full)'],
      ['.cinema',      'Cinema Showtimes'],
      ['.define',      'English Dictionary'],
      ['.dict',        'Dictionary (Short)'],
      ['.dictionary',  'Sinhala Dictionary'],
      ['.meaning',     'Word Meaning'],
      ['.sinhaladict', 'Sinhala Dict (Full)'],
    ],
  },

  apis: {
    title: '🌐 𝙋𝙪𝙗𝙡𝙞𝙘 𝘼𝙋𝙄𝙨 & 𝙄𝙣𝙛𝙤',
    commands: [
      // Animals
      ['.catfact',       'Random Cat Fact'],
      ['.catpic',        'Random Cat Photo'],
      ['.dogpic',        'Random Dog Photo'],
      ['.foxpic',        'Random Fox Photo'],
      // Fun / Personality
      ['.chuck',         'Chuck Norris Fact'],
      ['.advice',        'Random Life Advice'],
      ['.activity',      'Random Activity Idea'],
      ['.bored',         'Bored? Get Activity'],
      ['.uselessfact',   'Useless Fact'],
      ['.kanye',         'Kanye West Quote'],
      // Finance
      ['.exchange',      'Currency Exchange Rate'],
      ['.convert',       'Currency Convert (Alt)'],
      ['.crypto',        'Crypto Price (CoinGecko)'],
      ['.cryptoprice',   'Crypto Price (Full)'],
      // Tools / Design
      ['.colorinfo',     'HEX Color Info'],
      ['.numfact',       'Math Number Fact'],
      // Anime / Manga
      ['.animeinfo',     'Anime Info (Jikan/MAL)'],
      ['.manga',         'Manga Info (Jikan/MAL)'],
      ['.dragonball',    'Random DBZ Character'],
      ['.dbz',           'Dragon Ball Z (Short)'],
      // Food & Drink
      ['.recipe',        'Search / Random Recipe'],
      ['.cocktail',      'Search / Random Cocktail'],
      ['.drink',         'Cocktail (Short)'],
      // Science / Space
      ['.nasa',          'NASA Astronomy Picture'],
      ['.apod',          'Astro Pic of the Day'],
      // Books
      ['.book',          'Search Books (Open Library)'],
      ['.openlibrary',   'Open Library (Full)'],
      // History
      ['.onthisday',     'Historical Events Today'],
      ['.histday',       'History Day (Short)'],
      // Sports
      ['.nba',           'NBA Scores (ESPN)'],
      ['.nbascore',      'NBA Scores (Full)'],
      // Tech
      ['.phonespec',     'Phone Specifications'],
    ],
  },

  stats: {
    title: '📊 𝙄𝙣𝙛𝙤 & 𝙎𝙩𝙖𝙩𝙨',
    commands: [
      ['.mystats',     'My Usage Stats'],
      ['.rank',        'My Rank'],
      ['.leaderboard', 'Top Users'],
      ['.topcmds',     'Top Commands Used'],
      ['.botstats',    'Bot Statistics'],
      ['.botinfo',     'Bot Details'],
      ['.groupstats',  'Group Statistics'],
      ['.screenshot',  'Screenshot URL'],
      ['.ss',          'Screenshot (Short)'],
      ['.cinfo',       'Country Info'],
      ['.staff',       'Bot Staff List'],
      ['.status',      'Bot Online Status'],
      ['.presence',    'Presence Info'],
      ['.setonline',   'Set Bot Online'],
      ['.settyping',   'Set Bot Typing'],
      ['.setrecording','Set Bot Recording'],
      ['.runtime',     'Bot Uptime'],
      ['.version',     'Bot Version'],
      ['.cmds',        'All Commands List'],
      ['.help',        'Help Menu'],
      ['.owner',       'Owner Info'],
    ],
  },
};

module.exports = {
  commands: [
    'menu', 'help', 'm',
    'menu_bot',
    'menu_group',
    'menu_download',
    'menu_ai',
    'menu_sticker',
    'menu_fun',
    'menu_tools',
    'menu_anime',
    'menu_games',
    'menu_protection',
    'menu_privacy',
    'menu_auto',
    'menu_channel',
    'menu_srilanka',
    'menu_stats',
    'menu_apis',
  ],

  async run({ sock, m }) {
    const cmd  = m.command;
    const chat = m.chat;
    const tr   = await getT(m.sessionOwner);
    const now  = moment().tz(cfg.timezone);
    const hour = now.hour();
    const greeting = hour < 12 ? tr('menu_greeting_morn') : hour < 17 ? tr('menu_greeting_aft') : tr('menu_greeting_eve');
    const date = now.format('ddd, DD MMM YYYY');
    const time = now.format('HH:mm');

    const subKey = cmd.replace('menu_', '');
    if (subMenus[subKey]) {
      try { await sock.sendMessage(chat, { delete: m.key }); } catch {}
      await deleteMenuButtons(sock, chat);

      const sub = subMenus[subKey];
      const cmdList = await buildCmdList(sub.commands);

      const text =
        `▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜\n` +
        `◤◢  ${sub.title}  ◤◢\n` +
        `▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟\n\n` +
        `${tr('menu_enabled_lbl')}\n\n` +
        cmdList +
        `\n\n◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢\n® 𝙐𝙉𝙄𝙏𝙔 𝙏𝙀𝘼𝙈\n◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢`;

      const subReply = await sendButtons(sock, chat, {
        text,
        footer: cfg.footer,
        buttons: [
          { label: tr('menu_main_menu'), id: '.menu' },
          { label: tr('menu_toggle_cmds'), id: '.cmds' },
        ],
      });
      if (subReply?.key) menuButtonKeys.set(chat, [subReply.key]);
      return;
    }

    // ── Main menu ─────────────────────────────────────────────
    try { await sock.sendMessage(chat, { delete: m.key }); } catch {}
    await deleteMenuButtons(sock, chat);

    const mainText =
      `▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜\n` +
      `◤◢ 🧲 𝙐𝙉𝙄𝙏𝙔-𝙈𝘿 🧩 ◤◢\n` +
      `▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟\n\n` +
      `${greeting}, *${m.pushName}*!\n` +
      `📅 ${date}  ·  🕐 ${time}\n\n` +
      `▸ 📦 *${plugins.size}* ${tr('menu_cmds_loaded')}\n` +
      `▸ 🔑 𝙋𝙧𝙚𝙛𝙞𝙭 *. / /*\n` +
      `▸ 👑 𝙊𝙬𝙣𝙚𝙧 *${cfg.ownerName}*\n` +
      `▸ ${tr('menu_enabled_lbl')}\n\n` +
      `◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢\n® 𝙐𝙉𝙄𝙏𝙔 𝙏𝙀𝘼𝙈\n◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢`;

    const trackedKeys = [];

    // ── Set thumb as pool image so sendButtons embeds it in the header ──
    const thumbPath = './src/media/unity_thumb.jpg';
    const _prevPoolImage = global._cmdPoolImage;
    if (fs.existsSync(thumbPath)) {
      try { global._cmdPoolImage = await fs.readFile(thumbPath); } catch {}
    }

    const r1 = await sendButtons(sock, chat, {
      text: mainText + '\n\n' + tr('menu_select_cat'),
      footer: cfg.footer,
      quoted: m.msg,
      buttons: [
        { label: '🤖 Bot Controls',        id: '.menu_bot'        },
        { label: tr('menu_btn_group'),      id: '.menu_group'      },
        { label: tr('menu_btn_dl'),         id: '.menu_download'   },
        { label: tr('menu_btn_ai'),         id: '.menu_ai'         },
        { label: '🎨 Sticker & Media',      id: '.menu_sticker'    },
        { label: tr('menu_btn_fun'),        id: '.menu_fun'        },
        { label: tr('menu_btn_tools'),      id: '.menu_tools'      },
        { label: tr('menu_btn_anime'),      id: '.menu_anime'      },
        { label: tr('menu_btn_games'),      id: '.menu_games'      },
        { label: '🛡️ Protection',           id: '.menu_protection' },
        { label: '🔒 Privacy',              id: '.menu_privacy'    },
        { label: '⚡ Auto Systems',         id: '.menu_auto'       },
        { label: '📡 Channel & Broadcast',  id: '.menu_channel'    },
        { label: tr('menu_btn_lk'),         id: '.menu_srilanka'   },
        { label: '🌐 Public APIs & Info',    id: '.menu_apis'       },
        { label: '📊 Info & Stats',          id: '.menu_stats'      },
        { label: tr('menu_btn_settings'),   id: '.settings'        },
        { label: tr('menu_btn_togglecmds'), id: '.cmds'            },
      ],
    });

    // Restore previous pool image
    global._cmdPoolImage = _prevPoolImage;

    if (r1?.key) trackedKeys.push(r1.key);
    if (trackedKeys.length) menuButtonKeys.set(chat, trackedKeys);
  },
};
