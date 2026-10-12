/**
 * TengeAlert Desktop Companion (Lightweight CLI Bridge)
 * Runs natively on Windows 10/11 using Node.js runtime.
 * Implements real-time push ingestion and automated liveness heartbeat.
 */

const http = require('http');

// Parse CLI arguments: --token=..., --server=...
let token = process.env.TENGE_TOKEN || '';
let serverUrl = process.env.TENGE_SERVER || 'http://localhost:3000';

process.argv.slice(2).forEach(arg => {
  if (arg.startsWith('--token=')) {
    token = arg.split('=')[1].trim();
  } else if (arg.startsWith('--server=')) {
    serverUrl = arg.split('=')[1].trim();
  }
});

console.log('====================================================');
console.log('   TengeAlert Windows Companion Daemon (Slash Edition)');
console.log('   Target Gateway: ' + serverUrl);
console.log('   Token: ' + (token ? token.slice(0, 8) + '...' : '(Not provided - using session fallback)'));
console.log('====================================================\n');

// 1. Liveness Heartbeat
function sendHeartbeat() {
  const payload = JSON.stringify({
    app_type: 'windows_companion',
    version: '2.5.0',
    device_info: `Windows ${process.platform} (${process.arch}) Node ${process.version}`,
    status: 'active'
  });

  const url = new URL('/api/companion/heartbeat', serverUrl);
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-TengeAlert-Key'] = token;
  }

  const req = http.request(url, {
    method: 'POST',
    headers: headers,
    timeout: 3000
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      // Heartbeat acknowledged silently
    });
  });

  req.on('error', (err) => {
    // If port 3000 fails and we haven't switched yet, test fallback port 3005
    if (serverUrl.includes(':3000') && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND')) {
      serverUrl = serverUrl.replace(':3000', ':3005');
      console.log(`[DAEMON] Switched gateway fallback to ${serverUrl}`);
    }
  });

  req.write(payload);
  req.end();
}

// Send initial heartbeat and schedule recurring every 10 seconds
sendHeartbeat();
setInterval(sendHeartbeat, 10000);

// 2. Post Notification Push to OBS
function postPush(text) {
  const payload = JSON.stringify({
    source: 'windows_companion',
    text: text
  });

  const url = new URL('/api/push', serverUrl);
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-TengeAlert-Key'] = token;
  }

  const req = http.request(url, {
    method: 'POST',
    headers: headers
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`[STATUS ${res.statusCode}] Forwarded push to OBS gateway: ${data}`);
    });
  });

  req.on('error', (err) => {
    console.error(`[ERROR] Failed to connect to ${serverUrl}: ${err.message}`);
  });

  req.write(payload);
  req.end();
}

// Sample test notifications
const samples = [
  'Перевод 5 000 ₸ от Данияр К. с сообщением «Красавчик, тащи стрим!»',
  'Пополнение 10 000 ₸ от Азамат Б. с сообщением «На новый микрофон»',
  'Вам поступил перевод 2 500 ₸ от Аружан С. «Удачи в игре»',
  'Перевод: +7 000.00 KZT от ASSET B. Доступно: 50 000 KZT',
  'Пополнение карты *1234 на 4 000 KZT от DANIYAR K.'
];

console.log('[READY] Companion running & heartbeat active. Type 1-5 for test pushes, or enter notification text:');

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  const line = chunk.trim();
  if (!line) return;

  const num = parseInt(line, 10);
  if (num >= 1 && num <= samples.length) {
    console.log(`\n[SEND] Sample #${num}: ${samples[num - 1]}`);
    postPush(samples[num - 1]);
  } else {
    console.log(`\n[SEND] Custom text: ${line}`);
    postPush(line);
  }
});
