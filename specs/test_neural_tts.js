// specs/test_neural_tts.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildSSML, getOrSynthesizeAudio, NEURAL_VOICES } = require('../website/server/neural_tts');

async function testNeuralTts() {
  console.log('=== STARTING MULTI-PROVIDER NEURAL TTS VERIFICATION ===\n');

  // 1. Test SSML Generation with micro-pauses (<break time="250ms"/>)
  console.log('1. Testing SSML Generation with breathing breaks...');
  const kzSsml = buildSSML({
    donor: 'Айдос',
    amountWords: 'бес мың теңге',
    message: 'Бауырым, керемет ойын!',
    lang: 'kk-KZ',
    voice: 'kk-KZ-DauletNeural'
  });
  console.log('   Kazakh SSML:\n' + kzSsml);
  assert(kzSsml.includes('<speak'), 'SSML must contain <speak');
  assert(kzSsml.includes('<break time="250ms"/>'), 'SSML must contain 250ms break');
  assert(kzSsml.includes('kk-KZ-DauletNeural'), 'SSML must specify voice');

  const ruSsml = buildSSML({
    donor: 'Дмитрий',
    amountWords: 'десять тысяч тенге',
    message: 'Красавчик, тащи турнир!',
    lang: 'ru-RU',
    voice: 'ru-RU-SvetlanaNeural'
  });
  console.log('\n   Russian SSML:\n' + ruSsml);
  assert(ruSsml.includes('ru-RU-SvetlanaNeural'), 'SSML must specify SvetlanaNeural voice');
  assert(ruSsml.includes('<break time="380ms"/>'), 'SSML must contain 380ms message break');

  // 2. Test Disk Caching Mechanism
  console.log('\n2. Testing local MP3 disk cache with simulated audio buffer...');
  const cacheDir = path.join(__dirname, '..', 'website', 'server', 'data', 'tts_cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const testPayload = {
    donor: 'ТестДонатер',
    amountWords: 'мың теңге',
    message: 'Тест кэша',
    lang: 'kk-KZ',
    provider: 'azure'
  };

  const dummyAudio = Buffer.from('ID3DummyMp3AudioContentForTestingCacheValidity1234567890'.repeat(20));
  const res = await getOrSynthesizeAudio(testPayload);
  assert(res.hash, 'Must generate deterministic MD5 cache hash');
  console.log('   Generated MD5 hash:', res.hash);

  // Write to cache and verify instant hit
  const cachePath = path.join(cacheDir, `${res.hash}.mp3`);
  fs.writeFileSync(cachePath, dummyAudio);

  const hitRes = await getOrSynthesizeAudio(testPayload);
  assert.strictEqual(hitRes.cached, true, 'Second call must hit disk cache');
  assert.strictEqual(hitRes.buffer.length, dummyAudio.length, 'Cached buffer must match');
  console.log('   ✅ Disk cache successfully validated (instant response)');

  // Clean test cache file
  if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);

  // 3. Test Fallback Mode
  console.log('\n3. Testing graceful Web Speech fallback when keys are absent...');
  const fallbackRes = await getOrSynthesizeAudio({
    donor: 'Аружан',
    amountWords: 'жиырма мың теңге',
    message: 'Керемет эфир!',
    lang: 'kk-KZ',
    provider: 'web_speech'
  });
  assert.strictEqual(fallbackRes.provider, 'web_speech');
  assert.strictEqual(fallbackRes.fallback, true);
  assert(fallbackRes.ssml, 'Must include SSML in fallback for client cadence');
  console.log('   ✅ Graceful fallback correctly formed');

  console.log('\n=== ALL NEURAL TTS TESTS PASSED (100%) ===');
}

testNeuralTts().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
