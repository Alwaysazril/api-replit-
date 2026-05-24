const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger');
const { bot } = require('../services/telegramService');

const OWNER_ID = parseInt(process.env.OWNER_ID || '5914076434');
const PENDING_FILE = path.join(__dirname, '../services/data/pending.json');

function loadPending() {
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')); } catch { return []; }
}
function savePending(data) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(data, null, 2));
}

// Upload storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `proof_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/order/submit
// Dipanggil APK saat user submit order + foto bukti TF
router.post('/submit', upload.single('proof'), async (req, res) => {
  try {
    const { username, password, role, day, package_name, price, telegram_id, notes } = req.body;

    if (!username || !password || !role) {
      return res.json({ success: false, message: 'Data tidak lengkap' });
    }

    const reqId = Date.now();
    const proofPath = req.file ? req.file.path : null;

    const order = {
      reqId,
      username,
      password,
      role: role || 'member',
      day: parseInt(day) || 30,
      package_name: package_name || role,
      price: price || '-',
      telegram_id: telegram_id || '-',
      notes: notes || '-',
      proofPath,
      step: 'pending_acc',
      createdAt: new Date().toISOString()
    };

    const pending = loadPending();
    pending.push(order);
    savePending(pending);

    // Kirim notif + foto ke owner Telegram
    const caption =
`📥 *ORDER BARU MASUK!*
━━━━━━━━━━━━━━━━
👤 Username: \`${username}\`
🔐 Password: \`${password}\`
🎖 Role: ${role}
📦 Paket: ${package_name || role}
💰 Harga: ${price || '-'}
⏳ Durasi: ${day || 30} hari
📱 Telegram ID: ${telegram_id || '-'}
📝 Catatan: ${notes || '-'}
━━━━━━━━━━━━━━━━
Klik ACC/REJECT di bawah:`;

    const keyboard = {
      inline_keyboard: [[
        { text: '✅ ACC', callback_data: `acc_${username}` },
        { text: '❌ REJECT', callback_data: `rej_${username}` }
      ]]
    };

    if (proofPath && fs.existsSync(proofPath)) {
      await bot.sendPhoto(OWNER_ID, fs.createReadStream(proofPath), {
        caption, parse_mode: 'Markdown', reply_markup: keyboard
      });
    } else {
      await bot.sendMessage(OWNER_ID, caption + '\n\n⚠️ (Tanpa foto bukti)', {
        parse_mode: 'Markdown', reply_markup: keyboard
      });
    }

    logger.info(`[ORDER] New order submitted: ${username}`);
    res.json({ success: true, message: 'Order berhasil dikirim! Menunggu konfirmasi owner.', reqId });

  } catch (err) {
    logger.error('[ORDER] Error: ' + err.message);
    res.json({ success: false, message: 'Gagal submit order: ' + err.message });
  }
});

// GET /api/order/status?username=xxx
router.get('/status', (req, res) => {
  const { username } = req.query;
  if (!username) return res.json({ found: false });

  const pending = loadPending();
  const order = pending.find(p => p.username === username);

  if (order) {
    return res.json({ found: true, status: 'pending', message: 'Menunggu konfirmasi owner' });
  }

  // Cek apakah sudah di-acc (ada di database)
  const { loadDatabase } = require('../services/databaseService');
  const db = loadDatabase();
  const user = db.find(u => u.username === username);
  if (user) {
    return res.json({ found: true, status: 'approved', message: 'Akun sudah aktif!', expiredDate: user.expiredDate });
  }

  res.json({ found: false, status: 'not_found' });
});

module.exports = router;
