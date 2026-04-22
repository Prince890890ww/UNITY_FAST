'use strict';
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const cfg = require('../../config');

const LOG_DIR = './logs';
fs.ensureDirSync(LOG_DIR);

const LEVELS = {
  info:    { color: chalk.cyan,    icon: 'ℹ️ ' },
  success: { color: chalk.green,   icon: '✅' },
  warn:    { color: chalk.yellow,  icon: '⚠️ ' },
  error:   { color: chalk.red,     icon: '❌' },
  cmd:     { color: chalk.magenta, icon: '⚡' },
  conn:    { color: chalk.blue,    icon: '🔗' },
  db:      { color: chalk.green,   icon: '🗄️ ' },
};

function timestamp() {
  return new Date().toLocaleString('en-LK', { timeZone: cfg.timezone });
}

function log(level, ...args) {
  const { color, icon } = LEVELS[level] || LEVELS.info;
  const ts = timestamp();
  const msg = args.join(' ');
  console.log(`${chalk.gray(`[${ts}]`)} ${color(`${icon} ${msg}`)}`);

  // Write to file
  const dateStr = new Date().toISOString().split('T')[0];
  const logFile = path.join(LOG_DIR, `${dateStr}.log`);
  fs.appendFile(logFile, `[${ts}] [${level.toUpperCase()}] ${msg}\n`).catch(() => {});
}

// Alert owner on error
let _ownerSock = null;
let _ownerJid = null;

function initLogger(sock) {
  _ownerSock = sock;
  _ownerJid = cfg.ownerNumber + '@s.whatsapp.net';
}

async function alertOwner(msg) {
  if (!_ownerSock || !_ownerJid) return;
  try {
    await _ownerSock.sendMessage(_ownerJid, {
      text: `🚨 *UNITY-MD Alert*\n\n${msg}\n\n${cfg.footer}`
    });
  } catch (e) {}
}

const logger = {
  info:    (...a) => log('info', ...a),
  success: (...a) => log('success', ...a),
  warn:    (...a) => log('warn', ...a),
  error:   (...a) => { log('error', ...a); alertOwner(`❌ Error: ${a.join(' ')}`); },
  cmd:     (...a) => log('cmd', ...a),
  conn:    (...a) => log('conn', ...a),
  db:      (...a) => log('db', ...a),
  init:    initLogger,
  alert:   alertOwner,
};

module.exports = logger;