const mongoose = require('mongoose');

const weeklyOfficeScheduleSchema = new mongoose.Schema({
  weekStart: { type: Date, required: true },  
  days: [{ type: String, required: true }],   // Example: ["Saturday", "Monday", "Friday"]
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WeeklyOfficeSchedule', weeklyOfficeScheduleSchema);
