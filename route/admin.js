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
const crypto = require('crypto');
const WeeklyOfficeSchedule = require('../model/WeeklyOfficeSchedule');


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
  <div style="max-width:600px; margin:auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#333; border:1px solid #ddd; border-radius:10px; overflow:hidden; box-shadow: 0 4px 12px rgba(245, 245, 245, 0.1);">
    <div style="background-color:rgba(237,28,22,0.4); padding:25px 20px; text-align:center;">
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

/*

router.post('/create-schedule-all', auth, async (req, res) => {
  const { startDate, endDate, totalOfficeDaysPerWeek } = req.body;
  console.log('📅 Incoming:', req.body);

  if (!startDate || !endDate || !totalOfficeDaysPerWeek) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const staffList = await Staff.find({ status: 'Active' });
  if (!staffList.length) {
    return res.status(404).json({ message: 'No active staff found' });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  // ✅ Get all working days (Mon-Fri) in the date range
  const workingDays = [];
  let currentDate = new Date(start);
  while (currentDate <= end) {
    const day = currentDate.getDay();
    if (day >= 1 && day <= 5) {
      workingDays.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const totalWeeks = Math.ceil(workingDays.length / 5);

  // ✅ Prepare assignment map for each staff
  const staffSchedules = staffList.map(staff => ({
    staffId: staff._id,
    assignedDates: [],
    remainingSlots: totalOfficeDaysPerWeek * totalWeeks
  }));

  // ✅ Group working days by week
  const weeks = [];
  for (let i = 0; i < workingDays.length; i += 5) {
    weeks.push(workingDays.slice(i, i + 5));
  }

  // ✅ Assign staff fairly across all weekdays without leaving empty days
  weeks.forEach(weekDays => {
    const dailyAssignments = {};

    // For each day in the week
    weekDays.forEach(day => {
      dailyAssignments[day] = [];

      // Pick staff who still have available slots
      const availableStaff = staffSchedules.filter(s => s.remainingSlots > 0);

      // Shuffle for fairness
      availableStaff.sort(() => Math.random() - 0.5);

      // Calculate how many staff to assign (ensure everyone gets fair spread)
      const staffPerDay = Math.min(Math.ceil(staffList.length * totalOfficeDaysPerWeek / 5), availableStaff.length);

      const selectedStaff = availableStaff.slice(0, staffPerDay);

      selectedStaff.forEach(s => {
        s.assignedDates.push(day);
        s.remainingSlots--;
        dailyAssignments[day].push(s.staffId);
      });
    });
  });

  // ✅ Prepare schedules to save
  const schedulesToSave = staffSchedules.map(s => ({
    staff: s.staffId,
    startDate: start,
    endDate: end,
    daysPerWeek: totalOfficeDaysPerWeek,
    assignedDates: s.assignedDates
  }));

  await Schedule.deleteMany({ startDate: { $gte: start }, endDate: { $lte: end } });
  await Schedule.insertMany(schedulesToSave);

  res.json({
    message: '✅ Schedule generated successfully',
    totalStaff: staffList.length,
    totalWeeks,
    schedulesCreated: schedulesToSave.length
  });
});



router.post('/create-schedule-all', auth, async (req, res) => {
  const { startDate, endDate, totalOfficeDaysPerWeek } = req.body;
  console.log('📅 Incoming:', req.body);

  if (!startDate || !endDate || !totalOfficeDaysPerWeek) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const staffList = await Staff.find({ status: 'Active' });
  if (!staffList.length) {
    return res.status(404).json({ message: 'No active staff found' });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  // ✅ Step 1: Get all working days (Mon-Fri)
  const workingDays = [];
  let currentDate = new Date(start);
  while (currentDate <= end) {
    const day = currentDate.getDay();
    if (day >= 1 && day <= 5) {
      workingDays.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const totalWeeks = Math.ceil(workingDays.length / 5);
  const maxDaysPerStaff = totalOfficeDaysPerWeek * totalWeeks;

  // ✅ Step 2: Track assigned days for each staff
  const staffSchedules = staffList.map(staff => ({
    staffId: staff._id,
    assignedDates: [],
    remainingSlots: maxDaysPerStaff
  }));

  // ✅ Step 3: Assign staff evenly to all working days
  const dailyAssignments = {};

  workingDays.forEach(day => {
    // Filter staff who still have available slots
    const availableStaff = staffSchedules.filter(s => s.remainingSlots > 0);

    if (availableStaff.length === 0) return; // No one left to assign

    // Shuffle for fairness
    availableStaff.sort(() => Math.random() - 0.5);

    // Calculate how many people should be assigned to this day
    const avgStaffPerDay = Math.ceil((staffList.length * totalOfficeDaysPerWeek) / 5);

    const staffForToday = availableStaff.slice(0, avgStaffPerDay);

    staffForToday.forEach(s => {
      s.assignedDates.push(day);
      s.remainingSlots--;
    });

    dailyAssignments[day] = staffForToday.map(s => s.staffId);
  });

  // ✅ Step 4: Prepare for saving
  const schedulesToSave = staffSchedules.map(s => ({
    staff: s.staffId,
    startDate: start,
    endDate: end,
    daysPerWeek: totalOfficeDaysPerWeek,
    assignedDates: s.assignedDates
  }));

  await Schedule.deleteMany({ startDate: { $gte: start }, endDate: { $lte: end } });
  await Schedule.insertMany(schedulesToSave);

  res.json({
    message: '✅ Monthly schedule generated successfully',
    totalStaff: staffList.length,
    totalWeeks,
    schedulesCreated: schedulesToSave.length
  });
});
*/


router.get('/staff-in-office/:date', auth, async (req, res) => {
  const { date } = req.params;

  if (!date) return res.status(400).json({ message: 'Date is required in the format YYYY-MM-DD' });

  const selectedDate = new Date(date);
  selectedDate.setHours(0, 0, 0, 0);

  const schedules = await Schedule.find({
    assignedDates: { $elemMatch: { $eq: selectedDate } }
  }).populate('staff', 'name email');

  if (!schedules.length) {
    return res.json({ message: 'No staff scheduled for this date', staffInOffice: [] });
  }

  const staffInOffice = schedules.map(s => ({
    staffId: s.staff._id,
    name: s.staff.name,
    email: s.staff.email
  }));

  res.json({
    date: selectedDate.toDateString(),
    totalInOffice: staffInOffice.length,
    staffInOffice
  });
});


router.get('/view-schedules-detailed', auth, async (req, res) => {
  const schedules = await Schedule.find()
    .populate('staff', 'name email')
    .lean();

  const detailedSchedules = schedules.map(schedule => ({
    staffName: schedule.staff?.name || 'Unknown',
    email: schedule.staff?.email || '',
    period: `${schedule.startDate.toDateString()} - ${schedule.endDate.toDateString()}`,
    assignedDates: (schedule.assignedDates || []).map(date => ({
      date: new Date(date).toLocaleDateString(),
      day: new Date(date).toLocaleDateString('en-US', { weekday: 'long' })
    }))
  }));

  res.json(detailedSchedules);
});



router.get('/grouped-schedules-by-date', auth, async (req, res) => {
  const schedules = await Schedule.find()
    .populate('staff', 'name email')
    .lean();

  const dateGroups = {};

  schedules.forEach(schedule => {
    (schedule.assignedDates || []).forEach(date => {
      const dateKey = new Date(date).toLocaleDateString();

      if (!dateGroups[dateKey]) {
        dateGroups[dateKey] = [];
      }

      dateGroups[dateKey].push({
        name: schedule.staff?.name || 'Unknown',
        email: schedule.staff?.email || '',
      });
    });
  });

  res.json(dateGroups);
});




router.post('/add-admin', auth, async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ message: 'Name and Email are required' });
  }

  // Check if admin already exists
  const existingAdmin = await Admin.findOne({ email });
  if (existingAdmin) {
    return res.status(400).json({ message: 'Admin with this email already exists' });
  }

  // Generate a temporary random password
  const tempPassword = Math.random().toString(36).slice(-8);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  // Create new admin
  const newAdmin = new Admin({
    name,
    email,
    password: hashedPassword
  });

  await newAdmin.save();

  // Prepare the welcome email
  const html = `
    <div style="max-width:600px; margin:auto; font-family: Arial, sans-serif; border:1px solid #ddd; border-radius:8px; overflow:hidden;">
      <div style="background-color:rgba(237,28,22,0.4); padding:20px; text-align:center;">
        <h2 style="color:#fff;">Welcome to NBC Red Auditor Attendance Admin Portal</h2>
      </div>
      <div style="padding: 30px;">
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your admin account has been created. Here are your login details:</p>
        <p>Email: <strong>${email}</strong><br>
           Temporary Password: <strong>${tempPassword}</strong></p>
        <p>Please log in using the link below and change your password immediately:</p>
        <div style="text-align:center; margin:20px 0;">
          <a href="https://rednauditors-attendance-log.onrender.com/index" target="_blank" style="background-color:#ed1c16; color:#fff; padding:12px 24px; border-radius:5px; text-decoration:none;">
            Login to Admin Portal
          </a>
        </div>
        <p style="font-size:12px; color:#666;">If you did not request this, please contact support immediately.</p>
      </div>
      <div style="background:#f4f4f4; text-align:center; padding:10px; font-size:12px; color:#999;">
        &copy; ${new Date().getFullYear()} NBC Red Auditor Attendance. All rights reserved.
      </div>
    </div>
  `;

  // Send email
  await sendEmail(email, 'NBC Red Auditor Attendance Admin Access - Your Login Details', html);

  res.json({ message: '✅ Admin created and login details sent via email.' });
});




router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  const admin = await Admin.findOne({ email });
  if (!admin) {
    return res.status(404).json({ message: 'Admin with this email not found.' });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiry = Date.now() + 1000 * 60 * 15;  // Token valid for 15 minutes

  admin.resetToken = resetToken;
  admin.resetTokenExpiry = expiry;
  await admin.save();

  const resetLink = `https://rednauditors-attendance-log.onrender.com/reset-password.html?token=${resetToken}&email=${email}`;

  const html = `
    <h2>Password Reset Request</h2>
    <p>Hello ${admin.name},</p>
    <p>We received a request to reset your password. Please click the link below to set a new password:</p>
    <a href="${resetLink}" style="padding:10px 15px; background:#ed1c16; color:#fff; text-decoration:none; border-radius:5px;">Reset Password</a>
    <p>This link will expire in 15 minutes.</p>
    <p>If you didn't request this, please ignore this email.</p>
  `;

  await sendEmail(email, 'NBC Red Auditor Password Reset', html);

  res.json({ message: '✅ Reset link sent to email.' });
});

router.post('/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body;

  const admin = await Admin.findOne({ email, resetToken: token, resetTokenExpiry: { $gt: Date.now() } });
  if (!admin) {
    return res.status(400).json({ message: 'Invalid or expired reset link.' });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  admin.password = hashed;
  admin.resetToken = null;
  admin.resetTokenExpiry = null;
  await admin.save();

  res.json({ message: '✅ Password has been reset successfully.' });
});


router.get('/permissions', auth, async (req, res) => {
  const today = new Date();

  const permissions = await Staff.find({
    permission: {
      $ne: null,
      $exists: true
    },
    'permission.startDate': { $lte: today },
    'permission.endDate': { $gte: today }
  }, { name: 1, email: 1, permission: 1, status: 1 })
  .sort({ 'permission.startDate': -1 });

  res.json(permissions);
});


// ===============================
//  ADMIN SETS GLOBAL OFFICE DAYS
// ===============================
router.post('/set-global-office-days',auth, async (req, res) => {
  const { startDate, endDate, selectedDays } = req.body;

  if (!startDate || !endDate || !selectedDays || selectedDays.length === 0) {
    return res.status(400).json({
      message: "Start date, end date and selected office days are required"
    });
  }

  const dayMap = {
    "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
    "Thursday": 4, "Friday": 5, "Saturday": 6
  };

  const selectedDayNumbers = selectedDays.map(day => dayMap[day]);

  const start = new Date(startDate);
  const end = new Date(endDate);

  let assignedDates = [];
  let current = new Date(start);

  while (current <= end) {
    if (selectedDayNumbers.includes(current.getDay())) {
      assignedDates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  const allStaff = await Staff.find({ status: "Active" });

  // Remove previous schedules in the period
  await Schedule.deleteMany({
    startDate: { $gte: start },
    endDate: { $lte: end }
  });

  // Assign same schedule to every staff
  const schedules = allStaff.map(staff => ({
    staff: staff._id,
    startDate: start,
    endDate: end,
    assignedDates,
    officeDays: selectedDays
  }));

  await Schedule.insertMany(schedules);

  res.json({
    message: "Global office schedule successfully applied.",
    selectedDays,
    totalAssignedDates: assignedDates.length,
    staffAssigned: allStaff.length
  });
});


router.post('/set-weekly-office-days', async (req, res) => {
  try {
    const { weekStart, days } = req.body;

    if (!weekStart || !days || days.length !== 3) {
      return res.status(400).json({ message: "Select exactly 3 office days." });
    }

    // Overwrite existing weekly schedule
    await WeeklyOfficeSchedule.deleteMany({});

    const schedule = new WeeklyOfficeSchedule({
      weekStart: new Date(weekStart),
      days
    });

    await schedule.save();

    res.json({ message: "Weekly office schedule saved successfully", schedule });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get('/view-weekly-schedule', async (req, res) => {
  const schedule = await WeeklyOfficeSchedule.findOne({});
  if (!schedule) {
    return res.json({ message: "No weekly schedule found" });
  }
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


