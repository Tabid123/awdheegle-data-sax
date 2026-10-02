package com.awdheegle.data

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import java.security.MessageDigest
import java.security.SecureRandom
import android.util.Base64

class DeliveryLoginActivity : ComponentActivity() {
    companion object {
        private const val PREFS = "awdheegle_delivery_login"
        private const val USER_SALT = "username_salt"
        private const val USER_HASH = "username_hash"
        private const val PASSWORD_SALT = "password_salt"
        private const val PASSWORD_HASH = "password_hash"
        private const val CONFIGURED = "configured"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        setContent {
            AwdheegleDataTheme {
                var username by remember { mutableStateOf("") }
                var password by remember { mutableStateOf("") }
                var error by remember { mutableStateOf<String?>(null) }
                val configured = prefs.getBoolean(CONFIGURED, false)

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
                            text = if (configured) "Delivery Login" else "Samee Login-kaaga",
                            color = Color(0xFF172033),
                            fontSize = 22.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = if (configured)
                                "Geli username-ka iyo password-kaaga."
                            else
                                "Deji username iyo password. Lambarada 0–9 oo keliya.",
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
                                password = value.filter { it in '0'..'9' }
                                error = null
                            },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Password") },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
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
                                    error = "Labada meelood geli lambarro."
                                } else if (configured) {
                                    val savedUserHash = prefs.getString(USER_HASH, null)
                                    val savedPasswordHash = prefs.getString(PASSWORD_HASH, null)
                                    val userSalt = prefs.getString(USER_SALT, null)
                                    val passwordSalt = prefs.getString(PASSWORD_SALT, null)
                                    val userMatches = savedUserHash != null && userSalt != null &&
                                        secureEquals(savedUserHash, hashValue(userSalt, username))
                                    val passwordMatches = savedPasswordHash != null && passwordSalt != null &&
                                        secureEquals(savedPasswordHash, hashValue(passwordSalt, password))

                                    if (userMatches && passwordMatches) {
                                        MainActivity.authorizeLoginSession()
                                        openDashboard()
                                    } else {
                                        error = "Username ama password waa khaldan yahay."
                                    }
                                } else {
                                    val userSalt = newSalt()
                                    val passwordSalt = newSalt()
                                    prefs.edit()
                                        .putString(USER_SALT, userSalt)
                                        .putString(USER_HASH, hashValue(userSalt, username))
                                        .putString(PASSWORD_SALT, passwordSalt)
                                        .putString(PASSWORD_HASH, hashValue(passwordSalt, password))
                                        .putBoolean(CONFIGURED, true)
                                        .apply()
                                    MainActivity.authorizeLoginSession()
                                    openDashboard()
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(54.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1370F0))
                        ) {
                            Text(
                                text = if (configured) "Gal" else "Samee Login",
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

    private fun newSalt(): String {
        val bytes = ByteArray(16)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    private fun hashValue(salt: String, value: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest("$salt:$value".toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(digest, Base64.NO_WRAP)
    }

    private fun secureEquals(first: String, second: String): Boolean =
        MessageDigest.isEqual(first.toByteArray(Charsets.UTF_8), second.toByteArray(Charsets.UTF_8))
}
