'use strict';
const axios  = require('axios');
const cfg    = require('../../config');
const { sendButtons } = require('./helper');

// ── Helper: download image buffer and send ───────────────────
async function sendImageFromUrl(sock, chat, url, caption, quoted) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UNITY-MD/2.0)' } });
  const buf = Buffer.from(res.data);
  await sock.sendMessage(chat, { image: buf, caption }, { quoted });
}

// ═══════════════════════════ API FUNCTIONS ═══════════════════════════

// ── Animals ──────────────────────────────────────────────────
async function getCatFact() {
  const r = await axios.get('https://catfact.ninja/fact', { timeout: 10000 });
  return r.data.fact;
}
async function getCatImage() {
  const r = await axios.get('https://api.thecatapi.com/v1/images/search', { timeout: 10000 });
  return r.data[0]?.url;
}
async function getDogImage() {
  const r = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 10000 });
  return r.data.message;
}
async function getFoxImage() {
  const r = await axios.get('https://randomfox.ca/floof/', { timeout: 10000 });
  return r.data.image;
}

// ── Entertainment / Personality ──────────────────────────────
async function getChuckJoke() {
  const r = await axios.get('https://api.chucknorris.io/jokes/random', { timeout: 10000 });
  return r.data.value;
}
async function getAdvice() {
  const r = await axios.get('https://api.adviceslip.com/advice', { timeout: 10000 });
  return r.data.slip.advice;
}
async function getActivity() {
  // Primary: bored-api.appbrewery.com (replacement for original boredapi.com)
  try {
    const r = await axios.get('https://bored-api.appbrewery.com/random', { timeout: 10000 });
    return r.data;
  } catch {
    // Fallback: boredapi.com (sometimes still works)
    const r2 = await axios.get('https://www.boredapi.com/api/activity', { timeout: 10000 });
    return r2.data;
  }
}
async function getUselessFact() {
  const r = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 10000 });
  return r.data.text;
}
async function getKanyeQuote() {
  const r = await axios.get('https://api.kanye.rest/', { timeout: 10000 });
  return r.data.quote;
}

// ── Finance ───────────────────────────────────────────────────
async function getExchangeRate(from, to, amount = 1) {
  const f = from.toLowerCase();
  const t = to.toLowerCase();
  // Primary: jsdelivr CDN mirror (no CORS issues)
  const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${f}.json`;
  const r = await axios.get(url, { timeout: 15000 });
  const rate = r.data[f]?.[t];
  if (!rate) throw new Error(`Currency pair ${from.toUpperCase()}/${to.toUpperCase()} not found`);
  const result = (amount * rate).toFixed(4);
  return { from: from.toUpperCase(), to: to.toUpperCase(), rate, result, amount };
}
async function getCryptoPrice(coin) {
  const id = coin.toLowerCase().replace(/\s+/g, '-');
  const r = await axios.get(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd,eur&include_24hr_change=true`,
    { timeout: 15000 }
  );
  const data = r.data[id];
  if (!data) throw new Error(`Coin "${coin}" not found. Try: bitcoin, ethereum, dogecoin, solana`);
  return { coin: id, ...data };
}

// ── Tools / Design ────────────────────────────────────────────
async function getColorInfo(hex) {
  const clean = hex.replace(/^#/, '');
  const r = await axios.get(`https://www.thecolorapi.com/id?hex=${clean}`, { timeout: 10000 });
  return r.data;
}
async function getNumberFact(n = 'random') {
  const target = (n === 'random' || isNaN(n)) ? 'random' : n;
  const r = await axios.get(`https://numbersapi.com/${target}/math?json`, { timeout: 10000 });
  return r.data;
}

// ── Anime / Manga ─────────────────────────────────────────────
async function searchAnime(query) {
  const r = await axios.get(
    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`,
    { timeout: 15000 }
  );
  return r.data.data?.[0];
}
async function searchManga(query) {
  const r = await axios.get(
    `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(query)}&limit=1`,
    { timeout: 15000 }
  );
  return r.data.data?.[0];
}
async function getRandomDragonBallChar() {
  const r = await axios.get('https://dragonball-api.com/api/characters?limit=58', { timeout: 15000 });
  const chars = r.data.items || r.data.data || [];
  if (!chars.length) throw new Error('No characters returned');
  return chars[Math.floor(Math.random() * chars.length)];
}

// ── Food & Drink ──────────────────────────────────────────────
async function searchRecipe(query) {
  const url = query
    ? `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`
    : 'https://www.themealdb.com/api/json/v1/1/random.php';
  const r = await axios.get(url, { timeout: 15000 });
  return r.data.meals?.[0];
}
async function searchCocktail(query) {
  const url = query
    ? `https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`
    : 'https://www.thecocktaildb.com/api/json/v1/1/random.php';
  const r = await axios.get(url, { timeout: 15000 });
  return r.data.drinks?.[0];
}

// ── Science / Space ───────────────────────────────────────────
async function getNasaApod() {
  const r = await axios.get(
    'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY',
    { timeout: 15000 }
  );
  return r.data;
}

// ── Books ─────────────────────────────────────────────────────
async function searchBook(query) {
  const r = await axios.get(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=4&fields=title,author_name,first_publish_year,number_of_pages_median`,
    { timeout: 15000 }
  );
  return r.data.docs?.slice(0, 4) || [];
}

// ── History ───────────────────────────────────────────────────
async function getOnThisDay() {
  const now = new Date();
  const mo  = now.getMonth() + 1;
  const day = now.getDate();
  const r   = await axios.get(`https://history.muffinlabs.com/date/${mo}/${day}`, { timeout: 15000 });
  return r.data?.data?.Events?.slice(0, 5) || [];
}

// ── Sports ────────────────────────────────────────────────────
async function getNbaScores() {
  // ESPN public scoreboard API — no auth required
  const r = await axios.get(
    'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
    { timeout: 15000 }
  );
  return r.data?.events || [];
}

// ── Tech ──────────────────────────────────────────────────────
async function searchPhoneSpec(query) {
  const r = await axios.get(
    `https://phone-specs-api.azharimm.dev/search?query=${encodeURIComponent(query)}`,
    { timeout: 15000 }
  );
  return r.data?.data?.phones || r.data?.phones || [];
}

// ═══════════════════════════ MODULE EXPORT ═══════════════════════════

module.exports = {
  commands: [
    // Animals
    'catfact', 'catfacts',
    'catpic',
    'dogpic',
    'foxpic',
    // Entertainment / Personality
    'chuck', 'chucknorris',
    'advice',
    'activity', 'bored',
    'uselessfact',
    'kanye',
    // Finance
    'exchange', 'convert',
    'crypto', 'cryptoprice',
    // Tools / Design
    'colorinfo',
    'numfact',
    // Anime / Manga
    'animeinfo',
    'manga',
    'dragonball', 'dbz',
    // Food & Drink
    'recipe',
    'cocktail', 'drink',
    // Science / Space
    'nasa', 'apod',
    // Books
    'book', 'openlibrary',
    // History
    'onthisday', 'histday',
    // Sports
    'nba', 'nbascore',
    // Tech
    'phonespec',
  ],

  async run({ sock, m }) {
    const cmd  = m.command;
    const chat = m.chat;
    const msg  = m.msg;
    const text = m.text?.trim();

    // ─────────────────────────────────────────────────────────
    // ANIMALS
    // ─────────────────────────────────────────────────────────

    // ── CAT FACT ──────────────────────────────────────────────
    if (cmd === 'catfact' || cmd === 'catfacts') {
      await m.react('🐱');
      try {
        const fact = await getCatFact();
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `🐱 *Cat Fact*\n\n_${fact}_\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '🐱 Another Fact', id: '.catfact' },
            { label: '📸 Cat Pic', id: '.catpic' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── CAT IMAGE ─────────────────────────────────────────────
    if (cmd === 'catpic') {
      await m.react('🐱');
      try {
        const url = await getCatImage();
        await sendImageFromUrl(sock, chat, url, `🐱 *Here's your cat!*\n\n${cfg.footer}`, msg);
        await m.react('✅');
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
      return;
    }

    // ── DOG IMAGE ─────────────────────────────────────────────
    if (cmd === 'dogpic') {
      await m.react('🐶');
      try {
        const url = await getDogImage();
        await sendImageFromUrl(sock, chat, url, `🐶 *Woof! Here's your dog!*\n\n${cfg.footer}`, msg);
        await m.react('✅');
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
      return;
    }

    // ── FOX IMAGE ─────────────────────────────────────────────
    if (cmd === 'foxpic') {
      await m.react('🦊');
      try {
        const url = await getFoxImage();
        await sendImageFromUrl(sock, chat, url, `🦊 *A wild fox appeared!*\n\n${cfg.footer}`, msg);
        await m.react('✅');
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────
    // ENTERTAINMENT / PERSONALITY
    // ─────────────────────────────────────────────────────────

    // ── CHUCK NORRIS ──────────────────────────────────────────
    if (cmd === 'chuck' || cmd === 'chucknorris') {
      await m.react('💪');
      try {
        const joke = await getChuckJoke();
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `💪 *Chuck Norris Fact*\n\n_"${joke}"_\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '💪 Another Fact', id: '.chuck' },
            { label: '😄 Joke', id: '.joke' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── ADVICE ────────────────────────────────────────────────
    if (cmd === 'advice') {
      await m.react('💡');
      try {
        const adv = await getAdvice();
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `💡 *Random Advice*\n\n_"${adv}"_\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '💡 More Advice', id: '.advice' },
            { label: '✨ Quote', id: '.quote' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── ACTIVITY / BORED ──────────────────────────────────────
    if (cmd === 'activity' || cmd === 'bored') {
      await m.react('🎯');
      try {
        const data = await getActivity();
        const act  = data.activity || 'No activity found';
        const type = data.type || '';
        const participants = data.participants ?? '';
        const price = data.price === 0 ? 'Free 🎉' : data.price ? `$${data.price}` : '';
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `🎯 *Random Activity*\n\n━━━━━━━━━━━━━━━━\n📌 *${act}*\n\n🏷️ Type: ${type}\n👥 Participants: ${participants}\n💰 Cost: ${price}\n━━━━━━━━━━━━━━━━\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '🎯 Another Activity', id: '.activity' },
            { label: '🎮 Games', id: '.gamemenu' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── USELESS FACT ──────────────────────────────────────────
    if (cmd === 'uselessfact') {
      await m.react('🤔');
      try {
        const fact = await getUselessFact();
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `🤔 *Useless Fact*\n\n_${fact}_\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '🤔 Another Fact', id: '.uselessfact' },
            { label: '😮 Random Fact', id: '.fact' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── KANYE QUOTE ───────────────────────────────────────────
    if (cmd === 'kanye') {
      await m.react('🎤');
      try {
        const quote = await getKanyeQuote();
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `🎤 *Kanye West Quote*\n\n_"${quote}"_\n\n— Kanye West\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '🎤 Another Quote', id: '.kanye' },
            { label: '✨ Quote', id: '.quote' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ─────────────────────────────────────────────────────────
    // FINANCE
    // ─────────────────────────────────────────────────────────

    // ── CURRENCY EXCHANGE ─────────────────────────────────────
    if (cmd === 'exchange' || cmd === 'convert') {
      if (!text) {
        return sendButtons(sock, chat, {
          text: `💱 *Currency Exchange*\n\n📌 *Usage:* .exchange [amount] [FROM] [TO]\n\n*Examples:*\n• .exchange 100 USD LKR\n• .exchange 50 EUR USD\n• .exchange 1 BTC USD\n• .exchange GBP JPY\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const parts = text.toUpperCase().split(/\s+/);
        let amount, from, to;
        if (parts.length === 3 && !isNaN(parts[0])) {
          [amount, from, to] = [parseFloat(parts[0]), parts[1], parts[2]];
        } else if (parts.length === 2) {
          [from, to] = [parts[0], parts[1]];
          amount = 1;
        } else {
          throw new Error('Invalid format. Use: .exchange [amount] FROM TO');
        }
        const res = await getExchangeRate(from, to, amount);
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `💱 *Currency Exchange*\n\n━━━━━━━━━━━━━━━━\n💵 *${res.amount} ${res.from}* = *${res.result} ${res.to}*\n📈 Rate: 1 ${res.from} = ${res.rate} ${res.to}\n━━━━━━━━━━━━━━━━\n_Powered by fawazahmed0/currency-api_\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '🔄 Convert More', id: '.exchange' },
            { label: '💰 Crypto', id: '.crypto' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── CRYPTO PRICE ──────────────────────────────────────────
    if (cmd === 'crypto' || cmd === 'cryptoprice') {
      if (!text) {
        return sendButtons(sock, chat, {
          text: `💰 *Crypto Price*\n\n📌 *Usage:* .crypto [coin name]\n\n*Examples:*\n• .crypto bitcoin\n• .crypto ethereum\n• .crypto dogecoin\n• .crypto solana\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '₿ Bitcoin', id: '.crypto bitcoin' },
            { label: '💎 Ethereum', id: '.crypto ethereum' },
          ],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const data = await getCryptoPrice(text);
        const change = data.usd_24h_change?.toFixed(2);
        const trend  = change > 0 ? '📈' : '📉';
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `💰 *${data.coin.toUpperCase()} Price*\n\n━━━━━━━━━━━━━━━━\n💵 USD: *$${data.usd?.toLocaleString()}*\n€ EUR: *€${data.eur?.toLocaleString()}*\n${trend} 24h: *${change}%*\n━━━━━━━━━━━━━━━━\n_Powered by CoinGecko_\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '₿ Bitcoin', id: '.crypto bitcoin' },
            { label: '💱 Exchange', id: '.exchange' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ─────────────────────────────────────────────────────────
    // TOOLS / DESIGN
    // ─────────────────────────────────────────────────────────

    // ── COLOR INFO ────────────────────────────────────────────
    if (cmd === 'colorinfo') {
      if (!text) {
        return sendButtons(sock, chat, {
          text: `🎨 *Color Info*\n\n📌 *Usage:* .colorinfo [hex code]\n\n*Examples:*\n• .colorinfo FF5733\n• .colorinfo #4A90D9\n• .colorinfo 00FF00\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const data = await getColorInfo(text);
        const name = data.name?.value || 'Unknown';
        const hex  = data.hex?.value  || `#${text.replace(/^#/, '')}`;
        const rgb  = data.rgb?.value  || '';
        const hsl  = data.hsl?.value  || '';
        const cmyk = data.cmyk?.value || '';
        const isLight = data.contrast?.value === '#000000';
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `🎨 *Color: ${name}*\n\n━━━━━━━━━━━━━━━━\n🔵 HEX: ${hex}\n🟢 RGB: ${rgb}\n🟡 HSL: ${hsl}\n🟠 CMYK: ${cmyk}\n☀️ Luminance: ${isLight ? 'Light' : 'Dark'}\n━━━━━━━━━━━━━━━━\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '🎨 Try Another', id: '.colorinfo' }, { label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ── NUMBER FACT ───────────────────────────────────────────
    if (cmd === 'numfact') {
      const num = text && !isNaN(text) ? text : 'random';
      await m.react('🔢');
      try {
        const data = await getNumberFact(num);
        const fact = typeof data === 'object' ? data.text : data;
        const n    = typeof data === 'object' ? data.number : '';
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `🔢 *Number Fact${n !== undefined && n !== '' ? `: ${n}` : ''}*\n\n_${fact}_\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '🔢 Another Fact', id: '.numfact' },
            { label: '😮 Random Fact', id: '.fact' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ─────────────────────────────────────────────────────────
    // ANIME / MANGA
    // ─────────────────────────────────────────────────────────

    // ── ANIME INFO ────────────────────────────────────────────
    if (cmd === 'animeinfo') {
      if (!text) {
        return sendButtons(sock, chat, {
          text: `🎌 *Anime Info*\n\n📌 *Usage:* .animeinfo [title]\n\n*Examples:*\n• .animeinfo Naruto\n• .animeinfo Attack on Titan\n• .animeinfo One Piece\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const anime = await searchAnime(text);
        if (!anime) throw new Error(`Anime not found: "${text}"`);
        const title    = anime.title_english || anime.title || 'Unknown';
        const score    = anime.score || 'N/A';
        const eps      = anime.episodes || '?';
        const status   = anime.status || 'Unknown';
        const type     = anime.type || '';
        const genres   = anime.genres?.map(g => g.name).slice(0, 5).join(', ') || 'N/A';
        const synopsis = anime.synopsis ? anime.synopsis.slice(0, 350) + '...' : 'No synopsis.';
        const img      = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
        const year     = anime.aired?.prop?.from?.year || '';
        await m.react('✅');
        const replyText =
          `🎌 *${title}*\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `⭐ Score: ${score}  |  📺 Type: ${type}\n` +
          `📺 Episodes: ${eps}  |  📅 Year: ${year}\n` +
          `📊 Status: ${status}\n` +
          `🎭 Genres: ${genres}\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `📝 ${synopsis}\n\n` +
          `_Powered by Jikan / MyAnimeList_\n\n${cfg.footer}`;
        if (img) {
          await sendImageFromUrl(sock, chat, img, replyText, msg);
        } else {
          await sendButtons(sock, chat, { text: replyText, footer: cfg.footer, buttons: [{ label: '🎌 Anime Menu', id: '.animemenu' }], quoted: msg });
        }
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
      return;
    }

    // ── MANGA INFO ────────────────────────────────────────────
    if (cmd === 'manga') {
      if (!text) {
        return sendButtons(sock, chat, {
          text: `📖 *Manga Info*\n\n📌 *Usage:* .manga [title]\n\n*Examples:*\n• .manga One Piece\n• .manga Demon Slayer\n• .manga Berserk\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const manga = await searchManga(text);
        if (!manga) throw new Error(`Manga not found: "${text}"`);
        const title    = manga.title_english || manga.title || 'Unknown';
        const score    = manga.score || 'N/A';
        const chapters = manga.chapters || 'Ongoing';
        const volumes  = manga.volumes  || 'Ongoing';
        const status   = manga.status   || 'Unknown';
        const genres   = manga.genres?.map(g => g.name).slice(0, 5).join(', ') || 'N/A';
        const synopsis = manga.synopsis ? manga.synopsis.slice(0, 350) + '...' : 'No synopsis.';
        const img      = manga.images?.jpg?.large_image_url || manga.images?.jpg?.image_url;
        await m.react('✅');
        const replyText =
          `📖 *${title}*\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `⭐ Score: ${score}\n` +
          `📚 Chapters: ${chapters}  |  📦 Volumes: ${volumes}\n` +
          `📊 Status: ${status}\n` +
          `🎭 Genres: ${genres}\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `📝 ${synopsis}\n\n` +
          `_Powered by Jikan / MyAnimeList_\n\n${cfg.footer}`;
        if (img) {
          await sendImageFromUrl(sock, chat, img, replyText, msg);
        } else {
          await sendButtons(sock, chat, { text: replyText, footer: cfg.footer, buttons: [{ label: '🎌 Anime Menu', id: '.animemenu' }], quoted: msg });
        }
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
      return;
    }

    // ── DRAGON BALL ───────────────────────────────────────────
    if (cmd === 'dragonball' || cmd === 'dbz') {
      await m.react('🐉');
      try {
        const char  = await getRandomDragonBallChar();
        const name  = char.name        || 'Unknown';
        const race  = char.race        || 'Unknown';
        const aff   = char.affiliation || 'Unknown';
        const ki    = char.ki          || char.baseKi  || 'Unknown';
        const maxKi = char.maxKi       || '';
        const img   = char.image;
        await m.react('✅');
        const replyText =
          `🐉 *Dragon Ball Character*\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `👤 Name: *${name}*\n` +
          `🧬 Race: ${race}\n` +
          `⚡ Ki: ${ki}${maxKi ? ` / Max: ${maxKi}` : ''}\n` +
          `🏹 Affiliation: ${aff}\n` +
          `━━━━━━━━━━━━━━━━\n\n` +
          `_Powered by dragonball-api.com_\n\n${cfg.footer}`;
        if (img) {
          await sendImageFromUrl(sock, chat, img, replyText, msg);
        } else {
          await sendButtons(sock, chat, {
            text: replyText,
            footer: cfg.footer,
            buttons: [{ label: '🐉 Another Char', id: '.dragonball' }, { label: '🎌 Anime', id: '.animemenu' }],
            quoted: msg,
          });
        }
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────
    // FOOD & DRINK
    // ─────────────────────────────────────────────────────────

    // ── RECIPE ────────────────────────────────────────────────
    if (cmd === 'recipe') {
      await m.react('🍽️');
      try {
        const meal = await searchRecipe(text || null);
        if (!meal) throw new Error('Recipe not found');
        const name         = meal.strMeal;
        const category     = meal.strCategory  || '';
        const area         = meal.strArea       || '';
        const img          = meal.strMealThumb;
        const instructions = meal.strInstructions?.replace(/\r\n/g, '\n').slice(0, 400) + '...';
        const ingredients  = [];
        for (let i = 1; i <= 12; i++) {
          const ing  = meal[`strIngredient${i}`];
          const meas = meal[`strMeasure${i}`];
          if (ing?.trim()) ingredients.push(`• ${meas?.trim() || ''} ${ing}`.trim());
        }
        await m.react('✅');
        const replyText =
          `🍽️ *${name}*\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `🏷️ Category: ${category}  |  🌍 Origin: ${area}\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `🧂 *Ingredients:*\n${ingredients.slice(0, 12).join('\n')}\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `📋 *Instructions:*\n${instructions}\n\n` +
          `_Powered by TheMealDB_\n\n${cfg.footer}`;
        if (img) {
          await sendImageFromUrl(sock, chat, img, replyText, msg);
        } else {
          await sendButtons(sock, chat, { text: replyText, footer: cfg.footer, buttons: [{ label: '🍽️ Random Recipe', id: '.recipe' }], quoted: msg });
        }
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n💡 Try: .recipe chicken | .recipe pasta | .recipe (random)\n\n${cfg.footer}`);
      }
      return;
    }

    // ── COCKTAIL ──────────────────────────────────────────────
    if (cmd === 'cocktail' || cmd === 'drink') {
      await m.react('🍹');
      try {
        const d = await searchCocktail(text || null);
        if (!d) throw new Error('Cocktail not found');
        const name         = d.strDrink;
        const category     = d.strCategory  || '';
        const alcoholic    = d.strAlcoholic  || '';
        const glass        = d.strGlass      || '';
        const instructions = d.strInstructions?.slice(0, 300) + '...';
        const img          = d.strDrinkThumb;
        const ingredients  = [];
        for (let i = 1; i <= 12; i++) {
          const ing  = d[`strIngredient${i}`];
          const meas = d[`strMeasure${i}`];
          if (ing?.trim()) ingredients.push(`• ${meas?.trim() || ''} ${ing}`.trim());
        }
        await m.react('✅');
        const replyText =
          `🍹 *${name}*\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `🏷️ Category: ${category}\n` +
          `🍸 Glass: ${glass}  |  🔞 ${alcoholic}\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `🧂 *Ingredients:*\n${ingredients.join('\n')}\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `📋 ${instructions}\n\n` +
          `_Powered by TheCocktailDB_\n\n${cfg.footer}`;
        if (img) {
          await sendImageFromUrl(sock, chat, img, replyText, msg);
        } else {
          await sendButtons(sock, chat, { text: replyText, footer: cfg.footer, buttons: [{ label: '🍹 Random Drink', id: '.cocktail' }], quoted: msg });
        }
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n💡 Try: .cocktail margarita | .cocktail mojito | .cocktail (random)\n\n${cfg.footer}`);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────
    // SCIENCE / SPACE
    // ─────────────────────────────────────────────────────────

    // ── NASA APOD ─────────────────────────────────────────────
    if (cmd === 'nasa' || cmd === 'apod') {
      await m.react('🔭');
      try {
        const data        = await getNasaApod();
        const title       = data.title       || 'Astronomy Picture';
        const date        = data.date        || '';
        const explanation = data.explanation ? data.explanation.slice(0, 400) + '...' : '';
        const imgUrl      = data.url         || '';
        await m.react('✅');
        const replyText =
          `🔭 *NASA — Astronomy Picture of the Day*\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `🌌 *${title}*\n` +
          `📅 Date: ${date}\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `📝 ${explanation}\n\n` +
          `_Powered by NASA APOD API_\n\n${cfg.footer}`;
        const isImg = /\.(jpg|jpeg|png|gif)/i.test(imgUrl);
        if (imgUrl && isImg) {
          await sendImageFromUrl(sock, chat, imgUrl, replyText, msg);
        } else {
          await sendButtons(sock, chat, {
            text: replyText + (imgUrl ? `\n🔗 ${imgUrl}` : ''),
            footer: cfg.footer,
            buttons: [{ label: '🔭 NASA Today', id: '.nasa' }, { label: '📋 Menu', id: '.menu' }],
            quoted: msg,
          });
        }
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────
    // BOOKS
    // ─────────────────────────────────────────────────────────

    // ── BOOK SEARCH ───────────────────────────────────────────
    if (cmd === 'book' || cmd === 'openlibrary') {
      if (!text) {
        return sendButtons(sock, chat, {
          text: `📚 *Book Search*\n\n📌 *Usage:* .book [title or author]\n\n*Examples:*\n• .book Harry Potter\n• .book Stephen Hawking\n• .book 1984\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const books = await searchBook(text);
        if (!books.length) throw new Error('No books found');
        const lines = books.map((b, i) => {
          const authors = (b.author_name || ['Unknown']).slice(0, 2).join(', ');
          const pages   = b.number_of_pages_median ? `${b.number_of_pages_median}pg` : '';
          return `${i + 1}. 📖 *${b.title}*\n    👤 ${authors}\n    📅 ${b.first_publish_year || 'N/A'}  ${pages}`;
        }).join('\n\n');
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `📚 *Books: "${text}"*\n\n━━━━━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━━━━━\n\n_Powered by Open Library_\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📚 Search More', id: '.book' }, { label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ─────────────────────────────────────────────────────────
    // HISTORY
    // ─────────────────────────────────────────────────────────

    // ── ON THIS DAY ───────────────────────────────────────────
    if (cmd === 'onthisday' || cmd === 'histday') {
      await m.react('📅');
      try {
        const events  = await getOnThisDay();
        if (!events.length) throw new Error('No historical events found');
        const now     = new Date();
        const dateStr = `${now.toLocaleString('en', { month: 'long' })} ${now.getDate()}`;
        const lines   = events.map(e => `• *${e.year}* — ${e.text}`).join('\n\n');
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `📅 *On This Day: ${dateStr}*\n\n━━━━━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━━━━━\n\n_Powered by History Muffinlabs_\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📅 Today\'s Events', id: '.onthisday' }, { label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ─────────────────────────────────────────────────────────
    // SPORTS
    // ─────────────────────────────────────────────────────────

    // ── NBA SCORES ────────────────────────────────────────────
    if (cmd === 'nba' || cmd === 'nbascore') {
      await m.react('🏀');
      try {
        const events = await getNbaScores();
        if (!events.length) throw new Error('No NBA games scheduled today');
        const lines = events.slice(0, 8).map(e => {
          const comps  = e.competitions?.[0];
          const home   = comps?.competitors?.find(c => c.homeAway === 'home');
          const away   = comps?.competitors?.find(c => c.homeAway === 'away');
          const status = e.status?.type?.shortDetail || 'TBD';
          const awayName  = away?.team?.abbreviation  || '?';
          const homeName  = home?.team?.abbreviation  || '?';
          const awayScore = away?.score ?? '-';
          const homeScore = home?.score ?? '-';
          return `🏀 *${awayName} ${awayScore}* vs *${homeScore} ${homeName}*\n    🕐 ${status}`;
        }).join('\n\n');
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `🏀 *NBA Scores Today*\n\n━━━━━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━━━━━\n\n_Powered by ESPN_\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [
            { label: '🏀 Refresh', id: '.nba' },
            { label: '🏏 Cricket', id: '.cricket' },
          ],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }

    // ─────────────────────────────────────────────────────────
    // TECH
    // ─────────────────────────────────────────────────────────

    // ── PHONE SPECS ───────────────────────────────────────────
    if (cmd === 'phonespec') {
      if (!text) {
        return sendButtons(sock, chat, {
          text: `📱 *Phone Specifications*\n\n📌 *Usage:* .phonespec [phone name]\n\n*Examples:*\n• .phonespec Samsung Galaxy S24\n• .phonespec iPhone 15 Pro\n• .phonespec Xiaomi 14\n• .phonespec Pixel 8\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      await m.react('⏳');
      try {
        const phones = await searchPhoneSpec(text);
        if (!phones.length) throw new Error('Phone not found');
        const lines = phones.slice(0, 5).map((p, i) => {
          const name  = p.phone_name || 'Unknown';
          const brand = p.brand      || '';
          return `${i + 1}. 📱 *${brand ? brand + ' ' : ''}${name}*`;
        }).join('\n');
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `📱 *Phone Search: "${text}"*\n\n━━━━━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━━━━━\n\n_Powered by phone-specs-api_\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📱 Search Phone', id: '.phonespec' }, { label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      } catch (e) {
        await m.react('❌');
        return m.reply(`❌ ${e.message}\n\n${cfg.footer}`);
      }
    }
  },
};

// ── Auto-reload on file change ───────────────────────────────
const _fs   = require('fs');
const _file = require.resolve(__filename);
_fs.watchFile(_file, () => {
  _fs.unwatchFile(_file);
  delete require.cache[_file];
  require(_file);
});
