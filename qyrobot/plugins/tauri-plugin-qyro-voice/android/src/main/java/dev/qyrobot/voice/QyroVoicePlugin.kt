package dev.qyrobot.voice

import android.content.Context
import android.content.Intent
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * QyroVoicePlugin — ForegroundService Live Voice + Android SpeechRecognizer (id-ID / en-US).
 * Streams recognized transcripts to QyroBot cloud router; zero local LLM/Whisper models.
 */
class QyroVoicePlugin(private val context: Context) {

    private var recognizer: SpeechRecognizer? = null

    fun isSpeechRecognitionAvailable(): Boolean {
        return SpeechRecognizer.isRecognitionAvailable(context)
    }

    fun buildRecognizerIntent(localeTag: String): Intent {
        val safeLocale = if (localeTag == "en-US") "en-US" else "id-ID"
        return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, safeLocale)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)
        }
    }

    fun release() {
        recognizer?.destroy()
        recognizer = null
    }
}
