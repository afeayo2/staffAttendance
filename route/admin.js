const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Staff = require('../model/Staff');
const Attendance = require('../model/Attendance');
//const Admin = require('../model/Admin');
const sendEmail = require('../utils/mailer');
const auth = require('../route/adminAuth'); // Separate admin middleware
const Admin = require('../model/Admin');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// ✅ Admin Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email });
  if (!admin) return res.status(400).json({ message: "Invalid credentials" });

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

  const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: '7d' });

  res.json({ token, admin: { id: admin._id, name: admin.name, email: admin.email } });
});

// ✅ Add Staff
router.post('/add-staff', auth, async (req, res) => {
  const { name, email } = req.body;

  const existing = await Staff.findOne({ email });
  if (existing) return res.status(400).json({ message: "Staff already exists" });

  const tempPassword = Math.random().toString(36).slice(-8);
  const hashed = await bcrypt.hash(tempPassword, 10);

  const staff = new Staff({ name, email, password: hashed });
  await staff.save();

  // ✅ Send Email
  const html = `
    <h3>Welcome to Red Auditor Attendance Portal</h3>
    <p>Dear </srong> ${name} Your account has been created.</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Temporary Password:</strong> ${tempPassword}</p>
    <p>Please login and change your password.</p>
  `;

  await sendEmail(email, 'Coca-Cola Attendance - Your Login Details', html);

  res.json({ message: 'Staff created and email sent' });
});

// ✅ Dashboard Analytics
router.get('/dashboard', auth, async (req, res) => {
  const totalStaff = await Staff.countDocuments();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const presentToday = await Attendance.distinct('staff', {
    checkIn: { $gte: today }
  });

  const absentToday = await Staff.find({
    _id: { $nin: presentToday }
  });

  const attendanceByOffice = await Attendance.aggregate([
    { $match: { checkIn: { $gte: today } } },
    { $group: { _id: "$officeName", count: { $sum: 1 } } }
  ]);

  res.json({
    totalStaff,
    presentToday: presentToday.length,
    absentToday: absentToday.length,
    officeSummary: attendanceByOffice
  });
});

// ✅ View Individual Staff Attendance
router.get('/staff/:id/attendance', auth, async (req, res) => {
  const { id } = req.params;
  const records = await Attendance.find({ staff: id }).sort({ checkIn: -1 });
  res.json(records);
});





// One-time Admin Registration
router.post('/register-admin', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await Admin.findOne({ email });
    if (existing) return res.status(400).json({ message: "Admin already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const admin = new Admin({ name, email, password: hashed });
    await admin.save();

    res.json({ message: "Admin registered successfully" });
  } catch (err) {
    console.error('Admin registration error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});






module.exports = router;


