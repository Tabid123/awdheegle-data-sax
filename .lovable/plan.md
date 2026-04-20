

## Plan: Secret Price (Online + Offline)

### 1. Database
Add column to `data_packages_config`:
- `secret_price numeric NULL`

Add optional column to `orders` for admin visibility:
- `paid_via_secret_price boolean NOT NULL DEFAULT false`

### 2. Admin UI — Package config (`/simple-admin/packages`)
In `src/pages/AdminDashboard.tsx` (package add/edit form):
- Add input "🔒 Qiimaha Sirta ah (Secret Price) — Optional" below regular price.
- Save `secret_price` to insert/update payload (parse as number or null if empty).
- In package list row, if `secret_price` is set, show a small badge `🔒 $X`.

Customer-facing RPC `get_public_packages` already does NOT return `secret_price` — confirmed safe. No change there.

### 3. Edge function — `supabase/functions/process-payment-receipt/index.ts`
New matching priority order when SMS amount = X arrives from sender phone P:

1. **Exact price match (existing logic)** — find pending order where `sender_phone = P` AND `amount = X`. If found → mark paid + queue delivery.
2. **Secret price match for existing pending order** — find pending order where `sender_phone = P`, join `data_packages_config`, where `package.secret_price = X`. If found → mark paid, set `paid_via_secret_price = true`, queue delivery.
3. **Offline auto-match via secret price** — if no pending order exists for sender:
   - Look up any active package where `secret_price = X`.
   - Check `offline_registrations` for an active row where `sender_phone = P`.
   - If both found → create new order using registered receiver_phone + provider, set `is_offline = true`, `paid_via_secret_price = true`, queue delivery.
4. Otherwise → park in `unmatched_payments` (existing behavior).

Wrap secret-price lookups in service-role client (it can read `secret_price` server-side).

### 4. Admin order/transaction views — show secret-price badge
In `src/components/admin/TransactionsDashboard.tsx` and `OrderViews.tsx` / `DailyOrdersManager.tsx`:
- When `order.paid_via_secret_price === true`, render a small badge "🔒 Paid via Secret Price" next to amount.
- Update `get_admin_transactions_paginated` RPC to return `paid_via_secret_price` in row payload.

### 5. Files to edit
1. **Migration**:
   - `ALTER TABLE data_packages_config ADD COLUMN secret_price numeric NULL;`
   - `ALTER TABLE orders ADD COLUMN paid_via_secret_price boolean NOT NULL DEFAULT false;`
   - Update `get_admin_transactions_paginated` to include `o.paid_via_secret_price`.
2. `src/pages/AdminDashboard.tsx` — Secret Price input + save + badge in list.
3. `supabase/functions/process-payment-receipt/index.ts` — 3-tier matching.
4. `src/components/admin/TransactionsDashboard.tsx` (+ relevant order views) — display "Paid via Secret Price" badge.

### Security note
- `secret_price` is never selected by `get_public_packages` and is never sent to anonymous clients in any RPC. Only admin UI (which already requires admin role) reads it via direct table query.

