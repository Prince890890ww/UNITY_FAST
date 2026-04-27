'use strict';
const axios  = require('axios');
const fs     = require('fs-extra');
const path   = require('path');
const cfg    = require('../../config');
const { sendButtons } = require('./helper');

// ── Pending sessions: chat → { grade, subject, medium, step } ─
const ppSessions = new Map();

// ── Grade subjects ────────────────────────────────────────────
const GRADE_SUBJECTS = {
  '6':  ['Sinhala', 'English', 'Maths', 'Science', 'History', 'Religion', 'Geography', 'Art'],
  '7':  ['Sinhala', 'English', 'Maths', 'Science', 'History', 'Religion', 'Geography', 'ICT'],
  '8':  ['Sinhala', 'English', 'Maths', 'Science', 'History', 'Religion', 'Geography', 'ICT'],
  '9':  ['Sinhala', 'English', 'Maths', 'Science', 'History', 'Civics', 'ICT', 'Commerce'],
  '10': ['Sinhala', 'English', 'Maths', 'Science', 'History', 'Civics', 'ICT', 'Commerce'],
  '11': ['Sinhala', 'English', 'Maths', 'Science', 'History', 'ICT', 'Commerce', 'Religion'],
  'ol': ['Sinhala', 'English', 'Maths', 'Science', 'History', 'ICT', 'Commerce', 'Religion'],
  '12': ['Physics', 'Chemistry', 'Biology', 'Maths', 'Economics', 'Accounting', 'History', 'ICT'],
  '13': ['Physics', 'Chemistry', 'Biology', 'Combined Maths', 'Economics', 'Accounting', 'History', 'ICT'],
  'al': ['Physics', 'Chemistry', 'Biology', 'Combined Maths', 'Economics', 'Accounting', 'History', 'ICT'],
};

// ── Normalisers ───────────────────────────────────────────────
function normalizeGrade(s) {
  if (!s) return null;
  const v = s.toLowerCase().replace(/\s/g, '');
  if (['ol', 'o/l', 'ordinary', 'grade11', 'g11', '11ol'].includes(v)) return 'ol';
  if (['al', 'a/l', 'advanced', 'grade13', 'g13', '13al'].includes(v)) return 'al';
  const m = v.match(/^(?:grade|g)?(\d+)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 6 && n <= 13) return String(n);
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
  ict:'ICT', it:'ICT', computer:'ICT', computers:'ICT',
  religion:'Religion', buddhism:'Religion', rel:'Religion',
  art:'Art',
  music:'Music',
  civics:'Civics', civic:'Civics',
  commerce:'Commerce', comm:'Commerce',
  physics:'Physics', phy:'Physics',
  chemistry:'Chemistry', chem:'Chemistry',
  biology:'Biology', bio:'Biology',
  accounting:'Accounting', acc:'Accounting',
  economics:'Economics', econ:'Economics',
  'combined maths':'Combined Maths', 'combinedmaths':'Combined Maths', 'combmaths':'Combined Maths',
};

function normalizeSubject(s) {
  if (!s) return null;
  return SUBJECT_MAP[s.toLowerCase().trim()] || null;
}

const MEDIUM_MAP = {
  sinhala:'Sinhala', si:'Sinhala', sinhalese:'Sinhala', 's':'Sinhala',
  english:'English', en:'English', eng:'English', e:'English',
  tamil:'Tamil',    ta:'Tamil',   tam:'Tamil',   t:'Tamil',
};

function normalizeMedium(s) {
  if (!s) return null;
  return MEDIUM_MAP[s.toLowerCase().trim()] || null;
}

function validateYear(s) {
  const y = parseInt((s || '').trim(), 10);
  const cur = new Date().getFullYear();
  if (y >= 2000 && y <= cur) return y;
  return null;
}

// ── Grade display label ───────────────────────────────────────
function gradeLabel(g) {
  if (g === 'ol') return 'O/L (Grade 11)';
  if (g === 'al') return 'A/L (Grade 13)';
  return `Grade ${g}`;
}

// ── Search DuckDuckGo for paper PDF ──────────────────────────
async function searchPaper(grade, subject, medium, year) {
  const gl = grade === 'ol' ? 'OL Grade 11' : grade === 'al' ? 'AL Grade 13' : `Grade ${grade}`;
  const q  = `Sri Lanka ${gl} ${subject} ${medium} medium past paper ${year} filetype:pdf`;

  const res = await axios.get('https://html.duckduckgo.com/html/', {
    params: { q },
    timeout: 12000,
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
  });

  const html = res.data || '';

  // 1) Direct PDF links
  const pdfMatches = [...html.matchAll(/https?:\/\/[^\s"'<>]+\.pdf/gi)];
  if (pdfMatches.length) return { type: 'pdf', url: pdfMatches[0][0] };

  // 2) Known pastpaper sites
  const sitePatterns = [
    /https?:\/\/(?:www\.)?(?:pastpapers?\.wiki|pastpapers?\.lk|doenets\.lk|e-thaksalawa\.moe\.gov\.lk)[^\s"'<>]*/gi,
    /https?:\/\/[^\s"'<>]*(?:pastpaper|past-paper|past_paper)[^\s"'<>]*/gi,
  ];
  for (const pat of sitePatterns) {
    const m = [...html.matchAll(pat)];
    if (m.length) return { type: 'link', url: m[0][0] };
  }

  // 3) Return a fallback search URL
  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
  return { type: 'search', url: searchUrl };
}

// ── Download a PDF URL → Buffer ───────────────────────────────
async function downloadPDF(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: 50 * 1024 * 1024,
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)' },
  });
  const ct = res.headers['content-type'] || '';
  if (!ct.includes('pdf') && !ct.includes('octet')) throw new Error('Not a PDF');
  return Buffer.from(res.data);
}

// ── Send the paper ────────────────────────────────────────────
async function sendPaper(sock, m, grade, subject, medium, year) {
  const gl = gradeLabel(grade);
  await m.reply(`⏳ Searching for *${gl} ${subject} (${medium} medium) ${year}*...`);

  let result;
  try { result = await searchPaper(grade, subject, medium, year); }
  catch (e) {
    return sendButtons(sock, m.chat, {
      text: `❌ Search failed.\n\n_${e.message}_\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [{ label: '🔄 Retry', id: `.passpaper ${grade} ${subject}` }],
    });
  }

  // ── Direct PDF found — try to download & send ─────────────
  if (result.type === 'pdf') {
    try {
      await m.reply(`📥 Found PDF! Downloading...`);
      const buf  = await downloadPDF(result.url);
      const fname = `${grade}_${subject}_${medium}_${year}.pdf`
        .toLowerCase().replace(/\s+/g, '_');

      await sock.sendMessage(m.chat, {
        document: buf,
        mimetype: 'application/pdf',
        fileName: fname,
        caption:
          `📄 *${gl} — ${subject}*\n` +
          `🌐 Medium   : ${medium}\n` +
          `📅 Year     : ${year}\n` +
          `📦 Size     : ${(buf.length / 1024).toFixed(1)} KB\n\n` +
          `${cfg.footer}`,
      }, { quoted: m.msg });

      await sendButtons(sock, m.chat, {
        text: `✅ *Past paper sent!*\n\n📄 *${gl} ${subject}* — ${medium} medium ${year}\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: `🔄 Another year`,      id: `.passpaper ${grade} ${subject} ${medium}`    },
          { label: `📚 Same grade other`,  id: `.passpaper ${grade}`                         },
          { label: `📋 SL Menu`,           id: `.menu_srilanka`                              },
        ],
      });
      return;

    } catch (dlErr) {
      // Download failed — fall through to link fallback
    }
  }

  // ── Link or search fallback ───────────────────────────────
  const isLink  = result.type === 'link';
  const linkUrl = result.url;

  await sendButtons(sock, m.chat, {
    text:
      `${isLink ? '🔗' : '🔍'} *${gl} ${subject} — ${medium} medium ${year}*\n\n` +
      `Could not download automatically.\n` +
      `Tap the link below to download manually:\n\n` +
      `🌐 ${linkUrl}\n\n` +
      `${cfg.footer}`,
    footer: cfg.footer,
    buttons: [
      { label: '🔄 Try again',          id: `.passpaper ${grade} ${subject} ${medium} ${year}` },
      { label: `📅 Try ${year - 1}`,    id: `.passpaper ${grade} ${subject} ${medium} ${year - 1}` },
    ],
  });
}

// ── Multi-step pending handler (called from messageHandler) ───
async function handlePendingPP(sock, m) {
  const session = ppSessions.get(m.chat);
  if (!session) return false;

  const body = (m.body || '').trim();

  // ── Step: waiting for subject ────────────────────────────
  if (session.step === 'subject') {
    const sub = normalizeSubject(body);
    if (!sub) {
      const available = (GRADE_SUBJECTS[session.grade] || []).join(', ');
      await m.reply(`❌ Unknown subject.\n\nAvailable: ${available}\n\nType a subject name:`);
      return true;
    }
    session.subject = sub;
    session.step    = 'medium';
    ppSessions.set(m.chat, session);

    await sendButtons(sock, m.chat, {
      text:
        `✅ Subject: *${sub}*\n\n` +
        `🌐 *Select Medium / භාෂා මාධ්‍යය / மொழி ஊடகம்*\n\n` +
        `💡 Or type: *.lang en* / *.lang si* / *.lang ta*\n\n` +
        `${cfg.footer}`,
      footer: cfg.footer,
      buttons: [
        { label: '🇱🇰 Sinhala Medium',  id: '__pp_medium_Sinhala' },
        { label: '🇬🇧 English Medium',  id: '__pp_medium_English' },
        { label: '🇮🇳 Tamil Medium',    id: '__pp_medium_Tamil'   },
      ],
    });
    return true;
  }

  // ── Step: waiting for medium (button tap or text) ────────
  if (session.step === 'medium') {
    let medium = null;

    // Button tap: __pp_medium_English etc.
    if (body.startsWith('__pp_medium_')) {
      medium = body.replace('__pp_medium_', '').trim();
    } else {
      medium = normalizeMedium(body);
    }

    if (!medium) {
      await m.reply(`❌ Please select: *Sinhala*, *English*, or *Tamil*`);
      return true;
    }
    session.medium = medium;
    session.step   = 'year';
    ppSessions.set(m.chat, session);

    const curYear = new Date().getFullYear();
    await sendButtons(sock, m.chat, {
      text:
        `✅ Medium: *${medium}*\n\n` +
        `📅 *Type the year* (e.g., ${curYear - 1}, ${curYear - 2}, ${curYear - 3})\n\n` +
        `${cfg.footer}`,
      footer: cfg.footer,
      buttons: [
        { label: `📅 ${curYear - 1}`, id: `__pp_year_${curYear - 1}` },
        { label: `📅 ${curYear - 2}`, id: `__pp_year_${curYear - 2}` },
        { label: `📅 ${curYear - 3}`, id: `__pp_year_${curYear - 3}` },
      ],
    });
    return true;
  }

  // ── Step: waiting for year (button tap or typed number) ───
  if (session.step === 'year') {
    let year = null;

    // Button tap: __pp_year_2023 etc.
    if (body.startsWith('__pp_year_')) {
      year = validateYear(body.replace('__pp_year_', ''));
    } else {
      year = validateYear(body);
    }

    if (!year) {
      const cur = new Date().getFullYear();
      await m.reply(`❌ Invalid year. Type a year between 2000–${cur}:`);
      return true;
    }

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
    // .passpaper [grade] [subject?] [medium?] [year?]
    const args    = (m.text || '').trim().split(/\s+/).filter(Boolean);
    const grade   = normalizeGrade(args[0]);

    if (!grade) {
      return sendButtons(sock, m.chat, {
        text:
          `📚 *PAST PAPER DOWNLOADER*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Usage:\n` +
          `  *.passpaper [grade] [subject] [medium] [year]*\n\n` +
          `Examples:\n` +
          `  *.passpaper grade8 maths sinhala 2023*\n` +
          `  *.passpaper grade9 english*\n` +
          `  *.passpaper ol science english 2022*\n` +
          `  *.passpaper al physics sinhala*\n\n` +
          `Grades: 6, 7, 8, 9, 10, 11, ol, al\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: '📗 Grade 8',   id: '.passpaper grade8'  },
          { label: '📘 Grade 9',   id: '.passpaper grade9'  },
          { label: '📙 O/L',       id: '.passpaper ol'      },
          { label: '📕 A/L',       id: '.passpaper al'      },
        ],
      });
    }

    const subject = normalizeSubject(args[1]);
    const medium  = normalizeMedium(args[2]);
    const year    = validateYear(args[3]);

    // ── All 4 args present → directly download ─────────────
    if (grade && subject && medium && year) {
      return sendPaper(sock, m, grade, subject, medium, year);
    }

    // ── Subject missing → ask via buttons ──────────────────
    if (!subject) {
      const subs = GRADE_SUBJECTS[grade] || [];
      const btnSubs = subs.slice(0, 4).map(s => ({ label: `📖 ${s}`, id: `.passpaper ${grade} ${s.toLowerCase()}` }));

      ppSessions.set(m.chat, {
        grade,
        subject: null,
        medium: medium || null,
        year: year || null,
        step: 'subject',
      });

      return sendButtons(sock, m.chat, {
        text:
          `📚 *${gradeLabel(grade)} Past Paper*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Select a subject or type the name:\n\n` +
          `Available: ${subs.join(' · ')}\n\n` +
          `${cfg.footer}`,
        footer: cfg.footer,
        buttons: btnSubs,
      });
    }

    // ── Medium missing → ask via buttons ───────────────────
    if (!medium) {
      ppSessions.set(m.chat, {
        grade,
        subject,
        medium: null,
        year: year || null,
        step: 'medium',
      });

      return sendButtons(sock, m.chat, {
        text:
          `📚 *${gradeLabel(grade)} — ${subject}*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `🌐 *Select Medium / භාෂා මාධ්‍යය / மொழி ஊடகம்*\n\n` +
          `${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: '🇱🇰 Sinhala Medium',  id: '__pp_medium_Sinhala' },
          { label: '🇬🇧 English Medium',  id: '__pp_medium_English' },
          { label: '🇮🇳 Tamil Medium',    id: '__pp_medium_Tamil'   },
        ],
      });
    }

    // ── Year missing → ask with buttons ────────────────────
    const curYear = new Date().getFullYear();
    ppSessions.set(m.chat, { grade, subject, medium, year: null, step: 'year' });

    return sendButtons(sock, m.chat, {
      text:
        `📚 *${gradeLabel(grade)} — ${subject} (${medium} medium)*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📅 *Select year or type it:*\n\n` +
        `${cfg.footer}`,
      footer: cfg.footer,
      buttons: [
        { label: `📅 ${curYear - 1}`, id: `__pp_year_${curYear - 1}` },
        { label: `📅 ${curYear - 2}`, id: `__pp_year_${curYear - 2}` },
        { label: `📅 ${curYear - 3}`, id: `__pp_year_${curYear - 3}` },
        { label: `📅 ${curYear - 4}`, id: `__pp_year_${curYear - 4}` },
      ],
    });
  },
};
