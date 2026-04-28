'use strict';
const axios  = require('axios');
const cfg    = require('../../config');
const { sendButtons } = require('./helper');

// ── Pending sessions ──────────────────────────────────────────
const ppSessions = new Map();

// ── Grade subjects ────────────────────────────────────────────
const GRADE_SUBJECTS = {
  '6':  ['Sinhala','English','Maths','Science','History','Religion','Geography','Art'],
  '7':  ['Sinhala','English','Maths','Science','History','Religion','Geography','ICT'],
  '8':  ['Sinhala','English','Maths','Science','History','Religion','Geography','ICT'],
  '9':  ['Sinhala','English','Maths','Science','History','Civics','ICT','Commerce'],
  '10': ['Sinhala','English','Maths','Science','History','Civics','ICT','Commerce'],
  'ol': ['Sinhala','English','Maths','Science','History','ICT','Commerce','Religion'],
  '12': ['Physics','Chemistry','Biology','Maths','Economics','Accounting','History','ICT'],
  'al': ['Physics','Chemistry','Biology','Combined Maths','Economics','Accounting','History','ICT'],
};

// ── Normalisers ───────────────────────────────────────────────
function normalizeGrade(s) {
  if (!s) return null;
  const v = s.toLowerCase().replace(/\s/g, '');
  if (['ol','o/l','ordinary','grade11','g11','11ol','11'].includes(v)) return 'ol';
  if (['al','a/l','advanced','grade13','g13','13al','12','13','grade12','grade13'].some(x => v === x)) {
    return ['12','grade12'].includes(v) ? '12' : 'al';
  }
  const m = v.match(/^(?:grade|g)?(\d+)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n === 11) return 'ol';
    if (n >= 6 && n <= 10) return String(n);
  }
  return null;
}

const SUBJECT_MAP = {
  sinhala:'Sinhala', si:'Sinhala', sinhalese:'Sinhala',
  english:'English', en:'English', eng:'English',
  maths:'Maths', math:'Maths', mathematics:'Maths',
  science:'Science', sci:'Science',
  history:'History', hist:'History',
  geography:'Geography', geo:'Geography',
  ict:'ICT', it:'ICT', computer:'ICT',
  religion:'Religion', buddhism:'Religion',
  art:'Art', civics:'Civics', commerce:'Commerce', comm:'Commerce',
  physics:'Physics', phy:'Physics',
  chemistry:'Chemistry', chem:'Chemistry',
  biology:'Biology', bio:'Biology',
  accounting:'Accounting', acc:'Accounting',
  economics:'Economics', econ:'Economics',
  'combined maths':'Combined Maths', combinedmaths:'Combined Maths', combmaths:'Combined Maths',
};

function normalizeSubject(s) {
  if (!s) return null;
  return SUBJECT_MAP[s.toLowerCase().trim()] || null;
}

const MEDIUM_MAP = {
  sinhala:'Sinhala', si:'Sinhala', sinhalese:'Sinhala', s:'Sinhala',
  english:'English', en:'English', eng:'English', e:'English',
  tamil:'Tamil', ta:'Tamil', tam:'Tamil', t:'Tamil',
};

function normalizeMedium(s) {
  if (!s) return null;
  return MEDIUM_MAP[s.toLowerCase().trim()] || null;
}

function validateYear(s) {
  const y = parseInt((s || '').trim(), 10);
  return (y >= 2000 && y <= new Date().getFullYear()) ? y : null;
}

function gradeLabel(g) {
  if (g === 'ol') return 'O/L (Grade 11)';
  if (g === 'al') return 'A/L (Grade 13)';
  if (g === '12') return 'A/L (Grade 12)';
  return `Grade ${g}`;
}

// ── Source 1: pastpapers.wiki ─────────────────────────────────
// URL pattern: /grade-8-maths-past-papers/ or /ol-sinhala-past-papers/
async function tryPastpapersWiki(grade, subject, medium, year) {
  const gradeSlug   = grade === 'ol' ? 'ol' : grade === 'al' ? 'al' : `grade-${grade}`;
  const subjectSlug = subject.toLowerCase().replace(/\s+/g, '-');
  const mediumSlug  = medium.toLowerCase();

  // Try several URL patterns the site uses
  const urls = [
    `https://pastpapers.wiki/${gradeSlug}-${subjectSlug}-${mediumSlug}-medium-past-papers/`,
    `https://pastpapers.wiki/${gradeSlug}-${subjectSlug}-past-papers/`,
    `https://pastpapers.wiki/sri-lanka-${gradeSlug}-${subjectSlug}-past-papers/`,
  ];

  for (const pageUrl of urls) {
    try {
      const res = await axios.get(pageUrl, {
        timeout: 12000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      const html = res.data || '';

      // Find PDF links that match the year
      const pdfRegex = /https?:\/\/[^\s"'<>]+\.pdf/gi;
      const allPdfs  = [...html.matchAll(pdfRegex)].map(m => m[0]);
      const yearPdfs = allPdfs.filter(url => url.includes(String(year)));

      if (yearPdfs.length)  return { type: 'pdf',  url: yearPdfs[0],  source: 'pastpapers.wiki' };
      if (allPdfs.length)   return { type: 'pdf',  url: allPdfs[0],   source: 'pastpapers.wiki' };

      // Page exists but no PDFs — return the page link
      return { type: 'link', url: pageUrl, source: 'pastpapers.wiki' };
    } catch (e) {
      if (e?.response?.status !== 404) throw e;
      // 404 → try next URL
    }
  }
  return null;
}

// ── Source 2: e-thaksalawa.moe.gov.lk ────────────────────────
async function tryEthaksalawa(grade, subject, medium, year) {
  const gradeNum = grade === 'ol' ? 11 : grade === 'al' ? 13 : parseInt(grade, 10);
  const medCode  = medium === 'Sinhala' ? 'S' : medium === 'Tamil' ? 'T' : 'E';

  const searchUrl = `https://e-thaksalawa.moe.gov.lk/web/guest/resource-en` +
    `?p_p_id=resourcesportlet_WAR_ETPortlet` +
    `&_resourcesportlet_WAR_ETPortlet_grade=${gradeNum}` +
    `&_resourcesportlet_WAR_ETPortlet_subject=${encodeURIComponent(subject)}` +
    `&_resourcesportlet_WAR_ETPortlet_medium=${medCode}` +
    `&_resourcesportlet_WAR_ETPortlet_year=${year}` +
    `&_resourcesportlet_WAR_ETPortlet_type=PP`;

  try {
    const res = await axios.get(searchUrl, {
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const html = res.data || '';

    const pdfMatches = [...html.matchAll(/https?:\/\/[^\s"'<>]+\.pdf/gi)];
    if (pdfMatches.length) return { type: 'pdf', url: pdfMatches[0][0], source: 'e-thaksalawa.moe.gov.lk' };

    // Check if results section has links
    const linkMatches = [...html.matchAll(/href="(https?:\/\/e-thaksalawa\.moe\.gov\.lk\/[^"]+)"/gi)];
    if (linkMatches.length > 1) return { type: 'link', url: linkMatches[1][1], source: 'e-thaksalawa.moe.gov.lk' };
  } catch { /* ignore */ }
  return null;
}

// ── Source 3: Google site search fallback ─────────────────────
async function tryGoogleSearch(grade, subject, medium, year) {
  const gl  = grade === 'ol' ? 'OL grade 11' : grade === 'al' ? 'AL grade 13' : `grade ${grade}`;
  const q   = `site:pastpapers.wiki OR site:doenets.lk OR site:e-thaksalawa.moe.gov.lk ${gl} ${subject} ${medium} medium past paper ${year} filetype:pdf`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;

  try {
    const res = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
    });
    const html = res.data || '';
    const pdfs = [...html.matchAll(/https?:\/\/[^\s"'<>\\]+\.pdf/gi)].map(m => m[0]);
    if (pdfs.length) return { type: 'pdf', url: pdfs[0], source: 'Google' };

    // Return a DuckDuckGo search link as last resort
    const ddgQ = `${gl} ${subject} ${medium} medium past paper ${year} Sri Lanka filetype:pdf`;
    return { type: 'search', url: `https://duckduckgo.com/?q=${encodeURIComponent(ddgQ)}`, source: 'DuckDuckGo' };
  } catch {
    const ddgQ = `${grade === 'ol' ? 'OL' : `Grade ${grade}`} ${subject} ${medium} medium past paper ${year} Sri Lanka`;
    return { type: 'search', url: `https://duckduckgo.com/?q=${encodeURIComponent(ddgQ)}`, source: 'DuckDuckGo' };
  }
}

// ── Download PDF → Buffer ─────────────────────────────────────
async function downloadPDF(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: 50 * 1024 * 1024,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const ct = (res.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('pdf') && !ct.includes('octet')) throw new Error('Not a PDF');
  return Buffer.from(res.data);
}

// ── Main send logic ───────────────────────────────────────────
async function sendPaper(sock, m, grade, subject, medium, year) {
  const gl = gradeLabel(grade);
  await m.reply(`⏳ Searching *${gl} ${subject} (${medium}) ${year}*...`);

  // Try sources in order
  let result = null;
  try { result = await tryPastpapersWiki(grade, subject, medium, year); } catch {}
  if (!result) {
    try { result = await tryEthaksalawa(grade, subject, medium, year); } catch {}
  }
  if (!result) {
    try { result = await tryGoogleSearch(grade, subject, medium, year); } catch {}
  }

  if (!result) {
    return sendButtons(sock, m.chat, {
      text: `❌ Could not find *${gl} ${subject} (${medium}) ${year}*.\n\n💡 Try a different year.\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [
        { label: `📅 Try ${year - 1}`, id: `.passpaper ${grade} ${subject} ${medium} ${year - 1}` },
        { label: `📅 Try ${year - 2}`, id: `.passpaper ${grade} ${subject} ${medium} ${year - 2}` },
      ],
    });
  }

  // ── Got a PDF URL → try to download ──────────────────────
  if (result.type === 'pdf') {
    try {
      await m.reply(`📥 Found! Downloading from *${result.source}*...`);
      const buf   = await downloadPDF(result.url);
      const fname = `${grade}_${subject}_${medium}_${year}.pdf`.toLowerCase().replace(/[\s/]+/g, '_');

      await sock.sendMessage(m.chat, {
        document: buf,
        mimetype: 'application/pdf',
        fileName: fname,
        caption:
          `📄 *${gl} — ${subject}*\n` +
          `🌐 Medium : ${medium}\n` +
          `📅 Year   : ${year}\n` +
          `📦 Size   : ${(buf.length / 1024).toFixed(1)} KB\n` +
          `🔗 Source : ${result.source}\n\n` +
          `${cfg.footer}`,
      }, { quoted: m.msg });

      return sendButtons(sock, m.chat, {
        text: `✅ *Past paper sent!*\n\n📄 ${gl} ${subject} — ${medium} ${year}\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: `📅 Try ${year - 1}`,    id: `.passpaper ${grade} ${subject} ${medium} ${year - 1}` },
          { label: `📚 Same grade`,         id: `.passpaper ${grade}`                                  },
        ],
      });
    } catch (dlErr) {
      // Download failed → fall through to link
      result = { type: 'link', url: result.url, source: result.source };
    }
  }

  // ── Link or search fallback ───────────────────────────────
  const isSearch = result.type === 'search';
  await sendButtons(sock, m.chat, {
    text:
      `${isSearch ? '🔍' : '🔗'} *${gl} ${subject} — ${medium} ${year}*\n\n` +
      `${isSearch ? 'Search result' : 'Found on ' + result.source}:\n\n` +
      `📎 ${result.url}\n\n` +
      `_Open the link to download manually_\n\n${cfg.footer}`,
    footer: cfg.footer,
    buttons: [
      { label: `🔄 Try again`,       id: `.passpaper ${grade} ${subject} ${medium} ${year}` },
      { label: `📅 Try ${year - 1}`, id: `.passpaper ${grade} ${subject} ${medium} ${year - 1}` },
    ],
  });
}

// ── Multi-step pending handler ────────────────────────────────
async function handlePendingPP(sock, m) {
  const session = ppSessions.get(m.chat);
  if (!session) return false;

  const body = (m.body || '').trim();

  if (session.step === 'subject') {
    const sub = normalizeSubject(body);
    if (!sub) {
      const available = (GRADE_SUBJECTS[session.grade] || []).join(', ');
      await m.reply(`❌ Unknown subject.\n\nAvailable: ${available}`);
      return true;
    }
    session.subject = sub;
    session.step    = 'medium';
    ppSessions.set(m.chat, session);
    await sendButtons(sock, m.chat, {
      text: `✅ Subject: *${sub}*\n\n🌐 *Select Medium / භාෂා / மொழி*\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [
        { label: '🇱🇰 Sinhala', id: '__pp_medium_Sinhala' },
        { label: '🇬🇧 English', id: '__pp_medium_English' },
        { label: '🇮🇳 Tamil',   id: '__pp_medium_Tamil'   },
      ],
    });
    return true;
  }

  if (session.step === 'medium') {
    let medium = body.startsWith('__pp_medium_')
      ? body.replace('__pp_medium_', '')
      : normalizeMedium(body);
    if (!medium) { await m.reply(`❌ Select: *Sinhala*, *English*, or *Tamil*`); return true; }
    session.medium = medium;
    session.step   = 'year';
    ppSessions.set(m.chat, session);
    const cy = new Date().getFullYear();
    await sendButtons(sock, m.chat, {
      text: `✅ Medium: *${medium}*\n\n📅 *Type the year or tap:*\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [
        { label: `📅 ${cy-1}`, id: `__pp_year_${cy-1}` },
        { label: `📅 ${cy-2}`, id: `__pp_year_${cy-2}` },
        { label: `📅 ${cy-3}`, id: `__pp_year_${cy-3}` },
        { label: `📅 ${cy-4}`, id: `__pp_year_${cy-4}` },
      ],
    });
    return true;
  }

  if (session.step === 'year') {
    const year = body.startsWith('__pp_year_')
      ? validateYear(body.replace('__pp_year_', ''))
      : validateYear(body);
    if (!year) { await m.reply(`❌ Invalid year. Enter a year between 2000–${new Date().getFullYear()}`); return true; }
    ppSessions.delete(m.chat);
    await sendPaper(sock, m, session.grade, session.subject, session.medium, year);
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
module.exports = {
  commands: ['passpaper', 'pp', 'pastpaper', 'passparer'],
  handlePendingPP,

  async run({ sock, m }) {
    const args    = (m.text || '').trim().split(/\s+/).filter(Boolean);
    const grade   = normalizeGrade(args[0]);

    if (!grade) {
      return sendButtons(sock, m.chat, {
        text:
          `📚 *PAST PAPER DOWNLOADER*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Usage: *.passpaper [grade] [subject] [medium] [year]*\n\n` +
          `Examples:\n` +
          `  *.pp grade8 maths sinhala 2023*\n` +
          `  *.pp grade9 english*\n` +
          `  *.pp ol science english 2022*\n` +
          `  *.pp al physics sinhala*\n\n` +
          `${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: '📗 Grade 8',  id: '.passpaper grade8' },
          { label: '📘 Grade 9',  id: '.passpaper grade9' },
          { label: '📙 O/L',      id: '.passpaper ol'     },
          { label: '📕 A/L',      id: '.passpaper al'     },
        ],
      });
    }

    const subject = normalizeSubject(args[1]);
    const medium  = normalizeMedium(args[2]);
    const year    = validateYear(args[3]);

    if (grade && subject && medium && year) {
      return sendPaper(sock, m, grade, subject, medium, year);
    }

    if (!subject) {
      const subs    = GRADE_SUBJECTS[grade] || [];
      const btnSubs = subs.slice(0, 4).map(s => ({ label: `📖 ${s}`, id: `.passpaper ${grade} ${s.toLowerCase()}` }));
      ppSessions.set(m.chat, { grade, subject: null, medium: medium || null, year: year || null, step: 'subject' });
      return sendButtons(sock, m.chat, {
        text:
          `📚 *${gradeLabel(grade)} Past Paper*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Select subject or type name:\n\n` +
          `Available: ${subs.join(' · ')}\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: btnSubs,
      });
    }

    if (!medium) {
      ppSessions.set(m.chat, { grade, subject, medium: null, year: year || null, step: 'medium' });
      return sendButtons(sock, m.chat, {
        text: `📚 *${gradeLabel(grade)} — ${subject}*\n\n🌐 *Select Medium / භාෂා / மொழி*\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: '🇱🇰 Sinhala', id: '__pp_medium_Sinhala' },
          { label: '🇬🇧 English', id: '__pp_medium_English' },
          { label: '🇮🇳 Tamil',   id: '__pp_medium_Tamil'   },
        ],
      });
    }

    const cy = new Date().getFullYear();
    ppSessions.set(m.chat, { grade, subject, medium, year: null, step: 'year' });
    return sendButtons(sock, m.chat, {
      text: `📚 *${gradeLabel(grade)} — ${subject} (${medium})*\n\n📅 *Select year or type it:*\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [
        { label: `📅 ${cy-1}`, id: `__pp_year_${cy-1}` },
        { label: `📅 ${cy-2}`, id: `__pp_year_${cy-2}` },
        { label: `📅 ${cy-3}`, id: `__pp_year_${cy-3}` },
        { label: `📅 ${cy-4}`, id: `__pp_year_${cy-4}` },
      ],
    });
  },
};
