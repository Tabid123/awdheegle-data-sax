package com.awdheegle.data.worker

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.awdheegle.data.service.UssdDialerService

/**
 * WorkManager watchdog that only ensures UssdDialerService is running.
 * Realtime events wake delivery work; this worker never polls Supabase queues.
 */
class UssdPollingWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        android.util.Log.d("UssdPollingWorker", "⏰ WorkManager triggered - checking service status")
        
        try {
            // 1. Ensure UssdDialerService is running
            if (!isServiceRunning()) {
                android.util.Log.d("UssdPollingWorker", "🔄 Service not running, starting...")
                startService()
            } else {
                android.util.Log.d("UssdPollingWorker", "✅ Service already running")
            }
            
            // Realtime mode: no queue poll is triggered here.
            
            android.util.Log.d("UssdPollingWorker", "✅ WorkManager task completed successfully")
            return Result.success()
            
        } catch (e: Exception) {
            android.util.Log.e("UssdPollingWorker", "❌ WorkManager task failed: ${e.message}")
            e.printStackTrace()
            return Result.retry()
        }
    }
    
    @Suppress("DEPRECATION")
    private fun isServiceRunning(): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        for (service in manager.getRunningServices(Integer.MAX_VALUE)) {
            if (UssdDialerService::class.java.name == service.service.className) {
                return true
            }
        }
        return false
    }
    
    private fun startService() {
        try {
            val intent = Intent(context, UssdDialerService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            android.util.Log.d("UssdPollingWorker", "✅ Service started from WorkManager")
        } catch (e: Exception) {
            android.util.Log.e("UssdPollingWorker", "❌ Failed to start service: ${e.message}")
        }
    }
    

}
