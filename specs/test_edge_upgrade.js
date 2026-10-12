const https = require('https');
const crypto = require('crypto');

const key = crypto.randomBytes(16).toString('base64');
const req = https.request({
  host: 'speech.platform.bing.com',
  path: `/consumer/speech/synthesize/readaheadedge/v1?TrustedClientToken=6A5AA1D4EA65497283E4C34708781B28&ConnectionId=test1234`,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    'Origin': 'chrome-extension://jdiccldimpdaibfdhpkgikikfalnnchunk',
    'Upgrade': 'websocket',
    'Connection': 'Upgrade',
    'Sec-WebSocket-Key': key,
    'Sec-WebSocket-Version': '13'
  }
});

req.on('response', res => {
  console.log('HTTP response code:', res.statusCode, res.headers);
  process.exit(0);
});

req.on('upgrade', (res, socket) => {
  console.log('Successfully upgraded to WebSocket 101!');
  socket.end();
  process.exit(0);
});

req.on('error', err => {
  console.error('Req error:', err.message);
  process.exit(1);
});

req.setTimeout(4000, () => {
  console.log('Timed out');
  req.destroy();
  process.exit(1);
});

req.end();
