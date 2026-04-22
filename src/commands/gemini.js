'use strict';
const { getT } = require('../lang');
const axios = require('axios');
const cfg = require('../../config');
const NodeCache = require('node-cache');
const db = require('./index');

const aiHistory = new NodeCache({ stdTTL: 3600 });

async function geminiChat(prompt, history = []) {
  const key = cfg.geminiApiKey;
  if (!key) throw new Error('Gemini API key not set in config.env');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const contents = [
    ...history,
    { role: 'user', parts: [{ text: prompt }] }
  ];

  const res = await axios.post(url, {
    contents,
    generationConfig: { temperature: 0.9, maxOutputTokens: 1000 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  }, { timeout: 30000 });

  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '❌ No response.';
}

module.exports = {
  geminiChat,
  commands: ['ai', 'gemini', 'clearai', 'resetai', 'stopai'],

  // Public = ඕනම කෙනෙකුට
  // Mode mismatch = silent (no reply)

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd    = m.command;
    const text   = m.text?.trim();
    const sender = m.sender;
    const chat   = m.chat;

    // ── Mode check (silent block) — per-session from DB ──────
    try {
      const botCfg = await db.getBotConfig(m.sessionOwner);
      const mode = botCfg?.mode || 'public';
      if (mode === 'group' && !m.isGroup) return;
      if (mode === 'inbox' && m.isGroup) return;
      if (mode === 'private' && !m.isOwner && !m.isPaired) return;
    } catch (e) {}

    // ── Clear memory ─────────────────────────────────────────
    if (cmd === 'clearai' || cmd === 'resetai') {
      aiHistory.del(sender);
      aiHistory.del(chat);
      return m.reply(
        `🧹 *AI memory cleared!*\n\n` +
        `Fresh conversation started.\n\n` +
        `${cfg.footer}`
      );
    }

    if (cmd === 'stopai') {
      aiHistory.del(chat);
      return m.reply(`${tr('ai_stopped2')}\n\n${cfg.footer}`);
    }

    // ── Chat ─────────────────────────────────────────────────
    if (!text) {
      return m.reply(
        `🤖 *UNITY-MD AI*\n\n` +
        `📌 Usage: *.ai* [question]\n\n` +
        `Example:\n` +
        `*.ai* What is the capital of Sri Lanka?\n` +
        `*.ai* Write a poem about rain\n\n` +
        `💡 I remember the last *10 messages* in conversation.\n` +
        `🧹 Use *.clearai* to reset memory.\n\n` +
        `${cfg.footer}`
      );
    }

    await m.react('⏳');

    try {
      const histKey = m.isGroup ? chat : sender;
      const history = aiHistory.get(histKey) || [];
      const reply = await geminiChat(text, history);
      const newHistory = [
        ...history,
        { role: 'user', parts: [{ text }] },
        { role: 'model', parts: [{ text: reply }] },
      ].slice(-20);
      aiHistory.set(histKey, newHistory);
      await m.react('✅');
      return m.reply(`🤖 *UNITY-MD AI*\n\n${reply}\n\n${cfg.footer}`);
    } catch (e) {
      await m.react('❌');
      return m.reply(`❌ AI Error: ${e.message}\n\n${cfg.footer}`);
    }
  },

  async handleGroupAI(sock, m) {
    if (!m.isGroup || !m.group?.settings?.aiMode) return;
    if (m.isCmd || !m.body?.trim()) return;
    try {
      const history = aiHistory.get(m.chat) || [];
      const reply = await geminiChat(m.body, history);
      const newHistory = [
        ...history,
        { role: 'user', parts: [{ text: m.body }] },
        { role: 'model', parts: [{ text: reply }] },
      ].slice(-20);
      aiHistory.set(m.chat, newHistory);
      await sock.sendMessage(m.chat, { text: reply }, { quoted: m.msg });
    } catch (e) {}
  },
};