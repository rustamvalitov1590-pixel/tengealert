// Automated Auth & Isolation Verification Test
const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch(e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING TENGEALERT MULTI-USER & SECURITY VERIFICATION ---');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Register without Terms consent
    const resNoConsent = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'noconsent@test.kz',
      password: 'StrongPassword123!',
      agreed_terms: false
    });
    assert(resNoConsent.statusCode === 400 && (resNoConsent.json.error.includes('Условия') || resNoConsent.json.error.includes('соглашение')), 'Registration blocked without EULA/Privacy consent');

    // 2. Register with weak password
    const resWeakPass = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'weakpass@test.kz',
      password: '123',
      agreed_terms: true
    });
    assert(resWeakPass.statusCode === 400 && resWeakPass.json.error.includes('8'), 'Registration blocked with short password (< 8 chars)');

    // 3. Register User 1 (Almaty Streamer)
    const email1 = `almaty_${Date.now()}@streamer.kz`;
    const resReg1 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: email1,
      password: 'KzStreamerPassword2026!',
      display_name: 'Almaty Pro Streamer',
      agreed_terms: true
    });
    assert((resReg1.statusCode === 200 || resReg1.statusCode === 201) && resReg1.json.success === true, 'User 1 successfully registered');
    const user1 = resReg1.json.user;
    assert(user1 && user1.streamer_token && (user1.streamer_token.startsWith('ta_sec_') || user1.streamer_token.startsWith('ta_live_')), 'User 1 assigned isolated streamer_token');

    // 4. Duplicate registration check
    const resDup = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: email1,
      password: 'AnotherPassword123!',
      agreed_terms: true
    });
    assert(resDup.statusCode === 409, 'Duplicate registration prevented with HTTP 409');

    // 5. Register User 2 (Astana Streamer)
    const email2 = `astana_${Date.now()}@streamer.kz`;
    const resReg2 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: email2,
      password: 'AstanaStreamerPassword2026!',
      display_name: 'Astana Pro Streamer',
      agreed_terms: true
    });
    assert((resReg2.statusCode === 200 || resReg2.statusCode === 201) && resReg2.json.success === true, 'User 2 successfully registered');
    const user2 = resReg2.json.user;
    assert(user1.id !== user2.id && user1.streamer_token !== user2.streamer_token, 'Streamer tokens and user IDs are strictly isolated');

    // 6. Login wrong password
    const resWrongLogin = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: email1,
      password: 'WrongPassword999!'
    });
    assert(resWrongLogin.statusCode === 401, 'Login fails with wrong password');

    // 7. Login correct password
    const resLogin1 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: email1,
      password: 'KzStreamerPassword2026!'
    });
    assert(resLogin1.statusCode === 200 && resLogin1.json.success === true, 'Login succeeds with valid scrypt password hash');
    const cookie1 = resLogin1.headers['set-cookie'] ? resLogin1.headers['set-cookie'][0].split(';')[0] : '';
    assert(cookie1.startsWith('tenge_session='), 'Session cookie tenge_session issued upon login');

    // 8. Test /api/auth/me with session cookie
    const resMe = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/me',
      method: 'GET',
      headers: {
        'Cookie': cookie1
      }
    });
    assert(resMe.statusCode === 200 && resMe.json.user.email === email1, '/api/auth/me resolves authenticated user session');

    // 9. Push donation using User 1's secret token
    const resPush1 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TengeAlert-Key': user1.streamer_token
      }
    }, {
      notification: 'Пополнение 7 000 ₸ от Тимур К. «Для Алматы!»'
    });
    assert(resPush1.statusCode === 200 && resPush1.json.success === true, 'Donation pushed with User 1 token');

    // 10. Push donation using User 2's secret token
    const resPush2 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TengeAlert-Key': user2.streamer_token
      }
    }, {
      notification: 'Пополнение 12 000 ₸ от Динара С. «Привет Астане!»'
    });
    assert(resPush2.statusCode === 200 && resPush2.json.success === true, 'Donation pushed with User 2 token');

    // 11. Verify Isolation: User 1 history only contains User 1's donations
    const resHistory1 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/donations',
      method: 'GET',
      headers: {
        'Cookie': cookie1
      }
    });
    assert(resHistory1.statusCode === 200, 'User 1 history fetched');
    const u1Donations = Array.isArray(resHistory1.json) ? resHistory1.json : (resHistory1.json.donations || []);
    const hasU1 = u1Donations.some(d => d.amount === 7000 && d.sender.includes('Тимур'));
    const hasU2 = u1Donations.some(d => d.amount === 12000 || d.sender.includes('Динара'));
    assert(hasU1 === true, 'User 1 history correctly contains User 1 donation (7 000 ₸)');
    assert(hasU2 === false, 'CRITICAL ISOLATION: User 1 history DOES NOT contain User 2 donation (12 000 ₸)');

    // 12. Push sensitive 2FA attempt under User 1's token
    const res2FA = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TengeAlert-Key': user1.streamer_token
      }
    }, {
      notification: 'Kaspi.kz: Никому не говорите код 8492! Вход в кабинет'
    });
    assert(res2FA.statusCode === 403 && res2FA.json.dropped === true, 'Security Shield dropped 2FA push on /api/push');

    console.log(`\n========================================`);
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution exception:', err);
    process.exit(1);
  }
}

runTests();
