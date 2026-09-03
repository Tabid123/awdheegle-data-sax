package com.awdheegle.data.api

/**
 * Parses a raw *212 USSD menu into numbered items.
 *
 * Example input:
 *   Xulo xirmada
 *   1. $0.30 100MB Maalin
 *   2. $1 1GB Toddobaad
 *   0. Ka noqo
 */
object UssdMenuParser {

    data class MenuItem(
        val index: Int,
        val rawLabel: String,
        val dataAmount: String?
    )

    private val LINE_ITEM = Regex("""^\s*(\d{1,2})\s*[\.\)\-:]\s*(.+?)\s*$""")
    private val DATA_AMOUNT = Regex("""(\d+(?:[\.,]\d+)?)\s*(gb|mb|kb)""", RegexOption.IGNORE_CASE)
    private val IGNORED_LABEL = Regex(
        """^(ka\s*noqo|back|dib|exit|ka\s*bax|hore|next|xiga|cancel|jooji)\b""",
        RegexOption.IGNORE_CASE
    )

    fun parse(rawText: String?): List<MenuItem> {
        if (rawText.isNullOrBlank()) return emptyList()
        val items = mutableListOf<MenuItem>()
        val seen = mutableSetOf<Int>()

        rawText.split('\n', '\r').forEach { line ->
            val match = LINE_ITEM.find(line) ?: return@forEach
            val index = match.groupValues[1].toIntOrNull() ?: return@forEach
            // Dialer UI noise ("... | 1 | Cancel | Send") is glued onto the last
            // line of the dialog — cut everything from the first pipe.
            val label = match.groupValues[2]
                .substringBefore('|')
                .replace(Regex("""\b(cancel|send|ok)\b""", RegexOption.IGNORE_CASE), "")
                .replace(Regex("""\s{2,}"""), " ")
                .trim()
            if (label.isBlank()) return@forEach
            if (index == 0) return@forEach
            if (IGNORED_LABEL.containsMatchIn(label)) return@forEach
            if (!seen.add(index)) return@forEach

            val data = DATA_AMOUNT.find(label)?.let { m ->
                "${m.groupValues[1]}${m.groupValues[2].uppercase()}"
            }
            items.add(MenuItem(index = index, rawLabel = label, dataAmount = data))
        }
        return items.sortedBy { it.index }
    }

    /** True when the menu text looks like a real package list (not an error page). */
    fun looksLikeMenu(rawText: String?): Boolean = parse(rawText).size >= 2
}
