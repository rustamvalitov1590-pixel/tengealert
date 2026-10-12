/**
 * Bank Push Interceptor Test & Validation Utility
 * Validates regular expressions & security sanitization against real-world scenarios.
 */

const fs = require('fs');
const path = require('path');
const { isSecurityOrAuthAlert, sanitizeFinancialText, escapeHtml } = require('./security_sanitizer');

const specsPath = path.join(__dirname, 'banks.json');
const specs = JSON.parse(fs.readFileSync(specsPath, 'utf8'));

function parseNotification(text, packageName = null) {
  if (!text || typeof text !== 'string') return null;

  // 1. Critical Security Gate: Immediate Drop of 2FA / Auth / Password pushes
  if (isSecurityOrAuthAlert(text)) {
    return {
      rejected: true,
      security_drop: true,
      reason: 'Sensitive 2FA / Authentication / Security push dropped'
    };
  }

  // 2. Sensitive Data Redaction (Strip balances, card numbers, accounts)
  const sanitizedText = sanitizeFinancialText(text);

  const isKnownPkg = packageName && specs.banks.some(b => b.package_name === packageName);
  for (const bank of specs.banks) {
    if (!bank.enabled) continue;
    if (isKnownPkg && bank.package_name !== packageName) continue;

    for (const pattern of bank.patterns) {
      let regexStr = pattern.regex;
      let flags = '';
      if (regexStr.startsWith('(?i)')) {
        regexStr = regexStr.substring(4);
        flags += 'i';
      }
      
      const regex = new RegExp(regexStr, flags);
      // We run the regex against original text to match specific structures,
      // but return sanitized text in the final payload
      const match = regex.exec(text);

      if (match) {
        let rawAmount = match[pattern.groups.amount] || '';
        // Split on decimal if present
        let cleanAmount = 0;
        if (rawAmount.includes('.')) {
          const parts = rawAmount.split('.');
          const whole = parts[0].replace(/[\s\u00A0]/g, '');
          cleanAmount = parseInt(whole, 10) || 0;
        } else {
          cleanAmount = parseInt(rawAmount.replace(/[\s\u00A0]/g, ''), 10) || 0;
        }

        let sender = 'Аноним';
        if (pattern.groups.sender && match[pattern.groups.sender]) {
          sender = match[pattern.groups.sender].trim();
        } else if (pattern.groups.sender_alt1 && match[pattern.groups.sender_alt1]) {
          sender = match[pattern.groups.sender_alt1].trim();
        } else if (pattern.groups.sender_alt2 && match[pattern.groups.sender_alt2]) {
          sender = match[pattern.groups.sender_alt2].trim();
        }

        let message = '';
        if (pattern.groups.message && match[pattern.groups.message]) {
          message = match[pattern.groups.message].trim();
        }

        return {
          bank_id: bank.id,
          bank_name: bank.name,
          pattern_type: pattern.type,
          amount: cleanAmount,
          currency: 'KZT',
          sender: escapeHtml(sender),
          message: escapeHtml(message),
          raw_text: sanitizedText,
          timestamp: new Date().toISOString()
        };
      }
    }
  }

  return null;
}

// Self-test execution
function runAllTests() {
  console.log('--- 1. RUNNING BANK PARSER SPECIFICATION TESTS ---');
  let totalTests = 0;
  let passedTests = 0;

  for (const bank of specs.banks) {
    console.log(`\nTesting: ${bank.name} (${bank.id})`);
    for (const pattern of bank.patterns) {
      for (const sample of pattern.examples) {
        totalTests++;
        const result = parseNotification(sample, bank.package_name);
        if (result && !result.rejected && result.amount > 0) {
          console.log(`  [PASS] "${sample}"\n         -> ${result.amount} ₸ | От: "${result.sender}" | Сообщение: "${result.message}"`);
          passedTests++;
        } else {
          console.error(`  [FAIL] Could not parse: "${sample}"`);
        }
      }
    }
  }

  console.log(`\n--- 2. RUNNING 2FA & SECURITY DROP TESTS ---`);
  const securitySamples = [
    'Kaspi.kz: Код подтверждения 8491. Никому не сообщайте!',
    'Halyk: Одноразовый код 492041 для входа в приложение',
    'Freedom: Подтвердите операцию. СМС-код: 102938',
    'Внимание! Вход в личный кабинет с нового устройства',
    'Операция отклонена: карта заблокирована банком'
  ];

  let passedSecurityTests = 0;
  for (const secSample of securitySamples) {
    totalTests++;
    const res = parseNotification(secSample);
    if (res && res.rejected && res.security_drop) {
      console.log(`  [SECURITY PASS] Correctly dropped: "${secSample}"`);
      passedTests++;
      passedSecurityTests++;
    } else {
      console.error(`  [SECURITY FAIL] Leaked security push: "${secSample}"`);
    }
  }

  console.log(`\n--- 3. RUNNING FINANCIAL DATA SANITIZATION TESTS ---`);
  const balanceSample = 'Перевод: +5 000.00 KZT от ASSET B. Доступно: 45 000 KZT';
  totalTests++;
  const sanitizedRes = parseNotification(balanceSample);
  if (sanitizedRes && !sanitizedRes.raw_text.includes('45 000') && !sanitizedRes.raw_text.includes('Доступно')) {
    console.log(`  [PRIVACY PASS] Balance successfully stripped from raw_text: "${sanitizedRes.raw_text}"`);
    passedTests++;
  } else {
    console.error(`  [PRIVACY FAIL] Balance leaked in raw_text!`);
  }

  console.log(`\n=================================================`);
  console.log(`Overall Result: ${passedTests}/${totalTests} tests passed (including security & privacy).`);
  console.log(`=================================================`);
  return passedTests === totalTests;
}

if (require.main === module) {
  runAllTests();
}

module.exports = { parseNotification, specs, runAllTests };
