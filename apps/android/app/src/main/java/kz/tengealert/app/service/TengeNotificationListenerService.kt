package kz.tengealert.app.service

import android.app.Notification
import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kz.tengealert.app.network.TengeApiClient
import kz.tengealert.app.parser.BankPushParser
import kz.tengealert.app.queue.OfflineQueueManager

class TengeNotificationListenerService : NotificationListenerService() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)
    private lateinit var queueManager: OfflineQueueManager

    companion object {
        private const val TAG = "TengeNotificationSvc"
        var isConnected = false
        val supportedPackages = setOf(
            "kz.kaspi.mobile",
            "kz.kaspi.pay",
            "kz.halykbank.telebank",
            "kz.ffin.bank",
            "kz.jusan.mobile"
        )
    }

    override fun onCreate() {
        super.onCreate()
        queueManager = OfflineQueueManager(this)
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        isConnected = true
        Log.d(TAG, "Notification listener connected successfully")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        isConnected = false
        Log.w(TAG, "Notification listener disconnected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val pkgName = sbn.packageName ?: ""
        // Check if notification is from one of the target bank apps or general push
        val extras = sbn.notification?.extras ?: return

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""

        val combinedText = buildString {
            if (title.isNotBlank()) append(title).append(" ")
            if (bigText.isNotBlank()) append(bigText) else append(text)
        }.trim()

        if (combinedText.isBlank()) return

        Log.d(TAG, "New notification from $pkgName: $combinedText")

        val parsed = BankPushParser.parse(combinedText, pkgName)
        if (parsed != null) {
            Log.i(TAG, "SUCCESS! Parsed donation: ${parsed.amount} KZT from ${parsed.sender}")

            // Send local broadcast to update app UI
            val updateIntent = Intent("kz.tengealert.app.NEW_DONATION").apply {
                putExtra("amount", parsed.amount)
                putExtra("sender", parsed.sender)
                putExtra("message", parsed.message)
                putExtra("bank", parsed.bank)
                setPackage(packageName)
            }
            sendBroadcast(updateIntent)

            // Send to server or queue
            scope.launch {
                val sent = TengeApiClient.sendDonation(parsed)
                if (!sent) {
                    Log.w(TAG, "Network failed; saving donation to offline queue")
                    queueManager.enqueue(parsed)
                } else {
                    Log.i(TAG, "Donation immediately delivered to OBS gateway!")
                    queueManager.flush()
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
