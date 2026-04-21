

## Plan: Fix 6 issues

### Issue 1 — Order History: `$undefined` & "Failed"
The RPC `get_customer_order_history` only returns `id, order_number, sender_phone, receiver_phone, amount, status, package_name, provider_name, created_at`. The UI reads `selling_price`, `delivery_status`, `provider_logo`, `validity_days`, `payment_source`, `invoice_url` — all missing → "$undefined" and "Failed".

**Fix:** Update the RPC to also return: `selling_price`, `delivery_status`, `provider_logo`, `validity_days`, `payment_source`, `invoice_url`, `paid_via_secret_price`. Fall back to `amount` when `selling_price` is null.

### Issue 2 — Send Notification fails: "Could not find the 'message' column"
The `notifications` table uses columns `title` + `body`, but `SendNotification.tsx` and `useNotifications.ts` insert/read `message`.

**Fix:** Update both files to use `body` instead of `message` (map `body` → display as message in customer UI). No DB change needed.

### Issue 3 — Somtel USSD sends literal `{sim_password}`
Image shows USSD `829*685673015*020*{sim_password}#`. The Android `buildFinalUssd` STRIPS `{sim_password}` instead of substituting the actual password. The server already substitutes it before sending — but when the Android-side template still contains the placeholder (e.g., template stored on device or fallback path), it's wiped.

**Fix:** In `UssdDialerService.kt` `buildFinalUssd()`, substitute `{sim_password}` with the SIM password value (passed from server payload `sim_password` field, or read from local SIM config) BEFORE the strip step. Also ensure `process-payment-receipt` always resolves `sim_password` (not falsy default) by reading from `sim_credentials`/`delivery_instructions` for the actual SIM used.

### Issue 4 — Offline registration: add Edit button
In `src/components/admin/simple/CustomerViews.tsx`, add an Edit button inside the expanded accordion (next to Delete) that opens an inline edit form to update `sender_phone`, `receiver_phone`, `provider_id`. Save via `supabase.from('offline_registrations').update(...)`.

### Issue 5 — SMS Logs tab shows nothing
Verified: `sms_logs` table is empty (count = 0). Android devices are not inserting rows. Root cause: device-side SMS receiver writes to `payment_sms_log` only, not `sms_logs`.

**Fix:** Update `SmsLogsViewer.tsx` query to merge from `payment_sms_log` (already partially supported via `source` field). Ensure the fetch actually queries both tables and unions results. Also confirm RLS on `sms_logs` allows admin SELECT.

### Issue 6 — Auto Top-Up not delivering $1.25 / $1.30 chained packages
Likely: the chained-delivery rule lookup in `process-payment-receipt` uses exact equality on numeric amounts and the trigger amount doesn't match the rule trigger value, OR the chain rule runs but the second delivery's cost_price is not found.

**Fix:** Add diagnostic logging + use tolerance comparison (`abs(a-b) < 0.01`) for trigger amount lookup in `package_delivery_rules`. Verify the rule rows exist for $1.25 and $1.30 packages and that `chained_package_id` is set.

### Files to edit
1. **DB migration** — recreate `get_customer_order_history` RPC with full columns.
2. `src/components/admin/SendNotification.tsx` — `message` → `body`.
3. `src/hooks/useNotifications.ts` — read `body` field; update `Notification` type.
4. `android-app/.../UssdDialerService.kt` — substitute `{sim_password}` properly in `buildFinalUssd`.
5. `supabase/functions/process-payment-receipt/index.ts` — ensure sim_password always resolved; tolerance match for auto-topup rules; add logs for $1.25/$1.30 path.
6. `src/components/admin/simple/CustomerViews.tsx` — add Edit button + inline edit form for offline registrations.
7. `src/components/admin/SmsLogsViewer.tsx` — ensure union query of `sms_logs` + `payment_sms_log` works and renders.

### Notes
- Android APK rebuild required for Issue 3 (sim_password fix on device).
- Issue 6 may need follow-up after seeing the new diagnostic logs from a real $1.25 SMS.

