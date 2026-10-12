package kz.tengealert.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Slash Design System Colors (Midnight Vault & Gilded Accents)
val BgDark = Color(0xFF08080A)
val CardDark = Color(0xFF0B0C10)
val PanelElevated = Color(0xFF121317)
val CardBorder = Color(0xFF1C1D22)
val CardBorderStrong = Color(0xFF2E3038)

val AccentGold = Color(0xFFE5A93C)
val AccentCopper = Color(0xFFCC9166)
val AccentEmerald = Color(0xFF10B981)
val ErrorRed = Color(0xFFEF4444)

val TextLight = Color(0xFFFFFFFF)
val TextBody = Color(0xFFE2E3E9)
val TextSecondary = Color(0xFF9194A1)
val TextMuted = Color(0xFF5E616E)

private val DarkColorScheme = darkColorScheme(
    primary = AccentGold,
    secondary = AccentCopper,
    tertiary = AccentEmerald,
    background = BgDark,
    surface = CardDark,
    surfaceVariant = PanelElevated,
    onPrimary = Color(0xFF08080A),
    onBackground = TextLight,
    onSurface = TextBody,
    outline = CardBorder
)

@Composable
fun TengeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
