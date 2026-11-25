package dev.qyrobot.push

import android.content.Context

/**
 * QyroPushPlugin — UnifiedPush (ntfy / Sunup) + optional FCM wake receiver for QyroBot.
 * Receives opaque wake notifications containing only `last_event_id` so the client
 * fetches encrypted payloads over its authenticated Ed25519 session.
 */
data class PushEndpointState(
    val distributor: String,
    val endpointUrl: String,
    val registeredAtMs: Long
)

class QyroPushPlugin(private val context: Context) {

    @Volatile
    private var currentState: PushEndpointState? = null

    fun onNewUnifiedPushEndpoint(distributor: String, endpointUrl: String): PushEndpointState {
        require(endpointUrl.startsWith("https://")) {
            "UnifiedPush endpoint must use HTTPS"
        }
        val state = PushEndpointState(
            distributor = distributor,
            endpointUrl = endpointUrl,
            registeredAtMs = System.currentTimeMillis()
        )
        currentState = state
        return state
    }

    fun getCurrentRegistration(): PushEndpointState? = currentState

    fun clearRegistration() {
        currentState = null
    }
}
