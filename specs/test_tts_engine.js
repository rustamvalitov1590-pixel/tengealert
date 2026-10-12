// specs/test_tts_engine.js
// Automated verification for TengeAlert Dual-Language TTS Engine
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

async function runTtsEngineTests() {
  console.log('=== STARTING TENGEALERT DUAL-LANGUAGE TTS ENGINE TESTS ===\n');

  // 1. Authenticate streamer
  console.log('1. Authenticating streamer session...');
  const testEmail = 'tts_tester@tengealert.kz';
  const testPass = 'Password12345!';
  let authRes = await request('POST', '/api/auth/login', { email: testEmail, password: testPass });
  if (!authRes.body || !authRes.body.success) {
    authRes = await request('POST', '/api/auth/register', {
      email: testEmail,
      password: testPass,
      displayName: 'TTS Pro Streamer',
      agreedToTerms: true
    });
  }
  console.log('   Auth status:', authRes.status, 'Success:', authRes.body ? authRes.body.success : false);
  if (!authRes.body || !authRes.body.success) throw new Error('Auth failed');

  // 2. Test /api/tts/normalize endpoint with Kazakh phrase
  console.log('\n2. Testing /api/tts/normalize with Kazakh text and letters...');
  const normKzRes = await request('POST', '/api/tts/normalize', {
    sender: 'Бауыржан',
    amount: 5000,
    message: 'Салам бәріне! Керемет стрим, алға бауырым!'
  });
  console.log('   Kazakh normalization:', normKzRes.status, normKzRes.body);
  if (normKzRes.body.lang !== 'kk-KZ') throw new Error('Expected lang kk-KZ for Kazakh letters');
  if (normKzRes.body.amountSpoken !== 'бес мың теңге') throw new Error('Expected "бес мың теңге"');
  if (!normKzRes.body.speechText.includes('бес мың теңге')) throw new Error('speechText must contain spoken amount');

  // 3. Test /api/tts/normalize endpoint with Russian phrase
  console.log('\n3. Testing /api/tts/normalize with Russian text...');
  const normRuRes = await request('POST', '/api/tts/normalize', {
    sender: 'Александр',
    amount: 15000,
    message: 'Красавчик, тащи катку на турнире!'
  });
  console.log('   Russian normalization:', normRuRes.status, normRuRes.body);
  if (normRuRes.body.lang !== 'ru-RU') throw new Error('Expected lang ru-RU');
  if (normRuRes.body.amountSpoken !== 'пятнадцать тысяч тенге') throw new Error('Expected "пятнадцать тысяч тенге"');

  // 4. Test /api/tts/normalize with spam repetition
  console.log('\n4. Testing anti-spam character reduction...');
  const normSpamRes = await request('POST', '/api/tts/normalize', {
    sender: 'Спамер',
    amount: 1000,
    message: 'аааааааааааааааааааа топ!!!!!!!!!!! заходи https://evil-site.kz'
  });
  console.log('   Sanitized spam message:', normSpamRes.body.cleanMessage);
  if (normSpamRes.body.cleanMessage.includes('https://')) throw new Error('URL was not removed');
  if (normSpamRes.body.cleanMessage.includes('ааа')) throw new Error('Repeated characters were not collapsed');

  // 5. Update user TTS settings
  console.log('\n5. Updating TTS settings in streamer profile...');
  const updateSettingsRes = await request('POST', '/api/user/settings', {
    tts_enabled: true,
    tts_min_amount: 1000,
    tts_voice_kz: 'daulet',
    tts_voice_ru: 'svetlana',
    tts_rate: 1.15
  });
  console.log('   Settings update status:', updateSettingsRes.status, updateSettingsRes.body.settings);
  if (updateSettingsRes.body.settings.tts_min_amount !== 1000) throw new Error('tts_min_amount mismatch');
  if (updateSettingsRes.body.settings.tts_voice_kz !== 'daulet') throw new Error('tts_voice_kz mismatch');
  if (updateSettingsRes.body.settings.tts_rate !== 1.15) throw new Error('tts_rate mismatch');

  // 6. Test donation creation with automatic TTS generation
  console.log('\n6. Triggering test donation and verifying attached TTS payload...');
  const testDonationRes = await request('POST', '/api/donations/test', {
    sender: 'Айгүл С.',
    amount: 25000,
    message: 'Өте әдемі визуал мен тамаша көңіл-күй!'
  });
  console.log('   Donation status:', testDonationRes.status, 'Donation TTS:', testDonationRes.body.donation.tts);
  const donationTts = testDonationRes.body.donation.tts;
  if (!donationTts) throw new Error('Donation is missing tts payload');
  if (donationTts.lang !== 'kk-KZ') throw new Error('Expected kk-KZ for Kazakh message');
  if (donationTts.amountSpoken !== 'жиырма бес мың теңге') throw new Error('Expected "жиырма бес мың теңге"');

  console.log('\n=== ALL DUAL-LANGUAGE TTS ENGINE TESTS PASSED (100%) ===');
}

runTtsEngineTests().catch(err => {
  console.error('\n❌ TTS ENGINE TEST SUITE FAILED:', err);
  process.exit(1);
});
