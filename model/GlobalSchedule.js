const mongoose = require('mongoose');

const globalScheduleSchema = new mongoose.Schema({
  days: [String],  // e.g. ["Monday", "Wednesday", "Friday"]
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GlobalSchedule', globalScheduleSchema);
