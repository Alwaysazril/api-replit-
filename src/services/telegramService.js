process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const fs   = require('fs');
const path = require('path');
const TelegramBot = require("node-telegram-bot-api");
const { logger } = require('../utils/logger');
const { loadDatabase, saveDatabase } = require('./databaseService');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args)).catch(() => null);

const TOKEN    = process.env.TELEGRAM_TOKEN || "8671540051:AAEaEoE_6oFAQ0EA1_j9cXqOWEZzM76J1cQ";
const OWNER_ID = parseInt(process.env.OWNER_ID || "5914076434");
const idowner  = [OWNER_ID];

const IMAGE_URL = "https://l.top4top.io/p_3789tpwwq3.png";

const VALID_ROLES = ['member','reseller','reseller1','vip','owner','high owner','admin','high admin','dev'];

const PENDING_FILE = path.join(__dirname, "data/pending.json");
const CHAT_FILE    = path.join(__dirname, "data/chat_sessions.json");

function ensureFiles() {
  [PENDING_FILE, CHAT_FILE].forEach(f => {
    if (!fs.existsSync(path.dirname(f))) fs.mkdirSync(path.dirname(f), { recursive: true });
    if (!fs.existsSync(f)) fs.writeFileSync(f, '[]');
  });
}
ensureFiles();

function loadPending() { try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')); } catch { return []; } }
function savePending(d) { fs.writeFileSync(PENDING_FILE, JSON.stringify(d, null, 2)); }
function loadChats()   { try { return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')); } catch { return []; } }
function saveChats(d)  { fs.writeFileSync(CHAT_FILE, JSON.stringify(d, null, 2)); }

const bot = new TelegramBot(TOKEN, { polling: true });

// ── HELPER ───────────────────────────────────
function isOwner(id) { return idowner.includes(id); }

// Kirim foto dari URL dengan fallback ke text
async function sendWithPhoto(chatId, caption, opts = {}) {
  try {
    await bot.sendPhoto(chatId, IMAGE_URL, { caption, parse_mode: "Markdown", ...opts });
  } catch {
    await bot.sendMessage(chatId, caption, { parse_mode: "Markdown", ...opts });
  }
}

function mainMenuOpts(name, owner) {
  const inline = [
    [{ text: "🛒 Beli Akun",     callback_data: "buy_account" },
     { text: "📋 Status Akun",   callback_data: "cek_akun"    }],
    [{ text: "💬 Chat Owner",    callback_data: "open_chat"   }],
  ];
  if (owner) {
    inline.push([
      { text: "👥 List User",      callback_data: "list_user"    },
      { text: "🎛 Buat Custom",    callback_data: "create_custom" }
    ]);
    inline.push([
      { text: "🗑 Hapus User",     callback_data: "delete_user"  },
      { text: "⏳ Set Expired",    callback_data: "set_expire"   }
    ]);
    inline.push([
      { text: "📥 Pending Orders", callback_data: "pending_list" },
      { text: "💬 Inbox Chat",     callback_data: "inbox_chat"   }
    ]);
    inline.push([{ text: "📊 Stats Server", callback_data: "server_stats" }]);
  }
  return {
    caption:
`🐉 *AZRIL STRAVAS API*
━━━━━━━━━━━━━━━━━━
👋 Halo *${name}*!
${owner ? '👑 Mode: *OWNER*' : '👤 Mode: *User*'}

Pilih menu di bawah:`,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: inline }
  };
}

// ── /start ───────────────────────────────────
bot.onText(/^\/?(?:start|menu)$/i, async (msg) => {
  const id    = msg.chat.id;
  const name  = msg.from.first_name || 'User';
  const owner = isOwner(msg.from.id);
  const opts  = mainMenuOpts(name, owner);

  try {
    await bot.sendPhoto(id, IMAGE_URL, {
      caption:      opts.caption,
      parse_mode:   opts.parse_mode,
      reply_markup: opts.reply_markup
    });
  } catch {
    bot.sendMessage(id, opts.caption, { parse_mode: opts.parse_mode, reply_markup: opts.reply_markup });
  }
});

// ── CALLBACK ─────────────────────────────────
bot.on("callback_query", async (query) => {
  const id     = query.from.id;
  const chatId = query.message.chat.id;
  const data   = query.data;
  const owner  = isOwner(id);
  bot.answerCallbackQuery(query.id);

  if (data.startsWith("acc_"))  return _accUser(chatId, data.replace("acc_", ""), query);
  if (data.startsWith("rej_"))  return _rejectUser(chatId, data.replace("rej_", ""), query);

  switch (data) {

    case "buy_account":
      await sendWithPhoto(chatId,
`💰 *CARA BELI AKUN AZRIL STRAVAS*
━━━━━━━━━━━━━━━━━━
Kirim perintah:
\`/beli username|password|hari|role\`

*Contoh:*
\`/beli user123|pass123|30|member\`

*HARGA:*
• Member    — Rp 5.000/bln  | Rp 10.000 perm
• Reseller  — Rp 10.000/bln | Rp 20.000 perm
• VIP       — Rp 20.000/bln | Rp 35.000 perm
• Owner     — Rp 40.000/bln | Rp 80.000 perm

*PAYMENT:*
DANA: 085275080962 (Azahar Apriansyah)

Setelah TF, kirim foto bukti ke bot ini.`);
      break;

    case "cek_akun": {
      const db   = loadDatabase();
      const user = db.find(u => String(u.telegramId) === String(id));
      if (!user) {
        await sendWithPhoto(chatId, "❌ Akun tidak ditemukan.\nCatatan: akun dibuat via bot, bukan via APK.");
        return;
      }
      const exp  = new Date(user.expiredDate);
      const sisa = Math.ceil((exp - new Date()) / 86400000);
      await sendWithPhoto(chatId,
`📋 *Info Akun*
👤 Username: \`${user.username}\`
🎖 Role: ${user.role}
⏳ Expired: ${user.expiredDate}
📅 Sisa: ${sisa > 0 ? sisa + ' hari' : '❌ EXPIRED'}`);
      break;
    }

    case "open_chat":
      await sendWithPhoto(chatId,
`💬 *Chat dengan Owner*
━━━━━━━━━━━━━━━━━━
Kirim pesan kamu:
\`/tanya pesan kamu di sini\`

Contoh:
\`/tanya Halo min, mau tanya soal paket VIP\`

Owner akan membalas secepatnya.`);
      break;

    case "list_user":
      if (!owner) return;
      const db2 = loadDatabase();
      if (!db2.length) { await sendWithPhoto(chatId, "📋 Database kosong."); return; }
      const list = db2.map((u,i) => `${i+1}. *${u.username}* | ${u.role} | ${u.expiredDate}`).join('\n');
      await sendWithPhoto(chatId, `📋 *${db2.length} User:*\n\n${list}`);
      break;

    case "create_custom":
      if (!owner) return;
      await sendWithPhoto(chatId, "🎛 Format:\n`/ckey username,password,hari,role`");
      break;

    case "delete_user":
      if (!owner) return;
      await sendWithPhoto(chatId, "🗑 `/hapus username`");
      break;

    case "set_expire":
      if (!owner) return;
      await sendWithPhoto(chatId, "⏳ `/addexp username|hari`");
      break;

    case "pending_list":
      if (!owner) return;
      const pend = loadPending();
      if (!pend.length) { await sendWithPhoto(chatId, "📥 Tidak ada order pending."); return; }
      const plist = pend.map((p,i) =>
        `${i+1}. *${p.username}* | ${p.role} | ${p.day}hr\nACC: \`/acc ${p.username}\` | REJECT: \`/reject ${p.username}\``
      ).join('\n\n');
      await sendWithPhoto(chatId, `📥 *Pending Orders (${pend.length}):*\n\n${plist}`);
      break;

    case "inbox_chat":
      if (!owner) return;
      const chats = loadChats();
      const fromUsers = [...new Set(chats.filter(c => c.from === 'user').map(c => c.username))];
      if (!fromUsers.length) { await sendWithPhoto(chatId, "💬 Inbox kosong."); return; }
      const unreadInfo = fromUsers.map(u => {
        const last   = chats.filter(c => c.username === u).pop();
        const unread = chats.filter(c => c.username === u && c.from === 'user' && !c.read).length;
        return `👤 *${u}* ${unread > 0 ? `(${unread} baru)` : ''}\nBalas: \`/reply ${u}|pesan\`\nPesan terakhir: ${last?.message?.substring(0,40) || '-'}`;
      }).join('\n\n');
      await sendWithPhoto(chatId, `💬 *Inbox Chat:*\n\n${unreadInfo}`);
      break;

    case "server_stats":
      if (!owner) return;
      const db3   = loadDatabase();
      const aktif = db3.filter(u => new Date(u.expiredDate) > new Date()).length;
      const pend2 = loadPending();
      await sendWithPhoto(chatId,
`📊 *Stats Azril Stravas*
━━━━━━━━━━━━━━━━━━
👥 Total User: ${db3.length}
✅ Aktif: ${aktif}
❌ Expired: ${db3.length - aktif}
📥 Pending Order: ${pend2.length}
🤖 Bot: RUNNING
🌐 API: king.daiyat19.my.id:3556`);
      break;
  }
});

// ── /beli ────────────────────────────────────
bot.onText(/^\/beli (.+)/i, async (msg, match) => {
  const chatId    = msg.chat.id;
  const userId    = msg.from.id;
  const requester = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
  const parts     = match[1].split('|').map(s => s.trim());
  if (parts.length < 3) return sendWithPhoto(chatId, "❌ Format: `/beli username|password|hari|role`");

  let [username, password, day, role] = parts;
  role = (role || 'member').toLowerCase();
  if (!VALID_ROLES.includes(role)) return sendWithPhoto(chatId, "❌ Role tidak valid.");
  if (isNaN(parseInt(day)))        return sendWithPhoto(chatId, "❌ Durasi harus angka.");

  const db = loadDatabase();
  if (db.find(u => u.username === username)) return sendWithPhoto(chatId, "❌ Username sudah ada!");

  const pend = loadPending();
  if (pend.find(p => p.fromUser === userId)) return sendWithPhoto(chatId, "⏳ Masih ada request pending.");

  pend.push({ reqId: Date.now(), fromUser: userId, fromName: requester, username, password, role, day: parseInt(day), step: "wait_proof" });
  savePending(pend);

  await sendWithPhoto(chatId,
`✅ *Request diterima!*
👤 Username: \`${username}\`
🎖 Role: ${role} | ⏳ ${day} hari

📸 Kirim *foto bukti transfer* sekarang.`);
});

// ── Handle foto bukti TF ──────────────────────
bot.on("photo", (msg) => {
  const userId = msg.from.id;
  const pend   = loadPending();
  const req    = pend.find(p => p.fromUser === userId && p.step === "wait_proof");
  if (!req) return;

  const photoId = msg.photo[msg.photo.length - 1].file_id;
  req.proof = photoId;
  req.step  = "pending_acc";
  savePending(pend);

  idowner.forEach(ownerId => {
    bot.sendPhoto(ownerId, photoId, {
      caption:
`📥 *ORDER BARU (via Telegram)*
━━━━━━━━━━━━━━━━━━
👤 Dari: ${req.fromName}
👤 Username: \`${req.username}\`
🔐 Password: \`${req.password}\`
🎖 Role: ${req.role} | ⏳ ${req.day} hari`,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[
        { text: "✅ ACC",    callback_data: `acc_${req.username}` },
        { text: "❌ REJECT", callback_data: `rej_${req.username}` },
        { text: "👤 User",   url: `tg://user?id=${req.fromUser}` }
      ]]}
    }).catch(e => logger.error("Kirim owner gagal: " + e.message));
  });

  bot.sendMessage(userId, "⏳ Bukti diterima! Menunggu konfirmasi owner.");
});

// ── /tanya ────────────────────────────────────
bot.onText(/^\/tanya (.+)/i, (msg, match) => {
  const chatId   = msg.chat.id;
  const username = msg.from.username || String(msg.from.id);
  const message  = match[1].trim();

  const chats = loadChats();
  chats.push({ id: Date.now(), username, message, from: 'user', telegramId: msg.from.id, time: new Date().toISOString(), read: false });
  saveChats(chats);

  idowner.forEach(ownerId => {
    bot.sendMessage(ownerId,
`💬 *Pesan dari User*
━━━━━━━━━━━━━━━━━━
👤 User: *${username}* (ID: ${msg.from.id})
📝 Pesan: ${message}
━━━━━━━━━━━━━━━━━━
Balas: \`/reply ${username}|pesan kamu\``,
      { parse_mode: "Markdown" }
    );
  });

  bot.sendMessage(chatId, "✅ Pesan terkirim ke owner! Tunggu balasan ya.");
});

// ── /reply ────────────────────────────────────
bot.onText(/^\/reply (.+)/i, (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) return bot.sendMessage(chatId, "❌ Bukan owner.");

  const parts = match[1].split('|');
  if (parts.length < 2) return bot.sendMessage(chatId, "❌ Format: `/reply username|pesan`", { parse_mode: "Markdown" });

  const username = parts[0].trim();
  const message  = parts.slice(1).join('|').trim();

  const chats = loadChats();
  chats.push({ id: Date.now(), username, message, from: 'owner', time: new Date().toISOString(), read: false });
  saveChats(chats);

  const userChat = [...chats].reverse().find(c => c.username === username && c.from === 'user' && c.telegramId);
  if (userChat?.telegramId) {
    bot.sendMessage(userChat.telegramId,
`💬 *Pesan dari Owner Azril Stravas*
━━━━━━━━━━━━━━━━━━
${message}`, { parse_mode: "Markdown" }).catch(() => {});
  }

  bot.sendMessage(chatId, `✅ Balasan terkirim ke *${username}*.`, { parse_mode: "Markdown" });
});

// ── /ckey ────────────────────────────────────
bot.onText(/^\/ckey (.+)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) return;
  const parts = match[1].split(',').map(s => s.trim());
  if (parts.length < 3) return sendWithPhoto(chatId, "❌ Format: `/ckey username,pass,hari,role`");

  let [username, password, day, role] = parts;
  role = (role || 'member').toLowerCase();
  if (!VALID_ROLES.includes(role)) return sendWithPhoto(chatId, "❌ Role tidak valid.");

  const db = loadDatabase();
  if (db.find(u => u.username === username)) return sendWithPhoto(chatId, "❌ Username sudah ada!");

  const exp = new Date();
  exp.setDate(exp.getDate() + parseInt(day));
  db.push({ username, password, role, expiredDate: exp.toISOString().split("T")[0], lastSend: 0 });
  saveDatabase(db);

  await sendWithPhoto(chatId,
`✅ *Akun dibuat!*
👤 Username: \`${username}\`
🔐 Password: \`${password}\`
🎖 Role: ${role}
⏳ Expired: ${exp.toISOString().split("T")[0]}`);
});

// ── /acc ──────────────────────────────────────
bot.onText(/^\/acc (.+)/i, (msg, match) => {
  if (!isOwner(msg.from.id)) return;
  _accUser(msg.chat.id, match[1].trim(), null);
});

async function _accUser(chatId, username, query) {
  const pend = loadPending();
  const db   = loadDatabase();
  const req  = pend.find(p => p.username === username);

  if (!req) return sendWithPhoto(chatId, "❌ Request tidak ditemukan.");
  if (db.find(u => u.username === username)) return sendWithPhoto(chatId, "❌ Username sudah ada.");

  const exp = new Date();
  exp.setDate(exp.getDate() + req.day);
  db.push({ username: req.username, password: req.password, role: req.role, expiredDate: exp.toISOString().split("T")[0], lastSend: 0 });
  saveDatabase(db);
  savePending(pend.filter(p => p.username !== username));

  await sendWithPhoto(chatId, `✅ *${username}* di-ACC!`);

  if (req.fromUser) {
    try {
      await bot.sendPhoto(req.fromUser, IMAGE_URL, {
        caption:
`✅ *AKUN AKTIF!*
━━━━━━━━━━━━━━━━━━
👤 Username: \`${req.username}\`
🔐 Password: \`${req.password}\`
🎖 Role: ${req.role}
⏳ Expired: ${exp.toISOString().split("T")[0]}
━━━━━━━━━━━━━━━━━━
Login di app *Azril Stravas* sekarang ✅`,
        parse_mode: "Markdown"
      });
    } catch {
      bot.sendMessage(req.fromUser,
`✅ *AKUN AKTIF!*
━━━━━━━━━━━━━━━━━━
👤 Username: \`${req.username}\`
🔐 Password: \`${req.password}\`
🎖 Role: ${req.role}
⏳ Expired: ${exp.toISOString().split("T")[0]}
━━━━━━━━━━━━━━━━━━
Login di app *Azril Stravas* sekarang ✅`,
        { parse_mode: "Markdown" }).catch(() => {});
    }
  }

  if (query) bot.answerCallbackQuery(query.id, { text: "✅ ACC berhasil!" }).catch(() => {});
}

// ── /reject ───────────────────────────────────
bot.onText(/^\/reject (.+)/i, (msg, match) => {
  if (!isOwner(msg.from.id)) return;
  _rejectUser(msg.chat.id, match[1].trim(), null);
});

async function _rejectUser(chatId, username, query) {
  const pend = loadPending();
  const req  = pend.find(p => p.username === username);
  if (!req) return sendWithPhoto(chatId, "❌ Request tidak ditemukan.");

  savePending(pend.filter(p => p.username !== username));
  await sendWithPhoto(chatId, `❌ Request *${username}* ditolak.`);

  if (req.fromUser) {
    bot.sendMessage(req.fromUser, "❌ Request akun kamu *ditolak*.\nHubungi @usserunknownn untuk info.", { parse_mode: "Markdown" }).catch(() => {});
  }
  if (query) bot.answerCallbackQuery(query.id, { text: "❌ Rejected." }).catch(() => {});
}

// ── /hapus ────────────────────────────────────
bot.onText(/^\/hapus (.+)/i, (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) return;
  const db  = loadDatabase();
  const idx = db.findIndex(u => u.username === match[1].trim());
  if (idx === -1) return sendWithPhoto(chatId, "❌ User tidak ditemukan.");
  db.splice(idx, 1);
  saveDatabase(db);
  sendWithPhoto(chatId, `🗑 *${match[1].trim()}* dihapus.`);
});

// ── /addexp ───────────────────────────────────
bot.onText(/^\/addexp (.+)/i, (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) return;
  const [username, days] = match[1].split('|').map(s => s.trim());
  const db   = loadDatabase();
  const user = db.find(u => u.username === username);
  if (!user) return sendWithPhoto(chatId, "❌ User tidak ditemukan.");
  const d = new Date(isNaN(new Date(user.expiredDate)) ? Date.now() : user.expiredDate);
  d.setDate(d.getDate() + parseInt(days));
  user.expiredDate = d.toISOString().split("T")[0];
  saveDatabase(db);
  sendWithPhoto(chatId, `✅ Expired *${username}* → *${user.expiredDate}*`);
});

// ── /setrole ──────────────────────────────────
bot.onText(/^\/setrole (.+)/i, (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) return;
  const [username, newRole] = match[1].split('|').map(s => s.trim());
  if (!VALID_ROLES.includes(newRole?.toLowerCase())) return sendWithPhoto(chatId, "❌ Role tidak valid.");
  const db   = loadDatabase();
  const user = db.find(u => u.username === username);
  if (!user) return sendWithPhoto(chatId, "❌ User tidak ditemukan.");
  user.role = newRole.toLowerCase();
  saveDatabase(db);
  sendWithPhoto(chatId, `✅ Role *${username}* → *${newRole}*`);
});

// ── /list ─────────────────────────────────────
bot.onText(/^\/list$/i, async (msg) => {
  if (!isOwner(msg.from.id)) return;
  const db = loadDatabase();
  if (!db.length) return sendWithPhoto(msg.chat.id, "📋 Database kosong.");
  const text = db.map((u,i) => `${i+1}. *${u.username}* | ${u.role} | ${u.expiredDate}`).join('\n');
  await sendWithPhoto(msg.chat.id, `📋 *${db.length} User:*\n\n${text}`);
});

// ── /help ─────────────────────────────────────
bot.onText(/^\/help$/i, async (msg) => {
  const owner = isOwner(msg.from.id);
  await sendWithPhoto(msg.chat.id,
`📚 *Perintah Bot Azril Stravas*

*User:*
/start — Menu utama
/beli user|pass|hari|role — Request beli
/tanya pesan — Tanya ke owner
/help — Bantuan

${owner ? `*Owner:*
/ckey user,pass,hari,role — Buat akun
/hapus user — Hapus user
/addexp user|hari — Tambah expired
/setrole user|role — Ubah role
/list — List semua user
/acc user — ACC request
/reject user — Tolak request
/reply user|pesan — Balas chat user` : ''}`);
});

// ── Error handler ─────────────────────────────
bot.on("polling_error", err => logger.error("[BOT] " + err.message));

// ── startTelegramBot ──────────────────────────
async function startTelegramBot() {
  logger.info(`Telegram bot started (owner: ${OWNER_ID})`);
  const notif = `🟢 *Azril Stravas API ONLINE*\n\n🕐 ${new Date().toLocaleString('id-ID', {timeZone:'Asia/Jakarta'})} WIB\n🤖 Bot siap terima order & chat`;
  try {
    await bot.sendPhoto(OWNER_ID, IMAGE_URL, { caption: notif, parse_mode: "Markdown" });
  } catch {
    bot.sendMessage(OWNER_ID, notif, { parse_mode: "Markdown" }).catch(() => {});
  }
}

module.exports = { bot, startTelegramBot };
