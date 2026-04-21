'use strict';

/**
 * Local Development Server
 * 
 * Runs the Catalyst Advanced I/O function as a standalone Express server
 * for local development and testing WITHOUT the Catalyst CLI.
 * 
 * In production, Catalyst runs index.js directly.
 * For local dev, this server wraps it with port listening.
 * 
 * Usage: node server.js
 */

const app = require('./index');

const PORT = process.env.PORT || 8000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Maptix 3D Catalyst API running on http://localhost:${PORT}`);
  console.log(`   Platform: Zoho Catalyst (local dev mode)`);
  console.log(`   Health:   http://localhost:${PORT}/health`);
  console.log(`   Docs:     No Catalyst context — using local fallbacks`);
  console.log(`   AI:       Cloudflare Workers AI (Meta Llama 3)\n`);
  console.log(`   Endpoints:`);
  console.log(`   POST /v1/auth/register`);
  console.log(`   POST /v1/auth/login`);
  console.log(`   POST /v1/demo/generate         (no auth)`);
  console.log(`   POST /v1/demo/generate/upload   (no auth)`);
  console.log(`   GET  /v1/projects`);
  console.log(`   POST /v1/projects`);
  console.log(`   POST /v1/projects/:id/files`);
  console.log(`   POST /v1/projects/:id/process`);
  console.log(`   GET  /v1/projects/:id/model`);
  console.log(`   GET  /v1/projects/:id/export?format=svg|json\n`);
});
