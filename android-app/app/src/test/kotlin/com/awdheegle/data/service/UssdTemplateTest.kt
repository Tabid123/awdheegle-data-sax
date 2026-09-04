package com.awdheegle.data.service

import org.junit.Assert.assertEquals
import org.junit.Test

class UssdTemplateTest {
    @Test
    fun parsesMenuLabelsContainingCommas() {
        val parsed = UssdTemplate.parse(
            "*870*{receiver_phone}#|Data iyo Kuhadal|Unlimited data,voice,8 saac-",
            "683721522"
        )

        assertEquals("*870*683721522#", parsed.dialCode)
        assertEquals(
            listOf("Data iyo Kuhadal", "Unlimited data,voice,8 saac-"),
            parsed.menuPath
        )
    }

    @Test
    fun exactLongCategoryWinsOverShortPrefix() {
        val menu = """
            1. Data
            2. Kuhadal
            3. Data iyo Kuhadal
        """.trimIndent()

        assertEquals("3", Ussd870Flow.matchMenuOption(menu, "Data iyo Kuhadal"))
    }

    @Test
    fun packageLabelWithCommaRemainsOneStepAndMatches() {
        val menu = """
            1. internet aan xadidneyn,24 saac
            2. Unlimited data,voice,8 saac-
        """.trimIndent()

        assertEquals("2", Ussd870Flow.matchMenuOption(menu, "Unlimited data,voice,8 saac-"))
    }
}