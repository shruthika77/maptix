'use strict';

/**
 * Maptix 3D — Zoho Catalyst Advanced I/O Function
 * 
 * Replaces the entire FastAPI backend with Zoho Catalyst serverless:
 * - Catalyst Data Store → replaces SQLite
 * - Catalyst File Store → replaces local filesystem
 * - Catalyst Authentication → replaces JWT
 * - Express.js router → replaces FastAPI endpoints
 * - Cloudflare Workers AI (Meta Llama 3) → kept for AI generation
 * 
 * All endpoints served under /server/maptix_api/*
 */

const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const multer = require('multer');

// Route handlers
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const demoGenerateRoutes = require('./routes/demo-generate');
const fileRoutes = require('./routes/files');
const processingRoutes = require('./routes/processing');
const modelRoutes = require('./routes/models');
const exportRoutes = require('./routes/export');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Middleware ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS (Catalyst handles this, but add for local dev)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Attach Catalyst app to every request
app.use((req, res, next) => {
  try {
    req.catalystApp = catalyst.initialize(req);
  } catch (err) {
    // For local development without Catalyst context
    req.catalystApp = null;
  }
  next();
});

// ── Health Check ──
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'maptix-3d-catalyst-api',
    version: '2.0.0',
    platform: 'Zoho Catalyst',
    database: 'Catalyst Data Store',
    storage: 'Catalyst File Store',
    ai: 'Cloudflare Workers AI (Meta Llama 3)',
    processing: 'Serverless Functions',
  });
});

// ── API Routes ──

// Auth (Catalyst user management)
app.use('/v1/auth', authRoutes);

// Projects CRUD (Catalyst Data Store)
app.use('/v1/projects', projectRoutes);

// Demo generation — NO AUTH (AI + layout engine)
app.use('/v1/demo/generate', demoGenerateRoutes(upload));

// File upload (Catalyst File Store)  
app.use('/v1/projects/:projectId/files', fileRoutes(upload));

// Processing pipeline
app.use('/v1/projects/:projectId', processingRoutes);

// Spatial model
app.use('/v1/projects/:projectId/model', modelRoutes);

// Export
app.use('/v1/projects/:projectId/export', exportRoutes);

// ── Error Handler ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    detail: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// ── 404 Handler ──
app.use((req, res) => {
  res.status(404).json({ detail: `Route not found: ${req.method} ${req.path}` });
});

module.exports = app;
