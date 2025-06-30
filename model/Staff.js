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
  permission: permissionSchema, // Active permission
  status: {
    type: String,
    enum: ['Active', 'On Leave', 'On Official Duty', 'Sick', 'Suspended'],
    default: 'Active'
  }
});

module.exports = mongoose.model('Staff', staffSchema);
