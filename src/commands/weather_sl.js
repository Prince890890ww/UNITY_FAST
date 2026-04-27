'use strict';
const axios  = require('axios');
const cfg    = require('../../config');
const { sendButtons } = require('./helper');
const { getT } = require('../lang');

// ── Weather condition → emoji ──────────────────────────────────
function weatherEmoji(desc = '') {
  const d = desc.toLowerCase();
  if (d.includes('thunder') || d.includes('storm'))          return '⛈️';
  if (d.includes('blizzard') || d.includes('blowing snow'))  return '🌨️';
  if (d.includes('snow') || d.includes('sleet'))             return '❄️';
  if (d.includes('ice') || d.includes('freezing'))           return '🧊';
  if (d.includes('heavy rain') || d.includes('torrential'))  return '🌧️';
  if (d.includes('rain') || d.includes('shower'))            return '🌦️';
  if (d.includes('drizzle'))                                 return '🌂';
  if (d.includes('fog') || d.includes('mist'))               return '🌫️';
  if (d.includes('haze') || d.includes('smoke'))             return '😶‍🌫️';
  if (d.includes('overcast'))                                return '☁️';
  if (d.includes('partly cloudy') || d.includes('partial'))  return '⛅';
  if (d.includes('cloudy'))                                  return '🌥️';
  if (d.includes('sunny') || d.includes('clear'))            return '☀️';
  if (d.includes('wind'))                                    return '🌬️';
  return '🌤️';
}

// ── UV index label ────────────────────────────────────────────
function uvLabel(uv) {
  const n = parseInt(uv, 10);
  if (n <= 2)  return `${uv} 🟢 Low`;
  if (n <= 5)  return `${uv} 🟡 Moderate`;
  if (n <= 7)  return `${uv} 🟠 High`;
  if (n <= 10) return `${uv} 🔴 Very High`;
  return `${uv} 🟣 Extreme`;
}

// ── Wind direction → compass arrow ───────────────────────────
function windArrow(dir = '') {
  const map = {
    N:'↑', NNE:'↑↗', NE:'↗', ENE:'↗',
    E:'→', ESE:'↘', SE:'↘', SSE:'↓↘',
    S:'↓', SSW:'↓↙', SW:'↙', WSW:'↙',
    W:'←', WNW:'↖', NW:'↖', NNW:'↑↖',
  };
  return map[dir] || dir;
}

// ── Date: "2025-04-27" → "Sun 27 Apr" ─────────────────────────
function fmtDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-LK', { weekday: 'short', day: '2-digit', month: 'short' });
  } catch { return dateStr; }
}

// ── Rain chance label ─────────────────────────────────────────
function rainBar(pct) {
  const n = parseInt(pct, 10);
  const filled = Math.round(n / 20);
  return '🟦'.repeat(filled) + '⬜'.repeat(5 - filled) + ` ${n}%`;
}

// ─────────────────────────────────────────────────────────────
module.exports = {
  commands: ['weather', 'wthr', 'wt', 'forecast'],

  async run({ sock, m }) {
    const city = (m.text || '').trim() || 'Colombo';
    await m.reply(`🔍 Fetching weather for *${city}*...`);

    try {
      const res = await axios.get(
        `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
        { timeout: 12000, headers: { 'User-Agent': 'curl/7.68.0' } }
      );
      const data = res.data;

      // ── Current conditions ──────────────────────────────────
      const cur     = data.current_condition[0];
      const area    = data.nearest_area[0];
      const cityOut = area.areaName[0]?.value || city;
      const country = area.country[0]?.value || '';
      const flag    = country.toLowerCase().includes('sri lanka') ? '🇱🇰' : '🌍';

      const tempC    = cur.temp_C;
      const feelsC   = cur.FeelsLikeC;
      const humidity = cur.humidity;
      const windKmph = cur.windspeedKmph;
      const windDir  = cur.winddir16Point;
      const pressure = cur.pressure;
      const vis      = cur.visibility;
      const uv       = cur.uvIndex;
      const cloud    = cur.cloudcover;
      const desc     = cur.weatherDesc[0]?.value || '';
      const emo      = weatherEmoji(desc);

      // ── Temp bar (10°=min, 40°=max for SL) ───────────────────
      const tempPct   = Math.max(0, Math.min(100, ((parseInt(tempC, 10) - 10) / 30) * 100));
      const tempFilled = Math.round(tempPct / 10);
      const tempBar   = '🟥'.repeat(tempFilled) + '⬜'.repeat(10 - tempFilled);

      // ── 3-day forecast ────────────────────────────────────────
      const forecastLines = data.weather.slice(0, 3).map(day => {
        const fe    = weatherEmoji(day.hourly[4]?.weatherDesc[0]?.value || '');
        const rain  = day.hourly[4]?.chanceofrain || '0';
        const maxC  = day.maxtempC;
        const minC  = day.mintempC;
        const label = fmtDate(day.date);
        return (
          `│  ${fe} *${label}*\n` +
          `│      🌡️ ${minC}° – ${maxC}°C   🌧️ ${rain}%`
        );
      }).join('\n│\n');

      // ── Build message ─────────────────────────────────────────
      const msg =
        `╔══════════════════════════════╗\n` +
        `║   ${emo} *WEATHER REPORT* ${emo}         ║\n` +
        `║  ${flag} *${cityOut}*, ${country}\n` +
        `╠══════════════════════════════╣\n` +
        `║\n` +
        `║   ${emo} *${desc}*\n` +
        `║   🌡️ *${tempC}°C*  _(feels like ${feelsC}°C)_\n` +
        `║\n` +
        `║   ${tempBar}\n` +
        `║   10°C ───────────────── 40°C\n` +
        `║\n` +
        `╠══════════════════════════════╣\n` +
        `│\n` +
        `│  💧 *Humidity*   : ${humidity}%\n` +
        `│  💨 *Wind*       : ${windKmph} km/h  ${windArrow(windDir)} ${windDir}\n` +
        `│  🔵 *Pressure*   : ${pressure} hPa\n` +
        `│  👁️ *Visibility* : ${vis} km\n` +
        `│  ☀️ *UV Index*   : ${uvLabel(uv)}\n` +
        `│  ☁️ *Cloud*      : ${cloud}%\n` +
        `│\n` +
        `╠══════════════════════════════╣\n` +
        `║   📅 *3-DAY FORECAST*\n` +
        `╠══════════════════════════════╣\n` +
        `│\n` +
        `${forecastLines}\n` +
        `│\n` +
        `╚══════════════════════════════╝\n` +
        `\n${cfg.footer}`;

      await sendButtons(sock, m.chat, {
        text: msg,
        footer: cfg.footer,
        buttons: [
          { label: `🔄 Refresh`,       id: `.weather ${city}` },
          { label: `🏙️ Colombo`,       id: `.weather Colombo` },
          { label: `📋 SL Menu`,       id: `.menu_srilanka`   },
        ],
      });

    } catch (e) {
      const isNotFound = e?.response?.status === 404 || (e.message || '').includes('404');
      const errMsg = isNotFound
        ? `❌ City *"${city}"* not found.\n\n💡 Try: *.weather Colombo*\n\n${cfg.footer}`
        : `❌ Failed to fetch weather.\n\n_${e.message}_\n\n${cfg.footer}`;
      await sendButtons(sock, m.chat, {
        text: errMsg,
        footer: cfg.footer,
        buttons: [
          { label: '🏙️ Try Colombo',  id: '.weather Colombo'  },
          { label: '🏙️ Try Kandy',    id: '.weather Kandy'    },
          { label: '🏙️ Try Galle',    id: '.weather Galle'    },
        ],
      });
    }
  },
};
