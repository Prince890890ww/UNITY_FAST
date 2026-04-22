'use strict';

// ── UNITY-MD Trilingual String Table ─────────────────────────
// Usage: const { t } = require('./strings');
//        t('startup.activated', lang)   → lang = 'en' | 'si' | 'ta'
//
// Rules:
//   • 'en' = English  (default fallback)
//   • 'si' = සිංහල
//   • 'ta' = தமிழ்
//   • If a key is missing for a lang, falls back to 'en'.
// ─────────────────────────────────────────────────────────────

const strings = {

  // ── Startup message ────────────────────────────────────────
  'startup.activated': {
    en: '🧲  *UNITY-MD ACTIVATED*  🧩',
    si: '🧲  *UNITY-MD සක්‍රිය විය*  🧩',
    ta: '🧲  *UNITY-MD செயல்படுத்தப்பட்டது*  🧩',
  },
  'startup.connected': {
    en: '👤 *Connected:*',
    si: '👤 *සම්බන්ධ විය:*',
    ta: '👤 *இணைக்கப்பட்டது:*',
  },
  'startup.date': {
    en: '📅 *Date:*',
    si: '📅 *දිනය:*',
    ta: '📅 *தேதி:*',
  },
  'startup.time': {
    en: '🕐 *Time:*',
    si: '🕐 *වේලාව:*',
    ta: '🕐 *நேரம்:*',
  },
  'startup.active': {
    en: '✅ *Bot is now active!*',
    si: '✅ *බොට් දැන් සක්‍රියයි!*',
    ta: '✅ *போட் இப்போது செயலில் உள்ளது!*',
  },
  'startup.commands': {
    en: '📦 Commands:',
    si: '📦 විධාන:',
    ta: '📦 கட்டளைகள்:',
  },
  'startup.prefix': {
    en: '🔑 Prefix: *.* or */*',
    si: '🔑 උපසර්ගය: *.* හෝ */*',
    ta: '🔑 முன்னொட்டு: *.* அல்லது */*',
  },
  'startup.typemenu': {
    en: '💡 Type *.menu* to see all features',
    si: '💡 සියලු විශේෂාංග බලන්න *.menu* ටයිප් කරන්න',
    ta: '💡 அனைத்து அம்சங்களையும் காண *.menu* என்று தட்டச்சு செய்யவும்',
  },

  // ── Language select ────────────────────────────────────────
  'langselect.title': {
    en: '🌐  *LANGUAGE SELECT*  🌐',
    si: '🌐  *භාෂා තේරීම*  🌐',
    ta: '🌐  *மொழி தேர்வு*  🌐',
  },
  'langselect.prompt': {
    en: '🌍 Select your bot language:\nභාෂාව තෝරන්න:\nமொழியை தேர்ந்தெடுக்கவும்:',
    si: '🌍 Select your bot language:\nභාෂාව තෝරන්න:\nமொழியை தேர்ந்தெடுக்கவும்:',
    ta: '🌍 Select your bot language:\nභාෂාව තෝරන්න:\nமொழியை தேர்ந்தெடுக்கவும்:',
  },
  'langselect.blocked': {
    en: '⚠️ *All commands are blocked until you select a language!*',
    si: '⚠️ *භාෂාවක් තෝරන තුරු සියලු විධාන අවහිර කර ඇත!*',
    ta: '⚠️ *மொழியை தேர்ந்தெடுக்கும் வரை அனைத்து கட்டளைகளும் தடுக்கப்பட்டுள்ளன!*',
  },

  // ── Anti-call ──────────────────────────────────────────────
  'anticall.rejected': {
    en: '❌ *Calls not accepted!*\n\nPlease use text commands.',
    si: '❌ *ඇමතුම් භාරගත නොහැක!*\n\nකරුණාකර පෙළ විධාන භාවිත කරන්න.',
    ta: '❌ *அழைப்புகள் ஏற்கப்படவில்லை!*\n\nதயவுசெய்து உரை கட்டளைகளை பயன்படுத்தவும்.',
  },

  // ── Morocco block ──────────────────────────────────────────
  'moroccoblock.removed': {
    en: '🚫 User with +212 number detected and removed.',
    si: '🚫 +212 අංකය සහිත පරිශීලකයෙකු හඳුනා ගෙන ඉවත් කරන ලදී.',
    ta: '🚫 +212 எண் கொண்ட பயனர் கண்டறியப்பட்டு அகற்றப்பட்டார்.',
  },

  // ── Antidelete ─────────────────────────────────────────────
  'antidelete.title': {
    en: '🗑️ *Antidelete Alert*',
    si: '🗑️ *ඩිලීට් නිවේදනය*',
    ta: '🗑️ *நீக்கல் எச்சரிக்கை*',
  },
  'antidelete.deletedby': {
    en: '👤 *Deleted by:*',
    si: '👤 *මකා දැමූ පරිශීලකයා:*',
    ta: '👤 *நீக்கியவர்:*',
  },
  'antidelete.chat': {
    en: '📍 *Chat:*',
    si: '📍 *කතාබහ:*',
    ta: '📍 *அரட்டை:*',
  },
  'antidelete.time': {
    en: '🕐 *Time:*',
    si: '🕐 *වේලාව:*',
    ta: '🕐 *நேரம்:*',
  },
  'antidelete.message': {
    en: '💬 *Message:*',
    si: '💬 *පණිවිඩය:*',
    ta: '💬 *செய்தி:*',
  },
  'antidelete.notcached': {
    en: '⚠️ _Message content not cached_',
    si: '⚠️ _පණිවිඩ අන්තර්ගතය සුරැකී නැත_',
    ta: '⚠️ _செய்தி உள்ளடக்கம் சேமிக்கப்படவில்லை_',
  },

  // ── Scheduled message ──────────────────────────────────────
  'schedule.title': {
    en: '⏰ *Scheduled Message*',
    si: '⏰ *කාලසටහන් පණිවිඩය*',
    ta: '⏰ *திட்டமிடப்பட்ட செய்தி*',
  },

  // ── Daily report (owner only — English labels kept for clarity) ──
  'report.title': {
    en: '◤◢ 📊 𝘿𝘼𝙄𝙇𝙔 𝙍𝙀𝙋𝙊𝙍𝙏 ◤◢',
    si: '◤◢ 📊 දෛනික වාර්තාව ◤◢',
    ta: '◤◢ 📊 தினசரி அறிக்கை ◤◢',
  },
  'report.date': {
    en: '📅 Date:',
    si: '📅 දිනය:',
    ta: '📅 தேதி:',
  },
  'report.commands': {
    en: '⚡ Commands:',
    si: '⚡ විධාන:',
    ta: '⚡ கட்டளைகள்:',
  },
  'report.activeusers': {
    en: '👥 Active users:',
    si: '👥 සක්‍රිය පරිශීලකයින්:',
    ta: '👥 செயலில் உள்ள பயனர்கள்:',
  },
  'report.paired': {
    en: '🔗 Paired:',
    si: '🔗 යුගල කරන ලද:',
    ta: '🔗 இணைக்கப்பட்டவர்கள்:',
  },
  'report.totalusers': {
    en: '👤 Total users:',
    si: '👤 මුළු පරිශීලකයින්:',
    ta: '👤 மொத்த பயனர்கள்:',
  },
  'report.errors': {
    en: '❌ Errors:',
    si: '❌ දෝෂ:',
    ta: '❌ பிழைகள்:',
  },
  'report.newusers': {
    en: '👤 New users:',
    si: '👤 නව පරිශීලකයින්:',
    ta: '👤 புதிய பயனர்கள்:',
  },

  // ── Dashboard (ch3 — owner-facing, English fine but translated) ──
  'dashboard.title': {
    en: '🔐 *UNITY-MD Dashboard*',
    si: '🔐 *UNITY-MD උපකරණ පුවරුව*',
    ta: '🔐 *UNITY-MD கட்டுப்பாட்டு பலகை*',
  },
  'dashboard.status': {
    en: '✅ Status: Online',
    si: '✅ තත්ත්වය: සබැඳිව',
    ta: '✅ நிலை: இணையில்',
  },
  'dashboard.uptime': {
    en: '⏱️ Uptime:',
    si: '⏱️ ක්‍රියාකාරී කාලය:',
    ta: '⏱️ இயங்கும் நேரம்:',
  },
  'dashboard.ram': {
    en: '💾 RAM:',
    si: '💾 RAM:',
    ta: '💾 RAM:',
  },
  'dashboard.commands': {
    en: '📦 Commands:',
    si: '📦 විධාන:',
    ta: '📦 கட்டளைகள்:',
  },
  'dashboard.paired': {
    en: '🔗 Paired:',
    si: '🔗 යුගල:',
    ta: '🔗 இணைக்கப்பட்டவர்கள்:',
  },
  'dashboard.total': {
    en: '👥 Total:',
    si: '👥 මුළු:',
    ta: '👥 மொத்தம்:',
  },
  'dashboard.os': {
    en: '🖥️ OS:',
    si: '🖥️ OS:',
    ta: '🖥️ OS:',
  },

  // ── Antihijack ─────────────────────────────────────────────
  'hijack.bot_demoted_group': {
    en: '⚠️ *Security Alert!*\n\nBot has been demoted from admin.\nGroup protection is now disabled.',
    si: '⚠️ *ආරක්ෂක අනතුරු ඇඟවීම!*\n\nබොට් පරිපාලකයෙකු ලෙස අවනත කරන ලදී.\nකණ්ඩායම් ආරක්ෂාව දැන් අක්‍රියයි.',
    ta: '⚠️ *பாதுகாப்பு எச்சரிக்கை!*\n\nபாட் நிர்வாகியிடமிருந்து இறக்கப்பட்டது.\nகுழு பாதுகாப்பு இப்போது முடக்கப்பட்டது.',
  },
  'hijack.bot_demoted_owner': {
    en: '🚨 *HIJACK ALERT!*',
    si: '🚨 *හයිජැක් අනතුරු ඇඟවීම!*',
    ta: '🚨 *கைப்பற்றல் எச்சரிக்கை!*',
  },
  'hijack.bot_demoted_detail': {
    en: '⚠️ Bot was demoted!',
    si: '⚠️ බොට් අවනත කරන ලදී!',
    ta: '⚠️ போட் இறக்கப்பட்டது!',
  },
  'hijack.group_label': {
    en: '📍 Group:',
    si: '📍 කණ්ඩායම:',
    ta: '📍 குழு:',
  },
  'hijack.time_label': {
    en: '⏰',
    si: '⏰',
    ta: '⏰',
  },
  'hijack.masspromote_group': {
    en: '🚨 *Hijack Attempt Detected!*',
    si: '🚨 *හයිජැක් උත්සාහයක් හඳුනා ගන්නා ලදී!*',
    ta: '🚨 *கைப்பற்றல் முயற்சி கண்டறியப்பட்டது!*',
  },
  'hijack.masspromote_users': {
    en: (n) => `⚠️ ${n} users were promoted at once.`,
    si: (n) => `⚠️ ${n} දෙනෙකු එකවර ප්‍රවර්ධනය කරන ලදී.`,
    ta: (n) => `⚠️ ${n} பயனர்கள் ஒரே நேரத்தில் உயர்த்தப்பட்டனர்.`,
  },
  'hijack.group_locked': {
    en: '🔒 Group has been locked for safety.',
    si: '🔒 ආරක්ෂාව සඳහා කණ්ඩායම අගුළු දමා ඇත.',
    ta: '🔒 பாதுகாப்பிற்காக குழு பூட்டப்பட்டது.',
  },
  'hijack.contact_admin': {
    en: 'Contact original admin to unlock.',
    si: 'අගුළු ඇරීමට මුල් පරිපාලකයා අමතන්න.',
    ta: 'திறக்க அசல் நிர்வாகியை தொடர்பு கொள்ளவும்.',
  },
  'hijack.masspromote_owner': {
    en: (n) => `👥 Mass promote: ${n} users`,
    si: (n) => `👥 සමූහ ප්‍රවර්ධනය: ${n} දෙනෙකු`,
    ta: (n) => `👥 வெகுஜன உயர்வு: ${n} பயனர்கள்`,
  },
  'hijack.autolocked': {
    en: '🔒 Group auto-locked',
    si: '🔒 කණ්ඩායම ස්වයංක්‍රීයව අගුළු දමා ඇත',
    ta: '🔒 குழு தானாக பூட்டப்பட்டது',
  },
  'hijack.critical': {
    en: '🚨 *CRITICAL ALERT!*',
    si: '🚨 *විශේෂ අනතුරු ඇඟවීම!*',
    ta: '🚨 *மிக முக்கியமான எச்சரிக்கை!*',
  },
  'hijack.all_admins_removed': {
    en: '⚠️ ALL admins removed!\nGroup has no admins now.',
    si: '⚠️ සියලු පරිපාලකයින් ඉවත් කරන ලදී!\nකණ්ඩායමේ දැන් පරිපාලකයින් නොමැත.',
    ta: '⚠️ அனைத்து நிர்வாகிகளும் அகற்றப்பட்டனர்!\nகுழுவில் இப்போது நிர்வாகிகள் இல்லை.',
  },
  'hijack.raid': {
    en: '🚨 *Raid Detected!*',
    si: '🚨 *රේඩ් ප්‍රහාරයක් හඳුනා ගන්නා ලදී!*',
    ta: '🚨 *ரெய்டு கண்டறியப்பட்டது!*',
  },
  'hijack.raid_users': {
    en: (n) => `⚠️ ${n} users added at once.`,
    si: (n) => `⚠️ ${n} දෙනෙකු එකවර එකතු කරන ලදී.`,
    ta: (n) => `⚠️ ${n} பயனர்கள் ஒரே நேரத்தில் சேர்க்கப்பட்டனர்.`,
  },
  'hijack.raid_locked': {
    en: '🔒 Group locked for 10 minutes.',
    si: '🔒 කණ්ඩායම මිනිත්තු 10 ක් අගුළු දමා ඇත.',
    ta: '🔒 குழு 10 நிமிடங்களுக்கு பூட்டப்பட்டது.',
  },
  'hijack.raid_alert': {
    en: '🚨 *RAID ALERT!*',
    si: '🚨 *රේඩ් අනතුරු ඇඟවීම!*',
    ta: '🚨 *ரெய்டு எச்சரிக்கை!*',
  },
  'hijack.raid_massjoin': {
    en: (n) => `👥 ${n} mass join`,
    si: (n) => `👥 ${n} දෙනෙකු සමූහ ලෙස සම්බන්ධ විය`,
    ta: (n) => `👥 ${n} பேர் வெகுஜன சேர்க்கை`,
  },
  'hijack.raid_autolocked': {
    en: '🔒 Auto-locked 10min',
    si: '🔒 ස්වයංක්‍රීයව මිනිත්තු 10 ක් අගුළු දමා ඇත',
    ta: '🔒 தானாக 10 நிமிடம் பூட்டப்பட்டது',
  },
  'hijack.bot_not_admin': {
    en: '⚠️ *Bot Not Admin*',
    si: '⚠️ *බොට් පරිපාලකයෙකු නොවේ*',
    ta: '⚠️ *போட் நிர்வாகி இல்லை*',
  },
  'hijack.make_admin': {
    en: 'Please make bot admin for full protection.',
    si: 'සම්පූර්ණ ආරක්ෂාව සඳහා කරුණාකර බොට් පරිපාලකයෙකු කරන්න.',
    ta: 'முழு பாதுகாப்பிற்கு தயவுசெய்து போட்டை நிர்வாகி ஆக்கவும்.',
  },
  'hijack.jid_label': {
    en: '🔗 JID:',
    si: '🔗 JID:',
    ta: '🔗 JID:',
  },
};

// ── t() — resolve a string key for a given lang ───────────────
// If the value is a function (for dynamic strings), returns the function.
// If the value is a string, returns the string.
// Falls back to 'en' if the lang is not found.
function t(key, lang) {
  const l = lang && strings[key]?.[lang] !== undefined ? lang : 'en';
  const val = strings[key]?.[l] ?? strings[key]?.['en'] ?? key;
  return val; // caller invokes as t('key', lang)(n) if it's a function
}

// ── getLang() — safely read lang from DB botCfg ──────────────
// Returns 'en' | 'si' | 'ta'. Never throws.
async function getLang(db, sessionOwner) {
  try {
    const cfg = await db.getBotConfig(sessionOwner);
    const l = cfg?.lang;
    if (l === 'si' || l === 'ta' || l === 'en') return l;
    return 'en';
  } catch {
    return 'en';
  }
}

module.exports = { t, getLang, strings };
