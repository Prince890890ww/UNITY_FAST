'use strict';
const axios  = require('axios');
const cfg    = require('../../config');
const { sendButtons } = require('./helper');

// ── Popular CSE stocks for market summary ─────────────────────
const TOP_STOCKS = [
  { symbol: 'JKH',  name: 'John Keells Holdings'  },
  { symbol: 'DIAL', name: 'Dialog Axiata'          },
  { symbol: 'COMB', name: 'Commercial Bank'        },
  { symbol: 'HNB',  name: 'Hatton National Bank'   },
  { symbol: 'SAMP', name: 'Sampath Bank'           },
  { symbol: 'SLT',  name: 'Sri Lanka Telecom'      },
  { symbol: 'CTC',  name: 'Ceylon Tobacco'         },
  { symbol: 'LOLU', name: 'Lanka Orix Leasing'     },
];

// ── Yahoo Finance: fetch one CSE stock ────────────────────────
async function fetchStock(symbol) {
  const ticker = symbol.toUpperCase().endsWith('.CM')
    ? symbol.toUpperCase()
    : `${symbol.toUpperCase()}.CM`;

  const res = await axios.get(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
    {
      timeout: 10000,
      params: { interval: '1d', range: '5d' },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    }
  );

  const result = res.data?.chart?.result?.[0];
  if (!result) throw new Error('No data found');

  const meta      = result.meta;
  const price     = meta.regularMarketPrice ?? meta.previousClose ?? 0;
  const prevClose = meta.previousClose ?? price;
  const change    = +(price - prevClose).toFixed(2);
  const changePct = prevClose ? +((change / prevClose) * 100).toFixed(2) : 0;
  const high      = meta.regularMarketDayHigh ?? price;
  const low       = meta.regularMarketDayLow  ?? price;
  const volume    = meta.regularMarketVolume  ?? 0;
  const longName  = meta.longName || meta.shortName || symbol.toUpperCase();

  return { symbol: symbol.toUpperCase(), longName, price, prevClose, change, changePct, high, low, volume };
}

// ── Change emoji ──────────────────────────────────────────────
function changeEmoji(change) {
  if (change > 0) return '📈';
  if (change < 0) return '📉';
  return '➡️';
}

// ── Format large numbers (1,234,567 → 1.23M) ──────────────────
function fmtNum(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ── Mini price bar (relative to day range) ───────────────────
function priceBar(price, low, high) {
  const range = high - low;
  if (!range) return '──────────';
  const pct = Math.max(0, Math.min(1, (price - low) / range));
  const pos = Math.round(pct * 9);
  const bar = '─'.repeat(pos) + '●' + '─'.repeat(9 - pos);
  return bar;
}

// ─────────────────────────────────────────────────────────────
module.exports = {
  commands: ['cse', 'shares', 'share', 'stock', 'kothas'],

  async run({ sock, m }) {
    const arg = (m.text || '').trim().toUpperCase();

    // ── Single stock ────────────────────────────────────────────
    if (arg) {
      await m.reply(`🔍 Fetching *${arg}* from CSE...`);
      try {
        const s = await fetchStock(arg);
        const emo    = changeEmoji(s.change);
        const sign   = s.change >= 0 ? '+' : '';
        const bar    = priceBar(s.price, s.low, s.high);

        const msg =
          `╔══════════════════════════════╗\n` +
          `║  📊 *CSE SHARE PRICE*           ║\n` +
          `║  🇱🇰 Colombo Stock Exchange    ║\n` +
          `╠══════════════════════════════╣\n` +
          `║\n` +
          `║  🏢 *${s.symbol}*\n` +
          `║  _${s.longName}_\n` +
          `║\n` +
          `║  💰 *LKR ${s.price.toFixed(2)}*\n` +
          `║  ${emo} ${sign}${s.change.toFixed(2)}  _(${sign}${s.changePct.toFixed(2)}%)_\n` +
          `║\n` +
          `╠══════════════════════════════╣\n` +
          `│\n` +
          `│  📉 Low  : LKR *${s.low.toFixed(2)}*\n` +
          `│  ${bar}\n` +
          `│  📈 High : LKR *${s.high.toFixed(2)}*\n` +
          `│\n` +
          `│  🔄 *Prev Close* : LKR ${s.prevClose.toFixed(2)}\n` +
          `│  📦 *Volume*     : ${fmtNum(s.volume)} shares\n` +
          `│\n` +
          `╚══════════════════════════════╝\n` +
          `\n⏱️ _Data from Yahoo Finance · delayed_\n${cfg.footer}`;

        await sendButtons(sock, m.chat, {
          text: msg,
          footer: cfg.footer,
          buttons: [
            { label: `🔄 Refresh ${s.symbol}`,  id: `.cse ${s.symbol}`  },
            { label: `📊 Market Summary`,        id: `.cse`              },
            { label: `🌐 CSE Website`,           id: `.cse`              },
          ],
        });
      } catch (e) {
        const isNotFound = (e?.response?.status === 404) || !(e?.response?.data?.chart?.result);
        await sendButtons(sock, m.chat, {
          text:
            `❌ Stock *"${arg}"* not found on CSE.\n\n` +
            `💡 Try popular symbols:\n` +
            `  • *JKH* — John Keells\n` +
            `  • *DIAL* — Dialog\n` +
            `  • *COMB* — Commercial Bank\n` +
            `  • *HNB* — Hatton National\n` +
            `  • *SAMP* — Sampath Bank\n\n` +
            `Example: *.cse JKH*\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '📈 JKH',   id: '.cse JKH'  },
            { label: '📈 DIAL',  id: '.cse DIAL'  },
            { label: '📈 COMB',  id: '.cse COMB'  },
          ],
        });
      }
      return;
    }

    // ── Market summary — top stocks ─────────────────────────────
    await m.reply('📊 Fetching CSE market data...');

    const results = [];
    for (const s of TOP_STOCKS) {
      try {
        const data = await fetchStock(s.symbol);
        results.push(data);
      } catch { /* skip failed stocks */ }
    }

    if (!results.length) {
      await sendButtons(sock, m.chat, {
        text: `❌ Could not fetch CSE market data.\n\nTry a specific stock:\n*.cse JKH*\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: '📈 Try JKH',  id: '.cse JKH'  },
          { label: '🔄 Retry',    id: '.cse'       },
        ],
      });
      return;
    }

    // ── Sort by % change desc ─────────────────────────────────
    const sorted   = [...results].sort((a, b) => b.changePct - a.changePct);
    const gainers  = sorted.filter(s => s.change > 0).slice(0, 3);
    const losers   = [...sorted].reverse().filter(s => s.change < 0).slice(0, 3);

    // ── Build stock rows ──────────────────────────────────────
    function row(s) {
      const emo  = changeEmoji(s.change);
      const sign = s.change >= 0 ? '+' : '';
      return (
        `│  ${emo} *${s.symbol.padEnd(6)}* LKR ${String(s.price.toFixed(2)).padStart(8)}` +
        `  (${sign}${s.changePct.toFixed(1)}%)`
      );
    }

    const allRows = results.map(row).join('\n');
    const gainerRows = gainers.length
      ? gainers.map(row).join('\n')
      : '│  —';
    const loserRows = losers.length
      ? losers.map(row).join('\n')
      : '│  —';

    const msg =
      `╔══════════════════════════════╗\n` +
      `║  📊 *CSE MARKET SUMMARY*       ║\n` +
      `║  🇱🇰 Colombo Stock Exchange   ║\n` +
      `╠══════════════════════════════╣\n` +
      `│\n` +
      `${allRows}\n` +
      `│\n` +
      `╠══════════════════════════════╣\n` +
      `║  🏆 *TOP GAINERS*\n` +
      `╠══════════════════════════════╣\n` +
      `${gainerRows}\n` +
      `╠══════════════════════════════╣\n` +
      `║  🔻 *TOP LOSERS*\n` +
      `╠══════════════════════════════╣\n` +
      `${loserRows}\n` +
      `╠══════════════════════════════╣\n` +
      `│  💡 *.cse SYMBOL* for details\n` +
      `│  e.g. *.cse JKH*\n` +
      `╚══════════════════════════════╝\n` +
      `\n⏱️ _Data from Yahoo Finance · delayed_\n${cfg.footer}`;

    await sendButtons(sock, m.chat, {
      text: msg,
      footer: cfg.footer,
      buttons: [
        { label: '🔄 Refresh',    id: '.cse'       },
        { label: '📈 JKH',        id: '.cse JKH'   },
        { label: '📈 DIAL',       id: '.cse DIAL'  },
        { label: '📈 COMB',       id: '.cse COMB'  },
      ],
    });
  },
};
