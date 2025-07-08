const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  officeName: { type: String },
  latitude: Number,
  longitude: Number,
  deviceId: String,
  checkIn: Date,
  checkOut: Date,
  status: { type: String, enum: ['Present', 'Absent'], default: 'Present' },
  locationStatus: { type: String, enum: ["In Office", "Not in Office"], default: "In Office" }
});

module.exports = mongoose.model('Attendance', attendanceSchema);
