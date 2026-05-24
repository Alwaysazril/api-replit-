const express = require('express');
const { logger } = require('../utils/logger');
const { loadDatabase, saveDatabase } = require('../services/databaseService');
const { activeKeys } = require('../middleware/authMiddleware');

class UserController {
  static async createAccount(req, res) {
    const { key, newUser, pass, day } = req.query;
    logger.info(`[👤 CREATE] Request create user '${newUser}' dengan key '${key}'`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ CREATE] Key tidak valid.");
      return res.json({ valid: false, error: true, message: "Invalid key." });
    }

    const db = loadDatabase();
    const creator = db.find(u => u.username === keyInfo.username);

    if (!creator || !["reseller", "owner", "reseller1"].includes(creator.role)) {
      logger.info(`[❌ CREATE] ${creator?.username || "Unknown"} tidak memiliki izin.`);
      return res.json({ valid: true, authorized: false, message: "Not authorized." });
    }

    if (creator.role === "reseller" && parseInt(day) > 30) {
      logger.info("[❌ CREATE] Reseller tidak boleh membuat akun lebih dari 30 hari.");
      return res.json({ valid: true, created: false, invalidDay: true, message: "Reseller can only create accounts up to 30 days." });
    }

    if (db.find(u => u.username === newUser)) {
      logger.info("[❌ CREATE] Username sudah digunakan.");
      return res.json({ valid: true, created: false, message: "Username already exists." });
    }

    const expired = new Date();
    expired.setDate(expired.getDate() + parseInt(day));

    const newAccount = {
      username: newUser,
      password: pass,
      expiredDate: expired.toISOString().split("T")[0],
      role: "member",
      parent: creator.username, // --- MODIFIKASI: Menambahkan parent ---
    };

    db.push(newAccount);
    saveDatabase(db);
  
    logger.info("[✅ CREATE] Akun berhasil dibuat:", newAccount);
    // Log tidak perlu diubah karena sudah mencatat creator
    const logLine = `${creator.username} Created ${newUser} duration ${day}\n`;
    require('fs').appendFileSync('logUser.txt', logLine);

    return res.json({ valid: true, created: true, user: newAccount });
  }

  static async deleteAccount(req, res) {
    const { key, username } = req.query;
    logger.info(`[🗑️ DELETE] Request hapus user '${username}' oleh key '${key}'`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ DELETE] Key tidak valid.");
      return res.json({ valid: false, error: true, message: "Invalid key." });
    }

    const db = loadDatabase();
    const admin = db.find(u => u.username === keyInfo.username);

    if (!admin || admin.role !== "owner") {
      logger.info(`[❌ DELETE] ${admin?.username || "Unknown"} bukan owner.`);
      return res.json({ valid: true, authorized: false, message: "Only owner can delete users." });
    }

    const index = db.findIndex(u => u.username === username);
    if (index === -1) {
      logger.info("[❌ DELETE] User tidak ditemukan.");
      return res.json({ valid: true, deleted: false, message: "User not found." });
    }

    const deletedUser = db[index];
    db.splice(index, 1);
    saveDatabase(db);
  
    // --- MODIFIKASI: Menambahkan info parent di log ---
    logger.info("[✅ DELETE] User berhasil dihapus:", deletedUser);
    const logLine = `${admin.username} Deleted ${deletedUser.username} (Parent: ${deletedUser.parent || 'SYSTEM'})\n`;
    require('fs').appendFileSync('logUser.txt', logLine);

    return res.json({ valid: true, deleted: true, user: deletedUser });
  }

  static async listUsers(req, res) {
    const { key } = req.query;
    logger.info(`[📋 LIST] Request lihat semua user oleh key '${key}'`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ LIST] Key tidak valid.");
      return res.json({ valid: false, error: true, message: "Invalid key." });
    }

    const db = loadDatabase();
    const admin = db.find(u => u.username === keyInfo.username);

    if (!admin || admin.role !== "owner") {
      logger.info(`[❌ LIST] ${admin?.username || "Unknown"} bukan owner.`);
      return res.json({ valid: true, authorized: false, message: "Only owner can view users." });
    }

    // --- MODIFIKASI: Menambahkan field 'parent' di response ---
    const users = db.map(u => ({
      username: u.username,
      expiredDate: u.expiredDate,
      role: u.role || "member",
      parent: u.parent || "SYSTEM", // Tampilkan parent, default ke 'SYSTEM' jika tidak ada
    }));

    logger.info(`[✅ LIST] Menampilkan ${users.length} user`);
    return res.json({ valid: true, authorized: true, users });
  }

  static async userAdd(req, res) {
    const { key, username, password, role, day } = req.query;
    logger.info(`[➕ USERADD] ${username} dengan role ${role} oleh key ${key}`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ USERADD] Key tidak valid.");
      return res.json({ valid: false, error: true, message: "Invalid key." });
    }

    const db = loadDatabase();
    const creator = db.find(u => u.username === keyInfo.username);

    if (!creator || creator.role !== "owner") {
      logger.info(`[❌ USERADD] ${creator?.username || "Unknown"} tidak memiliki izin.`);
      return res.json({ valid: true, authorized: false, message: "Only owner can add user with role." });
    }

    if (db.find(u => u.username === username)) {
      logger.info("[❌ USERADD] Username sudah ada.");
      return res.json({ valid: true, created: false, message: "Username already exists." });
    }

    const expired = new Date();
    expired.setDate(expired.getDate() + parseInt(day));

    const newUser = {
      username,
      password,
      role: role || "member",
      expiredDate: expired.toISOString().split("T")[0],
      parent: creator.username, // --- MODIFIKASI: Menambahkan parent ---
    };

    db.push(newUser);
    saveDatabase(db);

    logger.info(`[✅ USERADD] User ${username} dengan role ${role} berhasil dibuat`);
    const logLine = `${creator.username} Created ${username} Role ${role} Days ${day}\n`;
    require('fs').appendFileSync('logUser.txt', logLine);

    return res.json({ valid: true, authorized: true, created: true, user: newUser });
  }

  static async editUser(req, res) {
    const { key, username, addDays } = req.query;
    logger.info(`[🛠️ EDIT] Tambah masa aktif ${username} +${addDays} hari oleh key ${key}`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ EDIT] Key tidak valid.");
      return res.json({ valid: false, error: true, message: "Invalid key." });
    }

    const db = loadDatabase();
    const editor = db.find(u => u.username === keyInfo.username);

    if (!editor || !["reseller", "owner"].includes(editor.role)) {
      logger.info(`[❌ EDIT] ${editor?.username || "Unknown"} tidak memiliki izin.`);
      return res.json({ valid: true, authorized: false, message: "Only reseller or owner can edit user." });
    }

    if (editor.role === "reseller" && parseInt(addDays) > 30) {
      logger.info("[❌ EDIT] Reseller tidak boleh menambah lebih dari 30 hari.");
      return res.json({ valid: true, authorized: true, edited: false, invalidDay: true, message: "Reseller can only add up to 30 days." });
    }

    const targetUser = db.find(u => u.username === username);
    if (!targetUser) {
      logger.info("[❌ EDIT] User tidak ditemukan.");
      return res.json({ valid: true, authorized: true, edited: false, message: "User not found." });
    }

    if (editor.role === "reseller" && targetUser.role !== "member") {
      logger.info("[❌ EDIT] Reseller hanya bisa mengedit user dengan role 'member'.");
      return res.json({ valid: true, authorized: true, edited: false, message: "Reseller hanya bisa mengedit user dengan role 'member'." });
    }

    const currentDate = new Date(targetUser.expiredDate);
    currentDate.setDate(currentDate.getDate() + parseInt(addDays));
    targetUser.expiredDate = currentDate.toISOString().split("T")[0];

    saveDatabase(db);
    
    // --- MODIFIKASI: Menambahkan info parent di log ---
    logger.info(`[✅ EDIT] Masa aktif ${username} diperbarui ke ${targetUser.expiredDate}`);
    const logLine = `${editor.username} Edited ${username} (Parent: ${targetUser.parent || 'SYSTEM'}) Add Days ${addDays}\n`;
    require('fs').appendFileSync('logUser.txt', logLine);

    return res.json({ valid: true, authorized: true, edited: true, user: targetUser });
  }

  static async changePassword(req, res) {
    const { username, oldPass, newPass } = req.body;
    logger.info(`[🔐] Change password request for user: ${username}`);

    const db = loadDatabase();
    const idx = db.findIndex(u => u.username === username && u.password === oldPass);
    
    if (idx === -1) {
      logger.error(`[❌ PASSWORD] Invalid credentials for user: ${username}`);
      return res.json({ success: false, message: "Invalid credentials" });
    }

    db[idx].password = newPass;
    saveDatabase(db);
    
    logger.info(`[✅ PASSWORD] Password berhasil diubah untuk user: ${username}`);
    return res.json({ success: true, message: "Password updated successfully" });
  }

  static async getLog(req, res) {
    const { key } = req.query;
    logger.info(`[📄 LOG] Request log oleh key '${key}'`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ LOG] Key tidak valid.");
      return res.json({ valid: false, error: true, message: "Invalid key." });
    }

    const db = loadDatabase();
    const admin = db.find(u => u.username === keyInfo.username);

    if (!admin || admin.role !== "owner") {
      logger.info(`[❌ LOG] ${admin?.username || "Unknown"} bukan owner.`);
      return res.json({ valid: true, authorized: false, message: "Only owner can view logs." });
    }

    try {
      const logContent = require('fs').readFileSync('logUser.txt', 'utf-8');
      return res.json({ valid: true, authorized: true, logs: logContent });
    } catch (err) {
      logger.error(`[❌ LOG] Error reading log file: ${err.message}`);
      return res.json({ valid: true, authorized: true, logs: "", error: "Failed to read log file." });
    }
  }
}

module.exports = UserController;