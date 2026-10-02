package com.awdheegle.data

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity

class SplashActivity : ComponentActivity() {

    companion object {
        private const val SPLASH_DELAY_MS = 2000L
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        Handler(Looper.getMainLooper()).postDelayed({
            startActivity(Intent(this, DeliveryLoginActivity::class.java))
            finish()
            @Suppress("DEPRECATION")
            if (android.os.Build.VERSION.SDK_INT >= 34) {
                overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, android.R.anim.fade_in, android.R.anim.fade_out)
            } else {
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            }
        }, SPLASH_DELAY_MS)
    }
}
