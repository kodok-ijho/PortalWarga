const Payment = require('../models/Payment');
const IPLBill = require('../models/IPLBill');
const User = require('../models/User');
const mongoose = require('mongoose');

// Initiate a payment (this would be called when user wants to pay via QRIS)
// In a real scenario, we would call Mayar API to generate QR code and create a pending payment
// For now, we simulate by creating a payment record with status pending
exports.createPayment = async (req, res) => {
  try {
    const { iplBillId, amount } = req.body;

    if (!iplBillId || !amount) {
      return res.status(400).json({ msg: 'Please provide iplBillId and amount' });
    }

    // Check if IPL bill exists
    const iplBill = await IPLBill.findById(iplBillId);
    if (!iplBill) {
      return res.status(404).json({ msg: 'IPL bill not found' });
    }

    // Check authorization: admin or the resident of the bill
    if (req.user.role !== 'admin' && iplBill.resident.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    // Check if bill is already paid
    if (iplBill.status === 'paid') {
      return res.status(400).json({ msg: 'This bill is already paid' });
    }

    // Create a new payment record (initially pending)
    const payment = new Payment({
      iplBill: iplBillId,
      resident: iplBill.resident,
      amount,
      paymentMethod: 'qris', // we assume QRIS for now
      status: 'pending'
    });

    await payment.save();

    // TODO: In real implementation, we would call Mayar API here to generate QR code
    // and update the payment with transactionId and maybe QR image URL
    // For now, we just return the payment object

    res.status(201).json(payment);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// Get payment by ID
exports.getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('iplBill', 'amount dueDate period')
      .populate('resident', 'name email');

    if (!payment) {
      return res.status(404).json({ msg: 'Payment not found' });
    }

    res.json(payment);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Payment not found' });
    }
    res.status(500).send('Server Error');
  }
};

// Get payments for a specific IPL bill
exports.getPaymentsByBill = async (req, res) => {
  try {
    const payments = await Payment.find({ iplBill: req.params.iplBillId })
      .populate('resident', 'name email')
      .sort({ paymentDate: -1 });

    res.json(payments);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// Get payments for current user
exports.getMyPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ resident: req.user.id })
      .populate('iplBill', 'amount dueDate period')
      .sort({ paymentDate: -1 });

    res.json(payments);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// Update payment status (this would be called from a webhook or after verifying payment)
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { status, transactionId } = req.body;

    let payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ msg: 'Payment not found' });
    }

    // Check authorization: admin or the resident of the payment
    if (req.user.role !== 'admin' && payment.resident.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    // Update payment
    if (status) payment.status = status;
    if (transactionId) payment.transactionId = transactionId;

    // If payment is successful, update the associated IPL bill status to paid
    if (status === 'success') {
      const iplBill = await IPLBill.findById(payment.iplBill);
      if (iplBill) {
        iplBill.status = 'paid';
        iplBill.payment = payment._id; // reference to payment
        await iplBill.save();
      }
    }

    await payment.save();

    res.json(payment);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Payment not found' });
    }
    res.status(500).send('Server Error');
  }
};