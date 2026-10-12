// specs/test_theme_engine.js
// Automated verification for TengeAlert 4-Theme Engine
const http = require('http');

const BASE_URL = 'http://localhost:3000';
let sessionCookie = '';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    if (sessionCookie) reqHeaders['Cookie'] = sessionCookie;
    if (body && typeof body === 'object') {
      reqHeaders['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    const req = http.request(url, {
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      if (res.headers['set-cookie']) {
        const raw = res.headers['set-cookie'][0];
        sessionCookie = raw.split(';')[0];
      }
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING TENGEALERT THEME ENGINE TESTS ===\n');

  // 1. Auth streamer session
  console.log('1. Authenticating as demo streamer...');
  const testEmail = 'tester_theme@tengealert.kz';
  const testPassword = 'Password12345!';
  let authRes = await request('POST', '/api/auth/login', {
    email: testEmail,
    password: testPassword
  });

  if (!authRes.body || !authRes.body.success) {
    console.log('   User not found, registering new test user...');
    authRes = await request('POST', '/api/auth/register', {
      email: testEmail,
      password: testPassword,
      displayName: 'Theme Tester Streamer',
      agreedToTerms: true
    });
  }

  console.log('   Auth status:', authRes.status, 'Success:', authRes.body ? authRes.body.success : false);
  if (!authRes.body || !authRes.body.success) throw new Error('Auth failed: ' + JSON.stringify(authRes.body));

  // 2. Fetch current settings
  console.log('\n2. Fetching current user settings...');
  const getSettings = await request('GET', '/api/user/settings');
  console.log('   Settings response:', getSettings.status, getSettings.body);
  if (!getSettings.body.settings || !getSettings.body.settings.theme) {
    throw new Error('settings.theme missing');
  }
  console.log('   Current theme:', getSettings.body.settings.theme);

  // 3. Test changing theme to each of the 4 supported themes
  const themesToTest = ['esports_hud', 'industrial', 'liquid_glass', 'neo_nomad'];
  for (const theme of themesToTest) {
    console.log(`\n3. Testing switch to "${theme}"...`);
    const updateRes = await request('POST', '/api/user/settings', { theme });
    console.log('   Update status:', updateRes.status, 'Theme:', updateRes.body.settings.theme);
    if (updateRes.body.settings.theme !== theme) {
      throw new Error(`Theme failed to update to ${theme}`);
    }
  }

  // 4. Test invalid theme rejection
  console.log('\n4. Testing rejection of invalid theme...');
  const invalidRes = await request('POST', '/api/user/settings', { theme: 'non_existent_theme' });
  console.log('   Invalid theme status:', invalidRes.status, 'Error:', invalidRes.body.error);
  if (invalidRes.status !== 400) {
    throw new Error('Invalid theme was not rejected with 400');
  }

  // 5. Test sending a test alert and verify theme inheritance
  console.log('\n5. Setting theme to "esports_hud" and sending test donation...');
  await request('POST', '/api/user/settings', { theme: 'esports_hud' });

  const testDonation = await request('POST', '/api/donations/test', {
    username: 'Alikhan_KZ',
    amount: 15000,
    message: 'Салам бәріне! Жаңа HUD темасы от екен!'
  });
  console.log('   Donation status:', testDonation.status, 'Result:', testDonation.body);
  if (!testDonation.body.success || testDonation.body.donation.theme !== 'esports_hud') {
    throw new Error('Test donation did not inherit active user theme');
  }

  // 6. Test setting theme to "liquid_glass" and sending test donation
  console.log('\n6. Setting theme to "liquid_glass" and sending test donation...');
  await request('POST', '/api/user/settings', { theme: 'liquid_glass' });
  const testDonation2 = await request('POST', '/api/donations/test', {
    username: 'Aigerim_VIP',
    amount: 50000,
    message: 'Керемет стрим! Өте әдемі визуал!'
  });
  console.log('   Donation status:', testDonation2.status, 'Result:', testDonation2.body);
  if (!testDonation2.body.success || testDonation2.body.donation.theme !== 'liquid_glass') {
    throw new Error('Test donation did not inherit liquid_glass theme');
  }

  // 7. Reset back to 'neo_nomad' default
  await request('POST', '/api/user/settings', { theme: 'neo_nomad' });
  console.log('\n7. Successfully reset theme to default neo_nomad.');

  console.log('\n=== ALL THEME ENGINE TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
