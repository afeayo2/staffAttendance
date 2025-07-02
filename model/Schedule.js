const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  startDate: Date,
  endDate: Date,
  daysPerWeek: Number,  // e.g., 3 days per week
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Schedule', scheduleSchema);
