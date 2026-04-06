const jwt = require('jsonwebtoken');
const { normalizeAppRole } = require('../lib/system-rules');

const JWT_SECRET = process.env.JWT_SECRET || 'fuhrpark-demo-secret';

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token && req.query.token) {
    token = req.query.token;
  }

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
    const actorRole = normalizeAppRole(req.user?.rolle);
    const normalizedRoles = roles.map((role) => normalizeAppRole(role));
    const roleGranted = normalizedRoles.includes(actorRole)
      || actorRole === 'superadmin'
      || (actorRole === 'hauptadmin' && normalizedRoles.includes('hauptadmin'))
      || (actorRole === 'lagerleiter' && (normalizedRoles.includes('admin') || normalizedRoles.includes('abteilungsleiter')));
    if (!req.user || !roleGranted) {
      return res.status(403).json({ error: 'Keine Berechtigung.' });
    }
    next();
  };
}

function signUser(user) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '8h' });
}

module.exports = { authRequired, requireRoles, signUser };
