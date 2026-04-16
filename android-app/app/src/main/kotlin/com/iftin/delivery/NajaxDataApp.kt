package com.iftin.delivery

import android.app.Application
import android.content.Intent
import android.os.Build
import androidx.work.*
import com.iftin.delivery.service.UssdDialerService
import com.iftin.delivery.worker.ServiceWatchdogWorker
import com.iftin.delivery.worker.UssdPollingWorker
import java.util.concurrent.TimeUnit

class NajaxDataApp : Application() {
    
    companion object {
        private const val POLLING_WORK_NAME = "ussd_polling_work"
        private const val WATCHDOG_WORK_NAME = "service_watchdog_work"
    }
    
    override fun onCreate() {
        super.onCreate()
        
        // DO NOT start foreground service here - Android 12+ (especially 16) 
        // crashes when starting foreground services from Application.onCreate()
        // The service is started from MainActivity after permissions are granted
        
        android.util.Log.d("NajaxApp", "✅ App started - service will be launched from MainActivity")
        
        scheduleReliablePolling()
        
        android.util.Log.d("NajaxApp", "✅ All workers scheduled")
    }
    
    private fun scheduleReliablePolling() {
        val workManager = WorkManager.getInstance(this)
        
        val pollingConstraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        
        val pollingRequest = PeriodicWorkRequestBuilder<UssdPollingWorker>(
            15, TimeUnit.MINUTES
        )
            .setConstraints(pollingConstraints)
            .setInitialDelay(1, TimeUnit.MINUTES)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                1, TimeUnit.MINUTES
            )
            .build()
        
        workManager.enqueueUniquePeriodicWork(
            POLLING_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            pollingRequest
        )
        
        android.util.Log.d("NajaxApp", "📅 UssdPollingWorker scheduled (every 15 min)")
        
        val watchdogRequest = PeriodicWorkRequestBuilder<ServiceWatchdogWorker>(
            15, TimeUnit.MINUTES
        )
            .setInitialDelay(2, TimeUnit.MINUTES)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                1, TimeUnit.MINUTES
            )
            .build()
        
        workManager.enqueueUniquePeriodicWork(
            WATCHDOG_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            watchdogRequest
        )
        
        android.util.Log.d("NajaxApp", "🐕 ServiceWatchdogWorker scheduled (every 15 min)")
    }
}
