'use strict';
const { t, getLang  } = require('../lang');
const axios = require('axios');
const cfg = require('../../config');
const { random, randomInt, sendButtons } = require('./helper');

// ── TTT ───────────────────────────────────────────────────────
const tttGames = new Map();
function tttBoard(board) {
  const nums = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
  return board.map((v,i) => v==='X'?'❌':v==='O'?'⭕':nums[i]).join('').match(/.{3}/g).join('\n');
}
function tttCheck(b) {
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b2,c] of wins) { if (b[a] && b[a]===b[b2] && b[b2]===b[c]) return b[a]; }
  return b.every(v=>v) ? 'draw' : null;
}

// ── Hangman ───────────────────────────────────────────────────
const hangmanGames = {};
const hangmanWords = ['javascript','whatsapp','nodejs','android','python','developer','computer','keyboard','internet','software','database','algorithm','function','variable','programming','technology','network','security','application','system'];

// ── Trivia ────────────────────────────────────────────────────
const triviaGames = {};

// ── Blackjack ─────────────────────────────────────────────────
const bjGames = new Map();
function bjDeal() {
  const vals = [2,3,4,5,6,7,8,9,10,'J','Q','K','A'];
  return vals[Math.floor(Math.random() * vals.length)];
}
function bjValue(card) {
  if (['J','Q','K'].includes(card)) return 10;
  if (card === 'A') return 11;
  return parseInt(card);
}
function bjTotal(hand) {
  let total = hand.reduce((s,c) => s + bjValue(c), 0);
  let aces = hand.filter(c => c==='A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

module.exports = {
  commands: [
    'ttt', 'tictactoe', 'tttmove',
    'blackjack', 'bj', 'bjhit', 'bjstand',
    'hangman', 'guess',
    'trivia', 'answer',
    'slots', 'slot',
    'riddle',
    'truth', 'dare',
    '8ball', 'eightball',
  ],

  async run({ sock, m }) {
    const lang = await getLang(m.sessionOwner);
    const cmd    = m.command;
    const text   = m.text?.trim();
    const chat   = m.chat;
    const msg    = m.msg;
    const sender = m.sender;
    const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    // ── TIC-TAC-TOE ───────────────────────────────────────────
    if (cmd === 'ttt' || cmd === 'tictactoe') {
      if (tttGames.has(chat)) {
        const g = tttGames.get(chat);
        return sendButtons(sock, chat, {
          text: `🎮 *TIC-TAC-TOE*\n\n${tttBoard(g.board)}\n\nP1 ❌: @${g.p1.split('@')[0]}\nP2 ⭕: @${g.p2.split('@')[0]}\nTurn: @${g.turn.split('@')[0]}\n\nUse *.tttmove* [1-9]\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: t('btn_quit',lang), id: '.ttt quit' }],
          quoted: msg,
        });
      }
      if (text === 'quit') { tttGames.delete(chat); return m.reply(`${tr('game_ended')}\n\n${cfg.footer}`); }
      if (!mentioned[0]) return sendButtons(sock, chat, { text: `📌 Usage: *.ttt* @opponent\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
      tttGames.set(chat, { board: Array(9).fill(null), p1: sender, p2: mentioned[0], turn: sender });
      return sendButtons(sock, chat, {
        text: `🎮 *TIC-TAC-TOE STARTED!*\n\n${tttBoard(Array(9).fill(null))}\n\nP1 ❌: @${sender.split('@')[0]}\nP2 ⭕: @${mentioned[0].split('@')[0]}\n\nUse *.tttmove* [1-9]\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: '🚩 Quit', id: '.ttt quit' }],
        quoted: msg,
      });
    }

    if (cmd === 'tttmove') {
      const g = tttGames.get(chat);
      if (!g) return m.reply(`❌ No game! Use *.ttt* @opponent\n\n${cfg.footer}`);
      if (g.turn !== sender) return m.reply(`${tr('game_not_turn')}\n\n${cfg.footer}`);
      const pos = parseInt(text) - 1;
      if (isNaN(pos) || pos < 0 || pos > 8) return m.reply(`📌 Enter 1-9!\n\n${cfg.footer}`);
      if (g.board[pos]) return m.reply(`❌ Taken!\n\n${cfg.footer}`);
      g.board[pos] = sender === g.p1 ? 'X' : 'O';
      g.turn = sender === g.p1 ? g.p2 : g.p1;
      const winner = tttCheck(g.board);
      if (winner === 'draw') {
        tttGames.delete(chat);
        return sendButtons(sock, chat, { text: `🤝 *DRAW!*\n\n${tttBoard(g.board)}\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: t('btn_play_again',lang), id: `.ttt @${g.p2.split('@')[0]}` }], quoted: msg });
      }
      if (winner) {
        const winnerJid = winner === 'X' ? g.p1 : g.p2;
        tttGames.delete(chat);
        return sock.sendMessage(chat, { text: `🏆 *@${winnerJid.split('@')[0]} WINS!*\n\n${tttBoard(g.board)}\n\n${cfg.footer}`, mentions: [winnerJid] }, { quoted: msg });
      }
      return sock.sendMessage(chat, { text: `🎮 *TIC-TAC-TOE*\n\n${tttBoard(g.board)}\n\nTurn: @${g.turn.split('@')[0]}\n\n${cfg.footer}`, mentions: [g.turn] }, { quoted: msg });
    }

    // ── BLACKJACK ─────────────────────────────────────────────
    if (cmd === 'blackjack' || cmd === 'bj') {
      if (bjGames.has(sender)) {
        const g2 = bjGames.get(sender);
        return sendButtons(sock, chat, {
          text: `🃏 *BLACKJACK* (in progress)\n\nYour hand: ${g2.player.join(', ')} (${bjTotal(g2.player)})\nDealer: ${g2.dealer[0]}, ?\n\n${cfg.footer}`,
          footer: cfg.footer,
          buttons: [{ label: '🃏 Hit', id: '.bjhit' }, { label: '✋ Stand', id: '.bjstand' }],
          quoted: msg,
        });
      }
      const playerHand = [bjDeal(), bjDeal()];
      const dealerHand = [bjDeal(), bjDeal()];
      bjGames.set(sender, { player: playerHand, dealer: dealerHand });
      const total = bjTotal(playerHand);
      if (total === 21) {
        bjGames.delete(sender);
        return sendButtons(sock, chat, { text: `🃏 *BLACKJACK!*\n\nYour hand: ${playerHand.join(', ')} (21)\n\n🎉 *YOU WIN!*\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🎮 Play Again', id: '.blackjack' }], quoted: msg });
      }
      return sendButtons(sock, chat, {
        text: `🃏 *BLACKJACK*\n\nYour hand: ${playerHand.join(', ')} (${total})\nDealer: ${dealerHand[0]}, ?\n\n${cfg.footer}`,
        footer: cfg.footer,
        buttons: [{ label: '🃏 Hit', id: '.bjhit' }, { label: '✋ Stand', id: '.bjstand' }],
        quoted: msg,
      });
    }

    if (cmd === 'bjhit') {
      const g3 = bjGames.get(sender);
      if (!g3) return m.reply(`❌ No game! Use *.blackjack*\n\n${cfg.footer}`);
      g3.player.push(bjDeal());
      const total2 = bjTotal(g3.player);
      if (total2 > 21) {
        bjGames.delete(sender);
        return sendButtons(sock, chat, { text: `🃏 *BUST!* (${total2})\n\nYour hand: ${g3.player.join(', ')}\n\n💀 *YOU LOSE!*\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🎮 Play Again', id: '.blackjack' }], quoted: msg });
      }
      if (total2 === 21) {
        bjGames.delete(sender);
        return sendButtons(sock, chat, { text: `🃏 *BLACKJACK!* (21)\n\nYour hand: ${g3.player.join(', ')}\n\n🎉 *YOU WIN!*\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🎮 Play Again', id: '.blackjack' }], quoted: msg });
      }
      return sendButtons(sock, chat, { text: `🃏 Your hand: ${g3.player.join(', ')} (${total2})\nDealer: ${g3.dealer[0]}, ?\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🃏 Hit', id: '.bjhit' }, { label: '✋ Stand', id: '.bjstand' }], quoted: msg });
    }

    if (cmd === 'bjstand') {
      const g4 = bjGames.get(sender);
      if (!g4) return m.reply(`❌ No game! Use *.blackjack*\n\n${cfg.footer}`);
      bjGames.delete(sender);
      while (bjTotal(g4.dealer) < 17) g4.dealer.push(bjDeal());
      const pTotal = bjTotal(g4.player);
      const dTotal = bjTotal(g4.dealer);
      let result = '';
      if (dTotal > 21 || pTotal > dTotal) result = '🎉 *YOU WIN!*';
      else if (pTotal === dTotal) result = '🤝 *DRAW!*';
      else result = '💀 *DEALER WINS!*';
      return sendButtons(sock, chat, { text: `🃏 *BLACKJACK RESULT*\n\nYour: ${g4.player.join(', ')} (${pTotal})\nDealer: ${g4.dealer.join(', ')} (${dTotal})\n\n${result}\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🎮 Play Again', id: '.blackjack' }], quoted: msg });
    }

    // ── HANGMAN ───────────────────────────────────────────────
    if (cmd === 'hangman') {
      if (hangmanGames[chat]) {
        const g5 = hangmanGames[chat];
        return sendButtons(sock, chat, { text: `🎮 *HANGMAN* (in progress)\n\nWord: ${g5.masked.join(' ')}\nWrong: ${g5.wrong.join(', ') || 'none'}\nTries left: ${g5.maxWrong - g5.wrongCount}\n\nUse *.guess* [letter]\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🚩 Quit', id: '.hangman quit' }], quoted: msg });
      }
      if (text === 'quit') { delete hangmanGames[chat]; return m.reply(`${tr('game_ended')}\n\n${cfg.footer}`); }
      const word = hangmanWords[Math.floor(Math.random() * hangmanWords.length)];
      hangmanGames[chat] = { word, masked: word.split('').map(()=>'_'), guessed: [], wrong: [], wrongCount: 0, maxWrong: 6 };
      return sendButtons(sock, chat, { text: `🎮 *HANGMAN STARTED!*\n\nWord: ${word.split('').map(()=>'_').join(' ')}\nTries: 6\n\nUse *.guess* [letter]\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🚩 Quit', id: '.hangman quit' }], quoted: msg });
    }

    if (cmd === 'guess') {
      const g6 = hangmanGames[chat];
      if (!g6) return m.reply(`${tr('game_no_hangman')}\n\n${cfg.footer}`);
      const letter = text?.toLowerCase()?.[0];
      if (!letter || !/[a-z]/.test(letter)) return m.reply(`${tr('game_guess_usage')}\n\n${cfg.footer}`);
      if (g6.guessed.includes(letter)) return m.reply(`⚠️ Already guessed "${letter}"!\n\n${cfg.footer}`);
      g6.guessed.push(letter);
      if (g6.word.includes(letter)) {
        g6.word.split('').forEach((c,i) => { if (c===letter) g6.masked[i]=letter; });
        if (!g6.masked.includes('_')) {
          delete hangmanGames[chat];
          return sendButtons(sock, chat, { text: `🎉 *YOU WON!* The word was: *${g6.word}*\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: t('btn_play_again',lang), id: '.hangman' }], quoted: msg });
        }
        return m.reply(`✅ Correct! "${letter}"\nWord: ${g6.masked.join(' ')}\nTries left: ${g6.maxWrong - g6.wrongCount}\n\n${cfg.footer}`);
      } else {
        g6.wrong.push(letter); g6.wrongCount++;
        if (g6.wrongCount >= g6.maxWrong) {
          const w2 = g6.word; delete hangmanGames[chat];
          return sendButtons(sock, chat, { text: `💀 *GAME OVER!* The word was: *${w2}*\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🎮 Play Again', id: '.hangman' }], quoted: msg });
        }
        return m.reply(`❌ Wrong! "${letter}"\nWord: ${g6.masked.join(' ')}\nWrong: ${g6.wrong.join(', ')}\nTries left: ${g6.maxWrong - g6.wrongCount}\n\n${cfg.footer}`);
      }
    }

    // ── TRIVIA ────────────────────────────────────────────────
    if (cmd === 'trivia') {
      if (triviaGames[chat]) return sendButtons(sock, chat, { text: `❓ *TRIVIA* (in progress)\n\n${triviaGames[chat].question}\n\nOptions:\n${triviaGames[chat].options.join('\n')}\n\nUse *.answer* [answer]\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🚩 Quit', id: '.trivia quit' }], quoted: msg });
      if (text === 'quit') { delete triviaGames[chat]; return m.reply(`Trivia ended!\n\n${cfg.footer}`); }
      await m.react('⏳');
      try {
        const res = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple', { timeout: 10000 });
        const q = res.data.results[0];
        const options = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
        triviaGames[chat] = { question: q.question, correctAnswer: q.correct_answer, options };
        await m.react('✅');
        return sendButtons(sock, chat, { text: `❓ *TRIVIA*\n\n${q.question}\n\n${options.join('\n')}\n\nUse *.answer* [answer]\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🚩 Quit', id: '.trivia quit' }], quoted: msg });
      } catch { await m.react('❌'); return m.reply(`${tr('err_failed')}\n\n${cfg.footer}`); }
    }

    if (cmd === 'answer') {
      const g7 = triviaGames[chat];
      if (!g7) return m.reply(`${tr('game_no_trivia')}\n\n${cfg.footer}`);
      if (!text) return m.reply(`📌 Usage: *.answer* [answer]\n\n${cfg.footer}`);
      delete triviaGames[chat];
      if (text.toLowerCase() === g7.correctAnswer.toLowerCase()) {
        return sendButtons(sock, chat, { text: `🎉 *CORRECT!*\n\nAnswer: ${g7.correctAnswer}\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: t('btn_play_again',lang), id: '.trivia' }], quoted: msg });
      }
      return sendButtons(sock, chat, { text: `❌ *WRONG!*\n\nCorrect: *${g7.correctAnswer}*\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🎮 Play Again', id: '.trivia' }], quoted: msg });
    }

    // ── SLOTS ─────────────────────────────────────────────────
    if (cmd === 'slots' || cmd === 'slot') {
      const syms = ['🍒','🍋','🍇','⭐','💎','🔔','7️⃣'];
      const s1 = syms[Math.floor(Math.random()*syms.length)], s2 = syms[Math.floor(Math.random()*syms.length)], s3 = syms[Math.floor(Math.random()*syms.length)];
      const won = s1===s2 && s2===s3;
      return sendButtons(sock, chat, { text: `🎰 *SLOT MACHINE*\n\n[ ${s1} | ${s2} | ${s3} ]\n\n${won?t('game_jackpot',lang):t('game_better_luck',lang)}\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: t('btn_spin_again',lang), id: '.slots' }], quoted: msg });
    }

    // ── RIDDLE ────────────────────────────────────────────────
    if (cmd === 'riddle') {
      const riddles = [
        { q: "What has keys but no locks?", a: "A keyboard" },
        { q: "What has a head and tail but no body?", a: "A coin" },
        { q: "What gets wetter as it dries?", a: "A towel" },
        { q: "What runs but never walks?", a: "Water" },
        { q: "What can you catch but not throw?", a: "A cold" },
        { q: "What goes up but never comes down?", a: "Age" },
        { q: "What has teeth but cannot bite?", a: "A comb" },
      ];
      const r = riddles[Math.floor(Math.random() * riddles.length)];
      return sendButtons(sock, chat, { text: `🧠 *RIDDLE*\n\n${r.q}\n\n||Answer: ${r.a}||\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🧠 Another', id: '.riddle' }, { label: '📋 Menu', id: '.menu' }], quoted: msg });
    }

    // ── TRUTH ─────────────────────────────────────────────────
    if (cmd === 'truth') {
      const truths = ["What's your biggest fear?","Who is your secret crush?","What's the most embarrassing thing you've done?","Have you ever lied to your best friend?","What's your most embarrassing memory?","Have you ever cheated on a test?","What's your biggest regret?","What's a secret you've never told anyone?"];
      return sendButtons(sock, chat, { text: `🎯 *TRUTH*\n\n${truths[Math.floor(Math.random()*truths.length)]}\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🎯 Another', id: '.truth' }, { label: '🔥 Dare', id: '.dare' }], quoted: msg });
    }

    // ── DARE ──────────────────────────────────────────────────
    if (cmd === 'dare') {
      const dares = ["Send a voice note singing your favorite song!","Change your status to something embarrassing for 10 minutes!","Send a selfie right now!","Tell a joke to the group!","Do 10 push-ups and send proof!","Send a love message to the last person who texted you!","Speak in a different accent for the next 5 messages!","Share your most cringe-worthy photo!"];
      return sendButtons(sock, chat, { text: `🔥 *DARE*\n\n${dares[Math.floor(Math.random()*dares.length)]}\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🔥 Another', id: '.dare' }, { label: '🎯 Truth', id: '.truth' }], quoted: msg });
    }

    // ── 8BALL ─────────────────────────────────────────────────
    if (cmd === '8ball' || cmd === 'eightball') {
      if (!text) return sendButtons(sock, chat, { text: `📌 Usage: *.8ball* [question]\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '📋 Menu', id: '.menu' }], quoted: msg });
      const responses = ['✅ Yes!','❌ No!','🤔 Maybe...','💯 Definitely!','😬 Doubtful.','🎯 Without a doubt!','🚫 No way!','⭐ Signs point to yes!'];
      return sendButtons(sock, chat, { text: `🎱 *Magic 8-Ball*\n\n❓ ${text}\n\n🔮 *${responses[Math.floor(Math.random()*responses.length)]}*\n\n${cfg.footer}`, footer: cfg.footer, buttons: [{ label: '🎱 Ask Again', id: `.8ball ${text}` }], quoted: msg });
    }
  },
};
