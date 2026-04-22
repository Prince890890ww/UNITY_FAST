'use strict';
/**
 * UNITY-MD — Language Strings (i18n)
 * Supported: en | si | ta
 * Set BOT_LANG in config.env
 */

const strings = {

  // ── English ────────────────────────────────────────────────
  en: {
    loading:      '🔍 Searching...',
    noResults:    (q) => `❌ *No results found for:* "${q}"`,
    rateLimited:  '⚠️ Too many requests. Please wait a moment and try again.',
    fetchError:   (e) => `❌ Failed to fetch video.\n\`${e}\``,
    duration:     'Duration',
    views:        'Views',
    tags:         'Tags',
  },

  // ── Sinhala ────────────────────────────────────────────────
  si: {
    loading:      '🔍 සොයමින් පවතී...',
    noResults:    (q) => `❌ *"${q}"* සඳහා ප්‍රතිඵල හමු නොවිණි.`,
    rateLimited:  '⚠️ ඉල්ලීම් සීමාව ඉක්මවා ඇත. ටික වේලාවකින් නැවත උත්සාහ කරන්න.',
    fetchError:   (e) => `❌ වීඩියෝව ලබාගැනීමට අසමත් විය.\n\`${e}\``,
    duration:     'කාලය',
    views:        'නැරඹුම්',
    tags:         'ටැග්',
  },

  // ── Tamil ──────────────────────────────────────────────────
  ta: {
    loading:      '🔍 தேடுகிறது...',
    noResults:    (q) => `❌ *"${q}"* க்கு எந்த முடிவும் கிடைக்கவில்லை.`,
    rateLimited:  '⚠️ கோரிக்கை வரம்பு மீறப்பட்டது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.',
    fetchError:   (e) => `❌ வீடியோவை பெற முடியவில்லை.\n\`${e}\``,
    duration:     'நேரம்',
    views:        'பார்வைகள்',
    tags:         'குறிச்சொற்கள்',
  },
};

/**
 * Get language strings for the current BOT_LANG setting.
 * Falls back to English if unknown lang is set.
 */
function getLang() {
  const lang = (process.env.BOT_LANG || 'en').toLowerCase().trim();
  return strings[lang] || strings['en'];
}

module.exports = { getLang };
