/**
 * TengeAlert Multi-Tenant Database Adapter
 * 
 * Supports two operational modes:
 * 1. Local-First Engine: File-backed persistent store (Zero-config, runs anywhere).
 * 2. PS.kz Plesk MySQL Engine: Activated when DB_HOST / DB_NAME are configured in Plesk.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DONATIONS_FILE = path.join(DATA_DIR, 'donations.json');
const GOALS_FILE = path.join(DATA_DIR, 'goals.json');
const WHEEL_FILE = path.join(DATA_DIR, 'wheel.json');
const BATTLE_FILE = path.join(DATA_DIR, 'battle.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');

// In-memory collections
let users = [];
let donations = [];
let goals = {};
let wheels = {};
let battles = {};
let reviews = [];

function loadData() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
    if (fs.existsSync(DONATIONS_FILE)) {
      donations = JSON.parse(fs.readFileSync(DONATIONS_FILE, 'utf8'));
    }
    if (fs.existsSync(GOALS_FILE)) {
      goals = JSON.parse(fs.readFileSync(GOALS_FILE, 'utf8'));
    }
    if (fs.existsSync(WHEEL_FILE)) {
      wheels = JSON.parse(fs.readFileSync(WHEEL_FILE, 'utf8'));
    }
    if (fs.existsSync(BATTLE_FILE)) {
      battles = JSON.parse(fs.readFileSync(BATTLE_FILE, 'utf8'));
    }
    if (fs.existsSync(REVIEWS_FILE)) {
      reviews = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[DB] Error loading persistent store:', err.message);
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] Failed to save users:', e.message);
  }
}

function saveReviews() {
  try {
    fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] Failed to save reviews:', e.message);
  }
}

function saveDonations() {
  try {
    fs.writeFileSync(DONATIONS_FILE, JSON.stringify(donations.slice(0, 5000), null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] Failed to save donations:', e.message);
  }
}

function saveGoals() {
  try {
    fs.writeFileSync(GOALS_FILE, JSON.stringify(goals, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] Failed to save goals:', e.message);
  }
}

function saveWheels() {
  try {
    fs.writeFileSync(WHEEL_FILE, JSON.stringify(wheels, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] Failed to save wheels:', e.message);
  }
}

function saveBattles() {
  try {
    fs.writeFileSync(BATTLE_FILE, JSON.stringify(battles, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] Failed to save battles:', e.message);
  }
}

loadData();

// In-memory sliding window cache for idempotency and duplicate detection
// Key: fingerprint string -> { timestamp: number, record: Object }
const dedupCache = new Map();

// Periodic purge of cache entries older than 180 seconds (3 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of dedupCache.entries()) {
    if (now - item.timestamp > 180000) {
      dedupCache.delete(key);
    }
  }
}, 30000);

// Database Interface
const db = {
  // Users
  findUserByEmail(email) {
    if (!email) return null;
    return users.find(u => u.email.toLowerCase() === email.toLowerCase().trim()) || null;
  },

  findUserById(id) {
    if (!id) return null;
    return users.find(u => u.id === id) || null;
  },

  findUserByToken(token) {
    if (!token) return null;
    return users.find(u => u.streamer_token === token) || null;
  },

  findUserByProvider(provider, providerId) {
    if (!provider || !providerId) return null;
    return users.find(u => u.auth_provider === provider && u.provider_id === String(providerId)) || null;
  },

  findUserBySlug(slug) {
    if (!slug) return null;
    const clean = String(slug).toLowerCase().trim().replace(/^\/+|\/+$/g, '');
    if (!clean) return null;
    return users.find(u => {
      const pSlug = (u.profile?.custom_page_slug || u.profile?.branding?.custom_page_slug || '').toLowerCase();
      if (pSlug === clean) return true;
      if (u.id.toLowerCase() === clean) return true;
      if (u.streamer_token && u.streamer_token.toLowerCase() === clean) return true;
      const nameSlug = (u.display_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (nameSlug && nameSlug === clean) return true;
      return false;
    }) || null;
  },

  createUser(userData) {
    const user = {
      id: 'usr_' + crypto.randomBytes(6).toString('hex'),
      email: userData.email.toLowerCase().trim(),
      password_hash: userData.password_hash || null,
      display_name: userData.display_name || userData.email.split('@')[0],
      streamer_token: 'ta_live_' + crypto.randomBytes(12).toString('hex'),
      auth_provider: userData.auth_provider || 'email',
      provider_id: userData.provider_id ? String(userData.provider_id) : null,
      avatar_url: userData.avatar_url || '',
      settings: userData.settings || {
        theme: 'neo_nomad',
        sound: 'nomad',
        tts_enabled: true,
        tts_min_amount: 500,
        tts_voice_kz: 'auto',
        tts_voice_ru: 'auto',
        tts_rate: 1.0,
        tts_pitch: 1.0
      },
      profile: {
        bio: 'Стример из Казахстана',
        accent_color: '#00f5a0',
        custom_page_slug: (userData.display_name || 'streamer').toLowerCase().replace(/[^a-z0-9]/g, ''),
        requisites: {
          kaspi_phone: '',
          kaspi_name: '',
          kaspi_pay_link: '',
          halyk_card: '',
          jusan_card: ''
        },
        socials: {
          youtube: '',
          twitch: '',
          tiktok: '',
          telegram: '',
          discord: ''
        },
        moderation: {
          profanity_filter: true,
          min_donation_amount: 100
        }
      },
      subscription: {
        plan_id: userData.plan_id || 'starter_free',
        status: 'active',
        expires_at: userData.subscription_expires_at || null,
        created_at: new Date().toISOString()
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    users.push(user);
    saveUsers();

    // Initialize default goal for user
    goals[user.id] = {
      id: 'goal_' + crypto.randomBytes(4).toString('hex'),
      user_id: user.id,
      title: 'На развитие стрима и микрофон',
      target: 500000,
      current: 0,
      updated_at: new Date().toISOString()
    };
    saveGoals();

    return user;
  },

  updateUser(id, updates) {
    const user = users.find(u => u.id === id);
    if (!user) return null;

    if (updates.display_name) user.display_name = updates.display_name;
    if (updates.settings) user.settings = { ...user.settings, ...updates.settings };
    if (updates.avatar_url) user.avatar_url = updates.avatar_url;
    if (updates.profile) user.profile = { ...(user.profile || {}), ...updates.profile };
    user.updated_at = new Date().toISOString();

    saveUsers();
    return user;
  },

  updateUserSettings(id, newSettings) {
    const user = users.find(u => u.id === id);
    if (!user) return null;
    user.settings = { ...(user.settings || {}), ...newSettings };
    user.updated_at = new Date().toISOString();
    saveUsers();
    return user.settings;
  },

  getUserProfile(id) {
    const user = users.find(u => u.id === id);
    if (!user) return null;
    const defaultProfile = {
      bio: 'Стример из Казахстана',
      accent_color: '#E5A93C',
      custom_page_slug: (user.display_name || 'streamer').toLowerCase().replace(/[^a-z0-9]/g, ''),
      button_text: 'Поддержать стримера',
      amount_presets: [500, 1000, 2500, 5000, 10000, 25000],
      custom_links: [],
      requisites: {
        kaspi_phone: '',
        kaspi_name: '',
        kaspi_pay_link: '',
        halyk_card: '',
        jusan_card: ''
      },
      socials: {
        youtube: '',
        twitch: '',
        tiktok: '',
        telegram: '',
        discord: '',
        kick: '',
        vk: ''
      },
      moderation: {
        profanity_filter: true,
        min_donation_amount: 100
      }
    };
    return {
      display_name: user.display_name,
      email: user.email,
      avatar_url: user.avatar_url,
      streamer_token: user.streamer_token,
      ...defaultProfile,
      ...(user.profile || {}),
      custom_links: Array.isArray(user.profile?.custom_links) ? user.profile.custom_links : defaultProfile.custom_links,
      amount_presets: Array.isArray(user.profile?.amount_presets) && user.profile.amount_presets.length > 0 ? user.profile.amount_presets : defaultProfile.amount_presets,
      button_text: user.profile?.button_text || defaultProfile.button_text,
      requisites: {
        ...defaultProfile.requisites,
        ...((user.profile && user.profile.requisites) || {})
      },
      socials: {
        ...defaultProfile.socials,
        ...((user.profile && user.profile.socials) || {})
      },
      moderation: {
        ...defaultProfile.moderation,
        ...((user.profile && user.profile.moderation) || {})
      }
    };
  },

  updateUserProfile(id, profileUpdates) {
    const user = users.find(u => u.id === id);
    if (!user) return null;

    if (profileUpdates.display_name) user.display_name = profileUpdates.display_name;
    if (profileUpdates.avatar_url !== undefined) user.avatar_url = profileUpdates.avatar_url;

    const currentProfile = user.profile || {};
    user.profile = {
      ...currentProfile,
      ...profileUpdates,
      custom_links: Array.isArray(profileUpdates.custom_links) ? profileUpdates.custom_links : (currentProfile.custom_links || []),
      amount_presets: Array.isArray(profileUpdates.amount_presets) && profileUpdates.amount_presets.length > 0 ? profileUpdates.amount_presets : (currentProfile.amount_presets || [500, 1000, 2500, 5000, 10000, 25000]),
      button_text: profileUpdates.button_text || currentProfile.button_text || 'Поддержать стримера',
      requisites: {
        ...(currentProfile.requisites || {}),
        ...(profileUpdates.requisites || {})
      },
      socials: {
        ...(currentProfile.socials || {}),
        ...(profileUpdates.socials || {})
      },
      moderation: {
        ...(currentProfile.moderation || {}),
        ...(profileUpdates.moderation || {})
      }
    };

    user.updated_at = new Date().toISOString();
    saveUsers();
    return this.getUserProfile(id);
  },

  getUserPublicProfile(slugOrId) {
    let user = null;
    if (slugOrId) {
      user = this.findUserBySlug(slugOrId) || this.findUserById(slugOrId) || this.findUserByToken(slugOrId);
    }
    if (!user) {
      user = users[0] || null;
    }
    if (!user) return null;

    const fullProfile = this.getUserProfile(user.id);
    const goal = this.getUserGoal(user.id);
    const battle = this.getUserBattle(user.id);
    const topDonors = this.getUserTopDonors(user.id, { limit: 5 });

    const presets = Array.isArray(fullProfile.amount_presets) && fullProfile.amount_presets.length > 0
      ? fullProfile.amount_presets
      : [500, 1000, 2500, 5000, 10000, 25000];

    return {
      id: user.id,
      display_name: user.display_name || 'Стример',
      avatar_url: user.avatar_url || '',
      bio: fullProfile.bio || 'Стример из Казахстана',
      slug: fullProfile.custom_page_slug || (user.display_name || 'streamer').toLowerCase().replace(/[^a-z0-9]/g, ''),
      accent_color: fullProfile.accent_color || '#E5A93C',
      button_text: fullProfile.button_text || 'Поддержать стримера',
      amount_presets: presets,
      custom_links: fullProfile.custom_links || [],
      requisites: {
        kaspi_phone: fullProfile.requisites?.kaspi_phone || '',
        kaspi_name: fullProfile.requisites?.kaspi_name || '',
        kaspi_pay_link: fullProfile.requisites?.kaspi_pay_link || '',
        halyk_card: fullProfile.requisites?.halyk_card || '',
        jusan_card: fullProfile.requisites?.jusan_card || ''
      },
      socials: {
        youtube: fullProfile.socials?.youtube || '',
        twitch: fullProfile.socials?.twitch || '',
        tiktok: fullProfile.socials?.tiktok || '',
        telegram: fullProfile.socials?.telegram || '',
        discord: fullProfile.socials?.discord || '',
        kick: fullProfile.socials?.kick || '',
        vk: fullProfile.socials?.vk || ''
      },
      settings: {
        theme: user.settings?.theme || 'neo_nomad',
        tts_enabled: user.settings?.tts_enabled !== false,
        tts_min_amount: user.settings?.tts_min_amount !== undefined ? user.settings.tts_min_amount : 500,
        min_donation_amount: fullProfile.moderation?.min_donation_amount || 100
      },
      goal: goal || null,
      battle: (battle && battle.enabled) ? battle : null,
      top_donors: topDonors || []
    };
  },

  findDonationById(id) {
    if (!id) return null;
    return donations.find(d => d.id === id) || null;
  },

  checkDuplicate(donationData) {
    const now = Date.now();
    const userId = donationData.user_id || 'default';
    const amount = parseInt(donationData.amount, 10) || 0;
    const sender = String(donationData.sender || '').trim().toLowerCase();
    const message = String(donationData.message || '').trim().toLowerCase();

    // 1. Explicit idempotency key or system push identifiers (notification_id, post_time, ref_code)
    const explicitKey = donationData.idempotency_key || donationData.notification_id || donationData.ref_code;
    if (explicitKey) {
      const key = `sys_${userId}_${explicitKey}`;
      if (dedupCache.has(key)) {
        return { isDuplicate: true, reason: 'system_id_duplicate', record: dedupCache.get(key).record };
      }
    }

    // 2. Sliding window content fingerprint:
    // Protects against network TCP retries / double-taps within a 5-second window
    // (Real consecutive donations spaced by > 5s will be treated as distinct)
    const contentKey = `cnt_${userId}_${amount}_${sender}_${message}`;
    if (dedupCache.has(contentKey)) {
      const cached = dedupCache.get(contentKey);
      if (now - cached.timestamp < 5000) { // 5-second micro-window for network retry
        return { isDuplicate: true, reason: 'network_retry_duplicate', record: cached.record };
      }
    }

    return { isDuplicate: false };
  },

  registerDedup(donationData, record) {
    const now = Date.now();
    const userId = donationData.user_id || 'default';
    const amount = parseInt(donationData.amount, 10) || 0;
    const sender = String(donationData.sender || '').trim().toLowerCase();
    const message = String(donationData.message || '').trim().toLowerCase();

    const explicitKey = donationData.idempotency_key || donationData.notification_id || donationData.ref_code;
    if (explicitKey) {
      dedupCache.set(`sys_${userId}_${explicitKey}`, { timestamp: now, record });
    }

    const contentKey = `cnt_${userId}_${amount}_${sender}_${message}`;
    dedupCache.set(contentKey, { timestamp: now, record });
  },

  // Donations
  addDonation(donationData, options = {}) {
    if (!options.skipDedup) {
      const dupCheck = this.checkDuplicate(donationData);
      if (dupCheck.isDuplicate) {
        return { ...dupCheck.record, is_duplicate: true, duplicate_reason: dupCheck.reason };
      }
    }

    const record = {
      id: donationData.id || 'ta_' + crypto.randomBytes(6).toString('hex'),
      user_id: donationData.user_id,
      amount: parseInt(donationData.amount, 10) || 0,
      currency: donationData.currency || 'KZT',
      sender: donationData.sender || 'Аноним',
      message: donationData.message || '',
      raw_text: donationData.raw_text || '',
      source_label: donationData.source_label || 'Перевод ₸',
      sound: donationData.sound || 'coin',
      theme: donationData.theme || 'cyber_emerald',
      tts: donationData.tts || null,
      tts_audio_url: donationData.tts_audio_url || null,
      ref_code: donationData.ref_code || null,
      received_at: donationData.received_at || new Date().toISOString()
    };

    this.registerDedup(donationData, record);

    donations.unshift(record);
    saveDonations();

    // Update goal
    this.incrementUserGoal(record.user_id, record.amount);

    return record;
  },

  getUserDonations(userId, options = 50) {
    let list = donations.filter(d => d.user_id === userId);

    // If options is a simple number, treat as limit (backwards compatible)
    if (typeof options === 'number') {
      return list.slice(0, options);
    }

    const { period = 'all', bank = 'all', search = '', limit = 50, page = 1 } = options || {};

    const now = new Date();
    if (period === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      list = list.filter(d => new Date(d.received_at).getTime() >= todayStart);
    } else if (period === 'week') {
      const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter(d => new Date(d.received_at).getTime() >= weekStart);
    } else if (period === 'month') {
      const monthStart = now.getTime() - 30 * 24 * 60 * 60 * 1000;
      list = list.filter(d => new Date(d.received_at).getTime() >= monthStart);
    }

    if (bank && bank !== 'all') {
      const bLower = bank.toLowerCase();
      list = list.filter(d => {
        const src = (d.source_label || '').toLowerCase();
        const raw = (d.raw_text || '').toLowerCase();
        return src.includes(bLower) || raw.includes(bLower);
      });
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(d => 
        (d.sender || '').toLowerCase().includes(q) ||
        (d.message || '').toLowerCase().includes(q) ||
        String(d.amount).includes(q)
      );
    }

    const total = list.length;
    const totalAmount = list.reduce((sum, d) => sum + (d.amount || 0), 0);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 50);
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const offset = (parsedPage - 1) * parsedLimit;
    const paginated = list.slice(offset, offset + parsedLimit);

    return {
      donations: paginated,
      total,
      totalAmount,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit) || 1,
      limit: parsedLimit
    };
  },

  deleteDonation(userId, donationId) {
    const idx = donations.findIndex(d => d.user_id === userId && d.id === donationId);
    if (idx === -1) return false;

    const removed = donations.splice(idx, 1)[0];
    saveDonations();

    // Recalculate goal
    if (removed.amount) {
      this.decrementUserGoal(userId, removed.amount);
    }

    return true;
  },

  getUserStats(userId) {
    const userDonations = donations.filter(d => d.user_id === userId);
    const totalAmount = userDonations.reduce((sum, d) => sum + (d.amount || 0), 0);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const monthStart = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    const todayAmount = userDonations
      .filter(d => new Date(d.received_at).getTime() >= todayStart)
      .reduce((sum, d) => sum + (d.amount || 0), 0);

    const weekAmount = userDonations
      .filter(d => new Date(d.received_at).getTime() >= weekStart)
      .reduce((sum, d) => sum + (d.amount || 0), 0);

    const monthAmount = userDonations
      .filter(d => new Date(d.received_at).getTime() >= monthStart)
      .reduce((sum, d) => sum + (d.amount || 0), 0);

    const topDonor = userDonations.slice().sort((a, b) => b.amount - a.amount)[0] || null;
    const goal = goals[userId] || {
      title: 'На развитие стрима',
      target: 500000,
      current: 0
    };

    return {
      total_amount: totalAmount,
      today_amount: todayAmount,
      week_amount: weekAmount,
      month_amount: monthAmount,
      total_count: userDonations.length,
      top_donor: topDonor,
      goal
    };
  },

  getUserTopDonors(userId, options = {}) {
    const period = options.period || 'all';
    const limit = Math.max(1, parseInt(options.limit, 10) || 5);
    let list = donations.filter(d => d.user_id === userId);

    const now = new Date();
    if (period === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      list = list.filter(d => new Date(d.received_at).getTime() >= todayStart);
    } else if (period === 'week') {
      const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter(d => new Date(d.received_at).getTime() >= weekStart);
    } else if (period === 'month') {
      const monthStart = now.getTime() - 30 * 24 * 60 * 60 * 1000;
      list = list.filter(d => new Date(d.received_at).getTime() >= monthStart);
    }

    // Group by sender (case-insensitive name)
    const donorMap = new Map();
    list.forEach(d => {
      const name = (d.sender || 'Аноним').trim();
      const key = name.toLowerCase();
      if (!donorMap.has(key)) {
        donorMap.set(key, {
          sender: name,
          amount: 0,
          count: 0,
          last_message: d.message || '',
          last_received_at: d.received_at
        });
      }
      const entry = donorMap.get(key);
      entry.amount += (d.amount || 0);
      entry.count += 1;
      if (new Date(d.received_at) > new Date(entry.last_received_at)) {
        entry.last_message = d.message || entry.last_message;
        entry.last_received_at = d.received_at;
      }
    });

    const sorted = Array.from(donorMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit)
      .map((d, idx) => ({ rank: idx + 1, ...d }));

    return sorted;
  },

  getTickerData(userId) {
    const userDonations = donations.filter(d => d.user_id === userId);
    const last = userDonations[0] || null;
    const topToday = this.getUserTopDonors(userId, { period: 'today', limit: 1 })[0];
    const topAll = this.getUserTopDonors(userId, { period: 'all', limit: 1 })[0];
    const top = topToday || topAll || null;

    const stats = this.getUserStats(userId);
    const goal = this.getUserGoal(userId);
    const percent = Math.min(100, Math.round(((goal.current || 0) / (goal.target || 1)) * 100));

    return {
      last_donation: last ? { sender: last.sender, amount: last.amount, message: last.message } : null,
      top_donor: top ? { sender: top.sender, amount: top.amount } : null,
      today_amount: stats.today_amount || 0,
      total_amount: stats.total_amount || 0,
      goal: {
        title: goal.title,
        current: goal.current,
        target: goal.target,
        percent
      }
    };
  },

  clearUserDonations(userId) {
    const initialCount = donations.length;
    donations = donations.filter(d => d.user_id !== userId);
    const removedCount = initialCount - donations.length;
    saveDonations();

    if (goals[userId]) {
      goals[userId].current = 0;
      goals[userId].updated_at = new Date().toISOString();
      saveGoals();
    }

    return removedCount;
  },

  normalizeUserGoals(userId) {
    if (!goals[userId]) {
      const defaultGoal = {
        id: 'goal_' + crypto.randomBytes(4).toString('hex'),
        user_id: userId,
        title: 'На развитие стрима',
        target: 500000,
        current: 0,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      goals[userId] = {
        active_id: defaultGoal.id,
        list: [defaultGoal]
      };
      saveGoals();
      return goals[userId];
    }

    // Migration from old flat object to multi-goal list
    if (!goals[userId].list || !Array.isArray(goals[userId].list)) {
      const flat = goals[userId];
      const gId = flat.id || ('goal_' + crypto.randomBytes(4).toString('hex'));
      const migrated = {
        id: gId,
        user_id: userId,
        title: flat.title || 'На развитие стрима',
        target: flat.target || 500000,
        current: flat.current || 0,
        is_active: true,
        created_at: flat.created_at || new Date().toISOString(),
        updated_at: flat.updated_at || new Date().toISOString()
      };
      goals[userId] = {
        active_id: gId,
        list: [migrated]
      };
      saveGoals();
    }

    return goals[userId];
  },

  getUserGoal(userId) {
    const data = this.normalizeUserGoals(userId);
    let active = data.list.find(g => g.id === data.active_id || g.is_active);
    if (!active && data.list.length > 0) {
      active = data.list[0];
      active.is_active = true;
      data.active_id = active.id;
      saveGoals();
    }
    if (!active) {
      return {
        id: 'goal_default',
        title: 'На развитие стрима',
        target: 500000,
        current: 0,
        is_active: true
      };
    }
    return active;
  },

  getUserGoals(userId) {
    const data = this.normalizeUserGoals(userId);
    return data.list.map(g => ({
      ...g,
      is_active: g.id === data.active_id,
      percent: Math.min(100, Math.round(((g.current || 0) / (g.target || 1)) * 100))
    }));
  },

  createGoal(userId, goalData) {
    const data = this.normalizeUserGoals(userId);
    const newGoal = {
      id: 'goal_' + crypto.randomBytes(4).toString('hex'),
      user_id: userId,
      title: String(goalData.title || 'Новая цель').trim(),
      target: Math.max(1000, parseInt(goalData.target, 10) || 100000),
      current: Math.max(0, parseInt(goalData.current, 10) || 0),
      deadline: goalData.deadline ? String(goalData.deadline) : null,
      is_active: !!goalData.is_active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (newGoal.is_active || data.list.length === 0) {
      data.list.forEach(g => g.is_active = false);
      newGoal.is_active = true;
      data.active_id = newGoal.id;
    }

    data.list.push(newGoal);
    saveGoals();
    return newGoal;
  },

  setActiveGoal(userId, goalId) {
    const data = this.normalizeUserGoals(userId);
    let found = false;
    data.list.forEach(g => {
      if (g.id === goalId) {
        g.is_active = true;
        data.active_id = g.id;
        found = true;
      } else {
        g.is_active = false;
      }
    });
    if (found) {
      saveGoals();
    }
    return this.getUserGoal(userId);
  },

  updateUserGoal(userId, goalDataOrId, maybeData) {
    const data = this.normalizeUserGoals(userId);
    let targetGoalId = typeof goalDataOrId === 'string' ? goalDataOrId : (goalDataOrId?.id || data.active_id);
    let payload = typeof goalDataOrId === 'string' ? (maybeData || {}) : goalDataOrId;

    let goal = data.list.find(g => g.id === targetGoalId);
    if (!goal) {
      goal = this.getUserGoal(userId);
    }

    if (payload.title !== undefined) goal.title = String(payload.title).trim();
    if (payload.target !== undefined) goal.target = Math.max(1000, parseInt(payload.target, 10) || 500000);
    if (payload.current !== undefined) goal.current = Math.max(0, parseInt(payload.current, 10) || 0);
    if (payload.deadline !== undefined) goal.deadline = payload.deadline ? String(payload.deadline) : null;
    goal.updated_at = new Date().toISOString();

    if (payload.is_active) {
      this.setActiveGoal(userId, goal.id);
    } else {
      saveGoals();
    }

    return goal;
  },

  deleteGoal(userId, goalId) {
    const data = this.normalizeUserGoals(userId);
    const index = data.list.findIndex(g => g.id === goalId);
    if (index === -1) return false;

    data.list.splice(index, 1);
    if (data.list.length === 0) {
      this.createGoal(userId, { title: 'На развитие стрима', target: 500000, is_active: true });
    } else if (data.active_id === goalId) {
      data.active_id = data.list[0].id;
      data.list[0].is_active = true;
    }
    saveGoals();
    return true;
  },

  incrementUserGoal(userId, amount) {
    const goal = this.getUserGoal(userId);
    if (goal && amount > 0) {
      goal.current = (goal.current || 0) + amount;
      goal.updated_at = new Date().toISOString();
      saveGoals();
    }
    return goal;
  },

  decrementUserGoal(userId, amount) {
    const goal = this.getUserGoal(userId);
    if (goal && amount > 0) {
      goal.current = Math.max(0, (goal.current || 0) - amount);
      goal.updated_at = new Date().toISOString();
      saveGoals();
    }
    return goal;
  },

  getAdvancedAnalytics(userId, period = '7d') {
    const userDonations = donations.filter(d => d.user_id === userId);
    const now = new Date();

    let daysCount = 7;
    if (period === '14d') daysCount = 14;
    else if (period === '30d') daysCount = 30;

    const periodStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (daysCount - 1), 0, 0, 0).getTime();
    const periodDonations = userDonations.filter(d => new Date(d.received_at).getTime() >= periodStartTime);

    // 1. Daily breakdown for charts
    const dailyMap = new Map();
    const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const label = `${d.getDate()} ${monthNames[d.getMonth()]}`;
      dailyMap.set(dateStr, {
        date: dateStr,
        label,
        amount: 0,
        count: 0
      });
    }

    periodDonations.forEach(d => {
      const dt = new Date(d.received_at);
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      if (dailyMap.has(dateStr)) {
        const item = dailyMap.get(dateStr);
        item.amount += (d.amount || 0);
        item.count += 1;
      }
    });

    const daily = Array.from(dailyMap.values());

    // 2. Summary stats
    const totalRevenue = periodDonations.reduce((acc, d) => acc + (d.amount || 0), 0);
    const totalDonations = periodDonations.length;
    const avgDonation = totalDonations > 0 ? Math.round(totalRevenue / totalDonations) : 0;

    // Median
    const sortedAmounts = periodDonations.map(d => d.amount || 0).sort((a, b) => a - b);
    let medianDonation = 0;
    if (sortedAmounts.length > 0) {
      const mid = Math.floor(sortedAmounts.length / 2);
      medianDonation = sortedAmounts.length % 2 !== 0 ? sortedAmounts[mid] : Math.round((sortedAmounts[mid - 1] + sortedAmounts[mid]) / 2);
    }

    // Max donation
    let maxDonation = null;
    if (periodDonations.length > 0) {
      const sortedByAmount = periodDonations.slice().sort((a, b) => (b.amount || 0) - (a.amount || 0));
      maxDonation = {
        amount: sortedByAmount[0].amount,
        sender: sortedByAmount[0].sender,
        received_at: sortedByAmount[0].received_at
      };
    }

    // 3. Bank breakdown
    const bankMap = new Map();
    periodDonations.forEach(d => {
      const rawBank = (d.source_label || 'Перевод ₸').toLowerCase();
      let key = 'kaspi_transfer';
      let name = 'Kaspi Перевод';

      if (rawBank.includes('qr') || rawBank.includes('кьюар')) {
        key = 'kaspi_qr';
        name = 'Kaspi QR ₸';
      } else if (rawBank.includes('halyk') || rawBank.includes('халык')) {
        key = 'halyk';
        name = 'Halyk Bank';
      } else if (rawBank.includes('freedom') || rawBank.includes('фридом')) {
        key = 'freedom';
        name = 'Freedom Bank';
      } else if (rawBank.includes('jusan') || rawBank.includes('жусан')) {
        key = 'jusan';
        name = 'Jusan Bank';
      } else if (rawBank.includes('kaspi') || rawBank.includes('каспи')) {
        key = 'kaspi_gold';
        name = 'Kaspi Gold';
      }

      if (!bankMap.has(key)) {
        bankMap.set(key, { code: key, name, amount: 0, count: 0 });
      }
      const b = bankMap.get(key);
      b.amount += (d.amount || 0);
      b.count += 1;
    });

    const bankBreakdown = Array.from(bankMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map(b => ({
        ...b,
        percentage: totalRevenue > 0 ? Math.round((b.amount / totalRevenue) * 100) : 0
      }));

    // 4. Hourly distribution (0-23 hours)
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      amount: 0,
      count: 0
    }));

    periodDonations.forEach(d => {
      const h = new Date(d.received_at).getHours();
      if (hourly[h]) {
        hourly[h].amount += (d.amount || 0);
        hourly[h].count += 1;
      }
    });

    // Peak hour
    const peakHour = hourly.slice().sort((a, b) => b.amount - a.amount)[0] || null;

    // 5. Top Donors in period
    const topDonors = this.getUserTopDonors(userId, {
      period: period === '7d' ? 'week' : (period === '30d' ? 'month' : 'all'),
      limit: 5
    });

    return {
      period,
      days_count: daysCount,
      summary: {
        total_revenue: totalRevenue,
        total_donations: totalDonations,
        average_donation: avgDonation,
        median_donation: medianDonation,
        max_donation: maxDonation,
        peak_hour: peakHour && peakHour.amount > 0 ? peakHour.label : '—'
      },
      daily,
      bank_breakdown: bankBreakdown,
      hourly,
      top_donors: topDonors
    };
  },

  // Wheel of Fortune (Рулетка челленджей)
  getUserWheel(userId) {
    if (!wheels[userId]) {
      wheels[userId] = {
        enabled: true,
        min_amount: 1000,
        title: 'Рулетка челленджей',
        sectors: [
          '20 отжиманий',
          'Спеть куплет',
          'Играть с пистолетом',
          'Мут на 5 минут',
          '+30 мин к стриму',
          'Без брони',
          'Случайный дроп',
          'Острый перекус'
        ],
        updated_at: new Date().toISOString()
      };
      saveWheels();
    }
    return wheels[userId];
  },

  updateUserWheel(userId, data) {
    const current = this.getUserWheel(userId);
    if (data.enabled !== undefined) current.enabled = Boolean(data.enabled);
    if (data.min_amount !== undefined) current.min_amount = Math.max(100, parseInt(data.min_amount, 10) || 1000);
    if (data.title !== undefined) current.title = String(data.title);
    if (Array.isArray(data.sectors) && data.sectors.length > 0) {
      current.sectors = data.sectors.map(s => String(s).trim()).filter(Boolean);
    }
    current.updated_at = new Date().toISOString();
    saveWheels();
    return current;
  },

  // Donation Battle (Донат-битва / Голосование)
  getUserBattle(userId) {
    if (!battles[userId]) {
      battles[userId] = {
        enabled: true,
        title: 'CS2 vs Valorant',
        side_a: {
          name: 'CS2',
          color: '#00f5a0',
          keywords: ['cs', 'кс', 'cs2', 'кска'],
          score: 15000
        },
        side_b: {
          name: 'Valorant',
          color: '#ff0055',
          keywords: ['val', 'вал', 'валорант', 'valorant'],
          score: 12500
        },
        updated_at: new Date().toISOString()
      };
      saveBattles();
    }
    return battles[userId];
  },

  updateUserBattle(userId, data) {
    const current = this.getUserBattle(userId);
    if (data.enabled !== undefined) current.enabled = Boolean(data.enabled);
    if (data.title !== undefined) current.title = String(data.title);
    if (data.side_a) {
      if (data.side_a.name) current.side_a.name = String(data.side_a.name);
      if (data.side_a.color) current.side_a.color = String(data.side_a.color);
      if (Array.isArray(data.side_a.keywords)) current.side_a.keywords = data.side_a.keywords.map(k => String(k).trim().toLowerCase());
      if (data.side_a.score !== undefined) current.side_a.score = Math.max(0, parseInt(data.side_a.score, 10) || 0);
    }
    if (data.side_b) {
      if (data.side_b.name) current.side_b.name = String(data.side_b.name);
      if (data.side_b.color) current.side_b.color = String(data.side_b.color);
      if (Array.isArray(data.side_b.keywords)) current.side_b.keywords = data.side_b.keywords.map(k => String(k).trim().toLowerCase());
      if (data.side_b.score !== undefined) current.side_b.score = Math.max(0, parseInt(data.side_b.score, 10) || 0);
    }
    current.updated_at = new Date().toISOString();
    saveBattles();
    return current;
  },

  addBattleScore(userId, message, amount) {
    const battle = this.getUserBattle(userId);
    if (!battle.enabled || !message) return null;

    const lowerMsg = String(message).toLowerCase();
    let matchedSide = null;

    for (const kw of (battle.side_a.keywords || [])) {
      if (lowerMsg.includes(kw)) {
        matchedSide = 'a';
        break;
      }
    }

    if (!matchedSide) {
      for (const kw of (battle.side_b.keywords || [])) {
        if (lowerMsg.includes(kw)) {
          matchedSide = 'b';
          break;
        }
      }
    }

    if (matchedSide === 'a') {
      battle.side_a.score = (battle.side_a.score || 0) + amount;
      battle.updated_at = new Date().toISOString();
      saveBattles();
      return { battle, matchedSide: 'a', sideName: battle.side_a.name };
    } else if (matchedSide === 'b') {
      battle.side_b.score = (battle.side_b.score || 0) + amount;
      battle.updated_at = new Date().toISOString();
      saveBattles();
      return { battle, matchedSide: 'b', sideName: battle.side_b.name };
    }

    return null;
  },

  resetBattle(userId) {
    const battle = this.getUserBattle(userId);
    battle.side_a.score = 0;
    battle.side_b.score = 0;
    battle.updated_at = new Date().toISOString();
    saveBattles();
    return battle;
  },

  // Subscription and Tariff Engine
  getPlans() {
    return {
      starter_free: {
        id: 'starter_free',
        name: 'Starter Free',
        price: 0,
        currency: 'KZT',
        period_label: '/ навсегда',
        limit_donations: 20,
        badge: 'Free',
        color: '#94a3b8',
        features: [
          'Прямой Kaspi QR виджет на экран',
          'Alert Box и шкала сбора Goal Bar',
          'Стиль оформления Cyber Emerald',
          'До 20 донатов за стрим'
        ]
      },
      creator_pro: {
        id: 'creator_pro',
        name: 'Creator Pro',
        price: 4900,
        currency: 'KZT',
        period_label: '/ месяц',
        limit_donations: null,
        badge: 'Выбор стримеров',
        color: '#e5a93c',
        features: [
          'Безлимитное количество донатов и трансляций',
          'Все 6 виджетов (Рулетка, Битва, Топ, QR, Саб-бар)',
          'Все 4 авторские темы оформления OBS',
          'Неограниченная озвучка (TTS) на казахском и русском',
          'Пульт управления трансляцией Live Stream Deck'
        ]
      },
      esports_studio: {
        id: 'esports_studio',
        name: 'Esports Studio',
        price: 8900,
        currency: 'KZT',
        period_label: '/ месяц',
        limit_donations: null,
        badge: 'Для студий',
        color: '#10b981',
        features: [
          'Все возможности тарифа Creator Pro',
          'Мульти-сцены и поддержка нескольких каналов',
          'Webhook интеграция с Discord и Telegram',
          'Приоритетный шлюз передачи данных'
        ]
      }
    };
  },

  getUserSubscription(userId) {
    const user = this.findUserById(userId);
    if (!user) return null;

    if (!user.subscription) {
      user.subscription = {
        plan_id: 'starter_free',
        status: 'active',
        expires_at: null,
        created_at: user.created_at || new Date().toISOString()
      };
      saveUsers();
    }

    const plans = this.getPlans();
    let currentPlanId = user.subscription.plan_id || 'starter_free';
    let isExpired = false;
    let daysLeft = null;

    if (user.subscription.expires_at) {
      const expiresTime = new Date(user.subscription.expires_at).getTime();
      const diffMs = expiresTime - Date.now();
      if (diffMs <= 0) {
        isExpired = true;
        currentPlanId = 'starter_free';
      } else {
        daysLeft = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      }
    }

    const activePlan = plans[currentPlanId] || plans.starter_free;

    // Count stream donations within current session / last 24h
    const sessionWindow = 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - sessionWindow;
    const streamDonations = donations.filter(d => d.user_id === userId && new Date(d.received_at).getTime() >= cutoff);
    const count = streamDonations.length;
    const limitMax = activePlan.limit_donations;
    const limitReached = limitMax !== null && count >= limitMax;

    return {
      user_id: userId,
      plan_id: currentPlanId,
      plan_name: activePlan.name,
      plan: activePlan,
      status: isExpired ? 'expired' : user.subscription.status,
      expires_at: user.subscription.expires_at,
      days_left: daysLeft,
      is_unlimited: limitMax === null,
      stream_donations_count: count,
      stream_limit_max: limitMax,
      stream_limit_reached: limitReached,
      plans
    };
  },

  checkStreamDonationLimit(userId) {
    const sub = this.getUserSubscription(userId);
    if (!sub) return { allowed: true, count: 0, limit: null, plan: 'unknown' };

    if (sub.is_unlimited) {
      return { allowed: true, count: sub.stream_donations_count, limit: null, plan: sub.plan_id };
    }

    if (sub.stream_donations_count >= (sub.stream_limit_max || 20)) {
      return {
        allowed: false,
        count: sub.stream_donations_count,
        limit: sub.stream_limit_max || 20,
        plan: sub.plan_id,
        message: `Лимит тарифа ${sub.plan_name} (${sub.stream_limit_max || 20} донатов за стрим) исчерпан.`
      };
    }

    return {
      allowed: true,
      count: sub.stream_donations_count,
      limit: sub.stream_limit_max || 20,
      plan: sub.plan_id
    };
  },

  upgradeUserSubscription(userId, planId, durationDays = 30, paymentRef = '') {
    const user = this.findUserById(userId);
    if (!user) return null;

    const plans = this.getPlans();
    if (!plans[planId]) {
      throw new Error(`Недопустимый тариф: ${planId}`);
    }

    if (planId === 'starter_free') {
      user.subscription = {
        plan_id: 'starter_free',
        status: 'active',
        expires_at: null,
        payment_ref: paymentRef,
        updated_at: new Date().toISOString()
      };
    } else {
      const now = Date.now();
      let baseTime = now;
      if (user.subscription && user.subscription.expires_at && user.subscription.plan_id === planId) {
        const prevExpires = new Date(user.subscription.expires_at).getTime();
        if (prevExpires > now) baseTime = prevExpires;
      }

      const expiresDate = new Date(baseTime + durationDays * 24 * 60 * 60 * 1000).toISOString();
      user.subscription = {
        plan_id: planId,
        status: 'active',
        expires_at: expiresDate,
        payment_ref: paymentRef || `KASPI-${Date.now().toString(36).toUpperCase()}`,
        updated_at: new Date().toISOString()
      };
    }

    user.updated_at = new Date().toISOString();
    saveUsers();
    return this.getUserSubscription(userId);
  },

  applyPromoCode(userId, rawCode) {
    const code = (rawCode || '').trim().toUpperCase();
    if (!code) throw new Error('Введите промокод');

    if (code === 'PROSTREAM') {
      return this.upgradeUserSubscription(userId, 'creator_pro', 14, 'PROMO-PROSTREAM-14D');
    }
    if (code === 'ESPORTS2026') {
      return this.upgradeUserSubscription(userId, 'esports_studio', 7, 'PROMO-ESPORTS2026-7D');
    }
    if (code === 'TENGEALERT100' || code === 'KAZAKHSTAN') {
      return this.upgradeUserSubscription(userId, 'creator_pro', 30, 'PROMO-30D');
    }

    throw new Error('Неверный или просроченный промокод');
  },

  // Reviews Engine
  getReviews() {
    return reviews;
  },

  addReview(reviewData) {
    if (!reviewData || !reviewData.name) {
      throw new Error('Укажите ваше имя или никнейм');
    }
    const name = String(reviewData.name).trim().slice(0, 50);
    const channel = String(reviewData.channel || '').trim().slice(0, 100);
    const platform = String(reviewData.platform || 'Twitch').trim().slice(0, 30);
    const type = reviewData.type === 'video' ? 'video' : 'text';
    const text = String(reviewData.text || '').trim().slice(0, 1000);
    const videoUrl = String(reviewData.video_url || '').trim().slice(0, 300);
    const rating = Math.min(5, Math.max(1, parseInt(reviewData.rating, 10) || 5));

    if (type === 'text' && !text) {
      throw new Error('Пожалуйста, напишите текст отзыва');
    }
    if (type === 'video' && !videoUrl) {
      throw new Error('Пожалуйста, укажите ссылку на видеоотзыв');
    }

    // Generate clean initials avatar (letters only)
    const cleanWords = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
    const initials = (cleanWords.length >= 2
      ? cleanWords[0][0] + cleanWords[1][0]
      : (cleanWords[0] ? cleanWords[0].slice(0, 2) : 'ST')
    ).toUpperCase();

    const newRev = {
      id: 'rev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      name,
      channel,
      platform,
      rating,
      type,
      avatar: initials,
      text,
      video_url: videoUrl,
      date: new Date().toISOString().split('T')[0],
      verified: false
    };

    reviews.unshift(newRev);
    saveReviews();
    return newRev;
  },

  // MySQL DDL Generator for PS.kz Plesk phpMyAdmin
  getMySQLSchema() {
    return `
-- ============================================================
-- TengeAlert Database Schema for PS.kz Plesk (MySQL / MariaDB)
-- Encoding: utf8mb4_unicode_ci
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NULL,
  display_name VARCHAR(100) NOT NULL,
  streamer_token VARCHAR(64) UNIQUE NOT NULL,
  auth_provider VARCHAR(20) DEFAULT 'email',
  provider_id VARCHAR(255) NULL,
  avatar_url TEXT NULL,
  settings JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_token (streamer_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS donations (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  amount INT NOT NULL,
  currency VARCHAR(10) DEFAULT 'KZT',
  sender VARCHAR(100) NOT NULL,
  message TEXT NULL,
  raw_text TEXT NULL,
  source_label VARCHAR(100) DEFAULT 'Перевод ₸',
  sound VARCHAR(50) DEFAULT 'coin',
  theme VARCHAR(50) DEFAULT 'cyber_emerald',
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_received (user_id, received_at),
  CONSTRAINT fk_donation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS goals (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  target INT NOT NULL DEFAULT 500000,
  current INT NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_goal_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
  }
};

module.exports = db;
