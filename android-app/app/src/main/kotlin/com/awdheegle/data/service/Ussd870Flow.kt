package com.awdheegle.data.service

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Step machine shared by the *870 (Hormuud), *866 (Somnet) and *101 (Somtel)
 * menu flows.
 *
 * The dialer builds a step plan from the template, writes it to SharedPreferences,
 * and [UssdAccessibilityService] consumes it one dialog at a time:
 *
 *  *870*<receiver>#  -> Menu1 -> Menu2 -> PIN
 *  *866*<receiver>#  -> Menu1 -> Menu2 -> PIN   (slow network: longer waits)
 *  *101#             -> Menu1 -> Menu2 -> receiver (9 digits) -> PIN
 *
 * INVARIANTS
 *  - The PIN always comes from server config (never hardcoded per-order in UI).
 *  - Nothing after `|` in the template is ever dialed.
 *  - Each step is written exactly once; the machine never re-sends a step.
 */
object Ussd870Flow {

    const val KEY_STEP_PLAN = "ussd_step_plan"
    const val KEY_STEP_INDEX = "ussd_step_index"
    const val KEY_STEP_TOKEN = "ussd_step_token"

    /** Step kinds. */
    const val KIND_MENU = "menu"
    const val KIND_LITERAL = "literal"
    const val KIND_PIN = "pin"

    data class Step(
        val order: Int,
        val kind: String,
        /** Keyword label to match inside the menu (menu steps only). */
        val label: String? = null,
        /** Literal text to type (literal steps: receiver phone). */
        val literal: String? = null
    )

    // ---------------------------------------------------------------- plan

    fun buildPlan(parsed: UssdTemplate.Parsed, receiverPhone: String): List<Step> {
        val steps = mutableListOf<Step>()
        var order = 0
        parsed.menuPath.forEach { label ->
            steps.add(Step(order++, KIND_MENU, label = label))
        }
        if (parsed.needsReceiverStep) {
            steps.add(Step(order++, KIND_LITERAL, literal = UssdTemplate.sanitizeReceiver(receiverPhone)))
        }
        steps.add(Step(order, KIND_PIN))
        return steps
    }

    fun savePlan(context: Context, steps: List<Step>, sessionToken: Long) {
        val arr = JSONArray()
        steps.forEach { s ->
            arr.put(JSONObject().apply {
                put("order", s.order)
                put("kind", s.kind)
                put("label", s.label ?: JSONObject.NULL)
                put("literal", s.literal ?: JSONObject.NULL)
            })
        }
        context.getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_STEP_PLAN, arr.toString())
            .putInt(KEY_STEP_INDEX, 0)
            .putLong(KEY_STEP_TOKEN, sessionToken)
            .apply()
    }

    fun clearPlan(context: Context) {
        context.getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_STEP_PLAN)
            .remove(KEY_STEP_INDEX)
            .remove(KEY_STEP_TOKEN)
            .apply()
    }

    fun loadPlan(context: Context): List<Step> {
        val json = context.getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_STEP_PLAN, null) ?: return emptyList()
        return try {
            val arr = JSONArray(json)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                Step(
                    order = o.optInt("order", i),
                    kind = o.optString("kind", KIND_MENU),
                    label = o.optString("label", "").ifBlank { null }.takeIf { it != "null" },
                    literal = o.optString("literal", "").ifBlank { null }.takeIf { it != "null" }
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun currentIndex(context: Context): Int =
        context.getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
            .getInt(KEY_STEP_INDEX, 0)

    fun advance(context: Context) {
        val prefs = context.getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putInt(KEY_STEP_INDEX, prefs.getInt(KEY_STEP_INDEX, 0) + 1).apply()
    }

    // ------------------------------------------------------- menu matching

    /** Somali/English normalization: lowercase, strip punctuation and prices. */
    fun normalize(raw: String): String {
        var s = raw.lowercase()
        // strip a leading "1." / "2)" menu numbering
        s = s.replace(Regex("^\\s*\\d+\\s*[.)\\-:]\\s*"), "")
        // strip price prefixes: $1, 1$, 0.50$, usd 1
        s = s.replace(Regex("(usd|\\$)\\s*\\d+([.,]\\d+)?"), " ")
        s = s.replace(Regex("\\d+([.,]\\d+)?\\s*(usd|\\$)"), " ")
        s = s.replace(Regex("[^a-z0-9]+"), " ")
        return s.trim().replace(Regex("\\s+"), " ")
    }

    private val DURATION_TOKENS = mapOf(
        "maalin" to "day", "day" to "day", "daily" to "day", "24" to "day",
        "toddobaad" to "week", "todobaad" to "week", "week" to "week", "weekly" to "week", "7" to "week",
        "bil" to "month", "bishii" to "month", "month" to "month", "monthly" to "month", "30" to "month"
    )

    fun durationKey(raw: String): String? {
        val n = normalize(raw)
        DURATION_TOKENS.forEach { (token, key) -> if (n.contains(token)) return key }
        return null
    }

    /**
     * Finds the menu number for [label] inside the dialog text.
     * Returns the leading option digits (e.g. "3") or null when nothing matches.
     */
    fun matchMenuOption(dialogText: String, label: String): String? {
        // A menu step may hold several synonyms separated by ';' or '|' -> try each.
        val alternatives = label.split(';', '|').map { it.trim() }.filter { it.isNotEmpty() }
        if (alternatives.size > 1) {
            alternatives.forEach { alt -> matchSingle(dialogText, alt)?.let { return it } }
            return null
        }
        return matchSingle(dialogText, label)
    }

    private fun matchSingle(dialogText: String, label: String): String? {
        val target = normalize(label)
        if (target.isBlank()) return null
        val targetDuration = durationKey(label)


        val lines = dialogText.split('\n', '\r').map { it.trim() }.filter { it.isNotEmpty() }
        var fallback: String? = null

        for (line in lines) {
            val num = Regex("^\\s*(\\d+)\\s*[.)\\-:]?\\s+").find(line)?.groupValues?.get(1)
                ?: Regex("^\\s*(\\d+)\\s*[.)\\-:]").find(line)?.groupValues?.get(1)
                ?: continue
            val body = normalize(line)
            if (body.isBlank()) continue

            // exact-ish match wins
            if (body == target || body.contains(target) || target.contains(body)) {
                val lineDuration = durationKey(line)
                if (targetDuration == null || lineDuration == null || targetDuration == lineDuration) {
                    return num
                }
                if (fallback == null) fallback = num
                continue
            }

            // token overlap fallback (>= 2 shared words, plus matching duration)
            val targetTokens = target.split(' ').filter { it.length > 2 }.toSet()
            val bodyTokens = body.split(' ').filter { it.length > 2 }.toSet()
            val shared = targetTokens.intersect(bodyTokens)
            if (shared.size >= 2 && (targetDuration == null || durationKey(line) == targetDuration)) {
                if (fallback == null) fallback = num
            }
        }
        return fallback
    }
}
