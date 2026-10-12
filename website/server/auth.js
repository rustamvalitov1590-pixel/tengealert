/**
 * TengeAlert Authentication & Session Manager
 * 
 * Implements:
 * - Scrypt password hashing with cryptographic salt (GPU-resistant, zero external deps).
 * - Cryptographically signed session tokens (HMAC-SHA256).
 * - Google OAuth 2.0 & Apple ID integration hooks.
 * - Mandatory Terms of Service & Privacy Policy consent validation.
 */

const crypto = require('crypto');
const db = require('./db');

const JWT_SECRET = process.env.APP_SECRET || 'ta_jwt_secret_' + crypto.randomBytes(16).toString('hex');
const TOKEN_EXPIRY_DAYS = 7;

/**
 * Hash password using crypto.scrypt
 */
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verify password against stored salt:hash
 */
function verifyPassword(password, storedHash) {
  return new Promise((resolve, reject) => {
    if (!storedHash || !storedHash.includes(':')) return resolve(false);
    const [salt, key] = storedHash.split(':');
    const keyBuffer = Buffer.from(key, 'hex');

    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
    });
  });
}

/**
 * Sign session token (HMAC-SHA256)
 */
function createSessionToken(userId) {
  const payload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (TOKEN_EXPIRY_DAYS * 24 * 60 * 60)
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payloadBase64).digest('base64url');

  return `${payloadBase64}.${signature}`;
}

/**
 * Verify session token
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;

  const [payloadBase64, signature] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(payloadBase64).digest('base64url');

  if (signature !== expectedSignature) {
    return null; // Invalid signature
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }
    return payload.sub; // Return userId
  } catch (e) {
    return null;
  }
}

/**
 * Register a new streamer account with Email + Password
 */
async function registerWithEmail(params = {}) {
  const email = params.email;
  const password = params.password;
  const displayName = params.displayName || params.display_name;
  const agreedToTerms = params.agreedToTerms || params.agreed_terms;

  if (!email || !email.includes('@')) {
    const err = new Error('Укажите корректный адрес электронной почты.');
    err.statusCode = 400;
    throw err;
  }

  if (!password || password.length < 8) {
    const err = new Error('Пароль должен содержать не менее 8 символов.');
    err.statusCode = 400;
    throw err;
  }

  if (!agreedToTerms) {
    const err = new Error('Необходимо принять Условия использования и Политику конфиденциальности.');
    err.statusCode = 400;
    throw err;
  }

  const existing = db.findUserByEmail(email);
  if (existing) {
    const err = new Error('Пользователь с таким email уже зарегистрирован.');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await hashPassword(password);
  const user = db.createUser({
    email,
    password_hash: passwordHash,
    display_name: displayName || email.split('@')[0],
    auth_provider: 'email'
  });

  const sessionToken = createSessionToken(user.id);
  return {
    sessionToken,
    user: sanitizeUser(user)
  };
}

/**
 * Login streamer with Email + Password
 */
async function loginWithEmail({ email, password }) {
  if (!email || !password) {
    throw new Error('Укажите email и пароль.');
  }

  const user = db.findUserByEmail(email);
  if (!user || !user.password_hash) {
    throw new Error('Неверный email или пароль.');
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new Error('Неверный email или пароль.');
  }

  const sessionToken = createSessionToken(user.id);
  return {
    sessionToken,
    user: sanitizeUser(user)
  };
}

/**
 * Social Auth Handlers (Google & Apple ID)
 */
function getGoogleAuthUrl(redirectUri) {
  const clientId = process.env.GOOGLE_CLIENT_ID || 'DEMO_GOOGLE_CLIENT_ID';
  const scope = encodeURIComponent('openid email profile');
  const redirect = encodeURIComponent(redirectUri || 'http://localhost:3000/api/auth/google/callback');
  return `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${redirect}&scope=${scope}&access_type=offline&prompt=consent`;
}

async function handleSocialLogin({ email, displayName, provider, providerId, avatarUrl }) {
  if (!email) throw new Error('Email не предоставлен сервисом авторизации.');

  let user = db.findUserByProvider(provider, providerId) || db.findUserByEmail(email);

  if (!user) {
    user = db.createUser({
      email,
      display_name: displayName || email.split('@')[0],
      auth_provider: provider,
      provider_id: providerId,
      avatar_url: avatarUrl || ''
    });
  } else {
    // Update provider info if needed
    if (!user.provider_id) {
      db.updateUser(user.id, { provider_id: providerId, auth_provider: provider });
    }
  }

  const sessionToken = createSessionToken(user.id);
  return {
    sessionToken,
    user: sanitizeUser(user)
  };
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  registerWithEmail,
  loginWithEmail,
  getGoogleAuthUrl,
  handleSocialLogin,
  sanitizeUser
};
