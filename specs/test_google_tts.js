// specs/test_google_tts.js
const https = require('https');

function testGoogleTts(text, lang) {
  return new Promise((resolve, reject) => {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    }, res => {
      console.log('Google TTS status:', res.statusCode);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        console.log('Buffer length:', buf.length, 'bytes');
        resolve(buf);
      });
    }).on('error', reject);
  });
}

testGoogleTts('Салам бәріне, бес мың теңге', 'kk')
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
