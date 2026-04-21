'use strict';

/**
 * Authentication Routes — Zoho Catalyst User Management
 * 
 * POST /v1/auth/register — Create a new user
 * POST /v1/auth/login    — Login and get JWT token
 */

const express = require('express');
const router = express.Router();
const { createUser, getUserByEmail } = require('../lib/datastore');
const { createToken, hashPassword, verifyPassword } = require('../lib/auth-middleware');

// ── Register ──
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ detail: 'email, password, and name are required' });
    }

    // Check if Catalyst app is available
    if (req.catalystApp) {
      // Check existing user
      const existing = await getUserByEmail(req.catalystApp, email);
      if (existing) {
        return res.status(409).json({ detail: 'Email already registered' });
      }

      // Create user in Catalyst Data Store
      const hashedPassword = hashPassword(password);
      const user = await createUser(req.catalystApp, {
        email,
        hashedPassword,
        name,
      });

      const userId = user.ROWID;
      const token = createToken({ sub: userId, email, name });

      return res.status(201).json({
        access_token: token,
        token_type: 'bearer',
        expires_in: 259200, // 72 hours
        user: {
          id: userId,
          email,
          name,
        },
      });
    }

    // Local development fallback (no Catalyst)
    const userId = `local-${Date.now()}`;
    const token = createToken({ sub: userId, email, name });

    return res.status(201).json({
      access_token: token,
      token_type: 'bearer',
      expires_in: 259200,
      user: { id: userId, email, name },
    });

  } catch (err) {
    next(err);
  }
});

// ── Login ──
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ detail: 'email and password are required' });
    }

    if (req.catalystApp) {
      const user = await getUserByEmail(req.catalystApp, email);
      if (!user) {
        return res.status(401).json({ detail: 'Invalid email or password' });
      }

      if (!verifyPassword(password, user.hashed_password)) {
        return res.status(401).json({ detail: 'Invalid email or password' });
      }

      if (user.is_active === 'false') {
        return res.status(401).json({ detail: 'User account is inactive' });
      }

      const userId = user.ROWID;
      const token = createToken({ sub: userId, email: user.email, name: user.name });

      return res.json({
        access_token: token,
        token_type: 'bearer',
        expires_in: 259200,
        user: {
          id: userId,
          email: user.email,
          name: user.name,
        },
      });
    }

    // Local development fallback
    const userId = `local-${Date.now()}`;
    const token = createToken({ sub: userId, email, name: 'Dev User' });

    return res.json({
      access_token: token,
      token_type: 'bearer',
      expires_in: 259200,
      user: { id: userId, email, name: 'Dev User' },
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
