const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  officeName: { type: String, required: true },
  latitude: Number,
  longitude: Number,
  checkIn: { type: Date },
  checkOut: { type: Date }
});

module.exports = mongoose.model('Attendance', attendanceSchema);
