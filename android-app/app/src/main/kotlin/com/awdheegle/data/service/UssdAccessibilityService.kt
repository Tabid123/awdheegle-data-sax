package com.awdheegle.data.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.util.Log

/**
 * AccessibilityService to auto-click "OK/Confirm" dialogs on USSD responses
 * 
 * IMPORTANT: User must manually enable this service in:
 * Settings > Accessibility > Installed Services > Awdheegle Data > Enable
 * 
 * Features:
 * - Auto-clicks OK/Confirm/Dismiss buttons on USSD dialogs
 * - Handles multiple consecutive dialogs (Hormuud sends 2-3)
 * - Communicates with SmsReceiver via SharedPreferences
 * - Sends broadcast when clicks complete for UssdDialerService
 * - CAPTURES ALL DIALOG TEXT for delivery_notes
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
        
        // Button texts to auto-click (Somali and English) - EXPANDED LIST
        private val CONFIRM_BUTTONS = listOf(
            // English
            "ok", "OK", "Ok", "O.K.", "okay", "Okay", "OKAY",
            "yes", "Yes", "YES",
            "confirm", "Confirm", "CONFIRM",
            "send", "Send", "SEND",
            "dismiss", "Dismiss", "DISMISS",
            "cancel", "Cancel", "CANCEL",
            "close", "Close", "CLOSE",
            "done", "Done", "DONE",
            "continue", "Continue", "CONTINUE",
            "next", "Next", "NEXT",
            "accept", "Accept", "ACCEPT",
            "agree", "Agree", "AGREE",
            // Somali - EXPANDED with Haye!
            "haa", "Haa", "HAA",
            "haye", "Haye", "HAYE",           // ← ADDED: Common Somali OK
            "hagaag", "Hagaag", "HAGAAG",     // ← ADDED: "Fine/OK" in Somali
            "xaq", "Xaq", "XAQ",
            "kulan", "Kulan", "KULAN",
            "dhamaad", "Dhamaad", "DHAMAAD",
            "xayn", "Xayn", "XAYN",
            "sii wad", "Sii Wad", "SII WAD",
            "raali", "Raali", "RAALI",
            "ogolow", "Ogolow", "OGOLOW",
            // Symbols & Emojis
            "✓", "✔", "☑", "👍", "🆗"
        )
        
        // USSD-related package names (including Somali carriers and common dialers)
        private val USSD_PACKAGES = listOf(
            // ✅ SIM TOOLKIT - CRITICAL for Hormuud USSD dialogs!
            "com.android.stk",              // Standard SIM Toolkit
            "com.mediatek.stk",             // MediaTek SIM Toolkit
            "com.sec.android.app.stk",      // Samsung SIM Toolkit
            "com.qualcomm.simtoolkit",      // Qualcomm SIM Toolkit
            // Phone/Dialer apps
            "com.android.phone",
            "com.samsung.android.phone",
            "com.android.server.telecom",
            "com.mediatek.phone",
            "com.hormuud.phone",
            "com.somnet.dialer",
            "com.somtel.phone",
            "com.huawei.phone",
            "com.xiaomi.phone",
            "com.oppo.phone",
            "com.vivo.phone",
            // Additional common dialer packages
            "com.google.android.dialer",
            "com.android.incallui",
            "com.samsung.android.incallui",
            "com.sec.android.app.samsungapps",
            "com.lge.phone",
            "com.asus.contacts",
            "com.oneplus.dialer",
            "com.coloros.phone",
            "com.realme.phone"
        )
        
        // Timeout for expecting USSD flag (30 seconds - INCREASED from 15s)
        private const val EXPECTING_USSD_TIMEOUT_MS = 60000L
        private const val DEBOUNCE_MS = 800L
        private const val CLICK_DELAY_MS = 350L
        private const val MULTI_DIALOG_TIMEOUT_MS = 20000L
        /** Active re-read of the live dialog: Samsung stops firing events on menu reuse. */
        private const val SWEEP_INTERVAL_MS = 900L
        private const val SWEEP_DURATION_MS = 30000L
    }
    
    private val handler = Handler(Looper.getMainLooper())
    private var clickCount = 0
    private var lastClickTime = 0L
    private var multiDialogRunnable: Runnable? = null
    private var sweepRunnable: Runnable? = null
    private var sweepUntil = 0L

    // Session guards to prevent duplicate PIN entry
    private var ussdSessionToken = 0L
    private var pinFilledForSession = false
    private var pinSubmittedForSession = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        
        Log.d(TAG, "✅ UssdAccessibilityService connected and active")
        
        // Configure service - NO packageNames filter to listen to ALL apps
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                        AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                   AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                   AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 10  // FASTER: 10ms instead of 50ms
            
            // REMOVED: packageNames filter - now listens to ALL apps for USSD dialogs
        }
        
        serviceInfo = info
        Log.d(TAG, "🎯 Listening to ALL apps for USSD dialogs (no package filter)")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        
        val packageName = event.packageName?.toString() ?: return
        
        // Check if we're expecting USSD dialogs (set by SmsReceiver)
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val expectingUssd = prefs.getBoolean(KEY_EXPECTING_USSD, false)
        val lastUssdTime = prefs.getLong(KEY_LAST_USSD_TIME, 0)
        
        // Auto-reset expecting flag after timeout
        if (expectingUssd && System.currentTimeMillis() - lastUssdTime > EXPECTING_USSD_TIMEOUT_MS) {
            prefs.edit().putBoolean(KEY_EXPECTING_USSD, false).apply()
            pinFilledForSession = false
            pinSubmittedForSession = false
            ussdSessionToken = 0L
            Log.d(TAG, "⏰ Reset expecting_ussd flag (timeout after ${EXPECTING_USSD_TIMEOUT_MS/1000}s)")
            return
        }

        // New USSD session started: reset one-time PIN guards
        if (expectingUssd && lastUssdTime != 0L && lastUssdTime != ussdSessionToken) {
            ussdSessionToken = lastUssdTime
            pinFilledForSession = false
            pinSubmittedForSession = false
            Log.d(TAG, "🆕 New USSD session detected, PIN guards reset")
        }
        
        // Check if event is from a phone/dialer-related app
        val isUssdPackage = USSD_PACKAGES.any { packageName.contains(it, ignoreCase = true) }
        
        // Check for generic phone/dialer packages with expanded keywords
        val isPhonePackage = packageName.contains("phone", ignoreCase = true) ||
                            packageName.contains("dialer", ignoreCase = true) ||
                            packageName.contains("stk", ignoreCase = true) ||        // ← ADDED: SIM Toolkit
                            packageName.contains("toolkit", ignoreCase = true) ||    // ← ADDED: SIM Toolkit
                            packageName.contains("telecom", ignoreCase = true) ||
                            packageName.contains("incall", ignoreCase = true) ||
                            packageName.contains("ussd", ignoreCase = true) ||
                            packageName.contains("call", ignoreCase = true)
        
        // CRITICAL: Only process if BOTH conditions are met:
        // 1. We're expecting USSD (flag set by SmsReceiver)
        // 2. AND it's from a phone/dialer app
        if (!expectingUssd) {
            // Not expecting USSD - clear session guards and ignore events
            pinFilledForSession = false
            pinSubmittedForSession = false
            ussdSessionToken = 0L
            return
        }
        
        if (!isUssdPackage && !isPhonePackage) {
            // Expecting USSD but not from a phone app - ignore
            return
        }
        
        // Debounce: Don't process if we clicked recently
        val timeSinceLastClick = System.currentTimeMillis() - lastClickTime
        if (timeSinceLastClick < DEBOUNCE_MS) {
            Log.d(TAG, "⏳ Debounce: ignoring event (${timeSinceLastClick}ms since last click)")
            return
        }
        
        Log.d(TAG, "📱 Event from $packageName: ${event.eventType} (expecting=$expectingUssd, isPhone=$isPhonePackage)")
        
        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                // NOTE: the AccessibilityEvent is recycled by the framework as soon as
                // this callback returns, so we must NOT touch it inside postDelayed
                // (that threw "Cannot perform this action on a not sealed instance"
                // and the USSD dialog text was never captured). Re-read the live
                // window tree instead.
                handler.postDelayed({
                    tryClickConfirmButton()
                }, CLICK_DELAY_MS)
            }
        }
    }

    /** Reads the current dialog straight from the live window tree. */
    private fun currentDialogRoot(): AccessibilityNodeInfo? {
        rootInActiveWindow?.let { return it }
        return try {
            windows.mapNotNull { it.root }.firstOrNull()
        } catch (e: Exception) {
            null
        }
    }

    private fun tryClickConfirmButton() {
        try {
            val source = currentDialogRoot() ?: return
            
            // CAPTURE ALL DIALOG TEXT FIRST - before any filtering
            val dialogText = extractDialogText(source)

            // ---- MULTI-STEP MENU FLOW (*870 / *866 / *101 / *212) --------
            // Consume a configured step before saving the dialog. For *212 this
            // prevents the root category menu from being mistaken for the package
            // result; only the submenu shown after the category is selected is saved.
            if (!dialogText.isNullOrBlank() && handleStepPlan(source, dialogText)) {
                source.recycle()
                return
            }

            // Save dialog text ONLY if it looks like a real USSD response.
            // This prevents lock-screen / clock / home-screen junk like
            // "06:24 | 06 | : | 24 | Mon, 20 April | Monday, 20 April"
            // from being stored as delivery_notes.
            if (!dialogText.isNullOrBlank() && isLikelyUssdResponse(dialogText)) {
                Log.d(TAG, "📝 Dialog text captured: ${dialogText.take(200)}")
                saveUssdResponse(dialogText)
            } else if (!dialogText.isNullOrBlank()) {
                Log.d(TAG, "🚫 Ignored non-USSD text (clock/home screen): ${dialogText.take(120)}")
            }
            
            val isPinDialog = dialogText?.contains("PIN", ignoreCase = true) == true ||
                             dialogText?.contains("pin", ignoreCase = true) == true ||
                             dialogText?.contains("password", ignoreCase = true) == true ||
                             dialogText?.contains("furaha", ignoreCase = true) == true
            
            if (isPinDialog) {
                Log.d(TAG, "🔐 PIN dialog detected")

                if (!pinFilledForSession) {
                    // Read PIN from SharedPreferences (set by UssdDialerService from web dashboard)
                    val rawPin = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .getString("current_pin_code", "5516") ?: "5516"
                    val currentPin = rawPin.filter { it.isDigit() }.take(4).ifEmpty { "5516" }
                    Log.d(TAG, "🔐 Using PIN from SharedPreferences: ${currentPin.take(2)}***")
                    val pinEntered = enterPinInDialog(source, currentPin)
                    if (!pinEntered) {
                        Log.w(TAG, "⚠️ PIN dialog found but couldn't set PIN text")
                        source.recycle()
                        return
                    }
                    pinFilledForSession = true
                    Log.d(TAG, "✅ PIN entered once for this session")
                } else {
                    Log.d(TAG, "⏭️ PIN already filled for this session, skipping re-entry")
                }

                if (!pinSubmittedForSession) {
                    pinSubmittedForSession = true
                    handler.postDelayed({
                        val root = rootInActiveWindow ?: return@postDelayed
                        clickSendOrOkButton(root)
                        root.recycle()
                    }, 300)
                } else {
                    Log.d(TAG, "⏭️ PIN already submitted for this session, skipping re-submit")
                }

                source.recycle()
                return
            }

            // Never press Send on an interactive menu unless a step above has
            // actually written a value. Pressing it with an empty EditText caused
            // *212 to skip the customer's category and close the USSD session.
            val pendingInputs = mutableListOf<AccessibilityNodeInfo>()
            findEditTexts(source, pendingInputs)
            val hasInteractiveInput = pendingInputs.isNotEmpty()
            pendingInputs.forEach { it.recycle() }
            if (hasInteractiveInput) {
                Log.d(TAG, "⏸️ Interactive USSD menu held open; no planned value to submit")
                source.recycle()
                return
            }
            
            // Search for clickable buttons with confirm text
            for (buttonText in CONFIRM_BUTTONS) {
                val nodes = source.findAccessibilityNodeInfosByText(buttonText)
                
                for (node in nodes) {
                    if (isClickableButton(node)) {
                        val nodeText = node.text?.toString() ?: buttonText
                        Log.d(TAG, "🎯 Found button: '$nodeText' - clicking...")
                        
                        val clicked = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        
                        if (clicked) {
                            clickCount++
                            lastClickTime = System.currentTimeMillis()
                            Log.d(TAG, "✅ Successfully clicked '$nodeText' button (click #$clickCount)")
                            
                            // Start multi-dialog listener
                            startMultiDialogListener()
                            
                            // Notify completion
                            notifyClickComplete()
                            
                            node.recycle()
                            source.recycle()
                            return
                        } else {
                            // Try clicking parent if button itself isn't clickable
                            val parent = node.parent
                            if (parent != null && parent.isClickable) {
                                val parentClicked = parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                                if (parentClicked) {
                                    clickCount++
                                    lastClickTime = System.currentTimeMillis()
                                    Log.d(TAG, "✅ Successfully clicked parent of '$nodeText' (click #$clickCount)")
                                    startMultiDialogListener()
                                    notifyClickComplete()
                                    parent.recycle()
                                    node.recycle()
                                    source.recycle()
                                    return
                                }
                                parent.recycle()
                            }
                        }
                    }
                    node.recycle()
                }
            }
            
            // IMPORTANT: avoid unsafe fallback clicks on dialer keypad (can type extra digits)
            Log.d(TAG, "ℹ️ No known confirm button found; skipping unsafe fallback click")
            
            source.recycle()
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error handling event: ${e.message}")
        }
    }
    
    /**
     * Extract ALL text content from the USSD dialog
     * This captures the Hormuud confirmation message for delivery_notes
     * IMPROVED: Captures all text including short strings and button labels
     */
    private fun extractDialogText(root: AccessibilityNodeInfo): String? {
        val textParts = mutableListOf<String>()
        extractTextRecursively(root, textParts)
        
        if (textParts.isNotEmpty()) {
            val fullText = textParts.joinToString(" | ")
            Log.d(TAG, "📄 Extracted dialog texts: $fullText")
            return fullText
        }
        return null
    }
    
    /**
     * Recursively extract text from ALL nodes in the dialog
     * IMPROVED: Captures ALL text regardless of length, including button labels and content descriptions
     */
    private fun extractTextRecursively(node: AccessibilityNodeInfo, texts: MutableList<String>) {
        try {
            // Capture ALL text - no length filter
            val text = node.text?.toString()
            if (!text.isNullOrBlank()) {
                texts.add(text.trim())
            }
            
            // Also capture content description (important for some dialogs)
            val contentDesc = node.contentDescription?.toString()
            if (!contentDesc.isNullOrBlank() && contentDesc != text) {
                texts.add(contentDesc.trim())
            }
            
            // Recurse into all children
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { child ->
                    extractTextRecursively(child, texts)
                    child.recycle()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error extracting text: ${e.message}")
        }
    }
    
    /**
     * Save captured USSD response to SharedPreferences
     * UssdDialerService will read this and send to backend as delivery_notes
     */
    private fun saveUssdResponse(text: String) {
        // Double-check before persisting (defense-in-depth)
        if (!isLikelyUssdResponse(text)) {
            Log.d(TAG, "🚫 saveUssdResponse rejected non-USSD text: ${text.take(80)}")
            return
        }
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            // Tag with the active queue id (if any) so the dialer can verify
            // the response actually belongs to the order it just dialed.
            val activeQueueId = prefs.getString(KEY_ACTIVE_QUEUE_ID, null)
            prefs.edit()
                .putString(KEY_LAST_USSD_RESPONSE, text)
                .putLong(KEY_LAST_USSD_RESPONSE_TIME, System.currentTimeMillis())
                .putString(KEY_LAST_USSD_RESPONSE_QUEUE_ID, activeQueueId)
                .apply()
            Log.d(TAG, "💾 Saved USSD response (queue=$activeQueueId): ${text.take(100)}")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to save USSD response: ${e.message}")
        }
    }

    /**
     * Heuristic: distinguish a real USSD/SIM-toolkit response (Hormuud/Somnet/Somtel)
     * from junk text captured off the lock-screen, status bar, or home screen
     * (e.g. "06:24 | 06 | : | 24 | Mon, 20 April | Monday, 20 April").
     *
     * Real USSD responses always contain at least one of:
     *   - A currency marker ($, USD, dollar)
     *   - A USSD keyword (Waxaad, ku shubtay, ugu shubtay, Haraagaagu, Mahadsanid,
     *     wareejiso, guulaysatay, lambarkani, ma shaqaynayo, OK, Voucher, e-voucher,
     *     received, sent, success, failed, error, balance, "Bille", "Dhammays")
     */
    private fun isLikelyUssdResponse(text: String): Boolean {
        val t = text.trim()
        if (t.length < 3) return false

        // Reject obvious clock / date-only patterns: "06:24 | 06 | : | 24 | Mon, 20 April | ..."
        // i.e. text that's mostly time/date tokens separated by " | " with no letters except weekday/month
        val clockJunkPattern = Regex(
            """^(\d{1,2}:\d{2}.*?(\||$)|.*?(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s*\d{1,2}\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec).*)""",
            RegexOption.IGNORE_CASE
        )
        val onlyTimeOrDate = clockJunkPattern.containsMatchIn(t) &&
            !Regex("""\$|USD|dollar|waxaad|shubtay|haraag|mahadsanid|wareejis|guulaysatay|lambark|shaqayn|voucher|received|sent|balance|bille|dhammays|mobile|airtime|ugu|haye|waafi""", RegexOption.IGNORE_CASE)
                .containsMatchIn(t)
        if (onlyTimeOrDate) return false

        val ussdKeywords = listOf(
            "$", "USD", "dollar",
            "maamuus", "data", "kuhadal", "xirmo", "package",
            "waxaad", "ku shubtay", "ugu shubtay", "haraag", "mahadsanid",
            "wareejis", "guulaysatay", "lambark", "shaqayn",
            "voucher", "e-voucher", "received from", "ka heshay",
            "balance", "bille", "dhammays", "airtime", "sent to",
            "OK", "okay", "success", "failed", "error", "PIN", "pin",
            "waafi", "hormuud", "somnet", "somtel", "amtel", "somlink"
        )
        return ussdKeywords.any { t.contains(it, ignoreCase = true) }
    }
    
    /**
     * Start listening for additional dialogs for 10 seconds
     * Hormuud often sends 2-3 consecutive USSD dialogs
     */
    private fun startMultiDialogListener() {
        // Cancel any existing runnable
        multiDialogRunnable?.let { handler.removeCallbacks(it) }
        
        multiDialogRunnable = Runnable {
            Log.d(TAG, "🏁 Multi-dialog listener ended. Total clicks: $clickCount")
            
            // Reset click count for next session
            clickCount = 0
            
            // Reset expecting flag
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_EXPECTING_USSD, false)
                .apply()
            
            // Send final completion broadcast with package name for Android 13+
            sendBroadcast(Intent(ACTION_USSD_CLICK_COMPLETE).apply {
                setPackage("com.awdheegle.data")
                putExtra("total_clicks", clickCount)
                putExtra("success", true)
            })
        }
        
        handler.postDelayed(multiDialogRunnable!!, MULTI_DIALOG_TIMEOUT_MS)
        Log.d(TAG, "⏳ Started multi-dialog listener for ${MULTI_DIALOG_TIMEOUT_MS/1000}s")
    }
    
    /**
     * Walks the step plan written by UssdDialerService for menu flows.
     * Returns true when this dialog was consumed by a step (input written + sent).
     */
    private fun handleStepPlan(source: AccessibilityNodeInfo, dialogText: String): Boolean {
        val plan = Ussd870Flow.loadPlan(this)
        if (plan.isEmpty()) return false

        val index = Ussd870Flow.currentIndex(this)
        if (index >= plan.size) return false

        val step = plan[index]

        // Only act when the dialog actually has an input field.
        val editTexts = mutableListOf<AccessibilityNodeInfo>()
        findEditTexts(source, editTexts)
        if (editTexts.isEmpty()) {
            Log.d(TAG, "⏳ Step ${step.order} (${step.kind}) waiting for an input field")
            return false
        }
        editTexts.forEach { it.recycle() }

        val value: String? = when (step.kind) {
            Ussd870Flow.KIND_MENU -> {
                val label = step.label
                if (label.isNullOrBlank()) null
                else Ussd870Flow.matchMenuOption(dialogText, label).also {
                    if (it == null) Log.w(TAG, "⚠️ No menu match for '${label}' in: ${dialogText.take(160)}")
                }
            }
            Ussd870Flow.KIND_LITERAL -> step.literal?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }
            Ussd870Flow.KIND_PIN -> {
                if (pinSubmittedForSession) {
                    Log.d(TAG, "⏭️ PIN already submitted for this session")
                    return true
                }
                getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getString("current_pin_code", null)
                    ?.filter { it.isDigit() }
                    ?.take(4)
                    ?.takeIf { it.length == 4 }
            }
            else -> null
        }

        if (value.isNullOrBlank()) return false

        val written = enterPinInDialog(source, value)
        if (!written) {
            Log.w(TAG, "⚠️ Could not write step ${step.order} value")
            return false
        }

        if (step.kind == Ussd870Flow.KIND_PIN) pinSubmittedForSession = true
        Ussd870Flow.advance(this)
        lastClickTime = System.currentTimeMillis()
        Log.d(TAG, "✅ Step ${step.order} (${step.kind}) sent -> '${if (step.kind == Ussd870Flow.KIND_PIN) "****" else value}'")

        handler.postDelayed({
            val root = rootInActiveWindow ?: return@postDelayed
            clickSendOrOkButton(root)
            root.recycle()
        }, 300)

        return true
    }
    

    /**
     * Enter PIN into an EditText/input field in the USSD dialog
     * Hormuud sends a PIN prompt after *712*phone*amount# - we auto-enter "5516"
     */
    private fun enterPinInDialog(root: AccessibilityNodeInfo, pin: String): Boolean {
        try {
            val editTexts = mutableListOf<AccessibilityNodeInfo>()
            findEditTexts(root, editTexts)
            
            Log.d(TAG, "🔐 Found ${editTexts.size} EditText fields in PIN dialog")
            if (editTexts.isEmpty()) return false

            var setSuccess = false
            for (editText in editTexts) {
                val existing = editText.text?.toString()?.trim().orEmpty()

                // Force replace existing text with exact PIN value (no appending)
                editText.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                val arguments = android.os.Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, pin)
                }
                val success = editText.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)

                if (success) {
                    setSuccess = true
                    Log.d(TAG, "✅ PIN '$pin' set successfully (replaced previous value='$existing')")
                }
            }

            editTexts.forEach { it.recycle() }
            return setSuccess
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to enter PIN: ${e.message}")
        }
        return false
    }
    
    /**
     * Recursively find all EditText fields in the view hierarchy
     */
    private fun findEditTexts(node: AccessibilityNodeInfo, results: MutableList<AccessibilityNodeInfo>) {
        try {
            val className = node.className?.toString() ?: ""
            if (className.contains("EditText", ignoreCase = true) || node.isEditable) {
                results.add(AccessibilityNodeInfo.obtain(node))
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { child ->
                    findEditTexts(child, results)
                    child.recycle()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error finding EditTexts: ${e.message}")
        }
    }
    
    /**
     * Click Send/OK button after entering PIN
     */
    private fun clickSendOrOkButton(root: AccessibilityNodeInfo) {
        try {
            // Priority order: Send > OK > Confirm
            val sendButtons = listOf("Send", "send", "SEND", "Dir", "dir", "DIR", "OK", "ok", "Ok", "Confirm", "confirm")
            
            for (buttonText in sendButtons) {
                val nodes = root.findAccessibilityNodeInfosByText(buttonText)
                for (node in nodes) {
                    if (isClickableButton(node)) {
                        val clicked = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        if (clicked) {
                            clickCount++
                            lastClickTime = System.currentTimeMillis()
                            Log.d(TAG, "✅ Clicked '$buttonText' after PIN entry (click #$clickCount)")
                            startMultiDialogListener()
                            notifyClickComplete()
                            node.recycle()
                            return
                        }
                    }
                    node.recycle()
                }
            }
            
            // IMPORTANT: do not click random buttons/keys in PIN dialog
            Log.w(TAG, "⚠️ No Send/OK button found after PIN set; skipping unsafe fallback click")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error clicking send after PIN: ${e.message}")
        }
    }
    
    /**
     * Send broadcast to notify UssdDialerService that we clicked a button
     */
    private fun notifyClickComplete() {
        try {
            val intent = Intent(ACTION_USSD_CLICK_COMPLETE).apply {
                setPackage("com.awdheegle.data")  // Required for Android 13+
                putExtra("click_count", clickCount)
                putExtra("timestamp", System.currentTimeMillis())
            }
            sendBroadcast(intent)
            Log.d(TAG, "📢 Sent USSD_CLICK_COMPLETE broadcast with setPackage (click #$clickCount)")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to send broadcast: ${e.message}")
        }
    }

    private fun isClickableButton(node: AccessibilityNodeInfo?): Boolean {
        if (node == null) return false
        
        val className = node.className?.toString() ?: ""
        val isButton = className.contains("Button", ignoreCase = true) ||
                      className.contains("TextView", ignoreCase = true)
        
        return node.isClickable || (isButton && node.isEnabled)
    }

    private fun findAndClickAnyButton(root: AccessibilityNodeInfo): Boolean {
        try {
            // Recursively search for any button in the view hierarchy
            for (i in 0 until root.childCount) {
                val child = root.getChild(i) ?: continue
                
                val className = child.className?.toString() ?: ""
                
                if (className.contains("Button", ignoreCase = true) && child.isClickable) {
                    val text = child.text?.toString() ?: ""
                    Log.d(TAG, "🔍 Found button: '$text' - attempting click...")
                    
                    if (child.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        clickCount++
                        lastClickTime = System.currentTimeMillis()
                        Log.d(TAG, "✅ Clicked button: '$text' (click #$clickCount)")
                        startMultiDialogListener()
                        notifyClickComplete()
                        child.recycle()
                        return true
                    }
                }
                
                // Recurse into children
                if (findAndClickAnyButton(child)) {
                    child.recycle()
                    return true
                }
                child.recycle()
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error searching for buttons: ${e.message}")
        }
        return false
    }
    
    /**
     * FALLBACK: Use GLOBAL_ACTION_BACK to dismiss dialog if no button found
     */
    private fun dismissDialogWithBack() {
        Log.d(TAG, "⚠️ No button found, using GLOBAL_ACTION_BACK fallback to dismiss dialog")
        val result = performGlobalAction(GLOBAL_ACTION_BACK)
        if (result) {
            clickCount++
            lastClickTime = System.currentTimeMillis()
            Log.d(TAG, "✅ GLOBAL_ACTION_BACK successful (click #$clickCount)")
            startMultiDialogListener()
            notifyClickComplete()
        } else {
            Log.e(TAG, "❌ GLOBAL_ACTION_BACK failed")
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "UssdAccessibilityService interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        multiDialogRunnable?.let { handler.removeCallbacks(it) }
        Log.d(TAG, "UssdAccessibilityService destroyed")
    }
}
