require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Staff = require('../model/Staff');
const sendEmail = require('../utils/mailer'); 

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// ✅ Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await Staff.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const staff = new Staff({ name, email, password: hashed });
    await staff.save();

    res.json({ message: "User registered successfully" });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const staff = await Staff.findOne({ email });
    if (!staff) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: staff._id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      staff: {
        id: staff._id,
        name: staff.name,
        email: staff.email
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});




// ✅ Forgot Password (Send Reset Link)
router.post('/forgot-password', async (req, res) => {  
  const { email } = req.body;

  const user = await Staff.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const resetToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '15m' });

  const resetLink = `https://rednauditors-attendance-log.onrender.com/reset-password.html?token=${resetToken}`;

const html = `
  <div style="max-width:600px; margin:auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#333; border:1px solid #ddd; border-radius:10px; overflow:hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    <div style="background-color:#036703; padding:25px 20px; text-align:center;">
      <img src="https://i.postimg.cc/HsZ59Dx0/image.png" alt="Logo" width="130" height="auto" style="display:block; margin:0 auto 15px; object-fit: contain;" />
      <h2 style="color:#fff; margin:0; font-weight:600; font-size:1.8rem;">Reset Your Password</h2>
    </div>
    <div style="background:#fff; padding:35px 25px 40px; font-size:16px; line-height:1.6; color:#444;">
      <p>You requested to reset your password. Please click the button below to proceed.</p>
      <p><strong>Note:</strong> This link will expire in 15 minutes.</p>
      <div style="text-align:center; margin: 35px 0;">
        <a href="${resetLink}" target="_blank" rel="noopener noreferrer"
          style="
            background-color:#ed1c16;
            color:#fff;
            text-decoration:none;
            padding:14px 28px;
            border-radius:6px;
            font-weight:700;
            font-size:16px;
            display:inline-block;
            box-shadow: 0 5px 10px rgba(237,28,22,0.4);
            transition: background-color 0.3s ease;
          "
          onmouseover="this.style.backgroundColor='#c71512'"
          onmouseout="this.style.backgroundColor='#ed1c16'"
        >
          Reset Password
        </a>
      </div>
      <p style="font-size:14px; color:#666; margin-top:0;">
        If you did not request this password reset, please ignore this email or contact support if you have questions.
      </p>
    </div>
    <div style="background:#f4f4f4; padding:15px; font-size:12px; color:#999; text-align:center;">
      &copy; ${new Date().getFullYear()} NBC Red Auditor Attendance Portal. All rights reserved.
    </div>
  </div>
`;

  await sendEmail(email, 'Password Reset Request', html);

  res.json({ message: "Password reset link sent to your email" });
});

// ✅ Reset Password (Complete Reset)
router.post('/reset-password', async (req, res) => { 
  const { token, newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await Staff.findById(decoded.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ message: "Password reset successful" });

  } catch (error) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }
});


module.exports = router;
