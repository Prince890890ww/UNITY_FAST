'use strict';
/**
 * UNITY-MD — Image Menu Generator
 * SVG → PNG via sharp  |  UNITY teal/green/cyan theme
 */
const sharp = require('sharp');

// ── timezone helper (no external dependency) ─────────────────
function getNowInTZ(tz) {
  try {
    const now  = new Date();
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day:'2-digit', month:'2-digit', year:'numeric' }).format(now);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour:'2-digit', minute:'2-digit', hour12: false }).format(now);
    return { date, time };
  } catch {
    const d = new Date();
    return { date: d.toLocaleDateString('en-GB'), time: d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}) };
  }
}

// ── helpers ──────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
const FONT = "'Courier New', Consolas, monospace";
const W    = 800;

// ── color palette ─────────────────────────────────────────────
const C = {
  bg:     '#020408',
  card:   '#05090f',
  border: '#0d1e2e',
  text:   '#ddeeff',
  muted:  '#2a4560',
  foot:   '#040c14',
};

// Each section gets a cycling accent color
const ACCENTS = [
  '#00ccff', '#00ff88', '#7c3aed', '#f59e0b',
  '#00ff88', '#00ccff', '#f59e0b', '#7c3aed',
  '#ff3b5c', '#00ff88', '#00ccff', '#ff3b5c', '#f59e0b',
];

// ── Section data (clean ASCII commands) ───────────────────────
const SECTIONS = [
  { n:'01', title:'AI & SEARCH',   cmds:['ai','gpt','llama3','chatai','clearai','stopai','imagine','flux','sora','wiki','imdb','github','wastalk','gimage','cricket','ss','cinfo'] },
  { n:'02', title:'DOWNLOADS',     cmds:['mp3','song','play','tiktok','tt','mp4','video','filmdownload','insta','fbvid','twitter','spotify'] },
  { n:'03', title:'MEDIA TOOLS',   cmds:['sticker','crop','attp','take','emojimix','rmbg','blur','remini','toaudio','tovideo','compress','resize'] },
  { n:'04', title:'STICKER ART',   cmds:['metallic','ice','snow','neon','fire','matrix','glitch','devil','angel','retro','cyber','vintage'] },
  { n:'05', title:'TOOLS',         cmds:['tts','tomp3','tovoice','tr','qr','ping','runtime','calc','weather','base64','hex','url'] },
  { n:'06', title:'TEXT TOOLS',    cmds:['fancy','bold','italic','mono','sinhalafont','morse','unmorse','binary','reverse','upper','lower','char'] },
  { n:'07', title:'FUN',           cmds:['joke','quote','fact','meme','flirt','compliment','insult','wasted','hack','rate','ship','simp'] },
  { n:'08', title:'ANIME GIFs',    cmds:['neko','waifu','hug','kiss','pat','poke','slap','punch','cry','wave','dance','kill'] },
  { n:'09', title:'GAMES',         cmds:['ttt','hangman','trivia','truth','dare','slots','riddle','8ball','math','wordgame'] },
  { n:'10', title:'SRI LANKA',     cmds:['news','esana','cinesubz','cinema','define','sinhaladict','weather','holidays'] },
  { n:'11', title:'GROUP MGMT',    cmds:['kick','promote','demote','add','tagall','hidetag','warn','mute','unmute','setname','setdesc','link'] },
  { n:'12', title:'PROTECTION',    cmds:['antitag','antilink','antispam','antidelete','anticall','antitoxic','antiforward','antiraid'] },
  { n:'13', title:'STATS',         cmds:['mystats','rank','leaderboard','topcmds','botstats','botinfo','groupstats'] },
];

// ── Scanline helper ───────────────────────────────────────────
function scanlines(h, color = '#00ccff', alpha = '04', step = 4) {
  let s = '';
  for (let y = 0; y < h; y += step)
    s += `<rect x="0" y="${y}" width="${W}" height="1" fill="${color}${alpha}"/>`;
  return s;
}

// ── Corner brackets ───────────────────────────────────────────
function corners(totalH, accent, size = 18) {
  return [
    [22, 22, 1, 1], [W - 22, 22, -1, 1],
    [22, totalH - 22, 1, -1], [W - 22, totalH - 22, -1, -1],
  ].map(([x, y, dx, dy]) =>
    `<line x1="${x}" y1="${y}" x2="${x + dx * size}" y2="${y}" stroke="${accent}" stroke-width="2"/>` +
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + dy * size}" stroke="${accent}" stroke-width="2"/>`,
  ).join('');
}

// ── COVER IMAGE ───────────────────────────────────────────────
function makeCoverSvg({ userName, prefix, totalCmds, date, time }) {
  const ROWS  = Math.ceil(SECTIONS.length / 3);
  const cellH = 46;
  const H = 180 + ROWS * cellH + 80;
  const CX = W / 2;
  const PX = 44;
  const colW = (W - PX * 2) / 3;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;

  // BG + scanlines
  s += `<rect width="${W}" height="${H}" fill="${C.bg}"/>`;
  s += scanlines(H);

  // Top bar
  s += `<rect x="0" y="0" width="${W}" height="5" fill="#00ff88"/>`;
  s += `<rect x="0" y="5" width="${W}" height="3" fill="#00ccff" opacity="0.35"/>`;

  // Header bg
  s += `<rect x="0" y="0" width="${W}" height="170" fill="${C.card}"/>`;
  s += `<rect x="0" y="168" width="${W}" height="2" fill="${C.border}"/>`;

  // Corner brackets
  s += corners(H, '#00ff88');

  // Title
  s += `<text x="${CX}" y="68" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="700" fill="#00ff88" letter-spacing="6">UNITY-MD</text>`;
  s += `<text x="${CX}" y="92" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${C.muted}" letter-spacing="5">WHATSAPP BOT PLATFORM  |  UNITY TEAM</text>`;

  // Divider
  s += `<line x1="${PX}" y1="108" x2="${W - PX}" y2="108" stroke="${C.border}" stroke-width="1"/>`;

  // Info row
  s += `<text x="${PX}" y="134" font-family="${FONT}" font-size="13" fill="#00ccff">USER: ${esc(userName)}</text>`;
  s += `<text x="${CX}" y="134" text-anchor="middle" font-family="${FONT}" font-size="13" fill="#00ff88">PREFIX: ${esc(prefix)}</text>`;
  s += `<text x="${W - PX}" y="134" text-anchor="end" font-family="${FONT}" font-size="13" fill="#00ccff">CMDS: ${esc(String(totalCmds))}</text>`;

  // Date/time
  s += `<text x="${CX}" y="156" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${C.muted}">DATE: ${esc(date)}   |   TIME: ${esc(time)}</text>`;

  // Section grid
  const gridY = 190;
  SECTIONS.forEach((sec, i) => {
    const col    = i % 3;
    const row    = Math.floor(i / 3);
    const x      = PX + col * colW;
    const y      = gridY + row * cellH;
    const accent = ACCENTS[i];
    const cw     = colW - 10;

    // Card
    s += `<rect x="${x}" y="${y}" width="${cw}" height="${cellH - 6}" rx="6" fill="${C.card}" stroke="${C.border}" stroke-width="1"/>`;
    // Left accent bar
    s += `<rect x="${x}" y="${y}" width="4" height="${cellH - 6}" rx="2" fill="${accent}"/>`;
    // Number
    s += `<text x="${x + 14}" y="${y + 14}" font-family="${FONT}" font-size="10" fill="${accent}" font-weight="700">${esc(sec.n)}</text>`;
    // Title
    s += `<text x="${x + 14}" y="${y + 28}" font-family="${FONT}" font-size="12" fill="${C.text}" font-weight="600">${esc(sec.title)}</text>`;
    // Cmd count
    s += `<text x="${x + 14}" y="${y + 39}" font-family="${FONT}" font-size="9" fill="${C.muted}">${sec.cmds.length} cmds</text>`;
  });

  // Swipe hint
  const hintY = gridY + ROWS * cellH + 16;
  s += `<line x1="${PX}" y1="${hintY}" x2="${W - PX}" y2="${hintY}" stroke="${C.border}" stroke-width="1"/>`;
  s += `<text x="${CX}" y="${hintY + 24}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${C.muted}">◄  Swipe left / right to browse sections  ►</text>`;

  // Footer
  s += `<rect x="0" y="${H - 36}" width="${W}" height="36" fill="${C.foot}"/>`;
  s += `<rect x="0" y="${H - 36}" width="${W}" height="2" fill="#00ff88" opacity="0.5"/>`;
  s += `<text x="${CX}" y="${H - 13}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${C.muted}">® UNITY TEAM  |  99,999+ Bots Supported  |  2026</text>`;

  s += `</svg>`;
  return s;
}

// ── SECTION IMAGE ─────────────────────────────────────────────
function makeSectionSvg(sec, accent, idx, date, time) {
  const PX   = 32;
  const COLS = 2;
  const HDR  = 118;
  const FOOT = 38;
  const rowH = 30;
  const rows = Math.ceil(sec.cmds.length / COLS);
  const H    = HDR + rows * rowH + 28 + FOOT;
  const CX   = W / 2;
  const colW = (W - PX * 2) / COLS;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;

  // BG + scanlines
  s += `<rect width="${W}" height="${H}" fill="${C.bg}"/>`;
  s += scanlines(H, accent, '03');

  // Top accent bar
  s += `<rect x="0" y="0" width="${W}" height="5" fill="${accent}"/>`;
  s += `<rect x="0" y="5" width="${W}" height="3" fill="${accent}" opacity="0.3"/>`;

  // Header bg
  s += `<rect x="0" y="0" width="${W}" height="${HDR}" fill="${C.card}"/>`;
  s += `<rect x="0" y="${HDR - 2}" width="${W}" height="2" fill="${C.border}"/>`;

  // Corner brackets
  s += corners(H, accent, 16);

  // Section number badge
  s += `<rect x="${PX}" y="18" width="42" height="24" rx="12" fill="${accent}18" stroke="${accent}" stroke-width="1"/>`;
  s += `<text x="${PX + 21}" y="34" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" fill="${accent}">${esc(sec.n)}</text>`;

  // Section title
  s += `<text x="${PX + 56}" y="35" font-family="${FONT}" font-size="24" font-weight="700" fill="${accent}" letter-spacing="2">${esc(sec.title)}</text>`;

  // UNITY-MD top right
  s += `<text x="${W - PX}" y="22" text-anchor="end" font-family="${FONT}" font-size="10" fill="${C.muted}">UNITY-MD</text>`;

  // Divider
  s += `<line x1="${PX}" y1="54" x2="${W - PX}" y2="54" stroke="${C.border}" stroke-width="1"/>`;

  // Meta row
  s += `<text x="${PX}" y="74" font-family="${FONT}" font-size="11" fill="${C.muted}">${sec.cmds.length} commands</text>`;
  s += `<text x="${W - PX}" y="74" text-anchor="end" font-family="${FONT}" font-size="11" fill="${C.muted}">${esc(date)}  ${esc(time)}</text>`;

  // Pagination
  s += `<text x="${CX}" y="100" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${C.muted}">${idx + 1}  /  ${SECTIONS.length}</text>`;

  // Glow line under header
  s += `<line x1="0" y1="${HDR}" x2="${W}" y2="${HDR}" stroke="${accent}" stroke-width="1" opacity="0.2"/>`;

  // Commands
  const cmdsY = HDR + 20;
  sec.cmds.forEach((cmd, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx  = PX + col * colW;
    const cy  = cmdsY + row * rowH;

    // Alternate row tint
    if (row % 2 === 0)
      s += `<rect x="${PX - 4}" y="${cy - 16}" width="${W - (PX - 4) * 2}" height="${rowH}" fill="${accent}07"/>`;

    // Bullet
    s += `<text x="${cx}" y="${cy}" font-family="${FONT}" font-size="13" fill="${accent}" opacity="0.6">&gt;</text>`;
    // Command
    s += `<text x="${cx + 18}" y="${cy}" font-family="${FONT}" font-size="14" font-weight="600" fill="${C.text}">.${esc(cmd)}</text>`;
  });

  // Footer
  s += `<rect x="0" y="${H - FOOT}" width="${W}" height="${FOOT}" fill="${C.foot}"/>`;
  s += `<rect x="0" y="${H - FOOT}" width="${W}" height="2" fill="${accent}" opacity="0.4"/>`;
  s += `<text x="${CX}" y="${H - 13}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${C.muted}">® UNITY TEAM  |  ◄  Swipe  ►</text>`;

  s += `</svg>`;
  return s;
}

// ── Main export ───────────────────────────────────────────────
async function generateMenuImages(opts = {}) {
  const {
    userName  = 'User',
    prefix    = '.',
    totalCmds = 150,
    timezone  = 'Asia/Colombo',
  } = opts;

  const { date, time } = getNowInTZ(timezone);

  const toBuffer = svg =>
    sharp(Buffer.from(svg))
      .png({ quality: 90, compressionLevel: 7 })
      .toBuffer();

  // Cover
  const cover = await toBuffer(makeCoverSvg({ userName, prefix, totalCmds, date, time }));

  // Sections
  const sections = await Promise.all(
    SECTIONS.map((sec, i) => toBuffer(makeSectionSvg(sec, ACCENTS[i], i, date, time)))
  );

  return [cover, ...sections];
}

module.exports = { generateMenuImages, SECTIONS };
