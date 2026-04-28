'use strict';
const axios  = require('axios');
const cfg    = require('../../config');
const { sendButtons } = require('./helper');

// ── Pending sessions ──────────────────────────────────────────
const ppSessions = new Map();

// ── Data ──────────────────────────────────────────────────────
const GRADE_SUBJECTS = {
  '6':  ['Sinhala','English','Maths','Science','History','Religion','Geography','Art'],
  '7':  ['Sinhala','English','Maths','Science','History','Religion','Geography','ICT'],
  '8':  ['Sinhala','English','Maths','Science','History','Religion','Geography','ICT'],
  '9':  ['Sinhala','English','Maths','Science','History','Civics','ICT','Commerce'],
  '10': ['Sinhala','English','Maths','Science','History','Civics','ICT','Commerce'],
  'ol': ['Sinhala','English','Maths','Science','History','ICT','Commerce','Religion'],
  'al': ['Physics','Chemistry','Biology','Combined Maths','Economics','Accounting','History','ICT'],
};

function normalizeGrade(s) {
  if (!s) return null;
  const v = s.toLowerCase().replace(/[\s-]/g,'');
  if (['ol','o/l','ordinary','grade11','g11','11'].includes(v)) return 'ol';
  if (['al','a/l','advanced','grade13','g13','13','grade12','g12','12'].includes(v)) return 'al';
  const m = v.match(/^(?:grade|g)?(\d+)$/);
  if (m) { const n = parseInt(m[1],10); if (n>=6 && n<=10) return String(n); }
  return null;
}

const SUBJECT_MAP = {
  sinhala:'Sinhala',si:'Sinhala',sinhalese:'Sinhala',
  english:'English',en:'English',eng:'English',
  maths:'Maths',math:'Maths',mathematics:'Maths',
  science:'Science',sci:'Science',
  history:'History',hist:'History',
  geography:'Geography',geo:'Geography',
  ict:'ICT',it:'ICT',computer:'ICT',
  religion:'Religion',buddhism:'Religion',
  art:'Art',civics:'Civics',civic:'Civics',
  commerce:'Commerce',comm:'Commerce',
  physics:'Physics',phy:'Physics',
  chemistry:'Chemistry',chem:'Chemistry',
  biology:'Biology',bio:'Biology',
  accounting:'Accounting',acc:'Accounting',
  economics:'Economics',econ:'Economics',
  'combined maths':'Combined Maths',combinedmaths:'Combined Maths',combmaths:'Combined Maths',
};
function normalizeSubject(s) { return s ? SUBJECT_MAP[s.toLowerCase().trim()] || null : null; }

const MEDIUM_MAP = {
  sinhala:'Sinhala',si:'Sinhala',sinhalese:'Sinhala',s:'Sinhala',
  english:'English',en:'English',eng:'English',e:'English',
  tamil:'Tamil',ta:'Tamil',tam:'Tamil',t:'Tamil',
};
function normalizeMedium(s) { return s ? MEDIUM_MAP[s.toLowerCase().trim()] || null : null; }

function validateYear(s) {
  const y = parseInt((s||'').trim(),10);
  return (y>=2000 && y<=new Date().getFullYear()) ? y : null;
}

function gradeLabel(g) {
  if (g==='ol') return 'O/L (Grade 11)';
  if (g==='al') return 'A/L (Grade 12/13)';
  return `Grade ${g}`;
}

// ── HTTP helper ───────────────────────────────────────────────
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' };

async function httpGet(url, timeout=12000) {
  const res = await axios.get(url, { timeout, headers: HEADERS });
  return res.data || '';
}

// ── Extract all PDF links from HTML ──────────────────────────
function extractPDFs(html, yearFilter=null) {
  const all = [...html.matchAll(/https?:\/\/[^\s"'<>]+\.pdf/gi)].map(m=>m[0]);
  const filtered = yearFilter ? all.filter(u=>u.includes(String(yearFilter))) : all;
  return filtered.length ? filtered : all;
}

// ── Source 1: pastpapers.wiki ─────────────────────────────────
async function srcPastpapersWiki(grade, subject, medium, year) {
  const gradeSlug   = grade==='ol' ? 'ol' : grade==='al' ? 'al' : `grade-${grade}`;
  const subjectSlug = subject.toLowerCase().replace(/\s+/g,'-');

  const urls = [
    `https://pastpapers.wiki/${gradeSlug}-${subjectSlug}-${medium.toLowerCase()}-medium-past-papers/`,
    `https://pastpapers.wiki/${gradeSlug}-${subjectSlug}-past-papers/`,
    `https://pastpapers.wiki/${subjectSlug}-${gradeSlug}-past-papers/`,
  ];

  for (const url of urls) {
    try {
      const html = await httpGet(url);
      const pdfs = extractPDFs(html, year);
      if (pdfs.length) return { type:'pdf', url:pdfs[0], source:'pastpapers.wiki' };
      // Page found but no PDFs
      if (html.length > 5000) return { type:'link', url, source:'pastpapers.wiki' };
    } catch(e) { if (e?.response?.status!==404) continue; }
  }
  return null;
}

// ── Source 2: studentlanka.com ────────────────────────────────
async function srcStudentLanka(grade, subject, medium, year) {
  const gradeSlug   = grade==='ol' ? 'o-l' : grade==='al' ? 'a-l' : `grade-${grade}`;
  const subjectSlug = subject.toLowerCase().replace(/\s+/g,'-');

  const urls = [
    `https://www.studentlanka.com/past-papers/${gradeSlug}-${subjectSlug}-past-papers/`,
    `https://www.studentlanka.com/${gradeSlug}-past-papers/`,
    `https://www.studentlanka.com/past-papers/`,
  ];

  for (const url of urls) {
    try {
      const html = await httpGet(url);
      const pdfs = extractPDFs(html, year);
      if (pdfs.length) return { type:'pdf', url:pdfs[0], source:'studentlanka.com' };
    } catch {}
  }
  return null;
}

// ── Source 3: grade.lk ────────────────────────────────────────
async function srcGradeLk(grade, subject, medium, year) {
  const gradeNum    = grade==='ol' ? 11 : grade==='al' ? 13 : parseInt(grade,10);
  const subjectSlug = subject.toLowerCase().replace(/\s+/g,'-');

  const urls = [
    `https://www.grade.lk/grade-${gradeNum}-${subjectSlug}-past-papers/`,
    `https://www.grade.lk/${subjectSlug}-past-papers-grade-${gradeNum}/`,
  ];

  for (const url of urls) {
    try {
      const html = await httpGet(url);
      const pdfs = extractPDFs(html, year);
      if (pdfs.length) return { type:'pdf', url:pdfs[0], source:'grade.lk' };
    } catch {}
  }
  return null;
}

// ── Source 4: doenets.lk (Dept of Examinations) ──────────────
async function srcDoenets(grade, subject, medium, year) {
  const urls = [
    `http://www.doenets.lk/exam`,
    `https://www.doenets.lk/pastpapers`,
  ];
  for (const url of urls) {
    try {
      const html = await httpGet(url, 10000);
      const pdfs = extractPDFs(html, year);
      const relevant = pdfs.filter(u =>
        u.toLowerCase().includes(subject.toLowerCase()) ||
        u.toLowerCase().includes(grade)
      );
      if (relevant.length) return { type:'pdf', url:relevant[0], source:'doenets.lk' };
    } catch {}
  }
  return null;
}

// ── Source 5: e-thaksalawa (MOE) ─────────────────────────────
async function srcEthaksalawa(grade, subject, medium, year) {
  const gradeNum = grade==='ol' ? 11 : grade==='al' ? 13 : parseInt(grade,10);
  const medCode  = medium==='Sinhala' ? 'S' : medium==='Tamil' ? 'T' : 'E';
  const url = `https://e-thaksalawa.moe.gov.lk/web/guest/resource-en` +
    `?p_p_id=resourcesportlet_WAR_ETPortlet` +
    `&_resourcesportlet_WAR_ETPortlet_grade=${gradeNum}` +
    `&_resourcesportlet_WAR_ETPortlet_subject=${encodeURIComponent(subject)}` +
    `&_resourcesportlet_WAR_ETPortlet_medium=${medCode}` +
    `&_resourcesportlet_WAR_ETPortlet_year=${year}` +
    `&_resourcesportlet_WAR_ETPortlet_type=PP`;
  try {
    const html = await httpGet(url);
    const pdfs = extractPDFs(html, year);
    if (pdfs.length) return { type:'pdf', url:pdfs[0], source:'e-thaksalawa.moe.gov.lk' };
  } catch {}
  return null;
}

// ── Source 6: DuckDuckGo HTML search ─────────────────────────
async function srcDuckDuckGo(grade, subject, medium, year) {
  const gl = grade==='ol' ? 'OL grade 11' : grade==='al' ? 'AL grade 13' : `grade ${grade}`;
  const q  = `${gl} ${subject} ${medium} medium past paper ${year} Sri Lanka filetype:pdf`;

  try {
    const html = await httpGet(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    const pdfs = extractPDFs(html, year);
    if (pdfs.length) return { type:'pdf', url:pdfs[0], source:'DuckDuckGo' };

    // site-specific links
    const siteRe = /https?:\/\/(?:pastpapers?\.wiki|studentlanka\.com|grade\.lk|doenets\.lk|e-thaksalawa[^\s"'<>]*)[^\s"'<>]*/gi;
    const sites  = [...html.matchAll(siteRe)].map(m=>m[0]);
    if (sites.length) return { type:'link', url:sites[0], source:'DuckDuckGo' };
  } catch {}

  // Final fallback: return search URL
  const ddgQ = `${gl} ${subject} ${medium} medium past paper ${year} Sri Lanka`;
  return { type:'search', url:`https://duckduckgo.com/?q=${encodeURIComponent(ddgQ)}`, source:'DuckDuckGo' };
}

// ── Try all sources in order ──────────────────────────────────
async function findPaper(grade, subject, medium, year) {
  const sources = [
    () => srcPastpapersWiki(grade, subject, medium, year),
    () => srcStudentLanka(grade, subject, medium, year),
    () => srcGradeLk(grade, subject, medium, year),
    () => srcDoenets(grade, subject, medium, year),
    () => srcEthaksalawa(grade, subject, medium, year),
    () => srcDuckDuckGo(grade, subject, medium, year),
  ];

  for (const fn of sources) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
  }
  return null;
}

// ── Download PDF ──────────────────────────────────────────────
async function downloadPDF(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: 50*1024*1024,
    headers: HEADERS,
  });
  const ct = (res.headers['content-type']||'').toLowerCase();
  if (!ct.includes('pdf') && !ct.includes('octet')) throw new Error('Not a PDF');
  return Buffer.from(res.data);
}

// ── Send paper ────────────────────────────────────────────────
async function sendPaper(sock, m, grade, subject, medium, year) {
  const gl = gradeLabel(grade);
  await m.reply(`⏳ *${gl} ${subject}* (${medium}) *${year}* සොයනවා...\n\n_Checking 6 sources..._`);

  const result = await findPaper(grade, subject, medium, year);

  if (!result) {
    return sendButtons(sock, m.chat, {
      text:
        `❌ *${gl} ${subject} (${medium}) ${year}* not found.\n\n` +
        `💡 Try a different year.\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [
        { label:`📅 Try ${year-1}`, id:`.passpaper ${grade} ${subject.toLowerCase()} ${medium.toLowerCase()} ${year-1}` },
        { label:`📅 Try ${year-2}`, id:`.passpaper ${grade} ${subject.toLowerCase()} ${medium.toLowerCase()} ${year-2}` },
        { label:`🔄 Different subject`, id:`.passpaper ${grade}` },
      ],
    });
  }

  // PDF found → try download
  if (result.type === 'pdf') {
    try {
      await m.reply(`📥 Found on *${result.source}*! Downloading...`);
      const buf   = await downloadPDF(result.url);
      const fname = `${grade}_${subject}_${medium}_${year}.pdf`.toLowerCase().replace(/[\s/]+/g,'_');

      await sock.sendMessage(m.chat, {
        document: buf,
        mimetype: 'application/pdf',
        fileName: fname,
        caption:
          `📄 *${gl} — ${subject}*\n` +
          `🌐 Medium : *${medium}*\n` +
          `📅 Year   : *${year}*\n` +
          `📦 Size   : ${(buf.length/1024).toFixed(1)} KB\n` +
          `🔗 Source : ${result.source}\n\n${cfg.footer}`,
      }, { quoted: m.msg });

      return sendButtons(sock, m.chat, {
        text: `✅ *Paper sent!*  📄 ${gl} ${subject} — ${medium} ${year}\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label:`📅 ${year-1}`,       id:`.passpaper ${grade} ${subject.toLowerCase()} ${medium.toLowerCase()} ${year-1}` },
          { label:`📅 ${year-2}`,       id:`.passpaper ${grade} ${subject.toLowerCase()} ${medium.toLowerCase()} ${year-2}` },
          { label:`📚 Other subject`,   id:`.passpaper ${grade}` },
        ],
      });
    } catch {
      // Download failed → send link
      result.type = 'link';
    }
  }

  // Link or search fallback
  await sendButtons(sock, m.chat, {
    text:
      `🔗 *${gl} ${subject} — ${medium} ${year}*\n\n` +
      `Found on *${result.source}*.\n` +
      `Tap to download manually:\n\n` +
      `📎 ${result.url}\n\n${cfg.footer}`,
    footer: cfg.footer,
    buttons: [
      { label:`🔄 Try again`,    id:`.passpaper ${grade} ${subject.toLowerCase()} ${medium.toLowerCase()} ${year}` },
      { label:`📅 Try ${year-1}`,id:`.passpaper ${grade} ${subject.toLowerCase()} ${medium.toLowerCase()} ${year-1}` },
    ],
  });
}

// ── Show year buttons ─────────────────────────────────────────
async function askYear(sock, m, session) {
  const cy = new Date().getFullYear();
  ppSessions.set(m.chat, { ...session, step:'year' });
  await sendButtons(sock, m.chat, {
    text:
      `✅ Medium: *${session.medium}*\n\n` +
      `📅 *Select year or type it:*\n\n${cfg.footer}`,
    footer: cfg.footer,
    buttons: [
      { label:`📅 ${cy-1}`, id:`__pp_year_${cy-1}` },
      { label:`📅 ${cy-2}`, id:`__pp_year_${cy-2}` },
      { label:`📅 ${cy-3}`, id:`__pp_year_${cy-3}` },
      { label:`📅 ${cy-4}`, id:`__pp_year_${cy-4}` },
    ],
  });
}

// ── Multi-step handler (called from messageHandler) ───────────
async function handlePendingPP(sock, m) {
  const session = ppSessions.get(m.chat);
  if (!session) return false;

  const body = (m.body || '').trim();

  // ── Subject step ─────────────────────────────────────────
  if (session.step === 'subject') {
    const sub = normalizeSubject(body);
    if (!sub) {
      await m.reply(`❌ Unknown subject.\n\nAvailable: ${(GRADE_SUBJECTS[session.grade]||[]).join(', ')}`);
      return true;
    }
    session.subject = sub;

    if (session.medium) {
      // Medium already known (passed in command) → go to year
      return askYear(sock, m, session) || true;
    }

    session.step = 'medium';
    ppSessions.set(m.chat, session);

    await sendButtons(sock, m.chat, {
      text:`✅ Subject: *${sub}*\n\n🌐 *Select Medium / භාෂා / மொழி*\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [
        { label:'🇱🇰 Sinhala', id:'__pp_medium_Sinhala' },
        { label:'🇬🇧 English', id:'__pp_medium_English' },
        { label:'🇮🇳 Tamil',   id:'__pp_medium_Tamil'   },
      ],
    });
    return true;
  }

  // ── Medium step ──────────────────────────────────────────
  if (session.step === 'medium') {
    // Accept button ID format OR plain text
    let medium = null;
    if (body.startsWith('__pp_medium_')) {
      medium = body.replace('__pp_medium_','').trim();
    } else {
      medium = normalizeMedium(body);
    }

    if (!['Sinhala','English','Tamil'].includes(medium)) {
      await m.reply(`❌ Select: *Sinhala*, *English*, or *Tamil*`);
      return true;
    }

    session.medium = medium;
    await askYear(sock, m, session);
    return true;
  }

  // ── Year step ────────────────────────────────────────────
  if (session.step === 'year') {
    let year = null;
    if (body.startsWith('__pp_year_')) {
      year = validateYear(body.replace('__pp_year_',''));
    } else {
      year = validateYear(body);
    }

    if (!year) {
      await m.reply(`❌ Invalid year. Enter between 2000–${new Date().getFullYear()}`);
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
  commands: ['passpaper','pp','pastpaper','passparer'],
  handlePendingPP,

  async run({ sock, m }) {
    const args    = (m.text||'').trim().split(/\s+/).filter(Boolean);
    const grade   = normalizeGrade(args[0]);
    const subject = normalizeSubject(args[1]);
    const medium  = normalizeMedium(args[2]);
    const year    = validateYear(args[3]);

    // ── No grade → show grade buttons ─────────────────────
    if (!grade) {
      return sendButtons(sock, m.chat, {
        text:
          `📚 *PAST PAPER DOWNLOADER*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Usage: *.pp [grade] [subject] [medium] [year]*\n\n` +
          `Examples:\n` +
          `  *.pp grade8 maths sinhala 2023*\n` +
          `  *.pp ol science english 2022*\n` +
          `  *.pp al physics sinhala*\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label:'📗 Grade 8', id:'.passpaper grade8' },
          { label:'📘 Grade 9', id:'.passpaper grade9' },
          { label:'📙 O/L',     id:'.passpaper ol'     },
          { label:'📕 A/L',     id:'.passpaper al'     },
        ],
      });
    }

    // ── All 4 given → direct download ─────────────────────
    if (subject && medium && year) {
      return sendPaper(sock, m, grade, subject, medium, year);
    }

    // ── Subject missing ───────────────────────────────────
    if (!subject) {
      const subs    = GRADE_SUBJECTS[grade] || [];
      const btnSubs = subs.slice(0,4).map(s=>({ label:`📖 ${s}`, id:`.passpaper ${grade} ${s.toLowerCase()}` }));
      ppSessions.set(m.chat, { grade, subject:null, medium:medium||null, year:year||null, step:'subject' });
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

    // ── Medium missing ────────────────────────────────────
    if (!medium) {
      ppSessions.set(m.chat, { grade, subject, medium:null, year:year||null, step:'medium' });
      return sendButtons(sock, m.chat, {
        text:`📚 *${gradeLabel(grade)} — ${subject}*\n\n🌐 *Select Medium / භාෂා / மொழி*\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label:'🇱🇰 Sinhala', id:'__pp_medium_Sinhala' },
          { label:'🇬🇧 English', id:'__pp_medium_English' },
          { label:'🇮🇳 Tamil',   id:'__pp_medium_Tamil'   },
        ],
      });
    }

    // ── Year missing ──────────────────────────────────────
    const cy = new Date().getFullYear();
    ppSessions.set(m.chat, { grade, subject, medium, year:null, step:'year' });
    return sendButtons(sock, m.chat, {
      text:`📚 *${gradeLabel(grade)} — ${subject} (${medium})*\n\n📅 *Select year or type it:*\n\n${cfg.footer}`,
      footer: cfg.footer,
      buttons: [
        { label:`📅 ${cy-1}`, id:`__pp_year_${cy-1}` },
        { label:`📅 ${cy-2}`, id:`__pp_year_${cy-2}` },
        { label:`📅 ${cy-3}`, id:`__pp_year_${cy-3}` },
        { label:`📅 ${cy-4}`, id:`__pp_year_${cy-4}` },
      ],
    });
  },
};
