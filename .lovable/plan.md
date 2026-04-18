

# Awdheegle Full-System Sync Plan

Wax shan ah ayaan isku mar xalin doonaa: Payment matching, Auto Top-Up, Dashboard analytics realtime, SMS sync, Notifications, iyo CRUD audit.

## Cilladaha la helay (root cause)

1. **Auto Top-Up `Could not find table 'auto_topup_numbers'`**: UI-gu wuxuu insert/select ka sameynayaa jadwalada `auto_topup_numbers` iyo `auto_topup_packages`, laakin database-ka kuma jiraan (kaliya `auto_topup_rules` + `auto_topup_settings`). Migration-ka ayaa la lumiyay.
2. **Payment matching aan dhamaystirneyn**: `process-payment-receipt` wuxuu raadiyaa `pending_online_payments` oo keliya. Haddii la waayo, durba `unmatched` ayuu sheegaa — MA hubiyo `offline_registrations` MA hubiyo `auto_topup_numbers`.
3. **Dashboard analytics**: Wuxuu ku tiirsanyahay `get_admin_analytics_summary()` RPC oo aan u soo celin xog `today/week/month/year` (kaliya wuxuu soo celiyaa `total_orders`, `total_revenue`, etc). Sidaa darteed `todaySales/Profit` waa 0. Faa'iidada qaacidada saxda ah waa: `(selling_price × (1 + evoucher_rate)) - cost_price`.
4. **SMS Tab madhan**: `SmsLogsViewer` wuxuu select-gareeyaa `sms_body, sms_sender, sim_slot, tx_id, tx_type` — laakin jadwalka `sms_logs` columns-kiisu waa `message, phone_number, direction, status`. Schema mismatch → 0 results.
5. **Notifications-ka admin-ka**: `useRealtimeRefresh` wuxuu kaliya muujiyaa toast + beep, balse browser/system notification (Notification API) ma uusan triggerin. Sidoo kale `device_alerts` table magaceedu waa `device_offline_alerts`.
6. **Tab kasta CRUD**: Inta badan tabs-ku waa shaqaynayaan, laakin `AutoTopUpDeliveryRules` iyo `AutoTopUpSettings` waa "Coming soon" placeholders.

## Qorshaha hagaajinta

### 1. Database migrations (SQL)
- Abuur `auto_topup_numbers` (id, phone_number unique, label, is_active, created_at).
- Abuur `auto_topup_packages` (id, topup_number_id FK, package_name, selling_price, cost_price, data_amount, ussd_code, sim_password, provider_name, is_active).
- Renew `get_admin_analytics_summary()` si ay u soo celiso JSON: `{ today:{revenue,cost,profit,delivered,failed,pending,orders}, week:{...}, month:{...}, year:{...}, delivered_orders, pending_orders, failed_orders, devices_online }`. Faa'iidada: `SUM(selling_price*(1+evoucher_rate)) - SUM(cost_price)` oo orders-ka `delivered`.
- Enable Supabase Realtime on: `orders, payment_receipts, payment_sms_log, sms_logs, delivery_queue, offline_registrations, auto_topup_numbers, device_offline_alerts`.

### 2. Edge function `process-payment-receipt` (cusboonaysii matching hierarchy)
Marka SMS lacageed soo gasho:
1. Raadi `pending_online_payments` (sida hadda).
2. Hadii la waayo → raadi `auto_topup_numbers` (sender-ka). Hadii la helo + qiimuhu match-gareynayo `auto_topup_packages.selling_price`, abuur order + queue USSD-ga (provider/ussd_code/sim_password ka soo qaado package).
3. Hadii la waayo → raadi `offline_registrations` (sender_phone). Hadii la helo, abuur "auto-offline" order is_offline=true status pending oo admin daawan karo (ama match-gareeyo `pending` order kale ee sender-kaas leh). 
4. Marka labadaba la waayo OO ay tahay auto-topup number laakin amount mismatch → unmatched + reason=`auto_topup_amount_mismatch`.
5. Kale → unmatched (sida hadda).

### 3. SMS Tab fix
- Hagaaji `SmsLogsViewer.tsx` si uu u select-gareeyo column-yada saxda ah ee `sms_logs`: `phone_number, message, direction, status, device_id, created_at`. Map UI fields-ka kuwaas. Sidoo kale ku dar source `payment_sms_log` oo lagu daro list-ka (combine view) si admin-ku u arko dhammaan SMS-yada lacagta.

### 4. Notifications system-ka admin-ka
- Ku dar `Notification.requestPermission()` marka admin login-gareeyo.
- Cusboonaysii `useRealtimeRefresh`: marka payload eventType=INSERT, ku dar `new Notification(...)` (browser native) iyada oo lagu daray toast + beep ee jiray.
- Hagaaji magaca jadwalka `device_alerts` → `device_offline_alerts` ee `SimpleAdminDashboard` subscription.
- Subscriptions ku dar: `payment_sms_log, sms_logs, offline_registrations, auto_topup_numbers`.

### 5. Dashboard realtime + xisaab sax ah
- Dashboard-ka hadda waa realtime (`useRealtimeRefresh`), laakin xogtu waa eber sababtoo ah RPC-gu ma soo celiyo `today/week/month/year` periods. Markaan RPC-da dib u qoro (step 1), dashboard-ku tooska ayuu shaqayn doonaa.
- Ku dar polling 30s ah backup ahaan haddii realtime fashilmo.

### 6. Auto Top-Up admin tabs (placeholders ka saar)
- `AutoTopUpSettings.tsx` & `AutoTopUpDeliveryRules.tsx`: ka dhig functional iyaga oo isticmaalaya jadwalada cusub (`auto_topup_settings` oo hore u jiray + `auto_topup_numbers/packages`).

### 7. CRUD audit (xaqiijin)
Tabs intooda kale (Providers, Packages, Categories, Featured, Banners, Blocked Users, Bulk SMS, App Settings, Admin Management, Audit Log, Fraud Alerts, etc.) waa la xaqiijin doonaa inay si fiican ugu xirantahay tables-ka saxda ah. Wax cusub laguma dari doono haddii ay shaqeynayaan — kaliya nooc kasta oo jaban ayaa la hagaajin doonaa.

## Faylasha la beddeli doono

| Fayl | Beddel |
|---|---|
| Migration cusub | Tables `auto_topup_numbers`, `auto_topup_packages`; Renew `get_admin_analytics_summary()`; Enable realtime |
| `supabase/functions/process-payment-receipt/index.ts` | 3-tier matching (pending → auto_topup → offline_registrations → unmatched) |
| `src/components/admin/SmsLogsViewer.tsx` | Column mapping sax + `payment_sms_log` union |
| `src/hooks/useRealtimeRefresh.ts` | Browser Notification API + permission request |
| `src/components/admin/AutoTopUpSettings.tsx` | Functional UI |
| `src/components/admin/AutoTopUpDeliveryRules.tsx` | Functional UI |
| `src/pages/SimpleAdminDashboard.tsx` | Magaca `device_alerts` → `device_offline_alerts`; ku dar `payment_sms_log`, `offline_registrations` realtime |

## Waxa aan beddelin
- UI theme/CSS — sida memory-ga qabsan, naqshadda hadda waa la ilaalin.
- Android app code (sida la qoray, USSD format-ka waa hagaagsanyahay).

