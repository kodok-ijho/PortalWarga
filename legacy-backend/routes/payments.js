const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/auth');

// Create a new payment
router.post('/', authenticateToken, paymentController.createPayment);

// Get payment by ID
router.get('/:id', authenticateToken, paymentController.getPaymentById);

// Get payments for a specific IPL bill
router.get('/bill/:iplBillId', authenticateToken, paymentController.getPaymentsByBill);

// Get payments for current user
router.get('/my-payments', authenticateToken, paymentController.getMyPayments);

// Update payment status (e.g., after verification)
router.put('/:id/status', authenticateToken, paymentController.updatePaymentStatus);

module.exports = router;