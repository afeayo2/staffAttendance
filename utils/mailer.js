/*const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: 'mail.greatfutureinternationalnurseryandprimaryschool.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.CPANEL_EMAIL,
    pass: process.env.CPANEL_EMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false // This disables certificate validation
  }
});

const sendEmail = async (to, subject, html) => {
  const mailOptions = {
    from: `"NBC Auditors Attendance Portal" <${process.env.CPANEL_EMAIL}>`,
    to,
    subject,
    html
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info.response);
  } catch (error) {
    console.error('❌ Error sending email:', error);
  }
};

module.exports = sendEmail;
*/






const nodemailer = require("nodemailer");

// Configure SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,          // change from 465
  secure: false,      // false for STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Function to send email
const sendEmail = async ({ to, subject, html }) => {
  try {
    const info = await transporter.sendMail({
      from: `"NBC Auditors Attendance Portal" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log("✅ Email sent:", info.response);
    return info;
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
};

module.exports = sendEmail;



