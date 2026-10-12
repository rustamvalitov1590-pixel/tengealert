package kz.tengealert.app.queue

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kz.tengealert.app.network.TengeApiClient
import kz.tengealert.app.parser.ParsedDonation

class OfflineQueueManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("tenge_offline_queue", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val key = "pending_donations"

    @Synchronized
    fun enqueue(donation: ParsedDonation) {
        val list = getAll().toMutableList()
        list.add(donation)
        saveList(list)
    }

    @Synchronized
    fun getAll(): List<ParsedDonation> {
        val json = prefs.getString(key, null) ?: return emptyList()
        val type = object : TypeToken<List<ParsedDonation>>() {}.type
        return try {
            gson.fromJson(json, type) ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    @Synchronized
    fun remove(donation: ParsedDonation) {
        val list = getAll().toMutableList()
        list.remove(donation)
        saveList(list)
    }

    private fun saveList(list: List<ParsedDonation>) {
        prefs.edit().putString(key, gson.toJson(list)).apply()
    }

    suspend fun flush(): Int {
        val pending = getAll()
        var sentCount = 0
        for (item in pending) {
            val success = TengeApiClient.sendDonation(item)
            if (success) {
                remove(item)
                sentCount++
            } else {
                break
            }
        }
        return sentCount
    }
}
