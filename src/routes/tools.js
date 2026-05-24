const express = require('express');
const router = express.Router();
const ToolsController = require('../controllers/toolsController');

// NIK Check
router.get('/nik-check', ToolsController.nikCheck);

// Subdomain Finder
router.get('/subdomain-finder', ToolsController.subdomainFinder);

// ChatAI - Generate New Session
router.get('/chat/new-session', ToolsController.generateNewSession);

// ChatAI - Send Message
router.get('/chat/send', ToolsController.sendMessage);

// ChatAI - Get Chat History
router.get('/chat/history', ToolsController.getChatHistory);

// ChatAI - Delete Chat History
router.get('/chat/delete', ToolsController.deleteChatHistory);

// ChatAI - Get User Chat History List
router.get('/chat/list', ToolsController.getChatHistoryList);


module.exports = router;