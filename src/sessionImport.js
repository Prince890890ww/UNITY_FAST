'use strict';
/**
 * UNITY-MD — SESSION_ID Importer
 * Levanter-compatible SESSION_ID support
 *
 * Supports 3 formats:
 *   1. Base64 encoded JSON  →  SESSION_ID=eyJjcmVkc...
 *   2. Prefixed base64      →  SESSION_ID=UNITY-MD;eyJjcmVkc...
 *   3. Direct URL           →  SESSION_ID=https://example.com/session/abc123
 *
 * On startup:
 *   - If SESSION_ID is set (not default 'UNITY-MD_'),
 *     decode + import creds into MongoDB for OWNER_NUMBER
 *   - Skips silently if owner already has a saved session
 */

require('dotenv').config({ path: './config.env' });

const mongoose = require('mongoose');
const fetch    = require('node-fetch');
const logger   = require('./commands/logger');

// ── Same schema as sessionManager ─────────────────────────────
const UserAuthState = mongoose.models.UserAuthState ||
  mongoose.model('UserAuthState', new mongoose.Schema({
    _id:  { type: String },
    key:  { type: String },
    data: { type: mongoose.Schema.Types.Mixed },
  }, { versionKey: false }));

// ── Decode SESSION_ID to typed object ─────────────────────────
function decodeSessionId(raw) {
  if (!raw || raw === 'UNITY-MD_' || raw === 'UNITY-MD') return null;

  // Strip known prefix  e.g. "UNITY-MD;base64..."  "LEVANTER;base64..."
  const b64 = raw.includes(';') ? raw.split(';').slice(1).join(';') : raw;

  // Direct URL
  if (/^https?:\/\//i.test(b64.trim())) {
    return { type: 'url', value: b64.trim() };
  }

  // Base64 encoded JSON
  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    if (decoded.trim().startsWith('{')) {
      return { type: 'json', value: decoded };
    }
  } catch {}

  // Raw JSON (rare, but handle it)
  if (raw.trim().startsWith('{')) {
    return { type: 'json', value: raw.trim() };
  }

  return null;
}

// ── Fetch session data (URL or inline JSON) ───────────────────
async function fetchSessionData(decoded) {
  if (!decoded) return null;

  if (decoded.type === 'url') {
    logger.info('[IMPORT] Fetching session from URL…');
    const res = await fetch(decoded.value, { timeout: 15000 });
    if (!res.ok) throw new Error(`HTTP ${res.status} from session URL`);
    return await res.json();
  }

  // inline JSON — parse with BufferJSON reviver so Buffers restore correctly
  const { BufferJSON } = require('@whiskeysockets/baileys');
  return JSON.parse(decoded.value, BufferJSON.reviver);
}

// ── Write one auth record to MongoDB ─────────────────────────
async function writeRecord(userId, key, data) {
  const { BufferJSON } = require('@whiskeysockets/baileys');
  const docId = `${userId}:${key}`;
  await UserAuthState.findByIdAndUpdate(
    docId,
    {
      _id:  docId,
      key,
      data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)),
    },
    { upsert: true }
  );
}

// ── Check if owner already has creds saved ────────────────────
async function ownerHasCreds(userId) {
  const doc = await UserAuthState.findById(`${userId}:creds`).lean();
  return !!doc;
}

// ── Main import function ──────────────────────────────────────
async function importSession() {
  const rawId   = (process.env.SESSION_ID || '').trim();
  const ownerId = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

  if (!rawId || rawId === 'UNITY-MD_' || rawId === 'UNITY-MD') {
    logger.info('[IMPORT] No SESSION_ID set — skipping');
    return false;
  }

  if (!ownerId) {
    logger.warn('[IMPORT] SESSION_ID set but OWNER_NUMBER missing — skipping');
    return false;
  }

  // Don't overwrite an existing session
  if (await ownerHasCreds(ownerId)) {
    logger.info(`[IMPORT] Owner ${ownerId} already has a saved session — skipping import`);
    return false;
  }

  logger.info(`[IMPORT] SESSION_ID found — importing session for owner ${ownerId}…`);

  const decoded = decodeSessionId(rawId);
  if (!decoded) {
    logger.warn('[IMPORT] Could not decode SESSION_ID — unknown format');
    return false;
  }

  let sessionData;
  try {
    sessionData = await fetchSessionData(decoded);
  } catch (e) {
    logger.error(`[IMPORT] Failed to fetch/decode session: ${e.message}`);
    return false;
  }

  if (!sessionData) {
    logger.warn('[IMPORT] Session data is empty');
    return false;
  }

  // Normalise: supports both { creds, keys } format and flat creds object
  const creds = sessionData.creds || sessionData;
  const keys  = sessionData.keys  || {};

  if (!creds?.noiseKey) {
    logger.warn('[IMPORT] SESSION_ID does not contain valid WhatsApp credentials');
    return false;
  }

  // Write creds
  await writeRecord(ownerId, 'creds', creds);
  logger.info(`[IMPORT] Credentials saved for ${ownerId}`);

  // Write signal keys
  let keyCount = 0;
  for (const type in keys) {
    for (const id in keys[type]) {
      const value = keys[type][id];
      if (value !== null && value !== undefined) {
        await writeRecord(ownerId, `${type}-${id}`, value);
        keyCount++;
      }
    }
  }

  if (keyCount > 0) {
    logger.info(`[IMPORT] ${keyCount} signal keys saved`);
  }

  logger.info(`[IMPORT] ✅ SESSION_ID imported — bot will auto-connect on startup`);
  return true;
}

module.exports = { importSession };
