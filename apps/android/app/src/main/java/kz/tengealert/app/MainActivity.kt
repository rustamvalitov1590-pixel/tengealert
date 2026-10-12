package kz.tengealert.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.mutableStateListOf
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import kz.tengealert.app.network.TengeApiClient
import kz.tengealert.app.parser.ParsedDonation
import kz.tengealert.app.service.TengeForegroundService
import kz.tengealert.app.ui.MainScreen
import kz.tengealert.app.ui.TengeTheme

class MainActivity : ComponentActivity() {

    private val events = mutableStateListOf<ParsedDonation>()

    private val donationReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "kz.tengealert.app.NEW_DONATION") {
                val amount = intent.getIntExtra("amount", 0)
                val sender = intent.getStringExtra("sender") ?: "Аноним"
                val message = intent.getStringExtra("message") ?: ""
                val bank = intent.getStringExtra("bank") ?: "kaspi_gold"

                events.add(
                    0,
                    ParsedDonation(
                        bank = bank,
                        sourceLabel = "Банковский перевод",
                        amount = amount,
                        sender = sender,
                        message = message,
                        rawText = ""
                    )
                )
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Start persistent foreground service
        TengeForegroundService.start(this)

        // Request ignore battery optimizations if needed
        requestBatteryExemption()

        val filter = IntentFilter("kz.tengealert.app.NEW_DONATION")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(donationReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(donationReceiver, filter)
        }

        setContent {
            TengeTheme {
                MainScreen(
                    hasNotificationPermission = hasNotificationAccess(),
                    onOpenPermissionSettings = { openNotificationAccessSettings() },
                    onSendTestDonation = { amount, sender, msg ->
                        sendTestDonation(amount, sender, msg)
                    },
                    recentEvents = events
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Re-compose to update permission status if user just granted it
        setContent {
            TengeTheme {
                MainScreen(
                    hasNotificationPermission = hasNotificationAccess(),
                    onOpenPermissionSettings = { openNotificationAccessSettings() },
                    onSendTestDonation = { amount, sender, msg ->
                        sendTestDonation(amount, sender, msg)
                    },
                    recentEvents = events
                )
            }
        }
    }

    private fun hasNotificationAccess(): Boolean {
        val packages = NotificationManagerCompat.getEnabledListenerPackages(this)
        return packages.contains(packageName)
    }

    private fun openNotificationAccessSettings() {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        startActivity(intent)
    }

    private fun requestBatteryExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                try {
                    startActivity(intent)
                } catch (_: Exception) {}
            }
        }
    }

    private fun sendTestDonation(amount: Int, sender: String, msg: String) {
        val testItem = ParsedDonation(
            bank = "kaspi_gold",
            sourceLabel = "Kaspi Gold",
            amount = amount,
            sender = sender,
            message = msg,
            rawText = "Перевод $amount ₸ от $sender с сообщением «$msg»"
        )
        events.add(0, testItem)

        lifecycleScope.launch {
            TengeApiClient.sendDonation(testItem)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(donationReceiver)
        } catch (_: Exception) {}
    }
}
