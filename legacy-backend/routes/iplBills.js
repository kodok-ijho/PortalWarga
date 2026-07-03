const express = require('express');
const router = express.Router();
const iplBillController = require('../controllers/iplBillController');
const { authenticateToken } = require('../middleware/auth');

// Get all IPL bills (with filters and pagination)
router.get('/', authenticateToken, iplBillController.getIPLBills);

// Get IPL bills for current resident
router.get('/my-bills', authenticateToken, iplBillController.getMyIPLBills);

// Get IPL bill by ID
router.get('/:id', authenticateToken, iplBillController.getIPLBillById);

// Update IPL bill
router.put('/:id', authenticateToken, iplBillController.updateIPLBill);

// Delete IPL bill (admin only)
router.delete('/:id', authenticateToken, iplBillController.deleteIPLBill);

module.exports = router;