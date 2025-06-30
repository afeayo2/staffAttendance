require('dotenv').config();
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const token = req.header('Authorization');

  if (!token) {
    return res.status(401).json({ message: 'No token. Authorization denied' });
  }

  try {
    const tokenPart = token.startsWith('Bearer ')
      ? token.split(' ')[1]
      : token;

    const decoded = jwt.verify(tokenPart, process.env.JWT_SECRET);

    req.staff = decoded.id;
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: 'Token expired. Please login again.' });
    }
    res.status(400).json({ message: 'Invalid token' });
  }
};

module.exports = auth;
