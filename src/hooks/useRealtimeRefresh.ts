import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  } catch { /* silent */ }
};

const triggerVibration = () => {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch { /* silent */ }
};

const showBrowserNotification = (title: string, body: string) => {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico', tag: 'admin-realtime' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') new Notification(title, { body, icon: '/favicon.ico' });
      });
    }
  } catch { /* silent */ }
};

const TABLE_NOTIFICATIONS: Record<string, { so: string; en: string; icon: string }> = {
  orders: { so: '📦 Dalab cusub soo galay!', en: '📦 New order received!', icon: '📦' },
  android_devices: { so: '📱 Aalad cusub oo la cusboonaysiiyay', en: '📱 Device updated', icon: '📱' },
  sim_balances: { so: '💰 Haraaga SIM-ka waa la cusboonaysiiyay', en: '💰 SIM balance updated', icon: '💰' },
  delivery_queue: { so: '🚀 Delivery queue waa la cusboonaysiiyay', en: '🚀 Delivery queue updated', icon: '🚀' },
  payment_receipts: { so: '💳 Lacag cusub soo gashay!', en: '💳 New payment received!', icon: '💳' },
  payment_sms_log: { so: '💬 SMS lacageed cusub', en: '💬 New payment SMS', icon: '💬' },
  sms_logs: { so: '📨 SMS cusub', en: '📨 New SMS log', icon: '📨' },
  verified_phones: { so: '✅ Macmiil cusub oo is diwaangeliyay', en: '✅ New customer registered', icon: '✅' },
  providers_config: { so: '⚙️ Provider config waa la bedelay', en: '⚙️ Provider config changed', icon: '⚙️' },
  data_packages_config: { so: '📋 Package waa la cusboonaysiiyay', en: '📋 Package updated', icon: '📋' },
  auto_topup_numbers: { so: '🔄 Auto top-up waa la cusboonaysiiyay', en: '🔄 Auto top-up updated', icon: '🔄' },
  fraud_alerts: { so: '🚨 Digniin khatar ah!', en: '🚨 Fraud alert detected!', icon: '🚨' },
  blocked_users: { so: '🚫 Blocked users waa la cusboonaysiiyay', en: '🚫 Blocked users updated', icon: '🚫' },
  offline_registrations: { so: '📝 Diiwaangelin cusub', en: '📝 New offline registration', icon: '📝' },
  device_offline_alerts: { so: '⚠️ Aalad offline ah!', en: '⚠️ Device offline alert!', icon: '⚠️' },
};

export function useRealtimeRefresh(
  tables: string[],
  onRefresh: () => void,
  debounceMs = 800,
  options?: { notify?: boolean; lang?: 'so' | 'en' }
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstLoad = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Request notification permission once
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { isFirstLoad.current = false; }, 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (tables.length === 0) return;

    const channelName = `rt-${tables.join('-')}-${Math.random().toString(36).slice(2, 8)}`;

    const handleChange = (payload: any, table: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onRefresh(), debounceMs);

      const currentOptions = optionsRef.current;
      const shouldNotify = currentOptions?.notify !== false;
      const lang = currentOptions?.lang || 'so';

      if (shouldNotify && payload.eventType === 'INSERT' && !isFirstLoad.current) {
        const info = TABLE_NOTIFICATIONS[table];
        if (info) {
          const msg = lang === 'so' ? info.so : info.en;
          playNotificationSound();
          triggerVibration();
          toast.success(msg, { duration: 4000 });
          showBrowserNotification('Awdheegle Admin', msg);
        }
      }
    };

    let channel = supabase.channel(channelName);
    tables.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => handleChange(payload, table)
      );
    });
    channel.subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [tables.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
}
