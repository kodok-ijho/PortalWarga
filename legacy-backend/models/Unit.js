const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
  block: {
    type: String,
    required: true,
    trim: true
  },
  unitNumber: {
    type: String,
    required: true,
    trim: true
  },
  floor: {
    type: Number,
    min: 0
  },
  size: {
    type: Number, // in square meters
    min: 0
  },
  ownerName: {
    type: String,
    trim: true
  },
  contact: {
    type: String,
    trim: true
  },
  isOccupied: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for block and unitNumber
unitSchema.index({ block: 1, unitNumber: 1 }, { unique: true });

module.exports = mongoose.model('Unit', unitSchema);