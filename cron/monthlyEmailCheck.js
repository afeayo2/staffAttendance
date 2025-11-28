// cron/monthlyEmailCheck.js
const cron = require('node-cron');
const Staff = require('../model/Staff');
const Attendance = require('../model/Attendance');
const sendEmail = require('../utils/mailer');   

// Email HTML templates
const getWarningEmailHtml = (name) => `
  <h3>Hello ${name},</h3>
  <p>You have been absent <strong>4 times</strong> this month.</p>
  <p>Please improve your punctuality and attendance.</p>
  <p>Recommended video: <a href="https://www.youtube.com/watch?v=Q3HcGp8n7JI">How to Improve Punctuality</a></p>
`;

const getQueryEmailHtml = (name) => `
  <h3>Hello ${name},</h3>
  <p>You have been absent <strong>6 times</strong> this month.</p>
  <p>This is an official query. Contact HR immediately.</p>
`;

cron.schedule('5 12 * * *', async () => {
  console.log("📧 Running Monthly Absence Email Cron...");

  try {
    const allStaff = await Staff.find();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    for (const staff of allStaff) {
      const absences = await Attendance.countDocuments({
        staff: staff._id,
        checkIn: { $gte: monthStart },
        status: "Absent",
      });

      // Check permission override
      const hasPermission =
        staff.permission &&
        new Date(staff.permission.startDate) <= now &&
        now <= new Date(staff.permission.endDate);

      if (hasPermission) continue;

      // Send warning email
      if (absences >= 4 && staff.warningSentMonth !== currentMonth) {
        await sendEmail(
          staff.email,
          "⚠️ Attendance Warning",
          getWarningEmailHtml(staff.name)
        );

        staff.warningSentMonth = currentMonth;
        await staff.save();
      }

      // Send query email
      if (absences >= 6 && staff.querySentMonth !== currentMonth) {
        await sendEmail(
          [staff.email, "hr@nbc.com", "ayoafe@gmail.com", "admin@nbc.com"],
          "🚨 Official Query: Excessive Absences",
          getQueryEmailHtml(staff.name)
        );

        staff.querySentMonth = currentMonth;
        await staff.save();
      }
    }

    console.log("✅ Monthly Email Cron Completed.");
  } catch (err) {
    console.error("❌ Monthly Email Cron Error:", err);
  }
});
