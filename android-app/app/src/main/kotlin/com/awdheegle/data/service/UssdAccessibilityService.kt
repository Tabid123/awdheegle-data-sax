package com.awdheegle.data.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Accessibility service that drives interactive USSD menus.
 *
 * Important safety rules:
 * - One visible dialog may consume at most one planned step.
 * - PIN is never guessed or hardcoded; it must come from current_pin_code.
 * - PIN is accepted only when it is 3..12 digits and the dialog clearly asks for it.
 * - Somtel *101# receiver entry is handled only by the receiver step produced by
 *   UssdTemplate/Ussd870Flow, after the configured menu path has been consumed.
 */
class UssdAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "UssdAccessibility"

        const val ACTION_USSD_CLICK_COMPLETE = "com.awdheegle.data.USSD_CLICK_COMPLETE"
        const val PREFS_NAME = "awdheegle_ussd_prefs"
        const val KEY_EXPECTING_USSD = "expecting_ussd_dialogs"
        const val KEY_LAST_USSD_TIME = "last_ussd_time"
        const val KEY_LAST_USSD_RESPONSE = "last_ussd_response"
        const val KEY_LAST_USSD_RESPONSE_TIME = "last_ussd_response_time"
        const val KEY_LAST_USSD_RESPONSE_QUEUE_ID = "last_ussd_response_queue_id"
        const val KEY_ACTIVE_QUEUE_ID = "active_queue_id"

        private val CONFIRM_BUTTONS = listOf(
            "send", "ok", "confirm", "yes", "done", "continue", "next",
            "haye", "haa", "hagaag", "sii wad", "ogolow", "dir"
        )

        private val USSD_PACKAGES = listOf(
            "com.android.stk",
            "com.mediatek.stk",
            "com.sec.android.app.stk",
            "com.qualcomm.simtoolkit",
            "com.android.phone",
            "com.samsung.android.phone",
            "com.android.server.telecom",
            "com.mediatek.phone",
            "com.google.android.dialer",
            "com.android.incallui",
            "com.samsung.android.incallui",
            "com.hormuud.phone",
            "com.somnet.dialer",
            "com.somtel.phone"
        )

        private const val EXPECTING_USSD_TIMEOUT_MS = 60_000L
        private const val DEBOUNCE_MS = 800L
        private const val CLICK_DELAY_MS = 350L
        private const val SWEEP_INTERVAL_MS = 900L
        private const val SWEEP_DURATION_MS = 30_000L
        private const val MULTI_DIALOG_TIMEOUT_MS = 20_000L
    }

    private val handler = Handler(Looper.getMainLooper())

    private var clickCount = 0
    private var lastClickTime = 0L
    private var ussdSessionToken = 0L

    private var pinFilledForSession = false
    private var pinSubmittedForSession = false

    /**
     * Signature of the last dialog that successfully consumed a planned step.
     * The sweep can see the same Samsung USSD window repeatedly; this prevents the
     * new step index from being applied to the old/stale dialog.
     */
    private var lastConsumedDialogSignature: String? = null

    private var sweepRunnable: Runnable? = null
    private var sweepUntil = 0L
    private var multiDialogRunnable: Runnable? = null

    override fun onServiceConnected() {
        super.onServiceConnected()

        serviceInfo = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 10
        }

        Log.d(TAG, "✅ UssdAccessibilityService connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val expecting = prefs.getBoolean(KEY_EXPECTING_USSD, false)
        val lastUssdTime = prefs.getLong(KEY_LAST_USSD_TIME, 0L)

        if (!expecting) {
            resetSessionGuards()
            return
        }

        if (lastUssdTime > 0L && System.currentTimeMillis() - lastUssdTime > EXPECTING_USSD_TIMEOUT_MS) {
            prefs.edit().putBoolean(KEY_EXPECTING_USSD, false).apply()
            resetSessionGuards()
            Log.d(TAG, "⏰ USSD expectation timed out")
            return
        }

        if (lastUssdTime != 0L && lastUssdTime != ussdSessionToken) {
            ussdSessionToken = lastUssdTime
            pinFilledForSession = false
            pinSubmittedForSession = false
            lastConsumedDialogSignature = null
            startDialogSweep()
            Log.d(TAG, "🆕 New USSD session: $ussdSessionToken")
        }

        val packageName = event.packageName?.toString().orEmpty()
        if (!isPhoneOrUssdPackage(packageName)) return

        if (System.currentTimeMillis() - lastClickTime < DEBOUNCE_MS) return

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                handler.postDelayed({ tryHandleCurrentDialog() }, CLICK_DELAY_MS)
            }
        }
    }

    private fun isPhoneOrUssdPackage(packageName: String): Boolean {
        if (USSD_PACKAGES.any { packageName.contains(it, ignoreCase = true) }) return true
        return packageName.contains("phone", true) ||
            packageName.contains("dialer", true) ||
            packageName.contains("stk", true) ||
            packageName.contains("toolkit", true) ||
            packageName.contains("telecom", true) ||
            packageName.contains("incall", true) ||
            packageName.contains("ussd", true)
    }

    private fun resetSessionGuards() {
        ussdSessionToken = 0L
        pinFilledForSession = false
        pinSubmittedForSession = false
        lastConsumedDialogSignature = null
    }

    private fun startDialogSweep() {
        sweepUntil = System.currentTimeMillis() + SWEEP_DURATION_MS
        if (sweepRunnable != null) return

        sweepRunnable = object : Runnable {
            override fun run() {
                val expecting = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean(KEY_EXPECTING_USSD, false)

                if (!expecting || System.currentTimeMillis() > sweepUntil) {
                    sweepRunnable = null
                    return
                }

                if (System.currentTimeMillis() - lastClickTime >= DEBOUNCE_MS) {
                    tryHandleCurrentDialog()
                }
                handler.postDelayed(this, SWEEP_INTERVAL_MS)
            }
        }

        handler.postDelayed(sweepRunnable!!, SWEEP_INTERVAL_MS)
    }

    private fun currentDialogRoot(): AccessibilityNodeInfo? {
        rootInActiveWindow?.let { return it }
        return try {
            windows.mapNotNull { it.root }.firstOrNull()
        } catch (_: Exception) {
            null
        }
    }

    private fun tryHandleCurrentDialog() {
        val source = currentDialogRoot() ?: return

        try {
            val dialogText = extractDialogText(source).orEmpty()
            if (dialogText.isBlank()) return

            // Planned menu/receiver/PIN flow always has priority.
            if (handleStepPlan(source, dialogText)) return

            // If a plan still has steps, do not run the independent PIN fallback.
            // This prevents a stale menu dialog from jumping directly to PIN handling.
            if (hasPendingPlan()) {
                return
            }

            if (isLikelyUssdResponse(dialogText)) {
                saveUssdResponse(dialogText)
            }

            // Direct PIN handling is only for non-planned flows.
            if (isPinPrompt(dialogText)) {
                handleDirectPin(source)
                return
            }

            val inputs = mutableListOf<AccessibilityNodeInfo>()
            findEditTexts(source, inputs)
            val interactive = inputs.isNotEmpty()
            inputs.forEach { it.recycle() }

            if (interactive) {
                // Never click Send on a dialog that still expects unknown input.
                return
            }

            clickKnownConfirmButton(source)
        } catch (e: Exception) {
            Log.e(TAG, "❌ USSD dialog handling failed: ${e.message}")
        } finally {
            source.recycle()
        }
    }

    private fun hasPendingPlan(): Boolean {
        val plan = Ussd870Flow.loadPlan(this)
        return plan.isNotEmpty() && Ussd870Flow.currentIndex(this) < plan.size
    }

    private fun handleStepPlan(source: AccessibilityNodeInfo, dialogText: String): Boolean {
        val plan = Ussd870Flow.loadPlan(this)
        if (plan.isEmpty()) return false

        val index = Ussd870Flow.currentIndex(this)
        if (index >= plan.size) return false

        val step = plan[index]
        val dialogSignature = buildDialogSignature(dialogText)

        // Most important stale-dialog guard: the same visible dialog cannot consume
        // two consecutive steps just because the step index changed after Send.
        if (dialogSignature == lastConsumedDialogSignature) {
            Log.d(TAG, "⏭️ Same dialog already consumed; waiting for next USSD screen")
            return true
        }

        val editTexts = mutableListOf<AccessibilityNodeInfo>()
        findEditTexts(source, editTexts)
        val hasInput = editTexts.isNotEmpty()
        editTexts.forEach { it.recycle() }
        if (!hasInput) return false

        val pinPrompt = isPinPrompt(dialogText)

        val value = when (step.kind) {
            Ussd870Flow.KIND_MENU -> {
                // Never type a menu number into a PIN prompt.
                if (pinPrompt) return false
                val label = step.label ?: return false
                Ussd870Flow.matchMenuOption(dialogText, label).also {
                    if (it == null) {
                        Log.w(TAG, "⚠️ No menu match for '$label' in ${dialogText.take(160)}")
                    }
                }
            }

            Ussd870Flow.KIND_LITERAL -> {
                // In current plan grammar literal is the Somtel *101 receiver step.
                // It must never consume a PIN prompt.
                if (pinPrompt) return false
                step.literal
                    ?.filter(Char::isDigit)
                    ?.takeIf { it.length in 7..12 }
            }

            Ussd870Flow.KIND_PIN -> {
                // PIN may only be entered on a dialog that explicitly asks for it.
                if (!pinPrompt) {
                    Log.d(TAG, "⏳ PIN step waiting for an actual PIN prompt")
                    return false
                }
                readConfiguredPin()
            }

            else -> null
        }

        if (value.isNullOrBlank()) {
            if (step.kind == Ussd870Flow.KIND_PIN) {
                Log.w(TAG, "⚠️ PIN step blocked: no valid 3-12 digit current_pin_code")
            }
            return false
        }

        if (!setInputText(source, value)) {
            Log.w(TAG, "⚠️ Could not write step ${step.order} (${step.kind})")
            return false
        }

        // Mark THIS dialog as consumed before advancing so the 900ms sweep cannot
        // reuse it for the next step.
        lastConsumedDialogSignature = dialogSignature

        if (step.kind == Ussd870Flow.KIND_PIN) {
            pinFilledForSession = true
            pinSubmittedForSession = true
        }

        Ussd870Flow.advance(this)
        lastClickTime = System.currentTimeMillis()
        startDialogSweep()

        Log.d(
            TAG,
            "✅ Step ${step.order} (${step.kind}) prepared: ${if (step.kind == Ussd870Flow.KIND_PIN) "****" else value}"
        )

        handler.postDelayed({
            val root = currentDialogRoot() ?: return@postDelayed
            try {
                clickSendOrOkButton(root)
            } finally {
                root.recycle()
            }
        }, 300L)

        return true
    }

    private fun buildDialogSignature(dialogText: String): String {
        return dialogText
            .lowercase()
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun isPinPrompt(text: String): Boolean {
        val t = text.lowercase()
        return listOf(
            "pin",
            "password",
            "furaha",
            "sirta",
            "lambarka sirta",
            "secret",
            "passcode",
            "security code",
            "code-ka sirta",
            "koodhka sirta"
        ).any { t.contains(it) }
    }

    private fun readConfiguredPin(): String? {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString("current_pin_code", null)
            ?: prefs.getString("last_known_pin_code", null)
            ?: return null

        val digits = raw.filter(Char::isDigit)
        return digits.takeIf { it.length in 3..12 }
    }

    private fun handleDirectPin(source: AccessibilityNodeInfo) {
        if (pinSubmittedForSession) return

        val pin = readConfiguredPin()
        if (pin == null) {
            Log.w(TAG, "⚠️ PIN prompt found but no valid configured PIN; refusing fallback value")
            return
        }

        if (!pinFilledForSession) {
            if (!setInputText(source, pin)) return
            pinFilledForSession = true
        }

        pinSubmittedForSession = true
        handler.postDelayed({
            val root = currentDialogRoot() ?: return@postDelayed
            try {
                clickSendOrOkButton(root)
            } finally {
                root.recycle()
            }
        }, 300L)
    }

    private fun setInputText(root: AccessibilityNodeInfo, value: String): Boolean {
        val editTexts = mutableListOf<AccessibilityNodeInfo>()
        findEditTexts(root, editTexts)
        if (editTexts.isEmpty()) return false

        var success = false
        try {
            for (editText in editTexts) {
                editText.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                val args = android.os.Bundle().apply {
                    putCharSequence(
                        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                        value
                    )
                }
                if (editText.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
                    success = true
                    break
                }
            }
        } finally {
            editTexts.forEach { it.recycle() }
        }
        return success
    }

    private fun findEditTexts(node: AccessibilityNodeInfo, results: MutableList<AccessibilityNodeInfo>) {
        try {
            val className = node.className?.toString().orEmpty()
            if (className.contains("EditText", true) || node.isEditable) {
                results.add(AccessibilityNodeInfo.obtain(node))
            }

            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { child ->
                    findEditTexts(child, results)
                    child.recycle()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ findEditTexts: ${e.message}")
        }
    }

    private fun clickSendOrOkButton(root: AccessibilityNodeInfo): Boolean {
        val priority = listOf("Send", "Dir", "OK", "Confirm", "Haye", "Sii Wad")

        for (buttonText in priority) {
            val nodes = root.findAccessibilityNodeInfosByText(buttonText)
            try {
                for (node in nodes) {
                    if (isClickableButton(node) && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        clickCount++
                        lastClickTime = System.currentTimeMillis()
                        startMultiDialogListener()
                        notifyClickComplete()
                        return true
                    }
                }
            } finally {
                nodes.forEach { it.recycle() }
            }
        }

        Log.w(TAG, "⚠️ No safe Send/OK button found")
        return false
    }

    private fun clickKnownConfirmButton(root: AccessibilityNodeInfo): Boolean {
        for (buttonText in CONFIRM_BUTTONS) {
            val nodes = root.findAccessibilityNodeInfosByText(buttonText)
            try {
                for (node in nodes) {
                    if (isClickableButton(node) && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        clickCount++
                        lastClickTime = System.currentTimeMillis()
                        startMultiDialogListener()
                        notifyClickComplete()
                        return true
                    }
                }
            } finally {
                nodes.forEach { it.recycle() }
            }
        }
        return false
    }

    private fun isClickableButton(node: AccessibilityNodeInfo?): Boolean {
        if (node == null || !node.isEnabled) return false
        val className = node.className?.toString().orEmpty()
        return node.isClickable ||
            className.contains("Button", true) ||
            className.contains("TextView", true)
    }

    private fun extractDialogText(root: AccessibilityNodeInfo): String? {
        val parts = mutableListOf<String>()
        extractTextRecursively(root, parts)
        return parts.takeIf { it.isNotEmpty() }?.joinToString(" | ")
    }

    private fun extractTextRecursively(node: AccessibilityNodeInfo, parts: MutableList<String>) {
        node.text?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let(parts::add)
        node.contentDescription?.toString()?.trim()
            ?.takeIf { it.isNotBlank() && it != node.text?.toString()?.trim() }
            ?.let(parts::add)

        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                extractTextRecursively(child, parts)
                child.recycle()
            }
        }
    }

    private fun saveUssdResponse(text: String) {
        if (!isLikelyUssdResponse(text)) return

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val activeQueueId = prefs.getString(KEY_ACTIVE_QUEUE_ID, null)

        prefs.edit()
            .putString(KEY_LAST_USSD_RESPONSE, text)
            .putLong(KEY_LAST_USSD_RESPONSE_TIME, System.currentTimeMillis())
            .putString(KEY_LAST_USSD_RESPONSE_QUEUE_ID, activeQueueId)
            .apply()
    }

    private fun isLikelyUssdResponse(text: String): Boolean {
        if (text.trim().length < 3) return false
        val t = text.lowercase()
        return listOf(
            "$", "usd", "data", "kuhadal", "xirmo", "package",
            "waxaad", "shubtay", "haraag", "mahadsanid", "wareejis",
            "guul", "lambark", "voucher", "balance", "success", "failed",
            "error", "pin", "furaha", "sirta", "hormuud", "somnet", "somtel"
        ).any { t.contains(it) }
    }

    private fun startMultiDialogListener() {
        multiDialogRunnable?.let { handler.removeCallbacks(it) }

        multiDialogRunnable = Runnable {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_EXPECTING_USSD, false)
                .apply()

            sendBroadcast(Intent(ACTION_USSD_CLICK_COMPLETE).apply {
                setPackage("com.awdheegle.data")
                putExtra("total_clicks", clickCount)
                putExtra("success", true)
            })

            clickCount = 0
        }

        startDialogSweep()
        handler.postDelayed(multiDialogRunnable!!, MULTI_DIALOG_TIMEOUT_MS)
    }

    private fun notifyClickComplete() {
        sendBroadcast(Intent(ACTION_USSD_CLICK_COMPLETE).apply {
            setPackage("com.awdheegle.data")
            putExtra("click_count", clickCount)
            putExtra("timestamp", System.currentTimeMillis())
        })
    }

    override fun onInterrupt() {
        Log.d(TAG, "UssdAccessibilityService interrupted")
    }

    override fun onDestroy() {
        multiDialogRunnable?.let { handler.removeCallbacks(it) }
        sweepRunnable?.let { handler.removeCallbacks(it) }
        sweepRunnable = null
        super.onDestroy()
    }
}
