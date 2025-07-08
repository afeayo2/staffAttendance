const express = require('express');
const Attendance = require('../model/Attendance');
const Staff = require('../model/Staff');
const jwt = require('jsonwebtoken');
const authenticate = require('./authenticate');
const crypto = require('crypto');
const router = express.Router();
const Schedule = require('../model/Schedule');  
const JWT_SECRET = process.env.JWT_SECRET 

async function clearExpiredPermission(staff) {
  if (staff.permission && staff.permission.endDate) {
    const today = new Date();
    const endDate = new Date(staff.permission.endDate);
    if (today > endDate) {
      staff.permission = null;
      staff.status = 'Active';
      await staff.save();
    }
  }
}


// Middleware to verify token
const auth = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ message: "No token. Authorization denied" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.staff = decoded.id;
    next();
  } catch (e) {
    res.status(400).json({ message: "Invalid token" });
  }
};

// Office locations
const allowedOffices = [
  { name: "Office 1 - Head Office", lat: 6.5244, lng: 3.3792 },
  { name: "Office 2 - Mushin", lat: 6.544436, lng:3.354387},
  {  name: "Office 3 - Ikeja", lat: 6.62191, lng: 3.35309  }
];

// Check location proximity
const isWithinRadius = (lat1, lon1, lat2, lon2, radiusKm = 0.05) => {
  const toRad = val => (val * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c <= radiusKm;
};

// ✅ Check-in

router.post('/check-in', authenticate, async (req, res) => {
  const { latitude, longitude, deviceId } = req.body;

  if (!deviceId) {
    return res.status(400).json({ message: "Device ID is required for security." });
  }

  const matchedOffice = allowedOffices.find(office =>
    isWithinRadius(latitude, longitude, office.lat, office.lng)
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ✅ Prevent multiple check-ins by same staff same day
  const existingCheckIn = await Attendance.findOne({
    staff: req.staff,
    checkIn: { $gte: today }
  });

  if (existingCheckIn) {
    return res.json({ message: "🚫 You have already checked in today." });
  }

  // ✅ Prevent multiple check-ins by device ID same day
  const existingDeviceCheckIn = await Attendance.findOne({
    deviceId,
    checkIn: { $gte: today }
  });

  if (existingDeviceCheckIn) {
    return res.status(400).json({ message: "🚫 This device has already been used to check in today." });
  }

  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  const isLate = hours > 9 || (hours === 9 && minutes > 0);

  const record = new Attendance({
    staff: req.staff,
    officeName: matchedOffice ? matchedOffice.name : "Unknown Location",
    latitude,
    longitude,
    locationStatus: matchedOffice ? "In Office" : "Not in Office",
    checkIn: now,
    status: isLate ? "Absent" : "Present",
    deviceId // 📱 Store device ID
  });

  await record.save();

  res.json({
    message: isLate ? "⏰ You checked in after 9:00 AM. Marked as Absent." : "✅ Checked in successfully.",
    status: record.status
  });
});





// Warning Email HTML
const getWarningEmailHtml = (name) => `
  <h3>Hello ${name},</h3>
  <p>This is a friendly reminder that you have been absent <strong>4 times</strong> this month.</p>
  <p>Consistent attendance is key to performance and evaluation. We recommend watching this video to improve punctuality:</p>
  <p><a href="https://www.youtube.com/watch?v=Q3HcGp8n7JI" target="_blank">👉 How to Be More Punctual</a></p>
  <p>Please improve your attendance going forward.</p>
`;

// Query Email HTML
const getQueryEmailHtml = (name) => `
  <h3>Hello ${name},</h3>
  <p>We have noticed that you have been absent <strong>6 times</strong> this month without sufficient permission.</p>
  <p>This is an official query and will be added to your record. Please see HR for clarification.</p>
  <p>Regards,<br/>NBC Red Auditor System</p>
`;

// GET: Monthly Attendance Check and Auto Email
router.get('/check-absences', authenticate, async (req, res) => {
  try {
    const staffId = req.staff;
    const staff = await Staff.findById(staffId);

    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Count absences for this month where no permission
    const absenceCount = await Attendance.countDocuments({
      staff: staffId,
      checkIn: { $gte: monthStart },
      status: 'Absent'
    });

    // Check for Permission — override "Absent" if staff has permission
    const hasPermission = staff.permission && staff.permission.startDate && staff.permission.endDate && new Date(staff.permission.startDate) <= now && now <= new Date(staff.permission.endDate);

    if (hasPermission) {
      return res.json({ message: 'You are currently on official permission. No action required.', absentCount: absenceCount });
    }

    // Send Warning Email at 4 absences (once per month)
    if (absenceCount >= 4 && staff.warningSentMonth !== currentMonth) {
      const warningHtml = getWarningEmailHtml(staff.name);
      await sendEmail(staff.email, '⚠️ Punctuality Warning', warningHtml);
      staff.warningSentMonth = currentMonth;
      await staff.save();
    }

    // Send Query Email at 6 absences (once per month) — copying bosses
    if (absenceCount >= 6 && staff.querySentMonth !== currentMonth) {
      const queryHtml = getQueryEmailHtml(staff.name);
      await sendEmail(
        [staff.email, 'hr@nbc.com', 'ayoafe@gmail.com', 'admin@nbc.com'],
        '🚨 Official Query: Excessive Absences',
        queryHtml
      );
      staff.querySentMonth = currentMonth;
      await staff.save();
    }

    res.json({
      message: 'Attendance check completed.',
      absentCount: absenceCount,
      warningSent: staff.warningSentMonth === currentMonth,
      querySent: staff.querySentMonth === currentMonth
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});



// ✅ Check-out
router.post('/check-out', authenticate, async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const record = await Attendance.findOne({
    staff: req.staff,
    checkIn: { $gte: today }
  });

  if (!record) return res.json({ message: "Not checked in today." });

  record.checkOut = new Date();
  await record.save();

  res.json({ message: "Checked out successfully." });
});


// ✅ Dashboard summary
// ✅ Attendance Summary (including Present & Absent counts)
router.get('/summary', authenticate, async (req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());

  const [weekCount, monthCount, yearCount, presentCount, absentCount] = await Promise.all([
    Attendance.countDocuments({ staff: req.staff, checkIn: { $gte: weekStart } }),
    Attendance.countDocuments({ staff: req.staff, checkIn: { $gte: monthStart } }),
    Attendance.countDocuments({ staff: req.staff, checkIn: { $gte: yearStart } }),
    Attendance.countDocuments({ staff: req.staff, status: 'Present', checkIn: { $gte: monthStart } }),
    Attendance.countDocuments({ staff: req.staff, status: 'Absent', checkIn: { $gte: monthStart } }),
  ]);

  res.json({
    weekAttendance: weekCount,
    monthAttendance: monthCount,
    yearAttendance: yearCount,
    timesPresent: presentCount,
    timesAbsent: absentCount
  });
});


// ✅ Attendance History (showing permission status too)
router.get('/history', authenticate, async (req, res) => {
  const records = await Attendance.find({ staff: req.staff }).sort({ checkIn: -1 });
  res.json(records);
});


// Get individual staff schedule
router.get('/my-schedule', authenticate, async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ staff: req.staff });

    if (!schedule) {
      return res.json({ message: 'No schedule found', assignedDates: [] });
    }

    res.json({
      assignedDates: schedule.assignedDates.sort((a, b) => new Date(a) - new Date(b))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.get('/presence-summary', authenticate, async (req, res) => {
  const totalDays = await Attendance.countDocuments({ staff: req.staff });

  const allStaffRecords = await Attendance.find({ staff: req.staff });

  const presentCount = allStaffRecords.length;

  // Optional: If you have a total working days number, calculate absent like:
  const staff = await Staff.findById(req.staff);
  const totalSchedules = await Schedule.find({ staff: staff._id });

  let scheduledDays = 0;
  totalSchedules.forEach(s => {
    scheduledDays += s.assignedDates.length;
  });

  const absentCount = Math.max(scheduledDays - presentCount, 0);

  res.json({
    presentCount,
    absentCount
  });
});



module.exports = router;
