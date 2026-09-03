package com.awdheegle.data.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * Client for the *212 package-discovery RPCs.
 * All calls go straight to Supabase RPC endpoints with the anon key.
 */
class DiscoveryApiClient {
    private val rpcUrl = "https://xpqvfcmalgvrpoqwbqtv.supabase.co/rest/v1/rpc"
    private val anonKey = DeliveryApiClient().getAnonKey()
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    data class DiscoveryJob(
        val sessionId: String,
        val phoneNumber: String,
        val ussdCode: String,
        /** First-menu label to pick (root: Data / Kuhadal / Data iyo Kuhadal). */
        val menu1Label: String? = null
    )

    private fun post(fn: String, body: JSONObject): String? {
        val request = Request.Builder()
            .url("$rpcUrl/$fn")
            .addHeader("apikey", anonKey)
            .addHeader("Authorization", "Bearer $anonKey")
            .addHeader("Content-Type", "application/json")
            .post(body.toString().toRequestBody(jsonType))
            .build()
        DeliveryApiClient.sharedHttpClient.newCall(request).execute().use { res ->
            if (!res.isSuccessful) {
                android.util.Log.e("DiscoveryApi", "❌ $fn failed: ${res.code} ${res.body?.string()}")
                return null
            }
            return res.body?.string()
        }
    }

    /** Claim the next queued *212 discovery job for this device. */
    suspend fun claimNextDiscovery(deviceUuid: String): DiscoveryJob? = withContext(Dispatchers.IO) {
        try {
            val body = post("claim_next_discovery", JSONObject().put("p_device_id", deviceUuid))
                ?: return@withContext null
            val arr = JSONArray(body)
            if (arr.length() == 0) return@withContext null
            val row = arr.getJSONObject(0)
            DiscoveryJob(
                sessionId = row.getString("session_id"),
                phoneNumber = row.optString("phone_number", ""),
                ussdCode = row.optString("ussd_code", "")
            )
        } catch (e: Exception) {
            android.util.Log.e("DiscoveryApi", "claimNextDiscovery error: ${e.message}")
            null
        }
    }

    /** Report the parsed menu back to the server (prices are resolved server-side). */
    suspend fun completeDiscovery(
        sessionId: String,
        items: List<UssdMenuParser.MenuItem>,
        rawText: String?,
        holdSeconds: Int = 100
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val arr = JSONArray()
            items.forEach { item ->
                arr.put(
                    JSONObject()
                        .put("index", item.index)
                        .put("raw_label", item.rawLabel)
                        .put("data_amount", item.dataAmount ?: JSONObject.NULL)
                )
            }
            val payload = JSONObject()
                .put("p_session_id", sessionId)
                .put("p_items", arr)
                .put("p_raw_text", rawText ?: JSONObject.NULL)
                .put("p_hold_seconds", holdSeconds)
            post("complete_discovery", payload) != null
        } catch (e: Exception) {
            android.util.Log.e("DiscoveryApi", "completeDiscovery error: ${e.message}")
            false
        }
    }

    /** Tell the server the USSD session is gone so pending selections re-dial cold. */
    suspend fun sessionLost(sessionId: String, reason: String?): Boolean = withContext(Dispatchers.IO) {
        try {
            post(
                "discovery_session_lost",
                JSONObject()
                    .put("p_session_id", sessionId)
                    .put("p_reason", reason ?: JSONObject.NULL)
            ) != null
        } catch (e: Exception) {
            false
        }
    }

    /** Final outcome of a delivery (never auto-retried by the server). */
    suspend fun markDeliveryStatus(
        queueId: String,
        deviceUuid: String?,
        status: String,
        response: String?
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            post(
                "mark_delivery_status",
                JSONObject()
                    .put("p_queue_id", queueId)
                    .put("p_device_id", deviceUuid ?: JSONObject.NULL)
                    .put("p_status", status)
                    .put("p_response", response ?: JSONObject.NULL)
            ) != null
        } catch (e: Exception) {
            false
        }
    }
}
