const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  iplBill: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IPLBill',
    required: true
  },
  resident: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: ['qris', 'bank_transfer', 'cash', 'other'],
    required: true
  },
  // For QRIS, we might store reference to the QR transaction
  transactionId: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentDate: {
    type: Date
  },
  // Optional: metadata from payment gateway
  metadata: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

// Indexes
paymentSchema.index({ iplBill: 1 });
paymentSchema.index({ resident: 1, paymentDate: -1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);