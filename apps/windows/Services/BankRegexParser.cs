using System;
using System.Text.RegularExpressions;
using TengeAlert.Windows.Models;

namespace TengeAlert.Windows.Services
{
    public static class BankRegexParser
    {
        // 1. Kaspi Gold patterns
        private static readonly Regex KaspiGoldMsgRegex = new Regex(
            @"(?:Перевод|Пополнение|Вам поступил перевод)\s+([\d\s]+)\s*₸\s+от\s+([^\.]+?)(?:\s+[сs]\s+(?:сообщением|комментарием))?\s*[«""“]([^»""”]+)[»""”]",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex KaspiGoldSimpleRegex = new Regex(
            @"(?:Перевод|Пополнение|Вам поступил перевод)\s+([\d\s]+)\s*₸\s+от\s+([^\.]+?)(?:\.|$)",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        // 2. Kaspi Pay patterns
        private static readonly Regex KaspiPayPaymentRegex = new Regex(
            @"Оплата\s+([\d\s]+)\s*₸\s+от\s+(.+?)(?:\.|$)",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex KaspiPayQrRegex = new Regex(
            @"Поступление\s+([\d\s]+)\s*₸\s+Kaspi\s+QR",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        // 3. Halyk Bank
        private static readonly Regex HalykTransferRegex = new Regex(
            @"Перевод:\s*\+?([\d\s]+(?:\.\d{2})?)\s*KZT\s+от\s+([^\.]+?)(?:\.\s*Доступно|$)",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex HalykTopupRegex = new Regex(
            @"Пополнение\s*\+?([\d\s]+(?:\.\d{2})?)\s*KZT\s+от\s+([^\.]+?)(?:\.|$)",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        // 4. Freedom Bank
        private static readonly Regex FreedomCardRegex = new Regex(
            @"Пополнение\s+карты\s+\*?\d*\s*на\s+([\d\s]+)\s*KZT\s+от\s+([^\.]+?)(?:\.|$)",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex FreedomTransferRegex = new Regex(
            @"Перевод\s+([\d\s]+)\s*₸\s+от\s+([^\.]+?)(?:\.|$)",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        // 5. Jusan Bank
        private static readonly Regex JusanSumFirstRegex = new Regex(
            @"Перевод\s+от\s+([^\.]+?)\s+на\s+сумму\s+([\d\s]+)\s*KZT",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex JusanSimpleRegex = new Regex(
            @"Поступление\s+([\d\s]+)\s*₸\s+от\s+([^\.]+?)(?:\.|$)",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        public static DonationEvent? Parse(string rawText, string packageName = "")
        {
            if (string.IsNullOrWhiteSpace(rawText)) return null;

            string cleanText = rawText.Replace("\u00A0", " ").Trim();

            // 1. Check Kaspi Gold with message
            var m = KaspiGoldMsgRegex.Match(cleanText);
            if (m.Success)
            {
                return new DonationEvent
                {
                    Bank = "kaspi_gold",
                    SourceLabel = "Kaspi Gold",
                    Amount = ParseAmount(m.Groups[1].Value),
                    Sender = m.Groups[2].Value.Trim(),
                    Message = m.Groups[3].Value.Trim(),
                    RawText = cleanText
                };
            }

            // 2. Check Kaspi Gold simple
            m = KaspiGoldSimpleRegex.Match(cleanText);
            if (m.Success)
            {
                return new DonationEvent
                {
                    Bank = "kaspi_gold",
                    SourceLabel = "Kaspi Gold",
                    Amount = ParseAmount(m.Groups[1].Value),
                    Sender = m.Groups[2].Value.Trim(),
                    Message = string.Empty,
                    RawText = cleanText
                };
            }

            // 3. Check Kaspi Pay (Payment)
            m = KaspiPayPaymentRegex.Match(cleanText);
            if (m.Success)
            {
                return new DonationEvent
                {
                    Bank = "kaspi_pay",
                    SourceLabel = "Kaspi Pay",
                    Amount = ParseAmount(m.Groups[1].Value),
                    Sender = m.Groups[2].Value.Trim(),
                    Message = string.Empty,
                    RawText = cleanText
                };
            }

            // 4. Check Kaspi Pay QR
            m = KaspiPayQrRegex.Match(cleanText);
            if (m.Success)
            {
                return new DonationEvent
                {
                    Bank = "kaspi_pay",
                    SourceLabel = "Kaspi QR",
                    Amount = ParseAmount(m.Groups[1].Value),
                    Sender = "Аноним",
                    Message = string.Empty,
                    RawText = cleanText
                };
            }

            // 5. Check Halyk Bank
            m = HalykTransferRegex.Match(cleanText);
            if (m.Success)
            {
                return new DonationEvent
                {
                    Bank = "halyk_bank",
                    SourceLabel = "Halyk Bank",
                    Amount = ParseAmount(m.Groups[1].Value),
                    Sender = m.Groups[2].Value.Trim(),
                    Message = string.Empty,
                    RawText = cleanText
                };
            }

            m = HalykTopupRegex.Match(cleanText);
            if (m.Success)
            {
                return new DonationEvent
                {
                    Bank = "halyk_bank",
                    SourceLabel = "Halyk Bank",
                    Amount = ParseAmount(m.Groups[1].Value),
                    Sender = m.Groups[2].Value.Trim(),
                    Message = string.Empty,
                    RawText = cleanText
                };
            }

            // 6. Check Freedom Bank
            m = FreedomCardRegex.Match(cleanText);
            if (m.Success)
            {
                return new DonationEvent
                {
                    Bank = "freedom_bank",
                    SourceLabel = "Freedom Bank",
                    Amount = ParseAmount(m.Groups[1].Value),
                    Sender = m.Groups[2].Value.Trim(),
                    Message = string.Empty,
                    RawText = cleanText
                };
            }

            m = FreedomTransferRegex.Match(cleanText);
            if (m.Success)
            {
                return new DonationEvent
                {
                    Bank = "freedom_bank",
                    SourceLabel = "Freedom Bank",
                    Amount = ParseAmount(m.Groups[1].Value),
                    Sender = m.Groups[2].Value.Trim(),
                    Message = string.Empty,
                    RawText = cleanText
                };
            }

            // 7. Check Jusan Bank
            m = JusanSumFirstRegex.Match(cleanText);
            if (m.Success)
            {
                return new DonationEvent
                {
                    Bank = "jusan_bank",
                    SourceLabel = "Jusan Bank",
                    Amount = ParseAmount(m.Groups[2].Value),
                    Sender = m.Groups[1].Value.Trim(),
                    Message = string.Empty,
                    RawText = cleanText
                };
            }

            m = JusanSimpleRegex.Match(cleanText);
            if (m.Success)
            {
                return new DonationEvent
                {
                    Bank = "jusan_bank",
                    SourceLabel = "Jusan Bank",
                    Amount = ParseAmount(m.Groups[1].Value),
                    Sender = m.Groups[2].Value.Trim(),
                    Message = string.Empty,
                    RawText = cleanText
                };
            }

            return null;
        }

        private static int ParseAmount(string amountStr)
        {
            if (string.IsNullOrWhiteSpace(amountStr)) return 0;
            string digitsOnly = Regex.Replace(amountStr, @"[^\d\.]", "");
            if (double.TryParse(digitsOnly, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double parsed))
            {
                return (int)Math.Round(parsed);
            }
            return 0;
        }
    }
}
