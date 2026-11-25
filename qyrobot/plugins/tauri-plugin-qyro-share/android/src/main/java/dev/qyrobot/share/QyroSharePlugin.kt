package dev.qyrobot.share

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build

/**
 * QyroSharePlugin — Android Share Sheet bridge for Tauri v2.
 * Captures ACTION_SEND and ACTION_SEND_MULTIPLE intents so the user can share
 * links, text, screenshots, or documents directly to Chief of Staff or any bot.
 */
data class SharedIntentEnvelope(
    val action: String,
    val mimeType: String,
    val subject: String?,
    val text: String?,
    val uris: List<String>
)

class QyroSharePlugin(private val activity: Activity) {

    fun parseIncomingIntent(intent: Intent?): SharedIntentEnvelope? {
        if (intent == null) return null
        val action = intent.action ?: return null
        if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) {
            return null
        }

        val mimeType = intent.type ?: "text/plain"
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
        val uris = mutableListOf<String>()

        if (action == Intent.ACTION_SEND) {
            val streamUri = getParcelableUri(intent, Intent.EXTRA_STREAM)
            if (streamUri != null) {
                uris.add(streamUri.toString())
            }
        } else if (action == Intent.ACTION_SEND_MULTIPLE) {
            val streamUris = getParcelableUriList(intent, Intent.EXTRA_STREAM)
            streamUris.take(16).forEach { uri -> uris.add(uri.toString()) }
        }

        if (text.isNullOrBlank() && uris.isEmpty()) {
            return null
        }

        return SharedIntentEnvelope(
            action = action,
            mimeType = mimeType,
            subject = subject,
            text = text,
            uris = uris
        )
    }

    @Suppress("DEPRECATION")
    private fun getParcelableUri(intent: Intent, key: String): Uri? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(key, Uri::class.java)
        } else {
            intent.getParcelableExtra(key)
        }
    }

    @Suppress("DEPRECATION")
    private fun getParcelableUriList(intent: Intent, key: String): List<Uri> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableArrayListExtra(key, Uri::class.java).orEmpty()
        } else {
            intent.getParcelableArrayListExtra<Uri>(key).orEmpty()
        }
    }
}
