const express = require('express');
const Attendance = require('../model/Attendance');
const Staff = require('../model/Staff');
const jwt = require('jsonwebtoken');
const authenticate = require('./authenticate');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET // Use dotenv in production

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
  { name: "Office 2 - Mushin", lat: 6.544980, lng:3.354078 },
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
  const { latitude, longitude } = req.body;

  const matchedOffice = allowedOffices.find(office =>
    isWithinRadius(latitude, longitude, office.lat, office.lng)
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await Attendance.findOne({
    staff: req.staff,
    checkIn: { $gte: today }
  });

  if (existing) {
    return res.json({ message: "You have already checked in today. Kindly audit with conscience." });
  }

  const record = new Attendance({
    staff: req.staff,
    officeName: matchedOffice ? matchedOffice.name : "Unknown Location",
    latitude,
    longitude,
    locationStatus: matchedOffice ? "In Office" : "Not in Office",
    checkIn: new Date()
  });

  await record.save();

  res.json({
    message: "Welcome. Kindly audit with conscience today."
  });
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
router.get('/summary', authenticate, async (req, res) => {
  const now = new Date();

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const [weekCount, monthCount, yearCount] = await Promise.all([
    Attendance.countDocuments({ staff: req.staff, checkIn: { $gte: startOfWeek } }),
    Attendance.countDocuments({ staff: req.staff, checkIn: { $gte: startOfMonth } }),
    Attendance.countDocuments({ staff: req.staff, checkIn: { $gte: startOfYear } }),
  ]);

  res.json({
    weekAttendance: weekCount,
    monthAttendance: monthCount,
    yearAttendance: yearCount
  });
});

// ✅ Get attendance history
router.get('/history', authenticate, async (req, res) => {
  const records = await Attendance.find({ staff: req.staff }).sort({ checkIn: -1 });
  res.json(records);
});

module.exports = router;
