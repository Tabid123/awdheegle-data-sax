package com.awdheegle.data.service

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Step machine shared by the *870 (Hormuud), *866 (Somnet) and *101 (Somtel)
 * menu flows.
 *
 * The dialer builds a step plan from the template, writes it to SharedPreferences,
 * and UssdAccessibilityService consumes it one dialog at a time.
 *
 * IMPORTANT MATCHING RULES
 * - "Data iyo Kuhadal" must match "3. Data iyo Kuhadal".
 * - If an upstream parser accidentally removes spaces and gives "DataiyoKuhadal",
 *   compact matching can still identify "Data iyo Kuhadal".
 * - Full/complete matches always win before partial matches.
 * - Numeric tokens such as 3/8/20 must match exactly when present.
 * - Accessibility text using "|" as separators is converted back to menu rows.
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
            steps.add(
                Step(
                    order++,
                    KIND_LITERAL,
                    literal = UssdTemplate.sanitizeReceiver(receiverPhone)
                )
            )
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

        context.getSharedPreferences(
            UssdAccessibilityService.PREFS_NAME,
            Context.MODE_PRIVATE
        )
            .edit()
            .putString(KEY_STEP_PLAN, arr.toString())
            .putInt(KEY_STEP_INDEX, 0)
            .putLong(KEY_STEP_TOKEN, sessionToken)
            .apply()
    }

    fun clearPlan(context: Context) {
        context.getSharedPreferences(
            UssdAccessibilityService.PREFS_NAME,
            Context.MODE_PRIVATE
        )
            .edit()
            .remove(KEY_STEP_PLAN)
            .remove(KEY_STEP_INDEX)
            .remove(KEY_STEP_TOKEN)
            .apply()
    }

    fun loadPlan(context: Context): List<Step> {
        val json = context.getSharedPreferences(
            UssdAccessibilityService.PREFS_NAME,
            Context.MODE_PRIVATE
        ).getString(KEY_STEP_PLAN, null) ?: return emptyList()

        return try {
            val arr = JSONArray(json)

            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)

                Step(
                    order = o.optInt("order", i),
                    kind = o.optString("kind", KIND_MENU),
                    label = o.optString("label", "")
                        .ifBlank { null }
                        .takeIf { it != "null" },
                    literal = o.optString("literal", "")
                        .ifBlank { null }
                        .takeIf { it != "null" }
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun currentIndex(context: Context): Int =
        context.getSharedPreferences(
            UssdAccessibilityService.PREFS_NAME,
            Context.MODE_PRIVATE
        ).getInt(KEY_STEP_INDEX, 0)

    fun advance(context: Context) {
        val prefs = context.getSharedPreferences(
            UssdAccessibilityService.PREFS_NAME,
            Context.MODE_PRIVATE
        )

        prefs.edit()
            .putInt(KEY_STEP_INDEX, prefs.getInt(KEY_STEP_INDEX, 0) + 1)
            .apply()
    }

    // ------------------------------------------------------- menu matching

    /**
     * Normalizes text for menu comparison.
     *
     * IMPORTANT:
     * We replace punctuation with spaces, NOT with nothing.
     * This preserves word boundaries.
     */
    fun normalize(raw: String): String {
        var s = raw.lowercase()

        // Remove leading menu numbering: 1. / 2) / 3- / 4:
        s = s.replace(
            Regex("""^\s*\d+\s*[.)\-:]\s*"""),
            ""
        )

        // Remove price prefixes/suffixes.
        s = s.replace(
            Regex("""(?:usd|\$)\s*\d+(?:[.,]\d+)?"""),
            " "
        )
        s = s.replace(
            Regex("""\d+(?:[.,]\d+)?\s*(?:usd|\$)"""),
            " "
        )

        // Normalize common separators while PRESERVING spaces.
        s = s.replace(
            Regex("""[=,;/\-–—_|\\\[\]()<>"']"""),
            " "
        )

        // Somali/English equivalent words used by carrier menus.
        s = s.replace(
            Regex("""\baan\s+xadidnayn\b"""),
            " unlimited "
        )
        s = s.replace(
            Regex("""\b(hours?|saacadood)\b"""),
            " saac "
        )

        return s.trim().replace(Regex("""\s+"""), " ")
    }

    /**
     * Compact comparison is deliberately used only as a SECONDARY exact match.
     *
     * Example:
     *   "Data iyo Kuhadal" -> "dataiyokuhadal"
     *   "DataiyoKuhadal"   -> "dataiyokuhadal"
     *
     * This fixes the exact bug seen in the logcat without making "Data"
     * incorrectly match "Data iyo Kuhadal".
     */
    private fun compact(raw: String): String =
        normalize(raw).filter { it.isLetterOrDigit() }

    private val DURATION_TOKENS = mapOf(
        "maalin" to "day",
        "day" to "day",
        "daily" to "day",
        "24" to "day",

        "toddobaad" to "week",
        "todobaad" to "week",
        "week" to "week",
        "weekly" to "week",
        "7" to "week",

        "bil" to "month",
        "bishii" to "month",
        "month" to "month",
        "monthly" to "month",
        "30" to "month"
    )

    fun durationKey(raw: String): String? {
        val n = normalize(raw)

        DURATION_TOKENS.forEach { (token, key) ->
            if (Regex("""\b${Regex.escape(token)}\b""").containsMatchIn(n)) {
                return key
            }
        }

        return null
    }

    /**
     * Finds the menu number for [label] inside the dialog text.
     *
     * Matching priority:
     * 1. Exact normalized full-label match.
     * 2. Exact compact match (fixes "DataiyoKuhadal").
     * 3. All-token match.
     * 4. Numeric + duration protected fallback.
     *
     * A shorter word such as "Data" is never allowed to beat an exact
     * "Data iyo Kuhadal" match.
     */
    fun matchMenuOption(dialogText: String, label: String): String? {
        if (dialogText.isBlank() || label.isBlank()) return null

        val alternatives = label
            .split(';', '|')
            .map { it.trim() }
            .filter { it.isNotEmpty() }

        if (alternatives.isEmpty()) return null

        for (alternative in alternatives) {
            matchSingle(dialogText, alternative)?.let { return it }
        }

        return null
    }

    private fun matchSingle(dialogText: String, label: String): String? {
        val target = normalize(label)
        if (target.isBlank()) return null

        val targetCompact = compact(label)
        val targetTokens = tokenize(target)
        val targetNumbers = targetTokens.filter { it.any(Char::isDigit) }.toSet()
        val targetDuration = durationKey(label)

        val lines = extractMenuLines(dialogText)
        if (lines.isEmpty()) return null

        // ------------------------------------------------ exact normalized
        lines.firstOrNull { (_, body, _) ->
            body == target
        }?.let { return it.first }

        // ------------------------------------------------ exact compact
        // Fixes: admin "DataiyoKuhadal" vs live menu "Data iyo Kuhadal".
        if (targetCompact.isNotBlank()) {
            lines.firstOrNull { (_, body, _) ->
                compact(body) == targetCompact
            }?.let { return it.first }
        }

        var bestNum: String? = null
        var bestScore = -1

        for ((num, body, originalLine) in lines) {
            val bodyTokens = tokenize(body)
            if (bodyTokens.isEmpty()) continue

            val bodyTokenSet = bodyTokens.toSet()

            // Numeric tokens are mandatory and exact.
            val numbersMatch =
                targetNumbers.all { number -> bodyTokenSet.contains(number) }

            if (!numbersMatch) continue

            // If the request specifies a duration, don't cross-match durations.
            val lineDuration = durationKey(originalLine)
            if (targetDuration != null &&
                lineDuration != null &&
                targetDuration != lineDuration
            ) {
                continue
            }

            val matchedCount = targetTokens.count { token ->
                bodyTokenSet.contains(token)
            }

            // All requested tokens found = strong match.
            if (matchedCount == targetTokens.size && targetTokens.isNotEmpty()) {
                return num
            }

            // Duration + number fallback.
            if (targetNumbers.isNotEmpty() &&
                targetDuration != null &&
                numbersMatch &&
                lineDuration == targetDuration
            ) {
                if (matchedCount > bestScore) {
                    bestScore = matchedCount
                    bestNum = num
                }
                continue
            }

            // Conservative fuzzy matching:
            // only for longer labels and never without numeric protection.
            if (targetTokens.size >= 4 &&
                targetNumbers.isNotEmpty() &&
                matchedCount >= targetTokens.size - 1
            ) {
                if (matchedCount > bestScore) {
                    bestScore = matchedCount
                    bestNum = num
                }
            }
        }

        return bestNum
    }

    /**
     * Extracts numbered menu rows from both normal Accessibility text and
     * Accessibility output where "|" is used as a separator.
     *
     * Handles:
     *   1. Data
     *   2. Kuhadal
     *   3. Data iyo Kuhadal
     *
     * and:
     *   1 | Data | 2 | Kuhadal | 3 | Data iyo Kuhadal
     */
    private fun extractMenuLines(dialogText: String): List<Triple<String, String, String>> {
        val normalizedDialog = dialogText
            .replace(Regex("""\s+\|\s+"""), "\n")
            .replace(Regex("""\|"""), "\n")

        val parts = normalizedDialog
            .split('\n', '\r')
            .map { it.trim() }
            .filter { it.isNotEmpty() }

        val rebuilt = mutableListOf<String>()

        var i = 0
        while (i < parts.size) {
            val part = parts[i]

            // Standard single-line row: "3. Data iyo Kuhadal"
            if (Regex("""^\s*\d+\s*[.)\-:]\s+.+$""").matches(part)) {
                rebuilt.add(part)
                i++
                continue
            }

            // Accessibility may provide:
            // "3"
            // "Data iyo Kuhadal"
            if (part.matches(Regex("""^\d+$"""))) {
                val number = part
                val labelParts = mutableListOf<String>()

                var j = i + 1
                while (j < parts.size && !parts[j].matches(Regex("""^\d+$"""))) {
                    // Stop if next part is already a numbered row.
                    if (Regex("""^\s*\d+\s*[.)\-:]""").containsMatchIn(parts[j])) {
                        break
                    }
                    labelParts.add(parts[j])
                    j++
                }

                if (labelParts.isNotEmpty()) {
                    rebuilt.add("$number. ${labelParts.joinToString(" ")}")
                    i = j
                    continue
                }
            }

            i++
        }

        // Parse rebuilt rows.
        val result = mutableListOf<Triple<String, String, String>>()

        rebuilt.forEach { line ->
            val match = Regex(
                """^\s*(\d+)\s*[.)\-:]?\s+(.+)$"""
            ).find(line) ?: return@forEach

            val number = match.groupValues[1]
            val originalBody = match.groupValues[2].trim()
            val body = normalize(originalBody)

            if (body.isNotBlank()) {
                result.add(Triple(number, body, originalBody))
            }
        }

        return result
    }

    private fun tokenize(raw: String): List<String> =
        normalize(raw)
            .split(' ')
            .map { it.trim() }
            .filter { it.isNotEmpty() }
}
