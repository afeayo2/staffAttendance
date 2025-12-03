const express = require('express');
const Attendance = require('../model/Attendance');
const Staff = require('../model/Staff');
const jwt = require('jsonwebtoken');
const authenticate = require('./authenticate');
const crypto = require('crypto');
const router = express.Router();
//const Schedule = require('../model/Schedule');  
const JWT_SECRET = process.env.JWT_SECRET 
const WeeklyOfficeSchedule = require('../model/WeeklyOfficeSchedule');


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
  { name: "Office 1 - Head Office", lat: 6.474748846291188, lng: 3.382474780080282 },
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
// ✅ Check-in
router.post("/check-in", authenticate, async (req, res) => {
  try {
    const staffId = req.staff;
    const { latitude, longitude, deviceId } = req.body;

    if (!latitude || !longitude || !deviceId) {
      return res.status(400).json({ message: "All fields required" });
    }

    const staff = await Staff.findById(staffId);
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    const now = new Date();
    const todayName = now.toLocaleDateString("en-US", { weekday: "long" });

    // ✅ GLOBAL schedule for everyone
    const schedule = await WeeklyOfficeSchedule.findOne().sort({ createdAt: -1 });

    if (!schedule || !schedule.days.includes(todayName)) {
      return res.status(403).json({
        message: `❌ You are NOT scheduled for today (${todayName})`,
        yourSchedule: schedule ? schedule.days : []
      });
    }

    // ✅ Prevent multiple check-ins per day
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const alreadyChecked = await Attendance.findOne({
      staff: staffId,
      checkIn: { $gte: startOfDay }
    });

    if (alreadyChecked) {
      return res.status(403).json({ message: "❌ Already checked in today" });
    }

    // ✅ Device Anti-Fraud
    const otherStaffDevice = await Staff.findOne({
      deviceId,
      _id: { $ne: staffId }
    });

    if (otherStaffDevice) {
      return res.status(403).json({
        message: "❌ This device belongs to another staff"
      });
    }

    if (staff.deviceId && staff.deviceId !== deviceId) {
      return res.status(403).json({ message: "❌ Wrong device detected" });
    }

    if (!staff.deviceId) {
      staff.deviceId = deviceId;
      await staff.save();
    }

    // ✅ Office match
    const matchedOffice = allowedOffices.find(office =>
      isWithinRadius(latitude, longitude, office.lat, office.lng)
    );

    const isInOffice = !!matchedOffice;

    // ✅ Permission check
    const hasPermission =
      staff.permission &&
      now >= new Date(staff.permission.startDate) &&
      now <= new Date(staff.permission.endDate);

// Nigeria time safety
const nigeriaTime = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
const hour = nigeriaTime.getHours();
const minute = nigeriaTime.getMinutes();

let status = "Absent";

if (hasPermission) {
  status = "Permission";
} 
else if (!isInOffice) {
  status = "Absent";
} 
else {

  // After 5pm — Absent
  if (hour >= 17) {
    status = "Absent";
  } 
  
  // 9:01am to 4:59pm — Late
  else if ((hour === 9 && minute >= 1) || (hour > 9 && hour < 17)) {
    status = "Late";
  } 
  
  // Before or at 9:00am — Present
  else {
    status = "Present";
  }
}

console.log("Check-in Time:", nigeriaTime.toLocaleTimeString());
console.log("Status Assigned:", status);


    const attendance = new Attendance({
      staff: staffId,
      checkIn: now,
      status,
      deviceId,
      officeName: matchedOffice ? matchedOffice.name : "Out of Office",
      locationStatus: matchedOffice ? "In Office" : "Not in Office"
    });

    await attendance.save();

    if (status === "Absent") {
      staff.monthlyAbsence = (staff.monthlyAbsence || 0) + 1;
      await staff.save();
    }

    return res.json({
      message: `✅ Check-in Successful: ${status}`,
      office: matchedOffice ? matchedOffice.name : "Out of Office",
      locationStatus: matchedOffice ? "In Office" : "Not in Office"
    });

  } catch (err) {
    console.error("❌ Check-in error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
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
        [staff.email, 'afeayos@gmail.com', 'abdulnafiu.abdulyakin@cchellenic.com', 'afeayosunday@gmail.com'],
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
  const { latitude, longitude } = req.body;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const record = await Attendance.findOne({
    staff: req.staff,
    checkIn: { $gte: today }
  });

  if (!record) return res.json({ message: "You did not check in today" });

  const matchedOffice = allowedOffices.find(office =>
    isWithinRadius(latitude, longitude, office.lat, office.lng)
  );

  record.checkOut = new Date();
  record.checkOutLatitude = latitude;
  record.checkOutLongitude = longitude;
  record.checkOutLocationStatus = matchedOffice ? "In Office" : "Not in Office";

  await record.save();

  res.json({ message: "Checked out successfully" });
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


router.get('/auto-mark-absent', async (req, res) => {
  const staffList = await Staff.find();

  const now = new Date();
  const today = new Date(now.setHours(0, 0, 0, 0));
  const currentHour = new Date().getHours();

  for (const staff of staffList) {
   const schedule = await WeeklyOfficeSchedule.findOne();
    if (!schedule) continue;

    const todayName = new Date().toLocaleString('en-US', { weekday: 'long' });

    // Only scheduled staff are required
    if (!schedule.daysOfWeek.includes(todayName)) continue;

    // Check if staff checked in today
    const record = await Attendance.findOne({
      staff: staff._id,
      checkIn: { $gte: today }
    });

    // They didn't check in at all today
    if (!record) {
      // If it's already 5 pm or end of day → mark absent
      if (currentHour >= 17) {
        await Attendance.create({
          staff: staff._id,
          status: "Absent",
          officeName: "No Check-In",
          checkIn: new Date(),
          checkInLocationStatus: "Absent",
        });
      }

      continue;
    }

    // If they checked in but after 5 pm → convert record to Absent
    const checkInTime = new Date(record.checkIn);
    const checkInHour = checkInTime.getHours();

    if (checkInHour >= 17) {
      record.status = "Absent";
      await record.save();
    }
  }

  res.json({ message: "Auto absent check complete with 5PM rule." });
});


module.exports = router;
