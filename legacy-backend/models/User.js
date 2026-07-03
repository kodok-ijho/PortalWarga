const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['resident', 'admin'],
    default: 'resident'
  },
  phone: {
    type: String,
    trim: true
  },
  // Reference to unit (if resident)
  unit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for email
userSchema.index({ email: 1 });

module.exports = mongoose.model('User', userSchema);