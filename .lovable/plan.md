
User wants 3 fixes:
1. Package "Maalmo" field rejects "24 days" — column is integer, frontend sends string. Need to parse integer from input.
2. ADSL phone validation in PaymentProviders rejects digits 1-9 starting prefix; user wants ADSL to accept any 7-digit number starting with 1-9 (not strictly "1").
3. Clear all current orders + SMS data, AND make dashboard reset daily at 12:00 AM Mogadishu time (EAT, UTC+3).

Let me find relevant files.

Need to check:
- Admin package edit dialog for "Maalmo" field
- PaymentProviders.tsx ADSL validation
- SimpleAdminDashboard for "Maanta" date logic
- Tables to truncate: orders, payment_receipts, sms_logs (need DB check)

## Plan

### 1. Maalmo "24 days" fix
In the admin package edit form (likely in `src/components/admin/simple/ConfigViews.tsx` or `OrderViews.tsx`), parse the validity_days input by extracting digits only before sending: `parseInt(value.replace(/\D/g,''), 10)`. Also change input `type="number"` or strip non-digits on change.

### 2. ADSL prefix 1-9 fix
In `src/pages/PaymentProviders.tsx` (and `OfflinePhoneInputSheet.tsx`), change ADSL regex from `/^1\d{6}$/` to `/^[1-9]\d{6}$/` and update placeholder/error text to say "7 lambar bilaabanaya 1-9".

### 3. Clear data + Daily reset at Mogadishu midnight
- **Migration**: TRUNCATE `orders`, `payment_receipts`, `sms_logs`, `delivery_queue`, `unmatched_payments` (will request approval).
- **Dashboard "Maanta" reset**: In `SimpleAdminDashboard.tsx` and `get_admin_analytics_summary`, today_start is computed via `date_trunc('day', now())` which uses server timezone (UTC). Change to Mogadishu time: `date_trunc('day', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu'`. Update the RPC via migration. Also, on the client, ensure any "today" filter uses EAT.

### Files to edit
- `src/components/admin/simple/ConfigViews.tsx` (or wherever package edit form lives) — fix validity_days parsing
- `src/pages/PaymentProviders.tsx` — ADSL prefix 1-9
- `src/components/OfflinePhoneInputSheet.tsx` — ADSL prefix 1-9
- Migration: TRUNCATE old data + update `get_admin_analytics_summary` and `get_admin_transactions_summary` to use `Africa/Mogadishu` timezone for day/week/month/year boundaries.

### Confirmation needed
Clearing all orders + SMS is destructive and irreversible. The migration tool will ask for approval before running.

