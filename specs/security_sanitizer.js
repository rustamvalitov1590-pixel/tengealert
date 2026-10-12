/**
 * TengeAlert Security & Privacy Sanitizer
 * 
 * Provides defense-in-depth protection for streamers and donors:
 * 1. Immediate rejection of 2FA, OTP, passwords, and security alerts.
 * 2. Redaction of sensitive financial data (balances, card numbers, accounts).
 * 3. HTML escaping for broadcast safety (XSS prevention).
 */

// Blacklist triggers for 2FA, authentication, passwords, or security notices.
// ANY notification matching these patterns is IMMEDIATELY DROPPED from memory.
const SECURITY_DROP_PATTERNS = [
  /код\s+подтверждения/i,
  /смс-код/i,
  /одноразовый\s+код/i,
  /пароль/i,
  /никому\s+не\s+сообщайте/i,
  /3d\s*secure/i,
  /вход\s+(?:в\s+)?(?:личный\s+)?(?:кабинет|приложение|систему|аккаунт)/i,
  /нового\s+устройства/i,
  /восстановление\s+доступа/i,
  /подтвердите\s+вход/i,
  /cvv/i,
  /cvc/i,
  /пин-код/i,
  /pin-code/i,
  /списание\s+за\s+кредит/i,
  /задолженность/i,
  /арест\s+счета/i,
  /подозрительн(?:ая|ый|ое)\s+(?:операция|действие|вход)/i,
  /карта\s+заблокирована/i,
  /blocked/i,
  /security\s+code/i,
  /verification\s+code/i
];

/**
 * Checks if incoming text is a sensitive security alert, OTP, or auth code.
 * @param {string} text 
 * @returns {boolean} true if notification must be dropped immediately.
 */
function isSecurityOrAuthAlert(text) {
  if (!text || typeof text !== 'string') return false;
  for (const pattern of SECURITY_DROP_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Strips account balances, card numbers, and other non-donation sensitive data.
 * @param {string} text 
 * @returns {string} Sanitized string safe for logging or storage.
 */
function sanitizeFinancialText(text) {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;

  // 1. Remove balance & available funds disclosures
  // Examples: "Доступно: 45 000 KZT", "Остаток: 120 000 ₸", "Баланс: 50 000"
  sanitized = sanitized.replace(/(?:Доступно|Остаток|Баланс)[\s:]+[\d\s]+(?:₸|KZT|тенге)?(?:\.\d{2})?/gi, '');

  // 2. Redact card numbers or card masks
  // Examples: "карты *1234", "карта 4400 **** **** 1234"
  sanitized = sanitized.replace(/(?:карт[аые]\s+)?(?:\*+\d{4}|\d{4}\s*(?:\*+|\d{4})\s*(?:\*+|\d{4})\s*\d{4})/gi, '[карта скрыта]');

  // 3. Redact potential IIN / identification numbers (12 consecutive digits)
  sanitized = sanitized.replace(/\b\d{12}\b/g, '[ИИН скрыт]');

  // 4. Redact full phone numbers (e.g. +7 701 123 45 67)
  sanitized = sanitized.replace(/(?:\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g, '[тел. скрыт]');

  // Clean redundant whitespace
  sanitized = sanitized.replace(/\s{2,}/g, ' ').trim();

  return sanitized;
}

/**
 * HTML entities escaping to prevent XSS in web overlays and browser sources.
 * @param {string} str 
 * @returns {string} Safe HTML string
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Censors profane or banned words to protect streamers from platform bans.
 * Supports Russian, Kazakh, and custom user-defined stop words.
 * @param {string} text 
 * @param {Array<string>} customWords 
 * @returns {string} Text with profanity replaced by asterisks
 */
function censorProfanity(text, customWords = []) {
  if (!text || typeof text !== 'string') return '';

  const defaultPatterns = [
    /\b(?:х[уеё]й|х[уеё]е|п[ие]зд|еб[аеёиу]|ёб[ае]|бл[яе]д|сук[аио]|муд[аио]|гандон|гондон|шлюх|чмо)\w*/gi,
    /\b(?:қотақ|жалеп|сігем|сігіс|амшық)\w*/gi
  ];

  let result = text;

  for (const pattern of defaultPatterns) {
    result = result.replace(pattern, (match) => '*'.repeat(match.length));
  }

  if (Array.isArray(customWords) && customWords.length > 0) {
    for (const word of customWords) {
      if (!word || typeof word !== 'string') continue;
      const cleanWord = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!cleanWord) continue;
      const reg = new RegExp(`\\b${cleanWord}\\w*`, 'gi');
      result = result.replace(reg, (match) => '*'.repeat(match.length));
    }
  }

  return result;
}

module.exports = {
  isSecurityOrAuthAlert,
  sanitizeFinancialText,
  escapeHtml,
  censorProfanity
};

