const express = require('express');
const UserController = require('../controllers/userController');
const { logger } = require('../utils/logger');

const router = express.Router();

// Create account
router.get("/createAccount", UserController.createAccount);

// Delete user (admin only)
router.get("/deleteUser", UserController.deleteAccount);

// Show all users (admin only)
router.get("/listUsers", UserController.listUsers);

// Add user with role (owner only)
router.get("/userAdd", UserController.userAdd);

// Edit user expiration date (reseller or owner)
router.get("/editUser", UserController.editUser);

// Change password
router.post("/changepass", UserController.changePassword);

// Get logs (owner only)
router.get("/getLog", UserController.getLog);

module.exports = router;