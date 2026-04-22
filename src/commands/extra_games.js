'use strict';
const { getT } = require('../lang');
const axios = require('axios');
const cfg = require('../../config');
const { sendButtons } = require('./helper');

// ── Hangman State ─────────────────────────────────────────────
const hangmanGames = {};
const hangmanWords = [
  'javascript', 'whatsapp', 'nodejs', 'telegram', 'android', 'python',
  'developer', 'computer', 'keyboard', 'internet', 'software', 'database',
  'algorithm', 'function', 'variable', 'programming', 'technology',
];

// ── Trivia State ──────────────────────────────────────────────
const triviaGames = {};

// ── TicTacToe State ───────────────────────────────────────────
const tttGames = {};

function renderBoard(board) {
  const sym = (s) => s === 'X' ? '❌' : s === 'O' ? '⭕' : '⬜';
  return [
    `${sym(board[0])}${sym(board[1])}${sym(board[2])}`,
    `${sym(board[3])}${sym(board[4])}${sym(board[5])}`,
    `${sym(board[6])}${sym(board[7])}${sym(board[8])}`,
  ].join('\n');
}

function checkWinner(board) {
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every(c => c)) return 'draw';
  return null;
}

module.exports = {
  commands: [
    'hangman', 'guess',
    'trivia', 'answer',
    'ttt', 'tictactoe', 'tttmove',
    'slots', 'slot',
    'riddle',
  ],

  async run({ sock, m }) {
    const tr = await getT(m.sessionOwner);
    const cmd = m.command;
    const chat = m.chat;
    const msg = m.msg;
    const text = m.text?.trim();
    const sender = m.sender;

    // ── HANGMAN ───────────────────────────────────────────────
    if (cmd === 'hangman') {
      if (hangmanGames[chat]) {
        const g = hangmanGames[chat];
        return sendButtons(sock, chat, {
          text: `🎮 *HANGMAN* (game in progress)\n\nWord: ${g.masked.join(' ')}\nWrong: ${g.wrong.join(', ') || 'none'}\nTries left: ${g.maxWrong - g.wrongCount}\n\nUse *.guess* [letter]\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '🚩 Quit Game', id: '.hangman quit' }],
          quoted: msg,
        });
      }
      if (text === 'quit') {
        delete hangmanGames[chat];
        return m.reply(`${tr('game_hangman_ended')}\n\n${cfg.footer}`);
      }
      const word = hangmanWords[Math.floor(Math.random() * hangmanWords.length)];
      hangmanGames[chat] = {
        word, masked: word.split('').map(() => '_'), guessed: [], wrong: [], wrongCount: 0, maxWrong: 6,
      };
      return sendButtons(sock, chat, {
        text: `🎮 *HANGMAN STARTED!*\n\nWord: ${word.split('').map(() => '_').join(' ')}\nTries: 6\n\nUse *.guess* [letter] to play!\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: '🚩 Quit Game', id: '.hangman quit' }],
        quoted: msg,
      });
    }

    if (cmd === 'guess') {
      const g = hangmanGames[chat];
      if (!g) return m.reply(`❌ No hangman game! Use *.hangman* to start.\n\n${cfg.footer}`);
      const letter = text?.toLowerCase()?.[0];
      if (!letter || !/[a-z]/.test(letter)) return m.reply(`${tr('game_guess_usage')}\n\n${cfg.footer}`);
      if (g.guessed.includes(letter)) return m.reply(`⚠️ You already guessed "${letter}"!\n\n${cfg.footer}`);
      g.guessed.push(letter);
      if (g.word.includes(letter)) {
        g.word.split('').forEach((c, i) => { if (c === letter) g.masked[i] = letter; });
        if (!g.masked.includes('_')) {
          delete hangmanGames[chat];
          return sendButtons(sock, chat, {
            text: `🎉 *YOU WON!* The word was: *${g.word}*\n\n${cfg.footer}`,
            footer: cfg.footer,
            buttons: [{ label: '🎮 Play Again', id: '.hangman' }],
            quoted: msg,
          });
        }
        return m.reply(`✅ Correct! "${letter}"\nWord: ${g.masked.join(' ')}\nTries left: ${g.maxWrong - g.wrongCount}\n\n${cfg.footer}`);
      } else {
        g.wrong.push(letter);
        g.wrongCount++;
        if (g.wrongCount >= g.maxWrong) {
          const word = g.word;
          delete hangmanGames[chat];
          return sendButtons(sock, chat, {
            text: `💀 *GAME OVER!* The word was: *${word}*\n\n${cfg.footer}`,
            footer: cfg.footer,
            buttons: [{ label: '🎮 Play Again', id: '.hangman' }],
            quoted: msg,
          });
        }
        return m.reply(`❌ Wrong! "${letter}"\nWord: ${g.masked.join(' ')}\nWrong: ${g.wrong.join(', ')}\nTries left: ${g.maxWrong - g.wrongCount}\n\n${cfg.footer}`);
      }
    }

    // ── TRIVIA ────────────────────────────────────────────────
    if (cmd === 'trivia') {
      if (triviaGames[chat]) {
        return sendButtons(sock, chat, {
          text: `❓ *TRIVIA* (in progress)\n\n${triviaGames[chat].question}\n\nOptions:\n${triviaGames[chat].options.join('\n')}\n\nUse *.answer* [answer]\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '🚩 Quit', id: '.trivia quit' }],
          quoted: msg,
        });
      }
      if (text === 'quit') { delete triviaGames[chat]; return m.reply(`🎮 Trivia ended!\n\n${cfg.footer}`); }
      await m.react('⏳');
      try {
        const res = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple', { timeout: 10000 });
        const q = res.data.results[0];
        const options = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
        triviaGames[chat] = { question: q.question, correctAnswer: q.correct_answer, options };
        await m.react('✅');
        return sendButtons(sock, chat, {
          text: `❓ *TRIVIA*\n\n${q.question}\n\nOptions:\n${options.join('\n')}\n\nUse *.answer* [answer]\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '🚩 Quit', id: '.trivia quit' }],
          quoted: msg,
        });
      } catch {
        await m.react('❌');
        return m.reply(`❌ Failed to fetch trivia!\n\n${cfg.footer}`);
      }
    }

    if (cmd === 'answer') {
      const g = triviaGames[chat];
      if (!g) return m.reply(`❌ No trivia! Use *.trivia* to start.\n\n${cfg.footer}`);
      if (!text) return m.reply(`📌 Usage: *.answer* [your answer]\n\n${cfg.footer}`);
      delete triviaGames[chat];
      if (text.toLowerCase() === g.correctAnswer.toLowerCase()) {
        return sendButtons(sock, chat, {
          text: `🎉 *CORRECT!*\n\nAnswer: ${g.correctAnswer}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '🎮 Play Again', id: '.trivia' }],
          quoted: msg,
        });
      } else {
        return sendButtons(sock, chat, {
          text: `❌ *WRONG!*\n\nCorrect answer: *${g.correctAnswer}*\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '🎮 Play Again', id: '.trivia' }],
          quoted: msg,
        });
      }
    }

    // ── TIC-TAC-TOE ───────────────────────────────────────────
    if (cmd === 'ttt' || cmd === 'tictactoe') {
      if (tttGames[chat]) {
        const g = tttGames[chat];
        return sendButtons(sock, chat, {
          text: `🎮 *TIC-TAC-TOE* (in progress)\n\n${renderBoard(g.board)}\n\nPlayer 1 (❌): @${g.p1.split('@')[0]}\nPlayer 2 (⭕): @${g.p2.split('@')[0]}\nTurn: @${g.turn.split('@')[0]}\n\n*.tttmove* [1-9] to play\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '🚩 Quit', id: '.ttt quit' }],
          quoted: msg,
        });
      }
      if (text === 'quit') { delete tttGames[chat]; return m.reply(`${tr('game_ended')}\n\n${cfg.footer}`); }
      const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentioned[0]) {
        return sendButtons(sock, chat, {
          text: `📌 Usage: *.ttt* @opponent\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '📋 Menu', id: '.menu' }],
          quoted: msg,
        });
      }
      tttGames[chat] = { board: Array(9).fill(null), p1: sender, p2: mentioned[0], turn: sender };
      return sendButtons(sock, chat, {
        text: `🎮 *TIC-TAC-TOE STARTED!*\n\n${renderBoard(Array(9).fill(null))}\n\nPlayer 1 (❌): @${sender.split('@')[0]}\nPlayer 2 (⭕): @${mentioned[0].split('@')[0]}\n\n*.tttmove* [1-9] to play!\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: '🚩 Quit', id: '.ttt quit' }],
        quoted: msg,
      });
    }

    if (cmd === 'tttmove') {
      const g = tttGames[chat];
      if (!g) return m.reply(`❌ No TTT game! Use *.ttt* @opponent.\n\n${cfg.footer}`);
      if (g.turn !== sender) return m.reply(`${tr('game_not_turn')}\n\n${cfg.footer}`);
      const pos = parseInt(text) - 1;
      if (isNaN(pos) || pos < 0 || pos > 8) return m.reply(`${tr('game_enter_num')}\n\n${cfg.footer}`);
      if (g.board[pos]) return m.reply(`❌ That spot is taken!\n\n${cfg.footer}`);
      g.board[pos] = sender === g.p1 ? 'X' : 'O';
      g.turn = sender === g.p1 ? g.p2 : g.p1;
      const winner = checkWinner(g.board);
      if (winner === 'draw') {
        delete tttGames[chat];
        return sendButtons(sock, chat, {
          text: `🤝 *DRAW!*\n\n${renderBoard(g.board)}\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '🎮 Play Again', id: `.ttt @${g.p2.split('@')[0]}` }],
          quoted: msg,
        });
      }
      if (winner) {
        const winnerJid = winner === 'X' ? g.p1 : g.p2;
        delete tttGames[chat];
        return sock.sendMessage(chat, {
          text: `🏆 *@${winnerJid.split('@')[0]} WINS!*\n\n${renderBoard(g.board)}\n\n${cfg.footer}`,
          mentions: [winnerJid],
        }, { quoted: msg });
      }
      return sock.sendMessage(chat, {
        text: `🎮 *TIC-TAC-TOE*\n\n${renderBoard(g.board)}\n\nTurn: @${g.turn.split('@')[0]}\n\n${cfg.footer}`,
        mentions: [g.turn],
      }, { quoted: msg });
    }

    // ── SLOTS ─────────────────────────────────────────────────
    if (cmd === 'slots' || cmd === 'slot') {
      const symbols = ['🍒', '🍋', '🍇', '⭐', '💎', '🔔', '7️⃣'];
      const roll = () => symbols[Math.floor(Math.random() * symbols.length)];
      const s1 = roll(), s2 = roll(), s3 = roll();
      const won = s1 === s2 && s2 === s3;
      return sendButtons(sock, chat, {
        text: `🎰 *SLOT MACHINE*\n\n[ ${s1} | ${s2} | ${s3} ]\n\n${won ? '🎉 *JACKPOT! YOU WIN!* 🎉' : '😔 Better luck next time!'}\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: '🎰 Spin Again', id: '.slots' }],
        quoted: msg,
      });
    }

    // ── RIDDLE ────────────────────────────────────────────────
    if (cmd === 'riddle') {
      const riddles = [
        { q: "What has keys but no locks?", a: "A keyboard" },
        { q: "What has a head and a tail but no body?", a: "A coin" },
        { q: "What gets wetter as it dries?", a: "A towel" },
        { q: "What runs but never walks?", a: "Water" },
        { q: "What can you catch but not throw?", a: "A cold" },
        { q: "What has an eye but cannot see?", a: "A needle" },
        { q: "What goes up but never comes down?", a: "Age" },
        { q: "What has teeth but cannot bite?", a: "A comb" },
      ];
      const r = riddles[Math.floor(Math.random() * riddles.length)];
      return sendButtons(sock, chat, {
        text: `🧠 *RIDDLE*\n\n${r.q}\n\n||Answer: ${r.a}||\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [
          { label: '🧠 Another Riddle', id: '.riddle' },
          { label: '📋 Menu', id: '.menu' },
        ],
        quoted: msg,
      });
    }
  },
};
