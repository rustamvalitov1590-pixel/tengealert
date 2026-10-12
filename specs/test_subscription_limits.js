// Automated Subscription & Limits Verification Test
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
  console.log('--- STARTING TENGEALERT SUBSCRIPTION & LIMITS VERIFICATION ---');

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
    // 1. Register new streamer
    const email = `sub_tester_${Date.now()}@streamer.kz`;
    const resReg = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email,
      password: 'StrongStreamerPassword2026!',
      display_name: 'Test Limit Streamer',
      agreed_terms: true
    });
    assert(resReg.statusCode === 200 || resReg.statusCode === 201, 'Streamer successfully registered');
    const user = resReg.json.user;
    const cookie = resReg.headers['set-cookie'] ? resReg.headers['set-cookie'][0].split(';')[0] : '';

    // 2. Fetch subscription details
    const resSub = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/subscription',
      method: 'GET',
      headers: { 'Cookie': cookie }
    });
    assert(resSub.statusCode === 200, '/api/subscription returned HTTP 200');
    const sub = resSub.json.subscription;
    assert(sub.plan_id === 'starter_free', 'New user starts on Starter Free plan');
    assert(sub.stream_limit_max === 20, 'Starter Free has limit of 20 donations');
    assert(sub.is_unlimited === false, 'Starter Free is not unlimited');
    assert(sub.stream_donations_count === 0, 'Initial stream donations count is 0');
    assert(sub.stream_limit_reached === false, 'Limit is not reached initially');

    // 3. Push 20 donations through /api/push
    console.log('Pushing 20 donations on Starter Free...');
    for (let i = 1; i <= 20; i++) {
      const resPush = await request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/push',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TengeAlert-Key': user.streamer_token
        }
      }, {
        notification: `Перевод ${1000 * i} ₸ от Донатер ${i} «Тест лимита»`
      });
      if (resPush.statusCode !== 200) {
        console.error(`Failed at donation #${i}:`, resPush.body);
      }
    }

    // 4. Verify 20 donations recorded
    const resSub20 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/subscription',
      method: 'GET',
      headers: { 'Cookie': cookie }
    });
    assert(resSub20.json.subscription.stream_donations_count === 20, 'All 20 donations recorded successfully');
    assert(resSub20.json.subscription.stream_limit_reached === true, 'Stream limit reached flag set to true');

    // 5. Push 21st donation - MUST BE BLOCKED WITH HTTP 402
    const resPush21 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TengeAlert-Key': user.streamer_token
      }
    }, {
      notification: 'Перевод 5 000 ₸ от Зритель 21 «Этот донат должен быть заблокирован»'
    });
    assert(resPush21.statusCode === 402, '21st donation correctly blocked with HTTP 402 Payment Required');
    assert(resPush21.json.limit_reached === true, 'Response contains limit_reached: true');
    assert(resPush21.json.limit === 20, 'Response mentions limit: 20');

    // 6. Test Payment Request API
    const resPayReq = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/subscription/request',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie
      }
    }, {
      plan_id: 'creator_pro'
    });
    assert(resPayReq.statusCode === 200, '/api/subscription/request returned HTTP 200');
    assert(resPayReq.json.plan.price === 4900, 'Creator Pro price is 4 900 ₸');
    assert(resPayReq.json.payment_instruction.payment_comment.startsWith('TA-'), 'Personalized payment reference code generated');

    // 7. Test invalid promo code
    const resBadPromo = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/subscription/activate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie
      }
    }, {
      promo_code: 'INVALID_CODE_999'
    });
    assert(resBadPromo.statusCode === 400, 'Invalid promo code correctly rejected with HTTP 400');

    // 8. Activate Creator Pro via promo code PROSTREAM (14-day trial)
    const resPromo = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/subscription/activate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie
      }
    }, {
      promo_code: 'PROSTREAM'
    });
    assert(resPromo.statusCode === 200 && resPromo.json.success === true, 'PROSTREAM promo code successfully activated');
    const upgradedSub = resPromo.json.subscription;
    assert(upgradedSub.plan_id === 'creator_pro', 'Plan upgraded to Creator Pro');
    assert(upgradedSub.is_unlimited === true, 'Creator Pro is unlimited');
    assert(upgradedSub.days_left >= 13, 'Creator Pro has 14 days remaining');

    // 9. Push 21st, 22nd donations now on Creator Pro - MUST SUCCEED
    const resPushNow21 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TengeAlert-Key': user.streamer_token
      }
    }, {
      notification: 'Перевод 10 000 ₸ от Зритель 21 «Теперь на Creator Pro все проходит!»'
    });
    assert(resPushNow21.statusCode === 200 && resPushNow21.json.success === true, '21st donation successfully accepted after upgrade');

    const resPushNow22 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TengeAlert-Key': user.streamer_token
      }
    }, {
      notification: 'Перевод 15 000 ₸ от Зритель 22 «Безлимит работает!»'
    });
    assert(resPushNow22.statusCode === 200 && resPushNow22.json.success === true, '22nd donation successfully accepted after upgrade');

    console.log('\n========================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================');

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

runTests();
