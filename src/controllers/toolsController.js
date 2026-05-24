const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { activeKeys } = require('../middleware/authMiddleware');

// Direktori utama untuk menyimpan data chat history
const CHAT_HISTORY_DIR = path.join(__dirname, '../data/chatHistory');

// Pastikan direktori utama ada
if (!fs.existsSync(CHAT_HISTORY_DIR)) {
  fs.mkdirSync(CHAT_HISTORY_DIR, { recursive: true });
}

class ToolsController {
  // Helper function untuk validasi key
  static validateKey(key) {
    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      return { valid: false, message: "Invalid key." };
    }
    return { valid: true, keyInfo };
  }

  // Helper function untuk mendapatkan path direktori user
  static getUserDir(username) {
    const userDir = path.join(CHAT_HISTORY_DIR, username);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
  }

  // Helper function untuk menyimpan chat history
  static saveChatHistory(sessionId, username, message, isAI = false) {
    try {
      const userDir = ToolsController.getUserDir(username);
      const sessionFile = path.join(userDir, `${sessionId}.json`);
      let chatHistory = [];
      
      // Jika file sudah ada, baca kontennya
      if (fs.existsSync(sessionFile)) {
        const data = fs.readFileSync(sessionFile, 'utf-8');
        chatHistory = JSON.parse(data);
      }
      
      // Tambahkan pesan baru
      chatHistory.push({
        username,
        message,
        isAI, // Tambahkan flag untuk menandai pesan dari AI
        timestamp: new Date().toISOString()
      });
      
      // Simpan kembali ke file
      fs.writeFileSync(sessionFile, JSON.stringify(chatHistory, null, 2));
      return true;
    } catch (error) {
      logger.error(`Error saving chat history: ${error.message}`);
      return false;
    }
  }

  // Helper function untuk membaca chat history
  static getChatHistoryHelper(sessionId, username) {
    try {
      const userDir = ToolsController.getUserDir(username);
      const sessionFile = path.join(userDir, `${sessionId}.json`);
      if (!fs.existsSync(sessionFile)) {
        return [];
      }
      const data = fs.readFileSync(sessionFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error(`Error reading chat history: ${error.message}`);
      return [];
    }
  }

  // Helper function untuk menghapus chat history
  static deleteChatHistoryHelper(sessionId, username) {
    try {
      const userDir = ToolsController.getUserDir(username);
      const sessionFile = path.join(userDir, `${sessionId}.json`);
      if (fs.existsSync(sessionFile)) {
        fs.unlinkSync(sessionFile);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Error deleting chat history: ${error.message}`);
      return false;
    }
  }

  // Helper function untuk mendapatkan daftar session chat history untuk user tertentu
  static getChatHistoryListHelper(username) {
    try {
      const userDir = ToolsController.getUserDir(username);
      const files = fs.readdirSync(userDir);
      const sessionList = [];
      
      files.forEach(file => {
        if (file.endsWith('.json')) {
          const sessionId = file.replace('.json', '');
          const sessionFile = path.join(userDir, file);
          const stats = fs.statSync(sessionFile);
          
          // Baca beberapa pesan pertama untuk preview
          const chatHistory = ToolsController.getChatHistoryHelper(sessionId, username);
          const preview = chatHistory.length > 0 ? chatHistory[0].message.substring(0, 50) + '...' : 'No messages';
          
          sessionList.push({
            sessionId,
            username,
            lastModified: stats.mtime,
            messageCount: chatHistory.length,
            preview
          });
        }
      });
      
      return sessionList.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    } catch (error) {
      logger.error(`Error getting chat history list: ${error.message}`);
      return [];
    }
  }

  // 1. NIK Check
  static async nikCheck(req, res) {
    const { key, nik } = req.query;
    logger.info(`[NIK CHECK] Request NIK check by key '${key}'`);

    const validation = ToolsController.validateKey(key);
    if (!validation.valid) {
      logger.info("[❌ NIK CHECK] Key tidak valid.");
      return res.json({ valid: false, error: true, message: validation.message });
    }

    if (!nik) {
      logger.info("[❌ NIK CHECK] NIK tidak disediakan.");
      return res.json({ valid: false, error: true, message: "NIK parameter is required." });
    }

    try {
      const response = await axios.get(`https://api.siputzx.my.id/api/tools/nik-checker?nik=${nik}`);
      logger.info(`[✅ NIK CHECK] NIK check successful for ${nik}`);
      return res.json(response.data);
    } catch (error) {
      logger.error(`[❌ NIK CHECK] Error: ${error.message}`);
      return res.json({ 
        valid: false, 
        error: true, 
        message: "Failed to check NIK. Please try again later." 
      });
    }
  }

  // 2. Subdomain Finder
  static async subdomainFinder(req, res) {
    const { key, domain } = req.query;
    logger.info(`[SUBDOMAIN FINDER] Request subdomain finder for '${domain}' by key '${key}'`);

    const validation = ToolsController.validateKey(key);
    if (!validation.valid) {
      logger.info("[❌ SUBDOMAIN FINDER] Key tidak valid.");
      return res.json({ valid: false, error: true, message: validation.message });
    }

    if (!domain) {
      logger.info("[❌ SUBDOMAIN FINDER] Domain tidak disediakan.");
      return res.json({ valid: false, error: true, message: "Domain parameter is required." });
    }

    try {
      const response = await axios.get(`https://api.siputzx.my.id/api/tools/subdomains?domain=${domain}`);
      logger.info(`[✅ SUBDOMAIN FINDER] Subdomain finder successful for ${domain}`);
      return res.json(response.data);
    } catch (error) {
      logger.error(`[❌ SUBDOMAIN FINDER] Error: ${error.message}`);
      return res.json({ 
        valid: false, 
        error: true, 
        message: "Failed to find subdomains. Please try again later." 
      });
    }
  }

  // 3. ChatAI - Generate New Session
  static async generateNewSession(req, res) {
    const { key } = req.query;
    logger.info(`[CHAT AI] Generate new session by key '${key}'`);

    const validation = ToolsController.validateKey(key);
    if (!validation.valid) {
      logger.info("[❌ CHAT AI] Key tidak valid.");
      return res.json({ valid: false, error: true, message: validation.message });
    }

    try {
      // Generate session ID baru
      const sessionId = uuidv4();
      const username = validation.keyInfo.username;
      
      // Buat direktori user jika belum ada
      const userDir = ToolsController.getUserDir(username);
      
      // Buat file kosong untuk session baru di direktori user
      const sessionFile = path.join(userDir, `${sessionId}.json`);
      fs.writeFileSync(sessionFile, JSON.stringify([]));
      
      logger.info(`[✅ CHAT AI] New session generated: ${sessionId} for user ${username}`);
      return res.json({ 
        valid: true, 
        sessionId,
        username,
        message: "New session created successfully." 
      });
    } catch (error) {
      logger.error(`[❌ CHAT AI] Error generating new session: ${error.message}`);
      return res.json({ 
        valid: false, 
        error: true, 
        message: "Failed to generate new session." 
      });
    }
  }

  // 4. ChatAI - Send Message
  static async sendMessage(req, res) {
    const { key, session, message } = req.query;
    logger.info(`[CHAT AI] Send message to session '${session}' by key '${key}'`);

    const validation = ToolsController.validateKey(key);
    if (!validation.valid) {
      logger.info("[❌ CHAT AI] Key tidak valid.");
      return res.json({ valid: false, error: true, message: validation.message });
    }

    if (!session || !message) {
      logger.info("[❌ CHAT AI] Session atau message tidak disediakan.");
      return res.json({ 
        valid: false, 
        error: true, 
        message: "Session and message parameters are required." 
      });
    }

    try {
      // Simpan pesan user ke history
      const username = validation.keyInfo.username;
      ToolsController.saveChatHistory(session, username, message, false); // Pesan user dengan isAI = false
      
      // Kirim pesan ke API ChatAI
      const response = await axios.get(
        `https://api.neoxr.eu/api/gpt4-session?q=${encodeURIComponent(message)}&session=${session}&apikey=RadzzOffc_Gamteng`
      );
      
      // Simpan respons AI ke history dengan username yang sama dengan user, tapi dengan isAI = true
      if (response.data.status && response.data.data.message) {
        ToolsController.saveChatHistory(session, username, response.data.data.message, true);
      }
      
      logger.info(`[✅ CHAT AI] Message sent to session ${session}`);
      return res.json(response.data);
    } catch (error) {
      logger.error(`[❌ CHAT AI] Error sending message: ${error.message}`);
      return res.json({ 
        valid: false, 
        error: true, 
        message: "Failed to send message. Please try again later." 
      });
    }
  }

  // 5. ChatAI - Get Chat History (Express route handler)
  static async getChatHistory(req, res) {
    const { key, session } = req.query;
    logger.info(`[CHAT AI] Get chat history for session '${session}' by key '${key}'`);

    const validation = ToolsController.validateKey(key);
    if (!validation.valid) {
      logger.info("[❌ CHAT AI] Key tidak valid.");
      return res.json({ valid: false, error: true, message: validation.message });
    }

    if (!session) {
      logger.info("[❌ CHAT AI] Session tidak disediakan.");
      return res.json({ 
        valid: false, 
        error: true, 
        message: "Session parameter is required." 
      });
    }

    try {
      const username = validation.keyInfo.username;
      const chatHistory = ToolsController.getChatHistoryHelper(session, username);
      logger.info(`[✅ CHAT AI] Retrieved chat history for session ${session}`);
      return res.json({ 
        valid: true, 
        sessionId: session,
        chatHistory 
      });
    } catch (error) {
      logger.error(`[❌ CHAT AI] Error getting chat history: ${error.message}`);
      return res.json({ 
        valid: false, 
        error: true, 
        message: "Failed to get chat history." 
      });
    }
  }

  // 6. ChatAI - Delete Chat History (Express route handler)
  static async deleteChatHistory(req, res) {
    const { key, session } = req.query;
    logger.info(`[CHAT AI] Delete chat history for session '${session}' by key '${key}'`);

    const validation = ToolsController.validateKey(key);
    if (!validation.valid) {
      logger.info("[❌ CHAT AI] Key tidak valid.");
      return res.json({ valid: false, error: true, message: validation.message });
    }

    if (!session) {
      logger.info("[❌ CHAT AI] Session tidak disediakan.");
      return res.json({ 
        valid: false, 
        error: true, 
        message: "Session parameter is required." 
      });
    }

    try {
      const username = validation.keyInfo.username;
      const success = ToolsController.deleteChatHistoryHelper(session, username);
      if (success) {
        logger.info(`[✅ CHAT AI] Deleted chat history for session ${session}`);
        return res.json({ 
          valid: true, 
          sessionId: session,
          message: "Chat history deleted successfully." 
        });
      } else {
        logger.info(`[❌ CHAT AI] Session ${session} not found`);
        return res.json({ 
          valid: false, 
          error: true, 
          message: "Session not found." 
        });
      }
    } catch (error) {
      logger.error(`[❌ CHAT AI] Error deleting chat history: ${error.message}`);
      return res.json({ 
        valid: false, 
        error: true, 
        message: "Failed to delete chat history." 
      });
    }
  }

  // 7. ChatAI - Get User Chat History List (Express route handler)
  static async getChatHistoryList(req, res) {
    // Check if req.query exists
    if (!req || !req.query) {
      logger.error("[❌ CHAT AI] Request or query is undefined");
      return res.status(400).json({ 
        valid: false, 
        error: true, 
        message: "Invalid request" 
      });
    }

    const { key } = req.query;
    logger.info(`[CHAT AI] Get chat history list by key '${key}'`);

    const validation = ToolsController.validateKey(key);
    if (!validation.valid) {
      logger.info("[❌ CHAT AI] Key tidak valid.");
      return res.json({ valid: false, error: true, message: validation.message });
    }

    try {
      const username = validation.keyInfo.username;
      const chatHistoryList = ToolsController.getChatHistoryListHelper(username);
      logger.info(`[✅ CHAT AI] Retrieved chat history list for user ${username}`);
      return res.json({ 
        valid: true, 
        username,
        chatHistoryList 
      });
    } catch (error) {
      logger.error(`[❌ CHAT AI] Error getting chat history list: ${error.message}`);
      return res.json({ 
        valid: false, 
        error: true, 
        message: "Failed to get chat history list." 
      });
    }
  }
}

module.exports = ToolsController;