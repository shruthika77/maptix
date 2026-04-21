'use strict';

/**
 * Quick API test — validates all endpoints work correctly.
 * Run: node test-api.js
 */

const fetch = require('node-fetch');
const BASE = process.env.API_BASE || 'http://localhost:8000';

async function test() {
  console.log('🧪 Testing Maptix 3D Catalyst API...\n');
  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Health
  await check('GET /health', async () => {
    const res = await fetch(`${BASE}/health`);
    const data = await res.json();
    if (data.status !== 'healthy') throw new Error('Not healthy');
    if (!data.platform.includes('Catalyst')) throw new Error('Wrong platform');
  });

  // 2. Demo Generate (Prompt)
  await check('POST /v1/demo/generate (prompt)', async () => {
    const res = await fetch(`${BASE}/v1/demo/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: '3BHK apartment with living room, kitchen, 3 bedrooms, 2 bathrooms',
        building_type: 'residential',
      }),
    });
    const data = await res.json();
    if (data.status !== 'generated') throw new Error(`Status: ${data.status}`);
    if (!data.model_data) throw new Error('No model_data');
    if (!data.stats || data.stats.room_count === 0) throw new Error('No rooms generated');
    console.log(`      → ${data.stats.room_count} rooms, AI: ${data.ai_powered}`);
  });

  // 3. Demo Generate (Manual)
  await check('POST /v1/demo/generate (manual)', async () => {
    const res = await fetch(`${BASE}/v1/demo/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        building_type: 'hospital',
        floors: [{
          level: 0,
          label: 'Ground Floor',
          height_m: 3.0,
          rooms: [
            { name: 'Reception', type: 'reception', count: 1 },
            { name: 'Ward', type: 'ward', count: 2 },
            { name: 'Toilet', type: 'toilet', count: 2 },
            { name: 'Corridor', type: 'corridor', count: 1 },
          ],
        }],
        plot_width_m: 20,
        plot_length_m: 25,
      }),
    });
    const data = await res.json();
    if (data.status !== 'generated') throw new Error(`Status: ${data.status}`);
    console.log(`      → ${data.stats.room_count} rooms, ${data.stats.wall_count} walls`);
  });

  // 4. Auth Register (local dev)
  await check('POST /v1/auth/register', async () => {
    const res = await fetch(`${BASE}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test${Date.now()}@example.com`,
        password: 'test123',
        name: 'Test User',
      }),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('No access_token');
    if (data.token_type !== 'bearer') throw new Error('Wrong token type');
  });

  // 5. Auth Login (local dev)
  await check('POST /v1/auth/login', async () => {
    const res = await fetch(`${BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dev@example.com', password: 'dev123' }),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('No access_token');
  });

  // 6. 404 handling
  await check('GET /nonexistent → 404', async () => {
    const res = await fetch(`${BASE}/nonexistent`);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  // 7. Demo generate validation
  await check('POST /v1/demo/generate (empty) → 400', async () => {
    const res = await fetch(`${BASE}/v1/demo/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  console.log(`\n🏁 Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
  process.exit(failed > 0 ? 1 : 0);
}

test().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
