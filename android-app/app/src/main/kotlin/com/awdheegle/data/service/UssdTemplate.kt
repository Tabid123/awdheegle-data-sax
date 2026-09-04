package com.awdheegle.data.service

/**
 * Parser for the USSD template grammar used by the Awdheegle delivery pipeline.
 *
 * Grammar:
 *   *<prefix>*<receiver>#|<Menu1>~~<Menu2>[~~<Menu3>]
 *   *101#|<Menu1>~~<Menu2>            (Somtel: receiver is entered as a menu step)
 *
 * INVARIANT: nothing after `|` is ever dialed. The part before `|` is the
 * only thing that goes into the dialer; the part after `|` is the menu path
 * that the accessibility service walks step-by-step.
 */
object UssdTemplate {

    data class Parsed(
        /** Code that is actually dialed (never contains `|`). */
        val dialCode: String,
        /** Menu labels to walk, in order. Empty for single-shot USSD. */
        val menuPath: List<String>,
        /** Trigger code family: 870 / 866 / 212 / 101 / other. */
        val trigger: String
    ) {
        val isMenuFlow: Boolean get() = menuPath.isNotEmpty()
        /** Somtel *101# needs the receiver typed as its own step. */
        val needsReceiverStep: Boolean get() = trigger == "101"
        /** Somnet *866* is on a slow network — longer waits, more polling. */
        val isSlowNetwork: Boolean get() = trigger == "866"
    }

    /** Extracts the numeric trigger right after the leading `*`, e.g. "870". */
    fun triggerCode(template: String): String {
        val m = Regex("^\\*(\\d{2,4})").find(template.trim()) ?: return ""
        return m.groupValues[1]
    }

    /** The dial prefix of the template: everything before `|`, trimmed. */
    fun dialPrefix(template: String): String = template.trim().substringBefore('|').trim()

    /** New rows use `~~`; old pipe/comma rows remain readable. */
    fun parseMenuPath(template: String): List<String> {
        val raw = template.trim()
        if (!raw.contains('|')) return emptyList()
        val path = raw.substringAfter('|')
        val separator = when {
            path.contains("~~") -> "~~"
            path.contains('|') -> "|"
            else -> ","
        }
        return path
            .split(separator)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
    }

    fun isFlow870(template: String): Boolean = triggerCode(template) == "870"
    fun isFlow866(template: String): Boolean = triggerCode(template) == "866"
    fun isFlow101(template: String): Boolean = triggerCode(template) == "101"
    fun isFlow212(template: String): Boolean = triggerCode(template) == "212"

    fun parse(template: String, receiverPhone: String): Parsed {
        val trigger = triggerCode(template)
        val menuPath = parseMenuPath(template)
        var dial = dialPrefix(template)

        val phone = sanitizeReceiver(receiverPhone)

        // Placeholder substitution on the dial part only.
        if (phone.isNotEmpty()) {
            dial = dial
                .replace("{phone}", phone, true)
                .replace("{receiver}", phone, true)
                .replace("{receiver_phone}", phone, true)
                .replace("{number}", phone, true)
        }

        // *101# never carries the receiver in the dial string.
        if (trigger != "101" && phone.isNotEmpty() && menuPath.isNotEmpty() && !dial.contains(phone)) {
            dial = if (dial.contains("#")) {
                val idx = dial.lastIndexOf('#')
                dial.substring(0, idx).trimEnd('*') + "*" + phone + "#"
            } else {
                dial.trimEnd('*') + "*" + phone + "#"
            }
        }

        dial = dial.replace(" ", "").replace(Regex("\\*+"), "*").replace("*#", "#")
        return Parsed(dialCode = dial, menuPath = menuPath, trigger = trigger)
    }

    /** Somali receiver number normalized to 9 digits (252 / leading 0 stripped). */
    fun sanitizeReceiver(raw: String): String {
        var digits = raw.filter { it.isDigit() }
        if (digits.startsWith("252")) digits = digits.removePrefix("252")
        if (digits.startsWith("0")) digits = digits.removePrefix("0")
        if (digits.length > 9) digits = digits.takeLast(9)
        return digits
    }
}
