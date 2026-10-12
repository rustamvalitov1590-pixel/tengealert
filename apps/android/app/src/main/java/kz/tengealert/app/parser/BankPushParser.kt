package kz.tengealert.app.parser

import java.util.regex.Pattern

data class ParsedDonation(
    val bank: String,
    val sourceLabel: String,
    val amount: Int,
    val sender: String,
    val message: String,
    val rawText: String
)

object BankPushParser {

    // 1. Kaspi Gold with message
    private val KASPI_GOLD_MSG = Pattern.compile(
        """(?:Перевод|Пополнение|Вам поступил перевод)\s+([\d\s]+)\s*₸\s+от\s+([^\.]+?)(?:\s+[сs]\s+(?:сообщением|комментарием))?\s*[«""“]([^»""”]+)[»""”]""",
        Pattern.CASE_INSENSITIVE
    )

    // 2. Kaspi Gold simple
    private val KASPI_GOLD_SIMPLE = Pattern.compile(
        """(?:Перевод|Пополнение|Вам поступил перевод)\s+([\d\s]+)\s*₸\s+от\s+([^\.]+?)(?:\.|$)""",
        Pattern.CASE_INSENSITIVE
    )

    // 3. Kaspi Pay
    private val KASPI_PAY_PAYMENT = Pattern.compile(
        """Оплата\s+([\d\s]+)\s*₸\s+от\s+(.+?)(?:\.|$)""",
        Pattern.CASE_INSENSITIVE
    )
    private val KASPI_PAY_QR = Pattern.compile(
        """Поступление\s+([\d\s]+)\s*₸\s+Kaspi\s+QR""",
        Pattern.CASE_INSENSITIVE
    )

    // 4. Halyk Bank
    private val HALYK_TRANSFER = Pattern.compile(
        """Перевод:\s*\+?([\d\s]+(?:\.\d{2})?)\s*KZT\s+от\s+([^\.]+?)(?:\.\s*Доступно|$)""",
        Pattern.CASE_INSENSITIVE
    )
    private val HALYK_TOPUP = Pattern.compile(
        """Пополнение\s*\+?([\d\s]+(?:\.\d{2})?)\s*KZT\s+от\s+([^\.]+?)(?:\.|$)""",
        Pattern.CASE_INSENSITIVE
    )

    // 5. Freedom Bank
    private val FREEDOM_CARD = Pattern.compile(
        """Пополнение\s+карты\s+\*?\d*\s*на\s+([\d\s]+)\s*KZT\s+от\s+([^\.]+?)(?:\.|$)""",
        Pattern.CASE_INSENSITIVE
    )
    private val FREEDOM_TRANSFER = Pattern.compile(
        """Перевод\s+([\d\s]+)\s*₸\s+от\s+([^\.]+?)(?:\.|$)""",
        Pattern.CASE_INSENSITIVE
    )

    // 6. Jusan Bank
    private val JUSAN_SUM_FIRST = Pattern.compile(
        """Перевод\s+от\s+([^\.]+?)\s+на\s+сумму\s+([\d\s]+)\s*KZT""",
        Pattern.CASE_INSENSITIVE
    )
    private val JUSAN_SIMPLE = Pattern.compile(
        """Поступление\s+([\d\s]+)\s*₸\s+от\s+([^\.]+?)(?:\.|$)""",
        Pattern.CASE_INSENSITIVE
    )

    fun isSecurityOrAuthAlert(text: String): Boolean {
        val triggers = listOf(
            "код подтверждения", "смс-код", "одноразовый код", "пароль",
            "никому не сообщайте", "3d secure", "вход в", "восстановление доступа",
            "пин-код", "pin-code", "заблокирована", "security code", "verification"
        )
        val lower = text.lowercase()
        return triggers.any { lower.contains(it) }
    }

    fun sanitizeFinancialText(text: String): String {
        return text.replace(Regex("""(?i)(?:Доступно|Остаток|Баланс)[\s:]+[\d\s]+(?:₸|KZT|тенге)?(?:\.\d{2})?"""), "")
            .replace(Regex("""(?i)(?:карт[аые]\s+)?(?:\*+\d{4}|\d{4}\s*(?:\*+|\d{4})\s*(?:\*+|\d{4})\s*\d{4})"""), "[карта скрыта]")
            .trim()
    }

    fun parse(text: String, packageName: String? = null): ParsedDonation? {
        val clean = text.replace("\u00A0", " ").trim()

        // Security Shield: Drop 2FA and sensitive auth pushes immediately
        if (isSecurityOrAuthAlert(clean)) {
            return null
        }
        val safeRaw = sanitizeFinancialText(clean)

        // Kaspi Gold Msg
        var m = KASPI_GOLD_MSG.matcher(clean)
        if (m.find()) {
            return ParsedDonation(
                bank = "kaspi_gold",
                sourceLabel = "Kaspi Gold",
                amount = parseAmount(m.group(1)),
                sender = m.group(2).trim(),
                message = m.group(3).trim(),
                rawText = safeRaw
            )
        }

        // Kaspi Gold Simple
        m = KASPI_GOLD_SIMPLE.matcher(clean)
        if (m.find()) {
            return ParsedDonation(
                bank = "kaspi_gold",
                sourceLabel = "Kaspi Gold",
                amount = parseAmount(m.group(1)),
                sender = m.group(2).trim(),
                message = "",
                rawText = safeRaw
            )
        }

        // Kaspi Pay
        m = KASPI_PAY_PAYMENT.matcher(clean)
        if (m.find()) {
            return ParsedDonation(
                bank = "kaspi_pay",
                sourceLabel = "Kaspi Pay",
                amount = parseAmount(m.group(1)),
                sender = m.group(2).trim(),
                message = "",
                rawText = clean
            )
        }

        m = KASPI_PAY_QR.matcher(clean)
        if (m.find()) {
            return ParsedDonation(
                bank = "kaspi_pay",
                sourceLabel = "Kaspi QR",
                amount = parseAmount(m.group(1)),
                sender = "Аноним",
                message = "",
                rawText = clean
            )
        }

        // Halyk
        m = HALYK_TRANSFER.matcher(clean)
        if (m.find()) {
            return ParsedDonation(
                bank = "halyk_bank",
                sourceLabel = "Halyk Bank",
                amount = parseAmount(m.group(1)),
                sender = m.group(2).trim(),
                message = "",
                rawText = clean
            )
        }

        m = HALYK_TOPUP.matcher(clean)
        if (m.find()) {
            return ParsedDonation(
                bank = "halyk_bank",
                sourceLabel = "Halyk Bank",
                amount = parseAmount(m.group(1)),
                sender = m.group(2).trim(),
                message = "",
                rawText = clean
            )
        }

        // Freedom
        m = FREEDOM_CARD.matcher(clean)
        if (m.find()) {
            return ParsedDonation(
                bank = "freedom_bank",
                sourceLabel = "Freedom Bank",
                amount = parseAmount(m.group(1)),
                sender = m.group(2).trim(),
                message = "",
                rawText = clean
            )
        }

        m = FREEDOM_TRANSFER.matcher(clean)
        if (m.find()) {
            return ParsedDonation(
                bank = "freedom_bank",
                sourceLabel = "Freedom Bank",
                amount = parseAmount(m.group(1)),
                sender = m.group(2).trim(),
                message = "",
                rawText = clean
            )
        }

        // Jusan
        m = JUSAN_SUM_FIRST.matcher(clean)
        if (m.find()) {
            return ParsedDonation(
                bank = "jusan_bank",
                sourceLabel = "Jusan Bank",
                amount = parseAmount(m.group(2)),
                sender = m.group(1).trim(),
                message = "",
                rawText = clean
            )
        }

        m = JUSAN_SIMPLE.matcher(clean)
        if (m.find()) {
            return ParsedDonation(
                bank = "jusan_bank",
                sourceLabel = "Jusan Bank",
                amount = parseAmount(m.group(1)),
                sender = m.group(2).trim(),
                message = "",
                rawText = clean
            )
        }

        return null
    }

    private fun parseAmount(raw: String?): Int {
        if (raw.isNullOrBlank()) return 0
        val digits = raw.replace(Regex("""[^\d\.]"""), "")
        return try {
            digits.toDouble().toInt()
        } catch (e: Exception) {
            0
        }
    }
}
