

# 6 Final Fixes — Awdheegle Sync

## Cilladaha la helay

1. **Auto Top-Up "no trigger"**: Edge function-ku waa raadiya `auto_topup_packages` saxda ah. Cilladu waxay tahay in `markMatched` la dejiyay ka hor abuurka `unmatched_payments`, oo sidoo kale `pending_online_payments` tier-ka ka hor wuxuu ka ilaaliyaa in lacagta loo isticmaalo auto top-up. **Habka cusub**: Hubi `auto_topup_numbers` UGU HOREYN ka hor pending_online_payments — sidaas auto top-up uu nooqdo special path.
2. **Offline mode "Auto-created"**: `offline_registrations` ma hayso `package_id`, sidaa darteed order la abuuro ma hayo waxa la diro → ma galo `delivery_queue`. Tan lama xalin karo si automatic ah haddii aan la helin package mapping.
3. **Transactions tab madhan + $NaN**: RPCs (`get_admin_transactions_summary`, `get_admin_transactions_paginated`) MA jiraan database-ka. Sidaa darteed `selling_price` waa undefined → `$NaN`.
4. **SMS tab**: Hadda card-yada wuu sameeyaa, laakin Select All + Delete ma jiraan.

## Qorshaha

### Fix 1: Payment matching — Auto Top-Up FIRST
File: `supabase/functions/process-payment-receipt/index.ts`
- Beddel order-ka tier-yada: **TIER 1 = auto_topup_numbers** (haddii sender uu yahay registered auto-topup number, kaliya isaga ayaa la galayaa — haddii amount aan match-garayn package, durba unmatched).
- TIER 2 = pending_online_payments (sida hadda).
- TIER 3 = offline_registrations (sida hadda — order la abuuro).
- TIER 4 = unmatched.

### Fix 2: Offline mode delivery
File: `supabase/functions/process-payment-receipt/index.ts`
- Marka offline registration la helo, raadi `pending` order kale oo isla sender_phone leh oo `package_id` leh, oo update-gareyn (mark matched + queue USSD) halkii la abuuri lahaa order cusub oon waxba haynin.
- Haddii la waayo pending order, abuur order pending oo `delivery_notes='Awaiting admin assignment'` (wuxuu noqonayaa task admin-ku gacanta ku qabto). Tan ayaa qiyaaska saxda ah maadaama offline_registrations aan haysan package_id.

### Fix 3: Transactions RPCs (Migration cusub)
- Abuur `get_admin_transactions_summary(p_provider_id uuid, p_period text)` → returns JSON `{ transactions_today, sales_today, sales_this_month, cost_today, cost_this_month, total_profit, totalCost }`.
- Abuur `get_admin_transactions_paginated(p_search, p_status, p_provider_id, p_period, p_page_size, p_page)` → returns JSON `{ rows: [...], total_count, total_sales, total_profit }` with joined provider/package data.

### Fix 4: $NaN guard
File: `src/components/admin/TransactionsDashboard.tsx` (+ image-3/image-4 dialogs)
- Wrap dhammaan `Number(x).toFixed(2)` calls with `(Number(x) || 0).toFixed(2)`.
- Sidoo kale `SimpleAdminDetail` iyo `OrderViews` (kuwaas oo muujinaya `$NaN`).

### Fix 5: SMS tab — Select All + Delete
File: `src/components/admin/SmsLogsViewer.tsx`
- Ku dar checkbox kasta SMS card kasta (filteredLogs view kaliya, marka card la furo).
- "Select All" header iyo "Delete (N)" button.
- Delete: kala saar `sms_logs` vs `payment_sms_log` IDs → laba delete call. Ku dar RLS policy migration haddii loo baahdo.

### Fix 6: Auto top-up trigger logic
Tabarakii Fix 1 ayaa xalisay. Sidoo kale:
- Hubi in `auto_topup_packages.selling_price` `numeric` yahay (sax compare).
- Markii la helo, ku queue `delivery_queue` provider_name + ussd_code + receiver_phone = sender (Auto top-up = isku lambar).

## Migration cusub (SQL)
- `CREATE OR REPLACE FUNCTION get_admin_transactions_summary(...)` 
- `CREATE OR REPLACE FUNCTION get_admin_transactions_paginated(...)`
- RLS policy: admins can DELETE from `sms_logs` iyo `payment_sms_log` (haddii hadda aanay jirin).

## Faylasha la beddeli doono
| File | Beddel |
|---|---|
| Migration cusub SQL | 2 RPCs cusub + DELETE RLS policies |
| `supabase/functions/process-payment-receipt/index.ts` | Reorder tiers + offline order matching to existing pending |
| `src/components/admin/SmsLogsViewer.tsx` | Add checkbox select + bulk delete |
| `src/components/admin/TransactionsDashboard.tsx` | NaN guards on all `.toFixed()` |
| `src/components/admin/simple/OrderViews.tsx` (haddii loo baahdo) | NaN guard on price display |

## Waxa aan beddelin
- UI theme/CSS — sida memory-ga, naqshadda waa la ilaalin.
- Android app code.

