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

  const resetLink = `http://127.0.0.1:5500/reset-password.html?token=${resetToken}`;

const html = `
  <div style="max-width: 600px; margin: auto; font-family: Arial, sans-serif; color: #333; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
    <div style="background-color:rgb(3, 103, 3); padding: 20px; text-align: center;">
      <img src="https://i.postimg.cc/HsZ59Dx0/image.png" alt="Logo" style="max-width: 120px; height: auto; margin-bottom: 10px;" />
      <h2 style="color: #fff; margin: 0; font-weight: normal;">Reset Your Password</h2>
    </div>
    <div style="padding: 30px 20px; background: #fff;">
      <p style="font-size: 16px; line-height: 1.5;">
        You requested to reset your password. Please click the button below to proceed. <br/>
        <strong>Note:</strong> This link will expire in 15 minutes.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" 
           style="
             background-color: #ed1c16;
             color: #fff;
             text-decoration: none;
             padding: 12px 24px;
             border-radius: 5px;
             font-weight: bold;
             display: inline-block;
             font-size: 16px;
             box-shadow: 0 4px 6px rgba(0,0,0,0.1);
           ">
          Reset Password
        </a>
      </div>
      <p style="font-size: 14px; color: #555;">
        If you did not request this password reset, please ignore this email or contact support if you have questions.
      </p>
    </div>
    <div style="background-color: #f4f4f4; padding: 15px; font-size: 12px; color: #999; text-align: center;">
      &copy; ${new Date().getFullYear()} Your Company. All rights reserved.
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
