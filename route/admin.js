const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Staff = require('../model/Staff');
const Attendance = require('../model/Attendance');
//const Admin = require('../model/Admin');
const sendEmail = require('../utils/mailer');
const auth = require('../route/adminAuth'); // Separate admin middleware
const Admin = require('../model/Admin');
const Schedule = require('../model/Schedule');

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
  <div style="max-width:600px; margin:auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#333; border:1px solid #ddd; border-radius:10px; overflow:hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    <div style="background-color:#026a28; padding:25px 20px; text-align:center;">
      <img src="https://i.postimg.cc/HsZ59Dx0/image.png" alt="NBC Logo" width="130" height="auto" style="display:block; margin: 0 auto 15px; object-fit: contain;" />
      <h2 style="color:#fff; margin:0; font-weight:600; font-size:1.8rem;">Welcome to NBC Red Auditor Attendance Portal!</h2>
    </div>
    <div style="background:#fff; padding: 35px 25px 40px; font-size:16px; line-height:1.6; color:#444;">
      <p>Hello <strong>${name}</strong>,</p>
      <p>We’re thrilled to have you on board to the Auditors Attendance! Your account has been successfully created and you’re now part of the Red Auditor community.</p>
      <p><strong>Your login details:</strong><br/>
         Email: <a href="mailto:${email}" style="color:#ed1c16; text-decoration:none;">${email}</a><br/>
         Temporary Password: <strong>${tempPassword}</strong>
      </p>
      <p>For your security, please log in using the button below and update your password at your earliest convenience.</p>
      <div style="text-align:center; margin: 35px 0;">
        <a href="https://rednauditors-attendance-log.onrender.com/index" target="_blank" rel="noopener noreferrer"
          style="
            background-color:#ed1c16;
            color:#fff;
            text-decoration:none;
            padding:14px 28px;
            border-radius:6px;
            font-weight:700;
            font-size:16px;
            display:inline-block;
            box-shadow: 0 5px 10px rgba(237,28,22,0.4);
            transition: background-color 0.3s ease;
          "
          onmouseover="this.style.backgroundColor='#c71512'"
          onmouseout="this.style.backgroundColor='#ed1c16'"
        >
          Login to Your Account
        </a>
      </div>
      <p style="font-size:14px; color:#666; margin-top:0;">
        If you have any questions, feel free to contact our team lead anytime.
      </p>
      <p style="font-size:14px; color:#666; margin-bottom:0;">
        Welcome again, and we look forward to supporting you every step of the way!
      </p>
    </div>
    <div style="background:#f4f4f4; padding:15px; font-size:12px; color:#999; text-align:center;">
      &copy; ${new Date().getFullYear()} NBC Red Auditor Attendance Portal. All rights reserved.
    </div>
  </div>
`;


  await sendEmail(email, 'NBC Red Auditors Attendance Portal - Your Login Details', html);

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


router.post('/create-schedule-all', auth, async (req, res) => {
  const { startDate, endDate, totalOfficeDaysPerWeek } = req.body;

  if (!startDate || !endDate || !totalOfficeDaysPerWeek) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const staffList = await Staff.find({ status: 'Active' });

  if (staffList.length === 0) {
    return res.status(404).json({ message: 'No active staff found' });
  }

  // ✅ Calculate fair distribution
  const staffCount = staffList.length;
  const daysPerStaff = Math.ceil(totalOfficeDaysPerWeek / staffCount);

  const schedules = staffList.map(staff => ({
    staff: staff._id,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    daysPerWeek: daysPerStaff
  }));

  // ✅ Remove old schedules within this period to avoid duplicates
  await Schedule.deleteMany({
    startDate: { $gte: new Date(startDate) },
    endDate: { $lte: new Date(endDate) }
  });

  // ✅ Save new schedules
  await Schedule.insertMany(schedules);

  res.json({ message: '✅ Schedule created for all staff', schedules });
});


router.get('/check-compliance/:id', auth, async (req, res) => {
  const { id } = req.params;

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 4); // Friday

  const schedule = await Schedule.findOne({
    staff: id,
    startDate: { $lte: today },
    endDate: { $gte: today }
  });

  if (!schedule) {
    return res.status(404).json({ message: 'No active schedule found' });
  }

  const attendanceCount = await Attendance.countDocuments({
    staff: id,
    checkIn: { $gte: startOfWeek, $lte: endOfWeek }
  });

  const compliant = attendanceCount >= schedule.daysPerWeek;

  res.json({
    attendanceThisWeek: attendanceCount,
    requiredDays: schedule.daysPerWeek,
    compliant,
    message: compliant ? 'Staff has met the weekly schedule' : 'Staff has NOT met the weekly schedule'
  });
});

router.get('/schedules', auth, async (req, res) => {
  const schedules = await Schedule.find().populate('staff', 'name email');
  res.json(schedules);
});

router.get('/staff/:id/schedule', auth, async (req, res) => {
  const { id } = req.params;
  const schedule = await Schedule.findOne({ staff: id }).sort({ startDate: -1 });
  if (!schedule) return res.status(404).json({ message: 'No schedule found' });

  res.json(schedule);
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


