const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fuhrpark-demo-secret';

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Nicht authentifiziert.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Ungültiges Token.' });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rolle)) {
      return res.status(403).json({ error: 'Keine Berechtigung.' });
    }
    next();
  };
}

function signUser(user) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '8h' });
}

module.exports = { authRequired, requireRoles, signUser };
