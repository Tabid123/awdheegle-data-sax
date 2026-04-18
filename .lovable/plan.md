
User approved. Implementing the rewrite of `supabase/functions/process-payment-receipt/index.ts` with strict gate-based routing.

## Implementation Plan

### File to edit
- `supabase/functions/process-payment-receipt/index.ts`

### Logic flow

```text
SMS arrives → log to payment_sms_log + payment_receipts (pending)
   │
   ├─ Normalize sender_phone and receiver_sim
   │
   ├─ GATE: Lookup receiver_sim in auto_topup_numbers (is_active=true)
   │
   ├──[ MATCH ]──→ AUTO TOP-UP FLOW (ONLY)
   │     1. Find auto_topup_packages where topup_number_id=match.id, selling_price=amount, is_active=true
   │     2. Get sender prefix (first 2 digits) → lookup providers_config.phone_prefixes → senderProvider
   │        (61=Hormuud, 68=Somnet, 90=Somtel, etc — read from DB, never hardcoded)
   │     3. Pick package where provider_name = senderProvider (case-insensitive)
   │     4. Create order: sender=sender, receiver=sender, payment_status='matched'
   │     5. Insert delivery_queue with rendered USSD ({receiver_phone}, {amount}, {cost_price}, {sim_password}, {pin})
   │     6. STOP. Never check pending_online_payments or offline_registrations.
   │     • Unmatched reasons: "No auto top-up package for $X" / "Unknown sender prefix XX" / "No <provider> package for $X"
   │
   └──[ NO MATCH or receiver_sim missing ]──→ REGULAR FLOW
         • Tier A: pending_online_payments where sender_phone=sender, expected_amount=amount, status='pending'
              → match → create/update order with stored package_id+provider_id+receiver_phone, queue delivery
         • Tier B: offline_registrations where sender_phone=sender, is_active=true
              → use registered receiver_phone + provider_id
              → find data_packages_config matching provider_id + selling_price=amount
              → create order, queue delivery
         • Tier C: unmatched ("No pending order or offline registration for sender XXX")
```

### Helper functions
- `normalizeSomaliPhone(phone)` — already exists, reuse
- `getSenderProvider(prefix2, providersList)` — match prefix against `phone_prefixes` array
- `renderUssd(template, vars)` — replace `{receiver_phone}`, `{amount}`, `{cost_price}`, `{sim_password}`, `{pin}`
- `markUnmatched(reason)` / `markMatched(orderId)` — update payment_sms_log + payment_receipts + insert unmatched_payments

### Key principle
**The `receiver_sim` is the single source of truth for routing.** If it's in `auto_topup_numbers`, it's auto top-up — full stop. Offline_registrations and pending_online_payments are ONLY checked when receiver_sim is NOT an auto top-up number.

### After implementation
Edge function deploys automatically. User tests by sending payment to:
1. Auto top-up number → should create auto top-up order to sender
2. Regular payment number → should match against pending order or offline registration
