'use strict';
const { getT } = require('../lang');
const axios = require('axios');
const cfg = require('../../config');
const { sendButtons } = require('./helper');

// ══════════════════════════════════════════════════════
// UNITY AI EXTRA — OpenAI, DeepSeek, Mistral
// Ported from Lara-3V (rebranded) and adapted for Unity-MD structure
// ══════════════════════════════════════════════════════

module.exports = {
  commands: [
    'openai', 'chatgpt', 'gpt', 'gpt3', 'gpt5',
    'deepseek', 'deep', 'seekai',
    'mistral', 'bot', 'unity',
  ],

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd  = m.command;
    const chat = m.chat;
    const msg  = m.msg;
    const q    = m.text?.trim();

    // ── OpenAI / ChatGPT ──────────────────────────────
    if (['openai', 'chatgpt', 'gpt', 'gpt3', 'gpt5'].includes(cmd)) {
      if (!q) {
        return sendButtons(sock, chat, {
          text: `🧠 *OpenAI / ChatGPT*\n\n*Usage:* .${cmd} <your question>\n\n*Example:* .${cmd} What is quantum physics?\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const url = `https://vapis.my.id/api/openai?q=${encodeURIComponent(q)}`;
        const { data } = await axios.get(url, { timeout: 30000 });

        if (!data?.result) {
          await m.react('❌');
          return m.reply(`❌ OpenAI failed to respond. Please try again later.\n\n${cfg.footer}`);
        }

        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `🧠 *OpenAI Response*\n\n${data.result}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '🤖 Ask Again', id: '.openai' },
            { label: '📋 Menu',      id: '.menu' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ OpenAI error: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── DeepSeek AI ───────────────────────────────────
    if (['deepseek', 'deep', 'seekai'].includes(cmd)) {
      if (!q) {
        return sendButtons(sock, chat, {
          text: `👾 *DeepSeek AI*\n\n*Usage:* .${cmd} <your question>\n\n*Example:* .${cmd} Explain neural networks\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const url = `https://api.ryzendesu.vip/api/ai/deepseek?text=${encodeURIComponent(q)}`;
        const { data } = await axios.get(url, { timeout: 30000 });

        if (!data?.answer) {
          await m.react('❌');
          return m.reply(`❌ DeepSeek AI failed to respond. Please try again later.\n\n${cfg.footer}`);
        }

        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `👾 *DeepSeek AI Response*\n\n${data.answer}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '👾 Ask Again', id: '.deepseek' },
            { label: '🧠 OpenAI',   id: '.openai' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ DeepSeek error: ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── Mistral / Unity Bot ────────────────────────────
    if (['mistral', 'bot', 'unity'].includes(cmd)) {
      if (!q) {
        return sendButtons(sock, chat, {
          text: `🪄 *Mistral AI*\n\n*Usage:* .${cmd} <your question>\n\n*Example:* .${cmd} What is the meaning of life?\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const url = `https://pikabotzapi.vercel.app/ai/mistral/?apikey=anya-md&message=${encodeURIComponent(q)}`;
        const data = await axios.get(url, { timeout: 30000 }).then(r => r.data);

        if (!data?.message) {
          await m.react('❌');
          return m.reply(`❌ AI returned no response.\n\n${cfg.footer}`);
        }

        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `🪄 *Mistral AI*\n\n${data.message}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '🪄 Ask Again', id: '.mistral' },
            { label: '📋 Menu',      id: '.menu' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ Mistral error: ${e.message}\n\n${cfg.footer}`);
      }
    }
  },
};
