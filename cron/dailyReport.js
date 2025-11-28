// cron/dailyReport.js
const cron = require('node-cron');
const Attendance = require('../model/Attendance');
const Staff = require('../model/Staff');
const sendEmail = require('../utils/mailer');

cron.schedule("0 18 * * *", async () => {
  console.log("📊 Running daily attendance report...");

  try {
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));

    const allStaff = await Staff.find();
    const records = await Attendance.find({ checkIn: { $gte: today } }).populate("staff");

    const present = records.filter(r => r.status === "Present" || r.status === "Late");
    const absent = await Staff.countDocuments() - present.length;
    const late = records.filter(r => r.status === "Late");
    const afterFive = records.filter(r => new Date(r.checkIn).getHours() >= 17);

    const html = `
      <h2>📅 Daily Attendance Report</h2>
      <p><strong>Total Staff:</strong> ${allStaff.length}</p>
      <p><strong>Present:</strong> ${present.length}</p>
      <p><strong>Absent:</strong> ${absent}</p>
      <p><strong>Late:</strong> ${late.length}</p>
      <p><strong>Checked in after 5 PM:</strong> ${afterFive.length}</p>

      <h3>Late Staff:</h3>
      ${late.map(l => `<p>${l.staff.name} - ${l.checkIn}</p>`).join("")}

      <h3>Checked in After 5 PM:</h3>
      ${afterFive.map(a => `<p>${a.staff.name} - ${a.checkIn}</p>`).join("")}
    `;

    await sendEmail(
      ["admin@nbc.com", "hr@nbc.com", "ayoafe@gmail.com"],
      "📊 Daily Attendance Report",
      html
    );

    console.log("✅ Daily report sent.");

  } catch (err) {
    console.error("❌ Daily Report Error:", err);
  }
});
