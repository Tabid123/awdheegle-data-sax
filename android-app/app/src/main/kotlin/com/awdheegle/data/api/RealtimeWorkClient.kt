package com.awdheegle.data.api

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Event-driven wake channel for Android delivery work.
 *
 * The database emits a tiny row in device_work_signals only when there is work.
 * This keeps empty queue checks off Edge Functions. The signal never includes
 * customer phone numbers, PINs, USSD commands or order payloads.
 */
class RealtimeWorkClient(
    private val deviceId: String,
    private val anonKey: String,
    private val scope: CoroutineScope,
    private val onConnected: suspend () -> Unit,
    private val onSignal: suspend (String) -> Unit
) {
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Volatile private var running = false
    @Volatile private var webSocket: WebSocket? = null

    fun start() {
        if (running) return
        running = true
        scope.launch { connectionLoop() }
    }

    fun stop() {
        running = false
        webSocket?.close(1000, "service stopped")
        webSocket = null
    }

    private suspend fun connectionLoop() {
        var retryDelay = 3_000L
        while (running && scope.isActive) {
            val connected = CompletableDeferred<Boolean>()
            try {
                val request = Request.Builder()
                    .url("wss://xpqvfcmalgvrpoqwbqtv.supabase.co/realtime/v1/websocket?apikey=$anonKey&vsn=1.0.0")
                    .build()

                webSocket = client.newWebSocket(request, object : WebSocketListener() {
                    override fun onOpen(ws: WebSocket, response: Response) {
                        retryDelay = 3_000L
                        val join = JSONObject().apply {
                            put("topic", "realtime:public:device_work_signals")
                            put("event", "phx_join")
                            put("payload", JSONObject().apply {
                                put("config", JSONObject().apply {
                                    put("broadcast", JSONObject().put("self", false))
                                    put("presence", JSONObject().put("key", ""))
                                    put("postgres_changes", JSONArray().apply {
                                        put(JSONObject().apply {
                                            put("event", "INSERT")
                                            put("schema", "public")
                                            put("table", "device_work_signals")
                                        })
                                    })
                                })
                            })
                            put("ref", "work-signals")
                        }
                        ws.send(join.toString())
                        if (!connected.isCompleted) connected.complete(true)
                        scope.launch { onConnected() }
                    }

                    override fun onMessage(ws: WebSocket, text: String) {
                        try {
                            val msg = JSONObject(text)
                            if (msg.optString("event") != "postgres_changes") return
                            val record = msg.optJSONObject("payload")
                                ?.optJSONObject("data")
                                ?.optJSONObject("record")
                                ?: return
                            val target = record.optString("device_id", "").trim()
                            if (target.isNotEmpty() && target != deviceId) return
                            val kind = record.optString("kind", "").trim()
                            if (kind.isNotEmpty()) scope.launch { onSignal(kind) }
                        } catch (_: Exception) {
                        }
                    }

                    override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                        if (!connected.isCompleted) connected.complete(false)
                        webSocket = null
                    }

                    override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                        if (!connected.isCompleted) connected.complete(false)
                        webSocket = null
                    }
                })

                if (connected.await()) {
                    while (running && scope.isActive && webSocket != null) {
                        delay(25_000L)
                        val heartbeat = JSONObject().apply {
                            put("topic", "phoenix")
                            put("event", "heartbeat")
                            put("payload", JSONObject())
                            put("ref", System.currentTimeMillis().toString())
                        }
                        if (webSocket?.send(heartbeat.toString()) != true) break
                    }
                }
            } catch (_: Exception) {
            }

            webSocket?.close(1000, "reconnect")
            webSocket = null
            if (running && scope.isActive) {
                delay(retryDelay)
                retryDelay = (retryDelay * 2).coerceAtMost(60_000L)
            }
        }
    }
}
