const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Leave', 'Official', 'Sickness', 'Emergency', 'Suspension'],
    required: true
  },
  reason: String,
  startDate: Date,
  endDate: Date
});

const staffSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  permission: permissionSchema, 
  permissionsHistory: [permissionSchema],  // Past permissions
  status: {
    type: String,
    enum: ['Active', 'On Leave', 'On Official Duty', 'Sick', 'Suspended'],
    default: 'Active'
  },
  warningSentMonth: { type: String, default: null },  // e.g. '2025-07'
  querySentMonth: { type: String, default: null },    // e.g. '2025-07'
  monthlyAbsence: { type: Number, default: 0 }        // ✅ NEW: Tracks monthly absences
});

module.exports = mongoose.model('Staff', staffSchema);
