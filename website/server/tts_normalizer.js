/**
 * TengeAlert Natural Dual-Language TTS Normalizer
 * 
 * Capabilities:
 * 1. Dual-Language Detection (Kazakh kk-KZ vs Russian ru-RU)
 *    - Detects specific Kazakh alphabet glyphs: ә, і, ң, ғ, ү, ұ, қ, ө, һ
 *    - Recognizes common Kazakh vocabulary & speech markers
 * 2. Number-to-Words Expansion for Currencies (₸ / KZT)
 *    - Kazakh: 1 - 1,000,000,000+ (бір, екі, үш... он, жүз, мың, миллион)
 *    - Russian: 1 - 1,000,000,000+ (один, два, три... сто, тысяча, миллион)
 * 3. Anti-Spam & Text Hygiene
 *    - Collapses repeated characters (e.g. "ааааааааааа" -> "ааа")
 *    - Removes URLs and domain links
 *    - Cleans excessive emojis, punctuation and zalgo symbols
 */

// Kazakh unique letters
const KAZAKH_LETTERS_REGEX = /[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/;

// Common Kazakh words/markers frequently seen in stream donations
const KAZAKH_WORDS = [
  'салам', 'сәлем', 'рахмет', 'рақымет', 'қайырлы', 'бауырым', 'бауыр', 'жарайсың',
  'жарасың', 'мықты', 'теңге', 'тенге', 'досым', 'достар', 'алға', 'алга', 'көп',
  'рахметіңізге', 'құттықтаймын', 'аға', 'інішек', 'қарындас', 'жігіттер', 'бала',
  'сүйінші', 'күшті', 'керемет', 'жақсы', 'болашақ', 'аман', 'бол', 'болыңыз',
  'қалайсың', 'не', 'істеп', 'жатсың', 'ойна', 'бас'
];

/**
 * Detect language of the donation message.
 * Returns 'kk-KZ' if Kazakh letters or markers are present, else 'ru-RU'.
 */
function detectLanguage(text = '') {
  if (!text || typeof text !== 'string') return 'ru-RU';

  // 1. Definite proof: Kazakh specific Cyrillic letters
  if (KAZAKH_LETTERS_REGEX.test(text)) {
    return 'kk-KZ';
  }

  // 2. Vocabulary marker count
  const words = text.toLowerCase().split(/[\s,.;:!?+-_/\\()]+/);
  let kazakhScore = 0;
  for (const w of words) {
    if (w && KAZAKH_WORDS.includes(w)) {
      kazakhScore += 2;
    }
  }

  if (kazakhScore >= 2) {
    return 'kk-KZ';
  }

  return 'ru-RU';
}

/**
 * Kazakh Number to Words Converter
 */
const KZ_ONES = ['', 'бір', 'екі', 'үш', 'төрт', 'бес', 'алты', 'жеті', 'сегіз', 'тоғыз'];
const KZ_TENS = ['', 'он', 'жиырма', 'отыз', 'қырық', 'елу', 'алпыс', 'жетпіс', 'сексен', 'тоқсан'];

function numberToKazakhWords(num) {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return 'нөл';

  const parts = [];

  // Millions
  const millions = Math.floor(num / 1000000);
  if (millions > 0) {
    parts.push(numberToKazakhWords(millions) + ' миллион');
    num %= 1000000;
  }

  // Thousands
  const thousands = Math.floor(num / 1000);
  if (thousands > 0) {
    if (thousands === 1) {
      parts.push('мың');
    } else {
      parts.push(convertUnderThousandKZ(thousands) + ' мың');
    }
    num %= 1000;
  }

  // Under thousand
  if (num > 0) {
    parts.push(convertUnderThousandKZ(num));
  }

  return parts.join(' ').trim();
}

function convertUnderThousandKZ(n) {
  const parts = [];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const tens = Math.floor(remainder / 10);
  const ones = remainder % 10;

  if (hundreds > 0) {
    if (hundreds === 1) {
      parts.push('жүз');
    } else {
      parts.push(KZ_ONES[hundreds] + ' жүз');
    }
  }

  if (tens > 0) {
    parts.push(KZ_TENS[tens]);
  }

  if (ones > 0) {
    parts.push(KZ_ONES[ones]);
  }

  return parts.join(' ');
}

/**
 * Russian Number to Words Converter
 */
const RU_ONES = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const RU_ONES_FEM = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const RU_TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const RU_TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const RU_HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function numberToRussianWords(num) {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return 'ноль';

  const parts = [];

  // Millions
  const millions = Math.floor(num / 1000000);
  if (millions > 0) {
    parts.push(convertUnderThousandRU(millions, false) + ' ' + declensionRU(millions, 'миллион', 'миллиона', 'миллионов'));
    num %= 1000000;
  }

  // Thousands
  const thousands = Math.floor(num / 1000);
  if (thousands > 0) {
    parts.push(convertUnderThousandRU(thousands, true) + ' ' + declensionRU(thousands, 'тысяча', 'тысячи', 'тысяч'));
    num %= 1000;
  }

  // Under thousand
  if (num > 0) {
    parts.push(convertUnderThousandRU(num, false));
  }

  return parts.join(' ').trim();
}

function convertUnderThousandRU(n, isFeminine = false) {
  const parts = [];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const tens = Math.floor(remainder / 10);
  const ones = remainder % 10;

  if (hundreds > 0) {
    parts.push(RU_HUNDREDS[hundreds]);
  }

  if (tens === 1) {
    parts.push(RU_TEENS[ones]);
  } else {
    if (tens > 1) {
      parts.push(RU_TENS[tens]);
    }
    if (ones > 0) {
      parts.push(isFeminine ? RU_ONES_FEM[ones] : RU_ONES[ones]);
    }
  }

  return parts.join(' ');
}

function declensionRU(n, one, two, five) {
  const n100 = Math.abs(n) % 100;
  const n10 = n100 % 10;
  if (n100 >= 11 && n100 <= 19) return five;
  if (n10 === 1) return one;
  if (n10 >= 2 && n10 <= 4) return two;
  return five;
}

/**
 * Format currency amount in spoken words.
 */
function formatSpokenAmount(amount, lang = 'kk-KZ') {
  amount = parseInt(amount, 10) || 0;
  if (lang === 'kk-KZ') {
    const words = numberToKazakhWords(amount);
    return `${words} теңге`;
  } else {
    const words = numberToRussianWords(amount);
    return `${words} тенге`;
  }
}

/**
 * Anti-Spam and Text Sanitizer for Speech Synthesis
 */
function cleanMessageForTTS(text = '') {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // 1. Remove URLs and domain links
  cleaned = cleaned.replace(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(kz|ru|com|org|net|io|me|app)\b)/gi, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  // 2. Collapse repeated letters/numbers (e.g. "аааааааа" -> "аа")
  cleaned = cleaned.replace(/([\p{L}\p{N}])\1{2,}/gu, '$1$1');

  // 3. Remove weird zalgo / control unicode chars
  cleaned = cleaned.replace(/[\u0300-\u036f\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g, '');

  // 4. Collapse repeated punctuation (e.g. "!!!!!!" -> "!", "))))" -> "")
  cleaned = cleaned.replace(/!{2,}/g, '!');
  cleaned = cleaned.replace(/\?{2,}/g, '?');
  cleaned = cleaned.replace(/[._~-]{2,}/g, '.');
  cleaned = cleaned.replace(/\){2,}/g, '');
  cleaned = cleaned.replace(/\({2,}/g, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  // 5. Replace inline currency abbreviations like "1000₸", "500 тг", "2000 tenge" with word equivalents
  cleaned = cleaned.replace(/(\d+)\s*(₸|тг|тенге|теңге|kzt)/gi, (match, digits) => {
    return `${digits} тенге`;
  });

  // 6. Truncate max TTS speech to 250 characters to prevent audio lockout
  if (cleaned.length > 250) {
    cleaned = cleaned.substring(0, 247).trim() + '...';
  }

  return cleaned.trim();
}

/**
 * Generate full natural speech sentence for TTS engine
 */
function normalizeForTTS({ sender = 'Аноним', amount = 0, message = '', langOverride = null }) {
  const cleanMsg = cleanMessageForTTS(message);
  const cleanSender = (sender || 'Аноним').trim().replace(/[\r\n\t]/g, ' ').substring(0, 40);

  // Auto-detect language unless explicitly forced
  const detectedLang = langOverride || (cleanMsg ? detectLanguage(cleanMsg) : detectLanguage(cleanSender));
  const spokenAmount = formatSpokenAmount(amount, detectedLang);

  let fullSpeech = '';
  if (detectedLang === 'kk-KZ') {
    if (cleanMsg) {
      fullSpeech = `${cleanSender}, ${spokenAmount}. «${cleanMsg}»`;
    } else {
      fullSpeech = `${cleanSender} ${spokenAmount} қолдау көрсетті.`;
    }
  } else {
    if (cleanMsg) {
      fullSpeech = `${cleanSender}, ${spokenAmount}. «${cleanMsg}»`;
    } else {
      fullSpeech = `${cleanSender} задонатил ${spokenAmount}.`;
    }
  }

  return {
    lang: detectedLang,
    sender: cleanSender,
    amount: parseInt(amount, 10) || 0,
    amountSpoken: spokenAmount,
    cleanMessage: cleanMsg,
    speechText: fullSpeech
  };
}

module.exports = {
  detectLanguage,
  numberToKazakhWords,
  numberToRussianWords,
  formatSpokenAmount,
  cleanMessageForTTS,
  normalizeForTTS
};
