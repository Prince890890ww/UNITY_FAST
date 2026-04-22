'use strict';
/**
 * UNITY-MD — Image Pool Cache
 * ──────────────────────────────────────────────────────────────────────────
 * Bot start / restart වෙද්දි images 30ක් download කරලා database/nekopool/
 * folder එකේ save කරනවා. Command run වෙද්දි live download නෑ — pool
 * එකෙන් rotating ක්‍රමයට image buffer එකක් දෙනවා.
 *
 * Pool exhausted (30 දාලා ගියාට පස්සේ) වෙද්දි loop back කරනවා.
 * ──────────────────────────────────────────────────────────────────────────
 */

const path = require('path');
const fs   = require('fs-extra');
const axios = require('axios');

const POOL_DIR  = path.join(__dirname, '../../database/nekopool');
const POOL_SIZE = 30;          // Startup download count
const BATCH     = 5;           // Concurrent download batch size

fs.ensureDirSync(POOL_DIR);

// ── Internal state ──────────────────────────────────────────
let pool   = [];   // Ordered array of valid file paths
let cursor = 0;    // Next image to serve
let ready  = false;

// ── Helpers ─────────────────────────────────────────────────
function isValidJpeg(buf) {
  return Buffer.isBuffer(buf) && buf.length > 2000
    && buf[0] === 0xFF && buf[1] === 0xD8;
}

/** Fetch one random image buffer, tries multiple APIs with fallback */
async function fetchOneBuffer() {
  const APIS = [
    async () => {
      const r = await axios.get('https://nekos.best/api/v2/neko',
        { timeout: 8000 });
      const url = r.data?.results?.[0]?.url;
      if (!url) return null;
      const img = await axios.get(url,
        { responseType: 'arraybuffer', timeout: 12000 });
      return Buffer.from(img.data);
    },
    async () => {
      const r = await axios.get('https://nekos.life/api/v2/img/neko',
        { timeout: 8000 });
      const url = r.data?.url;
      if (!url) return null;
      const img = await axios.get(url,
        { responseType: 'arraybuffer', timeout: 12000 });
      return Buffer.from(img.data);
    },
    async () => {
      const r = await axios.get('https://api.waifu.pics/sfw/neko',
        { timeout: 8000 });
      const url = r.data?.url;
      if (!url) return null;
      const img = await axios.get(url,
        { responseType: 'arraybuffer', timeout: 12000 });
      return Buffer.from(img.data);
    },
    async () => {
      const r = await axios.get(
        'https://api.otakugifs.xyz/gif?reaction=neko',
        { timeout: 8000 });
      const url = r.data?.url;
      if (!url) return null;
      const img = await axios.get(url,
        { responseType: 'arraybuffer', timeout: 12000 });
      return Buffer.from(img.data);
    },
  ];

  for (const fn of APIS) {
    try {
      const buf = await fn();
      if (isValidJpeg(buf)) return buf;
    } catch {}
  }
  return null;
}

/** Download one slot, retry up to 3 times */
async function downloadSlot(index) {
  const filePath = path.join(
    POOL_DIR, `pool_${String(index).padStart(3, '0')}.jpg`
  );
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const buf = await fetchOneBuffer();
      if (buf) {
        await fs.outputFile(filePath, buf);
        return filePath;
      }
    } catch {}
    if (attempt < 3)
      await new Promise(r => setTimeout(r, 1500 * attempt));
  }
  return null; // Failed all attempts
}

// ── Shuffle in-place (Fisher-Yates) ─────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ── Public API ───────────────────────────────────────────────

/**
 * initImagePool()
 * ───────────────
 * Bot start / restart වෙද්දි call කරන්න.
 * Old pool clear කරලා 30 fresh images download කරනවා.
 * Background task ලෙස — await නොකළාත් හරි (setImmediate).
 */
async function initImagePool() {
  console.log('[imageCache] 🔄 Image pool init — downloading', POOL_SIZE, 'images...');

  // Reset state first (old pool clear)
  ready  = false;
  pool   = [];
  cursor = 0;

  try {
    const oldFiles = (await fs.readdir(POOL_DIR))
      .filter(f => f.startsWith('pool_'));
    await Promise.all(
      oldFiles.map(f => fs.remove(path.join(POOL_DIR, f)).catch(() => {}))
    );
  } catch {}

  // Download in batches to avoid hammering APIs
  let downloaded = 0;
  for (let i = 0; i < POOL_SIZE; i += BATCH) {
    const batch = [];
    for (let j = i; j < Math.min(i + BATCH, POOL_SIZE); j++) {
      batch.push(downloadSlot(j));
    }
    const results = await Promise.all(batch);
    for (const fp of results) {
      if (fp) {
        pool.push(fp);
        downloaded++;
      }
    }
    console.log(`[imageCache]  ↳ ${downloaded}/${POOL_SIZE} done`);
    // Small pause between batches
    if (i + BATCH < POOL_SIZE)
      await new Promise(r => setTimeout(r, 400));
  }

  // Shuffle so each restart serves images in a different order
  shuffle(pool);

  cursor = 0;
  ready  = pool.length > 0;

  if (ready) {
    console.log(`[imageCache] ✅ Pool ready — ${pool.length} images, randomised order`);
  } else {
    console.warn('[imageCache] ⚠️  Pool empty — all downloads failed');
  }
}

// ── Fallback: menucards images (always available locally) ───
const MENUCARD_DIR = path.join(__dirname, '../../database/menucards');
let menucardFiles  = [];
let menucardCursor = 0;

function loadMenucardFallback() {
  try {
    menucardFiles = fs.readdirSync(MENUCARD_DIR)
      .filter(f => /^menu_\d+\.jpg$/.test(f))
      .map(f => path.join(MENUCARD_DIR, f));
    shuffle(menucardFiles);
  } catch { menucardFiles = []; }
}
loadMenucardFallback(); // Load once at startup

function getMenucardFallback() {
  if (!menucardFiles.length) loadMenucardFallback();
  if (!menucardFiles.length) return null;
  // Rotate through menucards
  for (let i = 0; i < menucardFiles.length; i++) {
    const fp  = menucardFiles[menucardCursor % menucardFiles.length];
    menucardCursor = (menucardCursor + 1) % menucardFiles.length;
    try {
      const buf = fs.readFileSync(fp);
      if (isValidJpeg(buf)) return buf;
    } catch {}
  }
  return null;
}

/**
 * getPoolImage()
 * ──────────────
 * Returns a Buffer from the local pool (rotating). Never does a network call.
 * Falls back to menucards/ images if pool is empty or not ready.
 */
function getPoolImage() {
  // Primary: downloaded neko pool
  if (ready && pool.length > 0) {
    const start = cursor;
    do {
      const fp = pool[cursor % pool.length];
      cursor   = (cursor + 1) % pool.length;
      try {
        const buf = fs.readFileSync(fp);
        if (isValidJpeg(buf)) return buf;
        pool.splice(pool.indexOf(fp), 1);
        if (pool.length === 0) { ready = false; break; }
        cursor = cursor % pool.length;
      } catch {
        pool.splice(pool.indexOf(fp), 1);
        if (pool.length === 0) { ready = false; break; }
        cursor = cursor % pool.length;
      }
    } while (cursor !== start % pool.length && pool.length > 0);
  }

  // Fallback: local menucards (always available, no network needed)
  return getMenucardFallback();
}

/** isPoolReady() — pool download complete and has images */
function isPoolReady() { return ready || menucardFiles.length > 0; }

module.exports = { initImagePool, getPoolImage, isPoolReady };
