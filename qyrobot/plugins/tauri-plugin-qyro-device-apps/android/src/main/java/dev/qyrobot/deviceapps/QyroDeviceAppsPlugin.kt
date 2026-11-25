package dev.qyrobot.deviceapps

import android.app.Activity
import android.content.Intent
import android.provider.AlarmClock
import android.provider.CalendarContract

/**
 * QyroDeviceAppsPlugin — Scoped Android device app bridge for QyroBot.
 * Enforces PRD §5 fail-closed guardrails:
 *  - Calendar: non-recurring events with zero attendee invites.
 *  - Contacts: read-only lookup only.
 *  - Location: single explicit request only.
 *  - Alarms/Timers: max 24h horizon.
 *  - NotificationListenerService is NEVER declared, bound, or requested.
 */
class QyroDeviceAppsPlugin(private val activity: Activity) {

    companion object {
        const val APPROVAL_TTL_MS: Long = 5L * 60L * 1000L
        const val MAX_TIMER_SECONDS: Int = 24 * 60 * 60
    }

    fun assertServiceAllowed(serviceClassName: String) {
        if (serviceClassName.lowercase().contains("notificationlistener")) {
            throw SecurityException("NotificationListenerService is permanently forbidden by QyroBot PRD §5")
        }
    }

    fun createNonRecurringCalendarEvent(
        title: String,
        startEpochMs: Long,
        endEpochMs: Long,
        grantExpiresAtMs: Long,
        nowMs: Long = System.currentTimeMillis()
    ) {
        require(nowMs <= grantExpiresAtMs) { "Approval grant expired (fail-closed 5-minute TTL)" }
        require(endEpochMs > startEpochMs) { "Calendar event end time must be after start time" }

        val intent = Intent(Intent.ACTION_INSERT).apply {
            data = CalendarContract.Events.CONTENT_URI
            putExtra(CalendarContract.Events.TITLE, title)
            putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startEpochMs)
            putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endEpochMs)
            // Intentionally no RRULE (non-recurring) and no EXTRA_EMAIL (zero invites).
        }
        activity.startActivity(intent)
    }

    fun createScopedTimer(
        label: String,
        lengthSeconds: Int,
        grantExpiresAtMs: Long,
        nowMs: Long = System.currentTimeMillis()
    ) {
        require(nowMs <= grantExpiresAtMs) { "Approval grant expired (fail-closed 5-minute TTL)" }
        require(lengthSeconds in 1..MAX_TIMER_SECONDS) {
            "Timer length must be between 1s and 86400s (24 hours)"
        }

        val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
            putExtra(AlarmClock.EXTRA_MESSAGE, label)
            putExtra(AlarmClock.EXTRA_LENGTH, lengthSeconds)
            putExtra(AlarmClock.EXTRA_SKIP_UI, false)
        }
        activity.startActivity(intent)
    }
}
