const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { bot } = require('../services/telegramService');
const { logger } = require('../utils/logger');

const OWNER_ID = parseInt(process.env.OWNER_ID || '5914076434');
const CHAT_FILE = path.join(__dirname, '../services/data/chat_sessions.json');

function loadChats() {
  try { return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')); } catch { return []; }
}
function saveChats(data) {
  fs.writeFileSync(CHAT_FILE, JSON.stringify(data, null, 2));
}
function getMsgs(username) {
  const chats = loadChats();
  return chats.filter(c => c.username === username).slice(-50);
}

// POST /api/chat/send — user kirim pesan ke owner
router.post('/send', (req, res) => {
  const { username, message, key } = req.body;
  if (!username || !message) return res.json({ success: false, message: 'Data kurang' });

  const msg = {
    id: Date.now(),
    username,
    message,
    from: 'user',
    time: new Date().toISOString(),
    read: false
  };

  const chats = loadChats();
  chats.push(msg);
  saveChats(chats);

  // Forward ke Telegram owner
  bot.sendMessage(OWNER_ID,
`💬 *Pesan dari User*
━━━━━━━━━━━━━━
👤 User: *${username}*
📝 Pesan: ${message}
━━━━━━━━━━━━━━
Balas: \`/reply ${username}|pesan kamu\``,
    { parse_mode: 'Markdown' }
  ).catch(() => {});

  logger.info(`[CHAT] Message from ${username}`);
  res.json({ success: true, message: 'Pesan terkirim ke owner' });
});

// GET /api/chat/messages?username=xxx — user ambil history chat
router.get('/messages', (req, res) => {
  const { username } = req.query;
  if (!username) return res.json({ success: false, messages: [] });

  const msgs = getMsgs(username);

  // Mark owner replies as read
  const chats = loadChats();
  chats.forEach(c => { if (c.username === username && c.from === 'owner') c.read = true; });
  saveChats(chats);

  res.json({ success: true, messages: msgs });
});

// GET /api/chat/unread?username=xxx — cek ada pesan baru dari owner
router.get('/unread', (req, res) => {
  const { username } = req.query;
  if (!username) return res.json({ count: 0 });

  const chats = loadChats();
  const unread = chats.filter(c => c.username === username && c.from === 'owner' && !c.read).length;
  res.json({ count: unread });
});

// POST /api/chat/owner-reply — dipakai telegram bot untuk simpan balasan owner
router.post('/owner-reply', (req, res) => {
  const { secret, username, message } = req.body;
  if (secret !== 'azrilstravas2024') return res.json({ success: false });

  const msg = {
    id: Date.now(),
    username,
    message,
    from: 'owner',
    time: new Date().toISOString(),
    read: false
  };

  const chats = loadChats();
  chats.push(msg);
  saveChats(chats);
  res.json({ success: true });
});

module.exports = router;
