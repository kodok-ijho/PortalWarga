const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Get all users (admin only)
router.get('/', authenticateToken, authorizeRole('admin'), userController.getUsers);

// Get user by ID
router.get('/:id', authenticateToken, userController.getUserById);

// Update user
router.put('/:id', authenticateToken, userController.updateUser);

// Delete user (admin only)
router.delete('/:id', authenticateToken, authorizeRole('admin'), userController.deleteUser);

module.exports = router;