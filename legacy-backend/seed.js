const mongoose = require('mongoose');
const User = require('./models/User');
const Unit = require('./models/Unit');
const IPLBill = require('./models/IPLBill');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/palmvillage';

const seedData = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');

    // Clear existing data
    await User.deleteMany({});
    await Unit.deleteMany({});
    await IPLBill.deleteMany({});
    console.log('Existing data cleared');

    // Create sample units
    const units = [];
    for (let i = 1; i <= 10; i++) {
      const unit = await Unit.create({
        unitNumber: `A-${i.toString().padStart(3, '0')}`,
        block: 'A',
        floor: Math.floor((i-1)/5) + 1,
        size: 120, // in sqm
        bedrooms: 2,
        bathrooms: 1
      });
      units.push(unit);
    }
    console.log(`Created ${units.length} units`);

    // Create sample residents (one per unit)
    const residents = [];
    for (let i = 0; i < units.length; i++) {
      const resident = await User.create({
        name: `Penghuni ${units[i].unitNumber}`,
        email: `penghuni${i+1}@palmvillage.id`,
        password: 'password123', // will be hashed by pre-save hook
        role: 'resident',
        phone: `08123456${i.toString().padStart(4, '0')}`,
        unit: units[i]._id,
        isActive: true
      });
      residents.push(resident);
    }
    console.log(`Created ${residents.length} residents`);

    // Create admin user
    const admin = await User.create({
      name: 'Admin Sistem',
      email: 'admin@palmvillage.id',
      password: 'admin123',
      role: 'admin',
      phone: '081234567890',
      isActive: true
    });
    console.log('Created admin user');

    // Create sample IPL bills for the last 3 months for each unit
    const months = ['2024-01', '2024-02', '2024-03'];
    let billCount = 0;
    for (const unit of units) {
      for (const month of months) {
        const dueDate = new Date();
        // Set due date to 10th of the month
        dueDate.setFullYear(parseInt(month.substring(0,4)));
        dueDate.setMonth(parseInt(month.substring(5,7))-1);
        dueDate.setDate(10);
        dueDate.setHours(23,59,59,999);

        const bill = await IPLBill.create({
          unit: unit._id,
          resident: residents.find(r => r.unit.toString() === unit._id.toString())._id,
          period: month,
          amount: 500000, // IDR 500,000
          dueDate: dueDate,
          status: month === '2024-03' ? 'pending' : 'paid' // Jan and Feb paid, March pending
        });
        billCount++;
      }
    }
    console.log(`Created ${billCount} IPL bills`);

    console.log('Seeding completed successfully');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seedData();