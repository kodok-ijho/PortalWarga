const IPLBill = require('../models/IPLBill');
const User = require('../models/User');
const Unit = require('../models/Unit');

// Get all IPL bills (with pagination and filters)
exports.getIPLBills = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, residentId, unitId } = req.query;

    // Build filter
    let filter = {};
    if (status) filter.status = status;
    if (residentId) filter.resident = residentId;
    if (unitId) filter.unit = unitId;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const iplBills = await IPLBill.find(filter)
      .populate('resident', 'name email unitNumber')
      .populate('unit', 'unitNumber block')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await IPLBill.countDocuments(filter);

    res.json({
      iplBills,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// Get IPL bill by ID
exports.getIPLBillById = async (req, res) => {
  try {
    const iplBill = await IPLBill.findById(req.params.id)
      .populate('resident', 'name email phone')
      .populate('unit', 'unitNumber block floor size')
      .populate('payment', 'amount paymentDate method status');

    if (!iplBill) {
      return res.status(404).json({ msg: 'IPL bill not found' });
    }

    res.json(iplBill);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'IPL bill not found' });
    }
    res.status(500).send('Server Error');
  }
};

// Update IPL bill (e.g., change amount, due date, status)
exports.updateIPLBill = async (req, res) => {
  try {
    const { period, amount, dueDate, status } = req.body;

    // Build update object
    const iplBillFields = {};
    if (period) iplBillFields.period = period;
    if (amount) iplBillFields.amount = amount;
    if (dueDate) iplBillFields.dueDate = dueDate;
    if (status) iplBillFields.status = status;

    let iplBill = await IPLBill.findById(req.params.id);

    if (!iplBill) {
      return res.status(404).json({ msg: 'IPL bill not found' });
    }

    // Check if user is authorized (admin or the resident of the bill)
    if (req.user.role !== 'admin' && iplBill.resident.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    iplBill = await IPLBill.findByIdAndUpdate(
      req.params.id,
      { $set: iplBillFields },
      { new: true }
    )
      .populate('resident', 'name email')
      .populate('unit', 'unitNumber block');

    res.json(iplBill);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'IPL bill not found' });
    }
    res.status(500).send('Server Error');
  }
};

// Delete IPL bill (admin only)
exports.deleteIPLBill = async (req, res) => {
  try {
    let iplBill = await IPLBill.findById(req.params.id);

    if (!iplBill) {
      return res.status(404).json({ msg: 'IPL bill not found' });
    }

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    await iplBill.remove();

    res.json({ msg: 'IPL bill removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'IPL bill not found' });
    }
    res.status(500).send('Server Error');
  }
};

// Get IPL bills for current resident
exports.getMyIPLBills = async (req, res) => {
  try {
    const iplBills = await IPLBill.find({ resident: req.user.id })
      .populate('unit', 'unitNumber block')
      .sort({ createdAt: -1 });

    res.json(iplBills);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};