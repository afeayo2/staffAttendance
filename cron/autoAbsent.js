const cron = require('node-cron');
const Attendance = require('../model/Attendance');
const Staff = require('../model/Staff');
const Schedule = require('../model/Schedule');

cron.schedule('5 17 * * *', async () => {
  console.log("Running daily absence auto-check...");

  const today = new Date();
  const todayStart = new Date(today.setHours(0,0,0,0));

  const staffList = await Staff.find({ status: "Active" });

  for (const staff of staffList) {
    const schedule = await Schedule.findOne({ staff: staff._id });

    const isScheduledToday = schedule?.assignedDates?.some(date =>
      new Date(date).toDateString() === new Date().toDateString()
    );

    if (!isScheduledToday) continue;

    const hasCheckIn = await Attendance.findOne({
      staff: staff._id,
      checkIn: { $gte: todayStart }
    });

    if (!hasCheckIn) {
      await Attendance.create({
        staff: staff._id,
        status: "Absent",
      });
    }
  }

  console.log("Daily absence task completed.");
});
