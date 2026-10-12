// specs/test_tts_normalizer.js
const assert = require('assert');
const {
  detectLanguage,
  numberToKazakhWords,
  numberToRussianWords,
  formatSpokenAmount,
  cleanMessageForTTS,
  normalizeForTTS
} = require('../website/server/tts_normalizer');

console.log('=== STARTING TTS NORMALIZER TESTS ===\n');

// 1. Language Detection Tests
console.log('1. Testing Kazakh specific letter detection...');
assert.strictEqual(detectLanguage('Салам бәріне!'), 'kk-KZ', 'Should detect ә');
assert.strictEqual(detectLanguage('Қайырлы күн, стример!'), 'kk-KZ', 'Should detect Қ, ұ');
assert.strictEqual(detectLanguage('Күшті ойын, жарайсың!'), 'kk-KZ', 'Should detect ү, ң');
assert.strictEqual(detectLanguage('Інішек, алға!'), 'kk-KZ', 'Should detect І');
assert.strictEqual(detectLanguage('Өте әдемі визуал!'), 'kk-KZ', 'Should detect Ө, ә');
assert.strictEqual(detectLanguage('Бауырым саған рахмет көп-көп'), 'kk-KZ', 'Should detect Kazakh vocabulary markers');

console.log('2. Testing Russian text detection...');
assert.strictEqual(detectLanguage('Привет, отличный стрим!'), 'ru-RU', 'Should detect Russian');
assert.strictEqual(detectLanguage('Красавчик, тащи катку на турнире!'), 'ru-RU', 'Should detect Russian');
assert.strictEqual(detectLanguage('Удачи в игре и хорошего вечера'), 'ru-RU', 'Should detect Russian');

// 2. Kazakh Numbers to Words Tests
console.log('\n3. Testing Kazakh numbers to words...');
assert.strictEqual(numberToKazakhWords(1), 'бір');
assert.strictEqual(numberToKazakhWords(10), 'он');
assert.strictEqual(numberToKazakhWords(25), 'жиырма бес');
assert.strictEqual(numberToKazakhWords(100), 'жүз');
assert.strictEqual(numberToKazakhWords(500), 'бес жүз');
assert.strictEqual(numberToKazakhWords(1000), 'мың');
assert.strictEqual(numberToKazakhWords(2500), 'екі мың бес жүз');
assert.strictEqual(numberToKazakhWords(15000), 'он бес мың');
assert.strictEqual(numberToKazakhWords(50000), 'елу мың');
assert.strictEqual(numberToKazakhWords(1000000), 'бір миллион');
console.log('   Sample Kazakh: 2500 ->', numberToKazakhWords(2500));

// 3. Russian Numbers to Words Tests
console.log('\n4. Testing Russian numbers to words...');
assert.strictEqual(numberToRussianWords(1), 'один');
assert.strictEqual(numberToRussianWords(10), 'десять');
assert.strictEqual(numberToRussianWords(25), 'двадцать пять');
assert.strictEqual(numberToRussianWords(100), 'сто');
assert.strictEqual(numberToRussianWords(500), 'пятьсот');
assert.strictEqual(numberToRussianWords(1000), 'одна тысяча');
assert.strictEqual(numberToRussianWords(2000), 'две тысячи');
assert.strictEqual(numberToRussianWords(2500), 'две тысячи пятьсот');
assert.strictEqual(numberToRussianWords(15000), 'пятнадцать тысяч');
assert.strictEqual(numberToRussianWords(50000), 'пятьдесят тысяч');
console.log('   Sample Russian: 2500 ->', numberToRussianWords(2500));

// 4. Currency Formatting Tests
console.log('\n5. Testing spoken currency formatting...');
assert.strictEqual(formatSpokenAmount(5000, 'kk-KZ'), 'бес мың теңге');
assert.strictEqual(formatSpokenAmount(5000, 'ru-RU'), 'пять тысяч тенге');

// 5. Anti-Spam Cleaning Tests
console.log('\n6. Testing anti-spam and text hygiene...');
assert.strictEqual(cleanMessageForTTS('ааааааааааааааааа'), 'аа');
assert.strictEqual(cleanMessageForTTS('Стрим топ!!!!!!!!!!!'), 'Стрим топ!');
assert.strictEqual(cleanMessageForTTS('Заходи на https://spam-link.kz прямо сейчас'), 'Заходи на прямо сейчас');

// 6. Full Normalization Tests
console.log('\n7. Testing full TTS normalization pipeline...');
const normKZ = normalizeForTTS({
  sender: 'Айдос',
  amount: 5000,
  message: 'Бауырым, керемет ойын! Алға Қазақстан!'
});
console.log('   Kazakh normalization:', normKZ);
assert.strictEqual(normKZ.lang, 'kk-KZ');
assert.strictEqual(normKZ.amountSpoken, 'бес мың теңге');
assert(normKZ.speechText.includes('бес мың теңге'));

const normRU = normalizeForTTS({
  sender: 'Дмитрий',
  amount: 2500,
  message: 'Тащи турнир, бро! Отличная игра!'
});
console.log('   Russian normalization:', normRU);
assert.strictEqual(normRU.lang, 'ru-RU');
assert.strictEqual(normRU.amountSpoken, 'две тысячи пятьсот тенге');
assert(normRU.speechText.includes('две тысячи пятьсот тенге'));

console.log('\n=== ALL TTS NORMALIZER TESTS PASSED (100%) ===');
