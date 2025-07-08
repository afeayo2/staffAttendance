
require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require('./route/auth');
const attendanceRoutes = require('./route/attendance');
const admin = require('./route/admin');
const cron = require('node-cron');
const Staff = require('./model/Staff');

//process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error(' MongoDB connection error:', err));


app.use('/api/auth', authRoutes);
app.use('/api/admin', admin);
app.use('/api/attendance', attendanceRoutes);


// Runs every day at midnight
cron.schedule('0 0 * * *', async () => {
  const today = new Date();

  const staffWithPermissions = await Staff.find({ 'permission.endDate': { $lte: today } });

  for (const staff of staffWithPermissions) {
    if (staff.permission) {
      staff.permissionsHistory.push(staff.permission);  // Move to history
      staff.permission = null;
      staff.status = 'Active';
      await staff.save();
    }
  }

  console.log(`✅ Expired permissions cleared: ${staffWithPermissions.length} staff updated`);
});


// Get individual staff schedule
app.get('/',(req, res) => {
  res.send("welcome to Nbc Red Auditor Attendance portal")
})



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

















/*

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Attendance = require("./model/Attendance");

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error(' MongoDB connection error:', err));


    
// Define valid office locations
const allowedOffices = [
  { name: "Office 1 - Head Office", lat: 6.5244, lng: 3.3792 },
  { name: "Office 2 - Mushin", lat: 6.5005, lng: 3.3534 },
  { name: "Office 3 - Ikeja", lat: 6.62191, lng: 3.35309 }
];

// Function to check proximity
function isWithinRadius(lat1, lon1, lat2, lon2, radiusKm = 0.05) {
  const toRad = val => (val * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c <= radiusKm;
}

// API: Staff checks in
app.post("/check-in", async (req, res) => {
  const { staffName, latitude, longitude } = req.body;

  if (!staffName || !latitude || !longitude) {
    return res.status(400).json({ success: false, message: "Missing input fields." });
  }

  const matchedOffice = allowedOffices.find(office =>
    isWithinRadius(latitude, longitude, office.lat, office.lng)
  );

  if (!matchedOffice) {
    return res.status(403).json({
      success: false,
      message: "❌ You are not at a registered office location."
    });
  }

  try {
    const attendance = new Attendance({
      staffName,
      officeName: matchedOffice.name,
      latitude,
      longitude
    });

    await attendance.save();

    res.json({
      success: true,
      message: `✅ Checked in at ${matchedOffice.name}`
    });
  } catch (error) {
    console.error("Save error:", error);
    res.status(500).json({ success: false, message: "❌ Server error." });
  }
});

// Admin route to view logs
app.get("/admin/attendance", async (req, res) => {
  try {
    const records = await Attendance.find().sort({ time: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: "Server error retrieving attendance." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
*/