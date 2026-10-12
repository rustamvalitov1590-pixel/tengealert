package kz.tengealert.app.network

import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kz.tengealert.app.parser.ParsedDonation
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

object TengeApiClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(4, TimeUnit.SECONDS)
        .writeTimeout(4, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

    var serverBaseUrl: String = "http://192.168.1.100:3000"
    var apiKey: String = ""

    suspend fun sendDonation(donation: ParsedDonation): Boolean = withContext(Dispatchers.IO) {
        val payload = mapOf(
            "source" to donation.bank,
            "text" to donation.rawText,
            "parsed" to mapOf(
                "amount" to donation.amount,
                "sender" to donation.sender,
                "message" to donation.message
            )
        )

        val jsonBody = gson.toJson(payload)
        val url = "${serverBaseUrl.trimEnd('/')}/api/push"

        val request = Request.Builder()
            .url(url)
            .post(jsonBody.toRequestBody(JSON_MEDIA))
            .apply {
                if (apiKey.isNotBlank()) {
                    addHeader("X-TengeAlert-Key", apiKey)
                }
            }
            .build()

        return@withContext try {
            client.newCall(request).execute().use { response ->
                response.isSuccessful
            }
        } catch (e: Exception) {
            false
        }
    }
}
