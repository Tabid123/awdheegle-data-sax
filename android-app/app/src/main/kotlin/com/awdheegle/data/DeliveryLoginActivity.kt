package com.awdheegle.data

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.awdheegle.data.ui.theme.AwdheegleDataTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.security.MessageDigest
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

class DeliveryLoginActivity : ComponentActivity() {
    companion object {
        private const val LOGIN_PREFS = "awdheegle_delivery_login"
        private const val USERNAME_SALT = "Q38ThFYiYGGtbf8yDU9GiYpuMiMt+s0s"
        private const val USERNAME_HASH = "R7elpAoHwBPRwm90xxFsrJiap5Rx6EGIESBEU2MQnaA="
        private const val PASSWORD_SALT = "SKP0R57hq77d33CwcSTeYahySMRvxdrP"
        private const val PASSWORD_HASH = "XNm6bB8+qKinrRS53c3xCu591F3HXwab7qmcvC9cQ38="
        private const val HASH_ITERATIONS = 180000
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences(LOGIN_PREFS, Context.MODE_PRIVATE)
        setContent {
            AwdheegleDataTheme {
                var username by remember { mutableStateOf("") }
                var password by remember { mutableStateOf("") }
                var error by remember { mutableStateOf<String?>(null) }
                var isChecking by remember { mutableStateOf(false) }
                val scope = rememberCoroutineScope()

                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFFF5F7FB)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .imePadding()
                            .padding(horizontal = 24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = "AWDHEEGLE DATA",
                            color = Color(0xFF1370F0),
                            fontSize = 25.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = "Delivery Login",
                            color = Color(0xFF172033),
                            fontSize = 22.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Geli username-ka iyo password-kaaga.",
                            color = Color(0xFF687386),
                            fontSize = 14.sp
                        )
                        Spacer(modifier = Modifier.height(28.dp))

                        OutlinedTextField(
                            value = username,
                            onValueChange = { value ->
                                username = value.filter { it in '0'..'9' }
                                error = null
                            },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Username") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                            shape = RoundedCornerShape(12.dp)
                        )
                        Spacer(modifier = Modifier.height(14.dp))
                        OutlinedTextField(
                            value = password,
                            onValueChange = { value ->
                                password = value
                                error = null
                            },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Password") },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            shape = RoundedCornerShape(12.dp)
                        )

                        if (error != null) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(text = error.orEmpty(), color = Color(0xFFD32F2F), fontSize = 14.sp)
                        }

                        Spacer(modifier = Modifier.height(24.dp))
                        Button(
                            onClick = {
                                if (username.isBlank() || password.isBlank()) {
                                    error = "Labada meelood geli xogta login-ka."
                                } else if (!isChecking) {
                                    isChecking = true
                                    error = null
                                    scope.launch {
                                        val valid = withContext(Dispatchers.Default) {
                                            val usernameMatches = secureEquals(
                                                USERNAME_HASH,
                                                hashValue(USERNAME_SALT, username)
                                            )
                                            val passwordMatches = secureEquals(
                                                PASSWORD_HASH,
                                                hashValue(PASSWORD_SALT, password)
                                            )
                                            usernameMatches && passwordMatches
                                        }
                                        isChecking = false
                                        if (valid) {
                                            prefs.edit().remove("authenticated").apply()
                                            MainActivity.authorizeLoginSession()
                                            openDashboard()
                                        } else {
                                            error = "Username ama password waa khaldan yahay."
                                        }
                                    }
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(54.dp),
                            enabled = !isChecking,
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1370F0))
                        ) {
                            Text(
                                text = if (isChecking) "Hubinaya..." else "Gal",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }
        }
    }

    private fun openDashboard() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    private fun hashValue(salt: String, value: String): String {
        val spec = PBEKeySpec(
            value.toCharArray(),
            Base64.decode(salt, Base64.NO_WRAP),
            HASH_ITERATIONS,
            256
        )
        return try {
            val derived = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                .generateSecret(spec)
                .encoded
            Base64.encodeToString(derived, Base64.NO_WRAP)
        } finally {
            spec.clearPassword()
        }
    }

    private fun secureEquals(first: String, second: String): Boolean =
        MessageDigest.isEqual(first.toByteArray(Charsets.UTF_8), second.toByteArray(Charsets.UTF_8))
}
