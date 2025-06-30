const jwt = require('jsonwebtoken');
require('dotenv').config();

const adminAuth = (req, res, next) => {
  const token = req.header('Authorization');

  if (!token) {
    return res.status(401).json({ message: 'No token. Authorization denied' });
  }

  try {
    const tokenPart = token.startsWith('Bearer ') ? token.split(' ')[1] : token;
    const decoded = jwt.verify(tokenPart, process.env.JWT_SECRET);

    req.admin = decoded.id;
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    res.status(400).json({ message: 'Invalid or expired token' });
  }
};

module.exports = adminAuth;
