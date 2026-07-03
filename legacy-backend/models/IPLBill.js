const mongoose = require('mongoose');

const iplBillSchema = new mongoose.Schema({
  unit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit',
    required: true
  },
  resident: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  period: {
    type: String, // format YYYY-MM
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  dueDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'overdue', 'cancelled'],
    default: 'pending'
  },
  // QRIS data from Mayar
  qrCode: {
    type: String, // URL or base64 of QR image
  },
  qrCodeId: {
    type: String, // ID from Mayar
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  }
}, {
  timestamps: true
});

// Index for faster queries
iplBillSchema.index({ resident: 1, status: 1 });
iplBillSchema.index({ period: 1 });
iplBillSchema.index({ dueDate: 1 });

module.exports = mongoose.model('IPLBill', iplBillSchema);