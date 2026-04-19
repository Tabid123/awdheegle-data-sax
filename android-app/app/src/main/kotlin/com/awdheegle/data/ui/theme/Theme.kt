package com.awdheegle.data.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Awdhegle Data — 2026 Brand: Royal Blue + Vibrant Green
private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF1E40FF),
    onPrimary = Color.White,
    secondary = Color(0xFF22C55E),
    onSecondary = Color(0xFF0A0F2C),
    tertiary = Color(0xFF4F6FFF),
    background = Color(0xFF0A0F2C),
    surface = Color(0xFF0F1640),
    onBackground = Color(0xFFF8FAFF),
    onSurface = Color(0xFFF8FAFF),
)

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF1E40FF),
    onPrimary = Color.White,
    secondary = Color(0xFF22C55E),
    onSecondary = Color.White,
    tertiary = Color(0xFF4F6FFF),
    background = Color(0xFFFAFBFF),
    surface = Color(0xFFFFFFFF),
    onBackground = Color(0xFF0A0F2C),
    onSurface = Color(0xFF0A0F2C),
)

@Composable
fun AwdheegleDataTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
