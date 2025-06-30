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

// Admin Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email });
  if (!admin) return res.status(400).json({ message: "Invalid credentials" });

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

  const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: '7d' });

  res.json({ token, admin: { id: admin._id, name: admin.name, email: admin.email } });
});

//  Add Staff
router.post('/add-staff', auth, async (req, res) => {
  const { name, email } = req.body;

  const existing = await Staff.findOne({ email });
  if (existing) return res.status(400).json({ message: "Staff already exists" });

  const tempPassword = Math.random().toString(36).slice(-8);
  const hashed = await bcrypt.hash(tempPassword, 10);

  const staff = new Staff({ name, email, password: hashed });
  await staff.save();

  // Send Email
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

//  Dashboard Analytics
router.get('/dashboard', auth, async (req, res) => {
  const totalStaff = await Staff.countDocuments();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const presentToday = await Attendance.distinct('staff', {
    checkIn: { $gte: today }
  });

  const absentToday = await Staff.find({
    _id: { $nin: presentToday },
    status: 'Active'
  });

  const suspended = await Staff.find({ status: 'Suspended' });
  const onLeave = await Staff.find({ status: 'On Leave' });
  const onSick = await Staff.find({ status: 'Sick' });
  const onOfficial = await Staff.find({ status: 'On Official Duty' });

  // 🧠 Analytics: Count total attendance by staff
  const attendanceCounts = await Attendance.aggregate([
    {
      $group: {
        _id: "$staff",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // 🏆 Most Present Staff
  const mostPresent = attendanceCounts[0]
    ? await Staff.findById(attendanceCounts[0]._id)
    : null;

  // 🏆 Most Absent Staff (based on least attendance)
  const mostAbsent = attendanceCounts.length > 0
    ? await Staff.findById(attendanceCounts[attendanceCounts.length - 1]._id)
    : null;

  res.json({
    totalStaff,
    presentToday: presentToday.length,
    absentToday: absentToday.length,
    suspended: suspended.length,
    onLeave: onLeave.length,
    onSick: onSick.length,
    onOfficialDuty: onOfficial.length,
    mostPresent: mostPresent ? { name: mostPresent.name, id: mostPresent._id } : null,
    mostAbsent: mostAbsent ? { name: mostAbsent.name, id: mostAbsent._id } : null,
    mostSuspended: suspended.length > 0 ? suspended.map(s => ({ id: s._id, name: s.name })) : [],
    mostOnSick: onSick.length > 0 ? onSick.map(s => ({ id: s._id, name: s.name })) : [],
    mostOnOfficial: onOfficial.length > 0 ? onOfficial.map(s => ({ id: s._id, name: s.name })) : [],
  });
});


//  Grant Permission
router.post('/give-permission/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { type, reason, startDate, endDate } = req.body;

  const validTypes = ['Leave', 'Official', 'Sickness', 'Emergency', 'Suspension'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ message: 'Invalid permission type' });
  }

  const staff = await Staff.findById(id);
  if (!staff) {
    return res.status(404).json({ message: 'Staff not found' });
  }

  staff.permission = { type, reason, startDate, endDate };
  
  // Set status based on type
  switch (type) {
    case 'Leave':
      staff.status = 'On Leave';
      break;
    case 'Official':
      staff.status = 'On Official Duty';
      break;
    case 'Sickness':
      staff.status = 'Sick';
      break;
    case 'Suspension':
      staff.status = 'Suspended';
      break;
    default:
      staff.status = 'Active';
  }

  await staff.save();

  res.json({ message: 'Permission granted successfully' });
});

router.get('/permissions', auth, async (req, res) => {
  const permissions = await Staff.find({
    permission: { $ne: null }
  }, { name: 1, permission: 1, status: 1 });

  res.json(permissions);
});




// View Individual Staff Attendance
router.get('/staff/:id/attendance', auth, async (req, res) => {
  const { id } = req.params;
  const records = await Attendance.find({ staff: id }).sort({ checkIn: -1 });
  res.json(records);
});

router.get('/present-today', auth, async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const attendanceRecords = await Attendance.find({
    checkIn: { $gte: today }
  }).populate('staff', 'name email');

  const result = attendanceRecords.map(record => ({
    staffId: record.staff._id,
    name: record.staff.name,
    email: record.staff.email,
    office: record.officeName,
    checkInTime: record.checkIn,
    latitude: record.latitude,
    longitude: record.longitude
  }));

  res.json(result);
});

// Get all staff list for dropdown
router.get('/staff-list', auth, async (req, res) => {
  const staff = await Staff.find({}, { name: 1, email: 1 });
  res.json(staff);
});


/*

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

*/




module.exports = router;


