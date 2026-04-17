# Awdheegle Data ProGuard Rules

# ============================================================
# CRITICAL: Keep all app classes for USSD automation & Play Store
# Prevents R8/ProGuard from obfuscating class names
# ============================================================
-keep class com.awdheegle.data.SplashActivity { *; }
-keep class com.awdheegle.data.MainActivity { *; }
-keep class com.awdheegle.data.NajaxDataApp { *; }

# Keep all services in our package (including AccessibilityService)
-keep class com.awdheegle.data.service.** { *; }
-keep class com.awdheegle.data.service.UssdAccessibilityService { *; }
-keep class com.awdheegle.data.service.UssdDialerService { *; }

# Keep all receivers
-keep class com.awdheegle.data.receiver.** { *; }

# Keep Accessibility Service classes
-keep class * extends android.accessibilityservice.AccessibilityService { *; }
-keepclassmembers class * extends android.accessibilityservice.AccessibilityService {
    public void onAccessibilityEvent(android.view.accessibility.AccessibilityEvent);
    public void onInterrupt();
    public void onServiceConnected();
}

# Keep data classes
-keep class com.awdheegle.data.data.** { *; }

# Keep API client
-keep class com.awdheegle.data.api.** { *; }

# ============================================================
# Kotlin and Coroutines
# ============================================================
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

-keep class kotlin.** { *; }
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# ============================================================
# OkHttp
# ============================================================
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# ============================================================
# Jetpack Compose
# ============================================================
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**

# ============================================================
# Room Database
# ============================================================
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**

# ============================================================
# General Android
# ============================================================
-keep class android.telephony.** { *; }
