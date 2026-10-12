/**
 * TengeAlert - Multi-User Core Real-Time Engine & Gateway
 * Independent, Clean Room Architecture (Zero external dependencies, latency < 5ms)
 * Multi-User Auth, PS.kz Plesk / MySQL compatibility, Multi-tenant OBS isolation.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const auth = require('./auth');
const { parseNotification } = require('../../specs/test_parsers');
const { isSecurityOrAuthAlert, sanitizeFinancialText, escapeHtml, censorProfanity } = require('../../specs/security_sanitizer');
const ttsNormalizer = require('./tts_normalizer');
const neuralTts = require('./neural_tts');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT_DIR, '..');
const TOKEN_FILE = path.join(__dirname, 'secret_token.txt');

// Ensure master default streamer exists for local seamless testing
let masterToken = '';
try {
  if (fs.existsSync(TOKEN_FILE)) {
    masterToken = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  }
} catch (e) {}

if (!masterToken) {
  masterToken = 'ta_sec_' + crypto.randomBytes(8).toString('hex');
  try {
    fs.writeFileSync(TOKEN_FILE, masterToken, 'utf8');
  } catch (e) {}
}

let defaultUser = db.findUserByToken(masterToken);
if (!defaultUser) {
  defaultUser = db.findUserByEmail('streamer@tengealert.kz');
  if (!defaultUser) {
    defaultUser = db.createUser({
      email: 'streamer@tengealert.kz',
      display_name: 'Asset Streamer',
      auth_provider: 'email'
    });
    // Set matching token
    defaultUser.streamer_token = masterToken;
    db.saveUsers ? db.saveUsers() : null;
  }
}

// Active multi-tenant SSE and WS connections: Set of { res/socket, userId }
const sseClients = new Set();
const wsClients = new Set();
const companionStatus = new Map(); // userId -> { online: boolean, last_ping: number, platform: string, device: string, ip: string }

function broadcastEvent(event, data, targetUserId = null) {
  const payloadStr = JSON.stringify(data);

  // 1. SSE broadcast (filtered by targetUserId if specified)
  const sseMsg = `event: ${event}\ndata: ${payloadStr}\n\n`;
  for (const client of sseClients) {
    if (targetUserId && client.userId && client.userId !== targetUserId) {
      continue;
    }
    try {
      client.res.write(sseMsg);
    } catch (err) {
      sseClients.delete(client);
    }
  }

  // 2. WebSocket broadcast
  for (const client of wsClients) {
    if (targetUserId && client.userId && client.userId !== targetUserId) {
      continue;
    }
    try {
      sendWsFrame(client.socket, JSON.stringify({ event, data }));
    } catch (err) {
      wsClients.delete(client);
    }
  }
}

function sendWsFrame(socket, text) {
  const payload = Buffer.from(text, 'utf8');
  let header;

  if (payload.length <= 125) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

function getSessionUser(req) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['cookie']) {
    const match = req.headers['cookie'].match(/tenge_session=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) return null;
  const userId = auth.verifySessionToken(token);
  if (!userId) return null;

  return db.findUserById(userId);
}

// HTTP Request Handler
async function handleRequest(req, res) {
  // Global Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-TengeAlert-Key, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // ==========================================
  // 1. AUTHENTICATION ROUTES
  // ==========================================

  // Register with Email
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const result = await auth.registerWithEmail(payload);

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `tenge_session=${result.sessionToken}; Path=/; Max-Age=604800; SameSite=Lax`
        });
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (err) {
        res.writeHead(err.statusCode || 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Login with Email
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const result = await auth.loginWithEmail(payload);

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `tenge_session=${result.sessionToken}; Path=/; Max-Age=604800; SameSite=Lax`
        });
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (err) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Get Current Authenticated User (Session status)
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = getSessionUser(req) || defaultUser;
    if (user) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        authenticated: true,
        user: auth.sanitizeUser(user),
        token: user.streamer_token
      }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ authenticated: false }));
    }
    return;
  }

  // Social Auth Demo Handler (Google / Apple ID)
  if (pathname === '/api/auth/social/demo' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const result = await auth.handleSocialLogin(payload);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `tenge_session=${result.sessionToken}; Path=/; Max-Age=604800; SameSite=Lax`
        });
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Logout
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'tenge_session=; Path=/; Max-Age=0; SameSite=Lax'
    });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Get User Settings
  if (pathname === '/api/user/settings' && req.method === 'GET') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const defaultSettings = {
      theme: 'neo_nomad',
      sound: 'nomad',
      tts_enabled: true,
      tts_min_amount: 500,
      tts_voice_kz: 'auto',
      tts_voice_ru: 'auto',
      tts_rate: 1.0,
      tts_pitch: 1.0
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      settings: { ...defaultSettings, ...(user.settings || {}) },
      token: user.streamer_token
    }));
    return;
  }

  // Update User Settings (Theme, Sound, TTS, etc.)
  if (pathname === '/api/user/settings' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = parsedUrl.searchParams.get('token');
        const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;

        const allowedThemes = ['neo_nomad', 'esports_hud', 'industrial', 'liquid_glass'];
        const updates = {};
        if (payload.theme) {
          if (!allowedThemes.includes(payload.theme)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Недопустимая тема: ${payload.theme}. Доступные темы: ${allowedThemes.join(', ')}` }));
            return;
          }
          updates.theme = payload.theme;
        }
        if (payload.sound !== undefined) updates.sound = String(payload.sound);
        if (payload.tts_enabled !== undefined) updates.tts_enabled = Boolean(payload.tts_enabled);
        if (payload.tts_min_amount !== undefined) updates.tts_min_amount = Math.max(0, parseInt(payload.tts_min_amount, 10) || 0);
        if (payload.tts_voice_kz !== undefined) updates.tts_voice_kz = String(payload.tts_voice_kz);
        if (payload.tts_voice_ru !== undefined) updates.tts_voice_ru = String(payload.tts_voice_ru);
        if (payload.tts_rate !== undefined) updates.tts_rate = Math.max(0.5, Math.min(2.0, parseFloat(payload.tts_rate) || 1.0));
        if (payload.tts_pitch !== undefined) updates.tts_pitch = Math.max(0.5, Math.min(1.8, parseFloat(payload.tts_pitch) || 1.0));

        const updatedSettings = db.updateUserSettings(user.id, updates);

        // Broadcast real-time settings change to open OBS widgets
        broadcastEvent('theme_updated', { theme: updatedSettings.theme, settings: updatedSettings }, user.id);
        broadcastEvent('tts_settings_updated', { settings: updatedSettings }, user.id);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, settings: updatedSettings }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Normalize text for Natural TTS
  if (pathname === '/api/tts/normalize' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const normalized = ttsNormalizer.normalizeForTTS({
          sender: payload.sender,
          amount: payload.amount,
          message: payload.message,
          langOverride: payload.lang
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...normalized }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Stream or generate studio-grade Neural MP3 audio (Edge Neural TTS)
  if (pathname === '/api/tts/audio' && (req.method === 'GET' || req.method === 'POST')) {
    const id = parsedUrl.searchParams.get('id');
    const hash = parsedUrl.searchParams.get('hash');
    const textParam = parsedUrl.searchParams.get('text');
    const langParam = parsedUrl.searchParams.get('lang');
    const voiceParam = parsedUrl.searchParams.get('voice');

    // 1. Direct hash lookup from disk cache
    if (hash && /^[a-f0-9]{32}$/i.test(hash)) {
      const cachePath = path.join(neuralTts.CACHE_DIR, `${hash}.mp3`);
      if (fs.existsSync(cachePath)) {
        const stat = fs.statSync(cachePath);
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': stat.size,
          'Cache-Control': 'public, max-age=604800, immutable'
        });
        fs.createReadStream(cachePath).pipe(res);
        return;
      }
    }

    // 2. Lookup by donation ID or preview text
    let textToSpeak = textParam || '';
    let speechLang = langParam || 'kk-KZ';
    let speechVoice = voiceParam || 'auto';
    let donorName = '';
    let amountWords = '';
    let donorMsg = '';

    if (id) {
      const donation = db.findDonationById(id);
      if (donation) {
        donorName = donation.sender || 'Аноним';
        donorMsg = donation.message || '';
        const norm = donation.tts || ttsNormalizer.normalizeForTTS({
          sender: donation.sender,
          amount: donation.amount,
          message: donation.message
        });
        speechLang = norm.lang || (/[әіңғүұқөһ]/i.test(donorMsg) ? 'kk-KZ' : 'ru-RU');
        amountWords = norm.amountSpoken || `${donation.amount} тенге`;
        const user = db.findUserById(donation.user_id) || defaultUser;
        speechVoice = speechLang === 'kk-KZ' ? (user.settings?.tts_voice_kz || 'kk-KZ-DauletNeural') : (user.settings?.tts_voice_ru || 'ru-RU-SvetlanaNeural');
      }
    }

    if (!donorName && !textToSpeak) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing donation id or text parameter' }));
      return;
    }

    try {
      const synthResult = await neuralTts.getOrSynthesizeAudio({
        donor: donorName || 'Стример',
        amountWords: amountWords || '',
        message: donorMsg || textToSpeak,
        lang: speechLang,
        voice: speechVoice
      });

      if (synthResult.buffer && synthResult.buffer.length > 512) {
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': synthResult.buffer.length,
          'Cache-Control': 'public, max-age=604800, immutable'
        });
        res.end(synthResult.buffer);
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Neural TTS generation unavailable', fallback: true }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ==========================================
  // 2. REAL-TIME EVENT STREAMS (OBS & STUDIO)
  // ==========================================

  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    // Identify user by query token or session
    const token = parsedUrl.searchParams.get('token');
    let clientUser = token ? db.findUserByToken(token) : getSessionUser(req);
    if (!clientUser) clientUser = defaultUser;

    res.write(`data: ${JSON.stringify({ event: 'connected', time: Date.now(), user_id: clientUser?.id })}\n\n`);

    const clientObj = { res, userId: clientUser?.id };
    sseClients.add(clientObj);

    req.on('close', () => {
      sseClients.delete(clientObj);
    });
    return;
  }

  // Health check API
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      product: 'TengeAlert',
      status: 'ok',
      timestamp: new Date().toISOString(),
      active_sse_clients: sseClients.size,
      active_ws_clients: wsClients.size,
      hosting: 'PS.kz Ready',
      jurisdiction: 'Republic of Kazakhstan'
    }));
    return;
  }

  // Security status and streamer token info
  if (pathname === '/api/security/info') {
    const user = getSessionUser(req) || defaultUser;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      token: user ? user.streamer_token : masterToken,
      security_shield: 'active',
      two_factor_filter: 'enabled',
      privacy_mode: 'local_zero_telemetry',
      jurisdiction: 'Republic of Kazakhstan'
    }));
    return;
  }

  // Goal data endpoint
  if (pathname === '/api/goal') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const userGoal = db.getUserGoal(user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(userGoal));
    return;
  }

  // Streamer Profile (Requisites, Branding, Socials)
  if (pathname === '/api/user/profile' && req.method === 'GET') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const profile = db.getUserProfile(user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, profile }));
    return;
  }

  if (pathname === '/api/user/profile' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = parsedUrl.searchParams.get('token');
        const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
        const updated = db.updateUserProfile(user.id, payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, profile: updated }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // PUBLIC STREAMER & DONATION API (DaLink / Donatty)
  // ==========================================

  // Get Public Streamer Info (Slug or ID)
  if (pathname.startsWith('/api/public/streamer') && req.method === 'GET') {
    let slug = pathname.replace(/^\/api\/public\/streamer\/?/, '').trim();
    if (!slug) {
      slug = parsedUrl.searchParams.get('slug') || parsedUrl.searchParams.get('streamer') || '';
    }
    const publicProfile = db.getUserPublicProfile(slug);
    if (!publicProfile) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Стример не найден' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({ success: true, streamer: publicProfile }));
    return;
  }

  // Public Donation from Viewer (with instant OBS notification)
  if (pathname.startsWith('/api/public/donate') && req.method === 'POST') {
    let slug = pathname.replace(/^\/api\/public\/donate\/?/, '').trim();
    if (!slug) {
      slug = parsedUrl.searchParams.get('slug') || parsedUrl.searchParams.get('streamer') || '';
    }

    let targetUser = slug ? (db.findUserBySlug(slug) || db.findUserById(slug)) : null;
    if (!targetUser) targetUser = defaultUser;

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 32768) req.destroy();
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');

        // Security Shield: Drop 2FA / Password leaks
        const rawMsg = String(payload.message || '').trim();
        if (isSecurityOrAuthAlert(rawMsg)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Обнаружен недопустимый конфиденциальный текст.' }));
          return;
        }

        // Subscription Limit Check
        const limitCheck = db.checkStreamDonationLimit(targetUser.id);
        if (!limitCheck.allowed) {
          res.writeHead(402, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: limitCheck.message || 'Лимит донатов для стримера временно исчерпан.',
            limit_reached: true
          }));
          return;
        }

        const minAmount = targetUser.profile?.moderation?.min_donation_amount || 100;
        const amount = Math.max(minAmount, parseInt(payload.amount, 10) || minAmount);

        let cleanMsg = rawMsg;
        if (targetUser.profile?.moderation?.profanity_filter !== false && cleanMsg) {
          cleanMsg = censorProfanity(cleanMsg);
        }

        const refCode = payload.ref_code || `TA-${Math.floor(1000 + Math.random() * 9000)}`;
        const senderName = String(payload.sender || 'Аноним').trim().slice(0, 32) || 'Аноним';

        const donationRecord = {
          user_id: targetUser.id,
          source_label: payload.bank || 'Kaspi QR ₸',
          amount: amount,
          currency: 'KZT',
          sender: escapeHtml(senderName),
          message: escapeHtml(cleanMsg),
          ref_code: refCode,
          sound: targetUser.settings?.sound || 'nomad',
          theme: targetUser.settings?.theme || 'neo_nomad'
        };

        // TTS Normalization if enabled & above threshold
        const ttsMin = targetUser.settings?.tts_min_amount !== undefined ? targetUser.settings.tts_min_amount : 500;
        if (targetUser.settings?.tts_enabled !== false && amount >= ttsMin && cleanMsg) {
          donationRecord.tts = ttsNormalizer.normalizeForTTS({
            sender: donationRecord.sender,
            amount: donationRecord.amount,
            message: donationRecord.message
          });
        }

        const saved = db.addDonation(donationRecord);

        // Deduplication guard: ignore double-taps
        if (saved.is_duplicate) {
          console.log(`[DEDUP] Duplicate public donation ignored for user ${targetUser.id} (${saved.duplicate_reason || 'duplicate'})`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            duplicate: true,
            donation: saved,
            ref_code: refCode,
            message: 'Дубликат доната успешно распознан и пропущен без повторного алерта.'
          }));
          return;
        }

        saved.tts_audio_url = `/api/tts/audio?id=${encodeURIComponent(saved.id)}`;

        // Pre-generate studio neural audio in background
        if (saved.tts) {
          const speechVoice = saved.tts.lang === 'kk-KZ'
            ? (targetUser.settings?.tts_voice_kz || 'kk-KZ-DauletNeural')
            : (targetUser.settings?.tts_voice_ru || 'ru-RU-SvetlanaNeural');
          neuralTts.getOrSynthesizeAudio({
            donor: saved.sender,
            amountWords: saved.tts.amountSpoken,
            message: saved.message,
            lang: saved.tts.lang,
            voice: speechVoice
          }).catch(() => {});
        }

        const currentGoal = db.getUserGoal(targetUser.id);

        // Real-time broadcast to OBS and Studio
        broadcastEvent('donation', saved, targetUser.id);
        broadcastEvent('goal_update', currentGoal, targetUser.id);

        // Check Donation Battle
        const battleChoice = payload.battle_side || saved.message;
        const battleRes = db.addBattleScore(targetUser.id, battleChoice, saved.amount);
        if (battleRes) {
          broadcastEvent('battle_update', {
            battle: battleRes.battle,
            matchedSide: battleRes.matchedSide,
            sideName: battleRes.sideName,
            donation: saved
          }, targetUser.id);
        }

        // Check Wheel of Fortune
        const userWheel = db.getUserWheel(targetUser.id);
        if (userWheel.enabled && saved.amount >= userWheel.min_amount) {
          const sectors = userWheel.sectors || [];
          if (sectors.length > 0) {
            const sIdx = Math.floor(Math.random() * sectors.length);
            broadcastEvent('wheel_spin', {
              sector: sectors[sIdx],
              sector_index: sIdx,
              total_sectors: sectors.length,
              donor: saved.sender,
              amount: saved.amount,
              message: saved.message,
              timestamp: new Date().toISOString()
            }, targetUser.id);
          }
        }

        // Broadcast Top Donors and Ticker live updates
        broadcastEvent('top_update', { top_donors: db.getUserTopDonors(targetUser.id, { limit: 10 }) }, targetUser.id);
        broadcastEvent('ticker_update', db.getTickerData(targetUser.id), targetUser.id);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          donation: saved,
          ref_code: refCode,
          message: 'Донат успешно отправлен в прямой эфир!'
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Ошибка обработки доната' }));
      }
    });
    return;
  }

  // ==========================================
  // MULTI-GOALS MANAGEMENT API
  // ==========================================

  // 1. Get All Goals for User
  if (pathname === '/api/goals' && req.method === 'GET') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const goalsList = db.getUserGoals(user.id);
    const activeGoal = db.getUserGoal(user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, goals: goalsList, active_goal: activeGoal }));
    return;
  }

  // 2. Create Goal
  if (pathname === '/api/goals/create' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = parsedUrl.searchParams.get('token');
        const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
        const newGoal = db.createGoal(user.id, payload);

        if (newGoal.is_active) {
          broadcastEvent('goal_update', newGoal, user.id);
        }

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, goal: newGoal, goals: db.getUserGoals(user.id) }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 3. Activate Goal for OBS
  if (pathname === '/api/goals/activate' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = parsedUrl.searchParams.get('token');
        const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
        const goalId = payload.goal_id || payload.id;
        if (!goalId) throw new Error('Missing goal_id');

        const activeGoal = db.setActiveGoal(user.id, goalId);
        broadcastEvent('goal_update', activeGoal, user.id);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, active_goal: activeGoal, goals: db.getUserGoals(user.id) }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. Update Goal (Supports legacy /api/goal and /api/goal/update)
  if ((pathname === '/api/goals/update' || pathname === '/api/goal/update' || pathname === '/api/goal') && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = parsedUrl.searchParams.get('token');
        const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
        const updatedGoal = db.updateUserGoal(user.id, payload);

        broadcastEvent('goal_update', updatedGoal, user.id);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, goal: updatedGoal, goals: db.getUserGoals(user.id) }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 5. Delete Goal
  if (pathname === '/api/goals/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = parsedUrl.searchParams.get('token');
        const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
        const goalId = payload.goal_id || payload.id;
        if (!goalId) throw new Error('Missing goal_id');

        db.deleteGoal(user.id, goalId);
        const activeGoal = db.getUserGoal(user.id);
        broadcastEvent('goal_update', activeGoal, user.id);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, active_goal: activeGoal, goals: db.getUserGoals(user.id) }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // ADVANCED ANALYTICS OVERVIEW API
  // ==========================================
  if (pathname === '/api/analytics/overview' && req.method === 'GET') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const period = parsedUrl.searchParams.get('period') || '7d';

    const analyticsData = db.getAdvancedAnalytics(user.id, period);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, ...analyticsData }));
    return;
  }

  // ==========================================
  // COMPANION PUSH AGENT (HEARTBEAT & STATUS)
  // ==========================================
  if (pathname === '/api/companion/heartbeat' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = req.headers['x-tengealert-key'] || parsedUrl.searchParams.get('token');
        const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;

        const info = {
          online: true,
          last_ping: Date.now(),
          platform: payload.platform || 'windows',
          device_name: payload.device_name || 'Stream PC / Android',
          version: payload.version || '1.0.0',
          ip: req.socket.remoteAddress || ''
        };
        companionStatus.set(user.id, info);

        broadcastEvent('companion_status', info, user.id);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: info }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/companion/status' && req.method === 'GET') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;

    const info = companionStatus.get(user.id);
    const isOnline = info ? (Date.now() - info.last_ping < 90000) : false;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      online: isOnline,
      last_ping: info?.last_ping || null,
      platform: info?.platform || null,
      device_name: info?.device_name || null,
      version: info?.version || null
    }));
    return;
  }

  // Streamer Control Deck: Skip, Clear, Replay
  if (pathname === '/api/streamer/skip-alert' && req.method === 'POST') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    broadcastEvent('skip_alert', { timestamp: new Date().toISOString() }, user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Текущий алерт пропущен' }));
    return;
  }

  if (pathname === '/api/streamer/clear-screen' && req.method === 'POST') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    broadcastEvent('clear_screen', { timestamp: new Date().toISOString() }, user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Экран OBS очищен' }));
    return;
  }

  if (pathname === '/api/streamer/replay-last' && req.method === 'POST') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const result = db.getUserDonations(user.id, { limit: 1 });
    const lastDonation = (result.donations && result.donations.length > 0) ? result.donations[0] : null;
    if (lastDonation) {
      broadcastEvent('replay_last', lastDonation, user.id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Повтор последнего алерта', donation: lastDonation }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Нет предыдущих донатов' }));
    }
    return;
  }

  // Wheel of Fortune API (Рулетка челленджей)
  if (pathname === '/api/widgets/wheel' && req.method === 'GET') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const wheel = db.getUserWheel(user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, wheel }));
    return;
  }

  if (pathname === '/api/widgets/wheel' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = parsedUrl.searchParams.get('token');
        const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
        const updated = db.updateUserWheel(user.id, payload);
        broadcastEvent('wheel_settings_updated', updated, user.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, wheel: updated }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/widgets/wheel/spin' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = parsedUrl.searchParams.get('token');
        const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
        const wheel = db.getUserWheel(user.id);
        const sectors = wheel.sectors || ['Челлендж 1', 'Челлендж 2'];
        const sIndex = Math.floor(Math.random() * sectors.length);
        const selectedSector = sectors[sIndex];

        const spinEvent = {
          sector: selectedSector,
          sector_index: sIndex,
          total_sectors: sectors.length,
          donor: payload.donor || 'Стример (Ручной запуск)',
          amount: payload.amount || wheel.min_amount || 1000,
          message: payload.message || 'Крутим рулетку!',
          timestamp: new Date().toISOString()
        };

        broadcastEvent('wheel_spin', spinEvent, user.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, spin: spinEvent }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Donation Battle API (Донат-битва)
  if (pathname === '/api/widgets/battle' && req.method === 'GET') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const battle = db.getUserBattle(user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, battle }));
    return;
  }

  if (pathname === '/api/widgets/battle' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = parsedUrl.searchParams.get('token');
        const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
        const updated = db.updateUserBattle(user.id, payload);
        broadcastEvent('battle_update', { battle: updated }, user.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, battle: updated }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/widgets/battle/reset' && req.method === 'POST') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const reset = db.resetBattle(user.id);
    broadcastEvent('battle_update', { battle: reset, reset: true }, user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, battle: reset, message: 'Счет битвы сброшен' }));
    return;
  }

  // Top Donors API (Топ спонсоров)
  if (pathname === '/api/donations/top' && req.method === 'GET') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const period = parsedUrl.searchParams.get('period') || 'all';
    const limit = parseInt(parsedUrl.searchParams.get('limit'), 10) || 5;
    const topDonors = db.getUserTopDonors(user.id, { period, limit });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, period, top_donors: topDonors }));
    return;
  }

  // Ticker / Sub-bar Data API
  if (pathname === '/api/widgets/ticker' && req.method === 'GET') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const ticker = db.getTickerData(user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, ...ticker }));
    return;
  }

  // Export Donations to CSV (UTF-8 BOM for Excel)
  if (pathname === '/api/donations/export/csv' && req.method === 'GET') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const period = parsedUrl.searchParams.get('period') || 'all';
    const bank = parsedUrl.searchParams.get('bank') || 'all';
    const search = parsedUrl.searchParams.get('search') || '';

    const result = db.getUserDonations(user.id, { period, bank, search, limit: 10000 });
    const list = result.donations || [];

    const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += 'ID;Дата и время;Отправитель;Сумма (₸);Валюта;Банк / Источник;Сообщение\r\n';

    list.forEach(d => {
      const dDate = new Date(d.received_at).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' });
      csvContent += `${escapeCsv(d.id)};${escapeCsv(dDate)};${escapeCsv(d.sender)};${d.amount};${escapeCsv(d.currency || 'KZT')};${escapeCsv(d.source_label)};${escapeCsv(d.message)}\r\n`;
    });

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tengealert_donations_${Date.now()}.csv"`
    });
    res.end(csvContent);
    return;
  }

  // Delete single donation by ID
  const deleteDonationMatch = pathname.match(/^\/api\/donations\/([a-zA-Z0-9_-]+)$/);
  if (deleteDonationMatch && req.method === 'DELETE') {
    const donationId = deleteDonationMatch[1];
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;

    const ok = db.deleteDonation(user.id, donationId);
    if (ok) {
      broadcastEvent('donation_deleted', { id: donationId }, user.id);
      broadcastEvent('goal_update', db.getUserGoal(user.id), user.id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Донат успешно удален' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Донат не найден' }));
    }
    return;
  }

  // Streamer Stats
  if (pathname === '/api/stats') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const stats = db.getUserStats(user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;
  }

  // Donations feed and search
  if ((pathname === '/api/donations/recent' || pathname === '/api/donations') && req.method === 'GET') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;

    // Check if query params provided
    const period = parsedUrl.searchParams.get('period');
    const bank = parsedUrl.searchParams.get('bank');
    const search = parsedUrl.searchParams.get('search');
    const page = parsedUrl.searchParams.get('page');
    const limit = parsedUrl.searchParams.get('limit') || 50;

    if (period || bank || search || page || pathname === '/api/donations') {
      const data = db.getUserDonations(user.id, {
        period: period || 'all',
        bank: bank || 'all',
        search: search || '',
        limit: parseInt(limit, 10) || 50,
        page: parseInt(page, 10) || 1
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...data }));
      return;
    }

    const recent = db.getUserDonations(user.id, 50);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(recent));
    return;
  }

  // Purge / Clear donation history
  if ((pathname === '/api/donations/clear' || pathname === '/api/donations') && (req.method === 'POST' || req.method === 'DELETE')) {
    const user = getSessionUser(req) || defaultUser;
    const count = db.clearUserDonations(user.id);

    broadcastEvent('donations_cleared', { timestamp: new Date().toISOString() }, user.id);
    broadcastEvent('goal_update', db.getUserGoal(user.id), user.id);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'История донатов очищена', count }));
    return;
  }

  // ==========================================
  // 2.5 SUBSCRIPTION & BILLING ENGINE
  // ==========================================

  // Get current subscription status
  if (pathname === '/api/subscription' && req.method === 'GET') {
    const token = parsedUrl.searchParams.get('token');
    const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
    const sub = db.getUserSubscription(user.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, subscription: sub }));
    return;
  }

  // Request payment / upgrade invoice
  if (pathname === '/api/subscription/request' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = parsedUrl.searchParams.get('token');
        const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
        const planId = payload.plan_id || 'creator_pro';
        const plans = db.getPlans();
        const selectedPlan = plans[planId];
        if (!selectedPlan) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Недопустимый тариф: ${planId}` }));
          return;
        }

        const refCode = `TA-${user.id.replace('usr_', '').substring(0, 4).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          plan: selectedPlan,
          payment_instruction: {
            bank: 'Kaspi Bank (Перевод / Kaspi QR)',
            amount: selectedPlan.price,
            currency: 'KZT',
            payment_comment: refCode,
            requisites: {
              kaspi_number: '+7 (707) 830-58-15',
              recipient_name: 'Рустам М. (TengeAlert Finance)'
            },
            steps: [
              `Откройте приложение Kaspi.kz -> Переводы -> Клиенту Kaspi`,
              `Укажите номер +7 (707) 830-58-15 и сумму ${selectedPlan.price} ₸`,
              `ОБЯЗАТЕЛЬНО укажите в сообщении к переводу: ${refCode}`,
              `После перевода введите код в поле активации или дождитесь автозачисления`
            ]
          }
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Activate plan via promo code or transaction reference
  if (pathname === '/api/subscription/activate' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = parsedUrl.searchParams.get('token');
        const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;

        let updatedSub;
        if (payload.promo_code) {
          updatedSub = db.applyPromoCode(user.id, payload.promo_code);
        } else if (payload.plan_id) {
          const durationDays = parseInt(payload.duration_days, 10) || 30;
          updatedSub = db.upgradeUserSubscription(user.id, payload.plan_id, durationDays, payload.payment_ref);
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Укажите promo_code или plan_id' }));
          return;
        }

        broadcastEvent('subscription_updated', { subscription: updatedSub }, user.id);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Тариф ${updatedSub.plan_name} успешно активирован!`,
          subscription: updatedSub
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // REVIEWS API (STREAMER FEEDBACK & COMMUNITY)
  // ==========================================

  if (pathname === '/api/reviews') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        reviews: db.getReviews ? db.getReviews() : []
      }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 32768) req.destroy();
      });

      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const savedReview = db.addReview(payload);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'Отзыв успешно принят и сохранен!',
            review: savedReview
          }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Ошибка добавления отзыва' }));
        }
      });
      return;
    }
  }

  // ==========================================
  // 2.5 DOWNLOAD RELEASES API
  // ==========================================

  if (pathname.startsWith('/api/download/')) {
    const target = pathname.replace('/api/download/', '').toLowerCase();
    let fileName = 'TengeAlert-Setup.exe';
    let mime = 'application/octet-stream';
    let localPath = path.join(REPO_ROOT, 'apps', 'windows', 'reference', 'legacy_sample.exe');

    if (target === 'android' || target === 'apk') {
      fileName = 'TengeAlert-Companion-v1.1.4.apk';
      mime = 'application/vnd.android.package-archive';
      localPath = path.join(REPO_ROOT, 'apps', 'android', 'reference', 'legacy_sample.apk');
    } else if (target === 'windows-portable' || target === 'zip') {
      fileName = 'TengeAlert-Portable-v1.2.0.exe';
      mime = 'application/octet-stream';
      localPath = path.join(REPO_ROOT, 'apps', 'windows', 'reference', 'legacy_sample.exe');
    }

    if (fs.existsSync(localPath)) {
      try {
        const stat = fs.statSync(localPath);
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Cache-Control': 'public, max-age=86400'
        });
        fs.createReadStream(localPath).pipe(res);
        return;
      } catch (err) {
        console.error('[DOWNLOAD] Error streaming binary:', err);
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Release file not found on server' }));
    return;
  }

  // ==========================================
  // 3. INCOMING PUSH FROM CLIENT COMPANION
  // ==========================================

  if ((pathname === '/api/push' || pathname === '/api/donations/incoming') && req.method === 'POST') {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > 10240) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Payload Too Large (max 10 KB)' }));
      return;
    }

    const reqToken = req.headers['x-tengealert-key'] ||
      (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : '') ||
      parsedUrl.searchParams.get('token');

    // Match target streamer by token or fallback to master default
    let targetUser = reqToken ? db.findUserByToken(reqToken) : null;
    const clientIp = req.socket.remoteAddress || '';
    const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';

    if (!targetUser) {
      if (isLocalhost) {
        targetUser = defaultUser;
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing X-TengeAlert-Key' }));
        return;
      }
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10240) req.destroy();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const rawNotification = data.raw_text || data.text || data.notification || '';

        // Security Shield: Drop 2FA / Passwords / OTP
        if (isSecurityOrAuthAlert(rawNotification)) {
          console.warn('[SECURITY SHIELD] Dropped sensitive 2FA/Auth push.');
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Security Drop: 2FA or Authentication alert detected and blocked.',
            dropped: true
          }));
          return;
        }

        // Subscription Limit Gate (Max 20 donations on Starter Free)
        const limitCheck = db.checkStreamDonationLimit(targetUser.id);
        if (!limitCheck.allowed) {
          console.warn(`[LIMIT REACHED] Stream donation limit reached for user ${targetUser.id} (${limitCheck.count}/${limitCheck.limit})`);
          broadcastEvent('limit_reached', {
            plan_id: limitCheck.plan,
            count: limitCheck.count,
            limit: limitCheck.limit,
            message: limitCheck.message || 'Лимит тарифа Starter Free (20 донатов) исчерпан.'
          }, targetUser.id);

          res.writeHead(402, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: limitCheck.message || 'Payment Required: Лимит донатов на тарифе Starter Free исчерпан (20/20). Для продолжения перейдите на Creator Pro.',
            limit_reached: true,
            plan_id: limitCheck.plan,
            count: limitCheck.count,
            limit: limitCheck.limit
          }));
          return;
        }

        let donationPayload;

        if (data.parsed && data.parsed.amount) {
          donationPayload = {
            user_id: targetUser.id,
            source_label: escapeHtml(data.source_label || 'Перевод ₸'),
            amount: parseInt(data.parsed.amount, 10) || 0,
            currency: 'KZT',
            sender: escapeHtml(data.parsed.sender || 'Аноним'),
            message: escapeHtml(data.parsed.message || ''),
            raw_text: sanitizeFinancialText(rawNotification),
            sound: data.sound || targetUser.settings?.sound || 'nomad',
            theme: data.theme || targetUser.settings?.theme || 'neo_nomad'
          };
        } else if (rawNotification && !data.amount) {
          const parsed = parseNotification(rawNotification, data.package_name || data.source);
          if (!parsed || parsed.rejected) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Could not parse notification text' }));
            return;
          }
          donationPayload = {
            user_id: targetUser.id,
            source_label: 'Мгновенный перевод ₸',
            amount: parsed.amount,
            currency: 'KZT',
            sender: parsed.sender,
            message: parsed.message,
            raw_text: parsed.raw_text,
            sound: data.sound || targetUser.settings?.sound || 'nomad',
            theme: data.theme || targetUser.settings?.theme || 'neo_nomad'
          };
        } else {
          donationPayload = {
            user_id: targetUser.id,
            source_label: escapeHtml(data.source_label || 'Перевод ₸'),
            amount: parseInt(data.amount, 10) || 0,
            currency: data.currency || 'KZT',
            sender: escapeHtml(data.sender || 'Аноним'),
            message: escapeHtml(data.message || ''),
            raw_text: sanitizeFinancialText(rawNotification),
            sound: data.sound || targetUser.settings?.sound || 'nomad',
            theme: data.theme || targetUser.settings?.theme || 'neo_nomad'
          };
        }

        const profanityActive = targetUser.profile?.moderation?.profanity_filter !== false;
        if (profanityActive && donationPayload.message) {
          donationPayload.message = censorProfanity(donationPayload.message);
        }

        donationPayload.tts = ttsNormalizer.normalizeForTTS({
          sender: donationPayload.sender,
          amount: donationPayload.amount,
          message: donationPayload.message
        });

        donationPayload.notification_id = data.notification_id || data.id || null;
        donationPayload.post_time = data.post_time || null;
        donationPayload.idempotency_key = data.idempotency_key || (data.notification_id && data.post_time ? `${data.notification_id}_${data.post_time}` : null);

        const savedRecord = db.addDonation(donationPayload);

        // Deduplication guard: ignore retransmitted pushes
        if (savedRecord.is_duplicate) {
          console.log(`[DEDUP] Duplicate push ignored for user ${targetUser.id} (${savedRecord.duplicate_reason || 'duplicate'})`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            duplicate: true,
            donation: savedRecord,
            message: 'Duplicate push safely acknowledged without duplicate alert.'
          }));
          return;
        }

        savedRecord.tts_audio_url = `/api/tts/audio?id=${encodeURIComponent(savedRecord.id)}`;

        // Pre-generate studio neural audio in background
        if (savedRecord.tts) {
          const speechVoice = savedRecord.tts.lang === 'kk-KZ'
            ? (targetUser.settings?.tts_voice_kz || 'kk-KZ-DauletNeural')
            : (targetUser.settings?.tts_voice_ru || 'ru-RU-SvetlanaNeural');
          neuralTts.getOrSynthesizeAudio({
            donor: savedRecord.sender,
            amountWords: savedRecord.tts.amountSpoken,
            message: savedRecord.message,
            lang: savedRecord.tts.lang,
            voice: speechVoice
          }).catch(() => {});
        }

        const currentGoal = db.getUserGoal(targetUser.id);

        broadcastEvent('donation', savedRecord, targetUser.id);
        broadcastEvent('goal_update', currentGoal, targetUser.id);

        // Check Wheel of Fortune auto-trigger
        const userWheel = db.getUserWheel(targetUser.id);
        if (userWheel.enabled && savedRecord.amount >= userWheel.min_amount) {
          const sectors = userWheel.sectors || [];
          if (sectors.length > 0) {
            const sIdx = Math.floor(Math.random() * sectors.length);
            broadcastEvent('wheel_spin', {
              sector: sectors[sIdx],
              sector_index: sIdx,
              total_sectors: sectors.length,
              donor: savedRecord.sender,
              amount: savedRecord.amount,
              message: savedRecord.message,
              timestamp: new Date().toISOString()
            }, targetUser.id);
          }
        }

        // Check Donation Battle keywords
        const battleRes = db.addBattleScore(targetUser.id, savedRecord.message, savedRecord.amount);
        if (battleRes) {
          broadcastEvent('battle_update', {
            battle: battleRes.battle,
            matchedSide: battleRes.matchedSide,
            sideName: battleRes.sideName,
            donation: savedRecord
          }, targetUser.id);
        }

        // Broadcast Top Donors and Ticker live updates
        broadcastEvent('top_update', { top_donors: db.getUserTopDonors(targetUser.id, { limit: 10 }) }, targetUser.id);
        broadcastEvent('ticker_update', db.getTickerData(targetUser.id), targetUser.id);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, donation: savedRecord }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Trigger test donation
  if (pathname === '/api/donations/test' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let custom = {};
      try { custom = JSON.parse(body || '{}'); } catch(e) {}

      const token = parsedUrl.searchParams.get('token');
      const user = (token ? db.findUserByToken(token) : getSessionUser(req)) || defaultUser;
      const sampleNames = ['Азамат Б.', 'Данияр К.', 'Аружан С.', 'Берик М.', 'Нурсултан Т.', 'Камила Е.', 'Ильяс Ж.'];
      const sampleMessages = [
        'Тащи турнир, бро!',
        'Красавчик, топовый стрим!',
        'На новый микрофон :)',
        'Привет из Астаны!',
        'Удачи в игре!',
        'Поддерживаю канал!',
        'Салам бауырым! Керемет стрим, алға!'
      ];
      const sampleAmounts = [1000, 2000, 2500, 5000, 7777, 10000, 15000, 20000];

      let rawMsg = custom.message !== undefined ? custom.message : sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
      if (user.profile?.moderation?.profanity_filter !== false && rawMsg) {
        rawMsg = censorProfanity(rawMsg);
      }

      const testDonation = {
        user_id: user.id,
        source_label: custom.bank || 'Перевод ₸',
        amount: parseInt(custom.amount, 10) || sampleAmounts[Math.floor(Math.random() * sampleAmounts.length)],
        currency: 'KZT',
        sender: escapeHtml(custom.sender || sampleNames[Math.floor(Math.random() * sampleNames.length)]),
        message: escapeHtml(rawMsg),
        sound: custom.sound || user.settings?.sound || 'nomad',
        theme: custom.theme || user.settings?.theme || 'neo_nomad'
      };

      testDonation.tts = ttsNormalizer.normalizeForTTS({
        sender: testDonation.sender,
        amount: testDonation.amount,
        message: testDonation.message
      });

      const saved = db.addDonation(testDonation, { skipDedup: true });
      saved.tts_audio_url = `/api/tts/audio?id=${encodeURIComponent(saved.id)}`;
      const currentGoal = db.getUserGoal(user.id);

      broadcastEvent('donation', saved, user.id);
      broadcastEvent('goal_update', currentGoal, user.id);

      // Check Wheel of Fortune auto-trigger
      const userWheel = db.getUserWheel(user.id);
      if (userWheel.enabled && saved.amount >= userWheel.min_amount) {
        const sectors = userWheel.sectors || [];
        if (sectors.length > 0) {
          const sIdx = Math.floor(Math.random() * sectors.length);
          broadcastEvent('wheel_spin', {
            sector: sectors[sIdx],
            sector_index: sIdx,
            total_sectors: sectors.length,
            donor: saved.sender,
            amount: saved.amount,
            message: saved.message,
            timestamp: new Date().toISOString()
          }, user.id);
        }
      }

      // Check Donation Battle keywords
      const battleRes = db.addBattleScore(user.id, saved.message, saved.amount);
      if (battleRes) {
        broadcastEvent('battle_update', {
          battle: battleRes.battle,
          matchedSide: battleRes.matchedSide,
          sideName: battleRes.sideName,
          donation: saved
        }, user.id);
      }

      // Broadcast Top Donors and Ticker live updates
      broadcastEvent('top_update', { top_donors: db.getUserTopDonors(user.id, { limit: 10 }) }, user.id);
      broadcastEvent('ticker_update', db.getTickerData(user.id), user.id);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, donation: saved, test_donation: saved }));
    });
    return;
  }

  // ==========================================
  // 4. STATIC FILE SERVING
  // ==========================================

  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(ROOT_DIR, 'landing', 'index.html');
  } else if (pathname === '/auth' || pathname === '/auth/' || pathname === '/auth/login' || pathname === '/auth/login.html') {
    filePath = path.join(ROOT_DIR, 'auth', 'login.html');
  } else if (pathname === '/dashboard' || pathname === '/dashboard/' || pathname === '/dashboard/index.html') {
    filePath = path.join(ROOT_DIR, 'dashboard', 'index.html');
  } else if (pathname === '/download' || pathname === '/download/' || pathname === '/download/index.html') {
    filePath = path.join(ROOT_DIR, 'download', 'index.html');
  } else if (pathname === '/d' || pathname === '/d/' || pathname.startsWith('/d/') || pathname === '/donate' || pathname === '/donate/' || pathname.startsWith('/donate/') || pathname === '/pay' || pathname === '/pay/' || pathname.startsWith('/pay/')) {
    const candidatePath = path.join(ROOT_DIR, pathname);
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      filePath = candidatePath;
    } else {
      filePath = path.join(ROOT_DIR, 'd', 'index.html');
    }
  } else if (pathname.startsWith('/landing/')) {
    filePath = path.join(ROOT_DIR, pathname);
  } else if (pathname.startsWith('/auth/')) {
    filePath = path.join(ROOT_DIR, pathname);
  } else if (pathname.startsWith('/widgets/')) {
    filePath = path.join(ROOT_DIR, pathname);
  } else if (pathname.startsWith('/dashboard/')) {
    filePath = path.join(ROOT_DIR, pathname);
  } else if (pathname === '/legal' || pathname === '/legal/' || pathname === '/legal/terms' || pathname === '/legal/terms.html' || pathname === '/legal/TERMS_OF_SERVICE.md') {
    filePath = path.join(ROOT_DIR, 'legal', 'terms.html');
  } else if (pathname === '/legal/privacy' || pathname === '/legal/privacy.html' || pathname === '/legal/PRIVACY_POLICY.md') {
    filePath = path.join(ROOT_DIR, 'legal', 'privacy.html');
  } else if (pathname === '/legal/taxes' || pathname === '/legal/taxes.html' || pathname === '/legal/TAX_COMPLIANCE_RK.md') {
    filePath = path.join(ROOT_DIR, 'legal', 'taxes.html');
  } else if (pathname === '/legal/disclaimer' || pathname === '/legal/disclaimer.html' || pathname === '/legal/DISCLAIMER.md') {
    filePath = path.join(ROOT_DIR, 'legal', 'disclaimer.html');
  } else if (pathname === '/legal/legal.css') {
    filePath = path.join(ROOT_DIR, 'legal', 'legal.css');
  } else if (pathname.startsWith('/legal/')) {
    filePath = path.join(ROOT_DIR, pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(REPO_ROOT, pathname);
    }
  } else if (pathname.startsWith('/deploy/')) {
    filePath = path.join(REPO_ROOT, pathname);
  } else {
    filePath = path.join(ROOT_DIR, pathname);
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.md': 'text/markdown; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8'
    };
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

// HTTP Server
const server = http.createServer(handleRequest);

// WebSocket Upgrade
server.on('upgrade', (req, socket, head) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  if (parsedUrl.pathname === '/ws' || parsedUrl.pathname === '/ws/alerts') {
    const secKey = req.headers['sec-websocket-key'];
    if (!secKey) {
      socket.destroy();
      return;
    }

    const token = parsedUrl.searchParams.get('token');
    const user = token ? db.findUserByToken(token) : defaultUser;

    const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    const acceptKey = crypto.createHash('sha1').update(secKey + GUID).digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
      '\r\n'
    );

    const clientObj = { socket, userId: user?.id };
    wsClients.add(clientObj);

    socket.on('close', () => {
      wsClients.delete(clientObj);
    });

    socket.on('error', () => {
      wsClients.delete(clientObj);
    });

    sendWsFrame(socket, JSON.stringify({ event: 'connected', time: Date.now(), user_id: user?.id }));
  } else {
    socket.destroy();
  }
});

function startServer(portToTry) {
  server.removeAllListeners('error');
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const fallbackPort = portToTry === 3000 ? 3005 : portToTry + 1;
      console.warn(`[PORT] Port ${portToTry} is occupied. Retrying on port ${fallbackPort}...`);
      startServer(fallbackPort);
    } else {
      console.error('[SERVER ERROR]', err);
    }
  });

  server.listen(portToTry, () => {
    console.log('===================================================');
    console.log(`TengeAlert Multi-Tenant Gateway ACTIVE on port ${portToTry}!`);
    console.log(`Ready for PS.kz Plesk (MySQL / Local DB Engine)`);
    console.log(`Master Streamer Token: ${masterToken}`);
    console.log('---------------------------------------------------');
    console.log(`Studio Dashboard: http://localhost:${portToTry}/dashboard/`);
    console.log(`OBS Alert Box:    http://localhost:${portToTry}/widgets/alert.html`);
    console.log(`OBS Goal Bar:     http://localhost:${portToTry}/widgets/goal.html`);
    console.log(`Public Donate:    http://localhost:${portToTry}/d/`);
    console.log('===================================================');
  });
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = {
  server,
  handleRequest,
  startServer
};
