'use strict';

/**
 * Zoho Catalyst Authentication Middleware
 * 
 * Two auth strategies:
 * 1. Catalyst User Management (production) — uses Catalyst's built-in user auth
 * 2. Custom JWT (development fallback) — simple HMAC JWT for local testing
 * 
 * The middleware extracts the user from the Authorization header and
 * attaches it to req.user.
 */

const crypto = require('crypto');
const { getUserById } = require('./datastore');

const JWT_SECRET = process.env.JWT_SECRET || 'maptix-catalyst-dev-secret';
const JWT_ALGORITHM = 'HS256';

/**
 * Create a simple HMAC-SHA256 JWT (no external dependency needed)
 */
function createToken(payload, expiresInHours = 72) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + (expiresInHours * 3600),
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(tokenPayload));
  const signature = hmacSign(`${headerB64}.${payloadB64}`, JWT_SECRET);

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Decode and verify a JWT token
 */
function decodeToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signature] = parts;
    const expectedSig = hmacSign(`${headerB64}.${payloadB64}`, JWT_SECRET);

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(base64urlDecode(payloadB64));
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Hash a password using SHA-256 + salt
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash
 */
function verifyPassword(password, storedHash) {
  try {
    const [salt, hash] = storedHash.split(':');
    const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === testHash;
  } catch (err) {
    return false;
  }
}

/**
 * Express middleware: require authentication
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);

  // Try Catalyst user token first
  if (req.catalystApp) {
    try {
      const userManagement = req.catalystApp.userManagement();
      // Catalyst handles token verification internally
      // For Advanced I/O, the user context is available from the request
      const catalystUser = req.catalystApp.userManagement().getCurrentUser;
      if (catalystUser) {
        req.user = {
          id: catalystUser.user_id || catalystUser.ROWID,
          email: catalystUser.email_id,
          name: catalystUser.first_name || 'User',
        };
        return next();
      }
    } catch (err) {
      // Fall through to JWT
    }
  }

  // Fall back to custom JWT
  const payload = decodeToken(token);
  if (!payload) {
    return res.status(401).json({ detail: 'Invalid or expired token' });
  }

  req.user = {
    id: payload.sub,
    email: payload.email,
    name: payload.name || 'User',
  };
  next();
}

// ── Helpers ──

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

function hmacSign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

module.exports = {
  createToken,
  decodeToken,
  hashPassword,
  verifyPassword,
  requireAuth,
};
