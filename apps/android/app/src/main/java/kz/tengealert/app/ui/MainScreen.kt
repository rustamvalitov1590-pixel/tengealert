package kz.tengealert.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kz.tengealert.app.network.TengeApiClient
import kz.tengealert.app.parser.ParsedDonation

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    hasNotificationPermission: Boolean,
    onOpenPermissionSettings: () -> Unit,
    onSendTestDonation: (Int, String, String) -> Unit,
    recentEvents: List<ParsedDonation>
) {
    var serverUrl by remember { mutableStateOf(TengeApiClient.serverBaseUrl) }
    var apiKey by remember { mutableStateOf(TengeApiClient.apiKey) }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = BgDark
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(AccentEmerald),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "₸",
                            color = BgDark,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = "TengeAlert Mobile",
                            color = TextLight,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = "Android Push Listener",
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                }

                // Status pill
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (hasNotificationPermission) CardDark else ErrorRed.copy(alpha = 0.2f))
                        .border(
                            1.dp,
                            if (hasNotificationPermission) AccentEmerald else ErrorRed,
                            RoundedCornerShape(16.dp)
                        )
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(if (hasNotificationPermission) AccentEmerald else ErrorRed)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (hasNotificationPermission) "Активен" else "Нет доступа",
                            color = if (hasNotificationPermission) AccentEmerald else ErrorRed,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }

            // Permission banner if missing
            if (!hasNotificationPermission) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                    colors = CardDefaults.cardColors(containerColor = CardDark),
                    shape = RoundedCornerShape(12.dp),
                    border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(ErrorRed))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Требуется доступ к уведомлениям",
                            color = TextLight,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Предоставьте TengeAlert доступ к уведомлениям для автоматического перехвата пушей от Kaspi, Halyk и других банков.",
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Button(
                            onClick = onOpenPermissionSettings,
                            colors = ButtonDefaults.buttonColors(containerColor = AccentEmerald),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Открыть настройки Android", color = BgDark, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // Gateway Configuration Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                colors = CardDefaults.cardColors(containerColor = CardDark),
                shape = RoundedCornerShape(12.dp),
                border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(CardBorder))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Настройки подключения к OBS",
                        color = TextLight,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp
                    )
                    Spacer(modifier = Modifier.height(10.dp))

                    OutlinedTextField(
                        value = serverUrl,
                        onValueChange = {
                            serverUrl = it
                            TengeApiClient.serverBaseUrl = it
                        },
                        label = { Text("IP компьютера со стримом (OBS)", color = TextMuted) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = TextFieldDefaults.outlinedTextFieldColors(
                            focusedTextColor = TextLight,
                            unfocusedTextColor = TextLight,
                            focusedBorderColor = AccentEmerald,
                            unfocusedBorderColor = CardBorder
                        ),
                        shape = RoundedCornerShape(8.dp)
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedTextField(
                        value = apiKey,
                        onValueChange = {
                            apiKey = it
                            TengeApiClient.apiKey = it
                        },
                        label = { Text("Секретный токен стримера", color = TextMuted) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = TextFieldDefaults.outlinedTextFieldColors(
                            focusedTextColor = TextLight,
                            unfocusedTextColor = TextLight,
                            focusedBorderColor = AccentEmerald,
                            unfocusedBorderColor = CardBorder
                        ),
                        shape = RoundedCornerShape(8.dp)
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Button(
                        onClick = {
                            onSendTestDonation(5000, "Данияр К.", "Тест с Android телефона!")
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = AccentEmerald),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Отправить тестовый донат (5 000 ₸)", color = BgDark, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // Events List
            Text(
                text = "Перехваченные события",
                color = TextLight,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            if (recentEvents.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(CardDark)
                        .border(1.dp, CardBorder, RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Ожидание входящих банковских пушей...",
                        color = TextMuted,
                        fontSize = 13.sp
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(recentEvents) { item ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = CardDark),
                            shape = RoundedCornerShape(10.dp),
                            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(CardBorder))
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "${item.sourceLabel} • ${item.sender}",
                                        color = TextMuted,
                                        fontSize = 12.sp
                                    )
                                    if (item.message.isNotBlank()) {
                                        Text(
                                            text = "«${item.message}»",
                                            color = TextLight,
                                            fontSize = 13.sp
                                        )
                                    }
                                }
                                Text(
                                    text = "+${item.amount} ₸",
                                    color = AccentEmerald,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
