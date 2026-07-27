# Bank Transactions Feature

Add a full partner-bank integration: banks push credit transactions via an authenticated edge function, the system auto-matches them to `pending_online_payments`, triggers `activate-package`, and admins manage everything from a new "Lacagaha Bank-ka" screen.

## 1. Database migration (single migration)

Enable `pgcrypto` in `extensions` schema, then create three tables in the required order (CREATE → GRANT → RLS → POLICY):

- **`bank_credentials`** — `username` (unique), `password_hash` (bcrypt), `is_active`, `notes`, timestamps. Admin-only RLS via `is_admin(auth.uid())`. `updated_at` trigger.
- **`bank_sessions`** — `credential_id` FK, `token` unique, `expires_at`, `last_used_at`. Admin SELECT only; writes only via service_role (edge functions).
- **`bank_transactions`** — full column list from the spec including `tran_no` (unique index), `tran_amt`, `narration`, `dr_cr`, `parsed_sender_phone`, `parsed_receiver_phone`, `match_status` (default `unmatched`), `matched_payment_id` → `pending_online_payments`, `matched_order_id` → `orders`, `raw_payload jsonb`, `processed_at`. Composite index `(match_status, created_at desc)` + index on `parsed_sender_phone`. Admin-only RLS, added to `supabase_realtime` publication.

Two SECURITY DEFINER RPCs (`SET search_path = public, extensions`):

- `verify_bank_password(username, password) returns boolean` — compares `password_hash = crypt(password, password_hash)`. EXECUTE to `anon, authenticated, service_role`.
- `set_bank_credential(p_username, p_password) returns void` — admin-guarded, deactivates existing rows, upserts with `crypt(p_password, gen_salt('bf', 10))`. EXECUTE to `authenticated`.

## 2. Secret

Add `BANK_JWT_SECRET` (64-char generated) — signs the HS256 JWT issued by `bank-login` and verified by `bank-push-transaction`.

## 3. Edge functions

Both listed in `supabase/config.toml` with `verify_jwt = false`. Full CORS on every response, Zod validation, service-role client used internally only.

**`bank-login`** — POST `{username, password}`:
1. Zod validate.
2. Call `verify_bank_password` RPC → 401 on false.
3. Mint HS256 JWT via `djwt@v3.0.2`: `{sub: username, iss: 'najax-bank', iat, exp: +24h}`.
4. Insert into `bank_sessions` (token + expiry) so legacy DB-token flow keeps working.
5. Return `{token, token_type: 'JWT', expires_in: 86400}`.

**`bank-push-transaction`** — POST with `Authorization: Bearer <token>`:
1. Try JWT `verify()`; fall back to `bank_sessions` lookup (`token=? AND expires_at>now()`), bump `last_used_at`. Both fail → 401.
2. Zod validate body (`tran_no` required).
3. If `dr_cr === 'dr'` → insert as `ignored_debit`, return 200.
4. Regex `(?:\+?252)?[0-9]{9,12}` to extract `parsed_sender_phone` (first match) and `parsed_receiver_phone` (second match) from `narration`.
5. Upsert on `tran_no` — duplicates return `{ok:true, duplicate:true}`.
6. Auto-match: pick `pending_online_payments` with `status='pending'`, last-9-digit `sender_phone` equal, `abs(expected_amount - tran_amt) <= 0.01`, `created_at > now() - 48h`. On hit → mark payment `matched`, mark tx `matched` + `processed_at`, fire-and-forget invoke `activate-package` with `{pendingPaymentId, source:'bank_auto', tranNo}`.
7. Return `{ok:true, tran_no, match_status}`.

## 4. Frontend component

`src/components/admin/BankTransactions.tsx` — mobile-first, `isSo` toggle. Sections:

1. Header card: `Banknote` icon + title, right-side refresh + green `Bank Credentials` button.
2. Stat grid (2 cols mobile / 4 desktop): **Wadarta**, **Match**, **Lama Helin**, **Lacagta** (sum of credit rows).
3. Filters: period pills (Maanta/Shalay/Isbuucan/Bishaan/Dhammaan), status pills (all/matched/unmatched/ignored_debit/failed_parse), search input (tran_no, customer_name, both parsed phones, narration).
4. API URLs card — copyable Login & Push URLs built from published custom domain or `https://xpqvfcmalgvrpoqwbqtv.supabase.co`.
5. Transactions table (shadcn) with status badges and `Manual Match` action on unmatched.
6. Credentials Dialog → `supabase.rpc('set_bank_credential', ...)`, toast on success.
7. Manual Match Dialog → lists last-48h pending payments, `Match` button performs the two updates + fire-and-forget `activate-package` invoke with `source:'bank_manual'`.
8. Realtime: single `useEffect`, `supabase.channel(...).on('postgres_changes', {table:'bank_transactions'}, load).subscribe()`, cleanup `removeChannel`.
9. `useToast`, `date-fns`, lucide icons per spec.

## 5. Wiring

Add a new item to `SimpleAdminSidebar.tsx` under **Payments & Analytics**: label `Bank` (EN) / `Lacagaha Bank-ka` (SO), icon `Banknote`, path `/simple-admin/bank`. Register the route in `SimpleAdminDetail.tsx` rendering `<BankTransactions />`. Admin gating is inherited from the existing admin route guard.

## 6. Verification

After deploy: set credentials in UI → `curl` login → expect JWT. Push a credit tx → row shows within ~1s via realtime. Push same `tran_no` → still one row. Seed a matching `pending_online_payments`, push matching amount+phone → row flips to `matched` and `activate-package` runs.

## Technical notes

```text
bank flow
  bank -> POST /bank-login  ── verify_bank_password (bcrypt)
       <- JWT (24h, HS256)                +  bank_sessions row
  bank -> POST /bank-push-transaction (Bearer JWT)
        │
        ├─ dr  -> ignored_debit
        └─ cr  -> parse phones -> upsert on tran_no
                          └─ auto-match pending_online_payments (±$0.01, 48h)
                                    └─ invoke activate-package
```

- `pgcrypto` in `extensions` schema; RPC search_path includes `extensions`.
- All new tables + RPCs live in `public`; each `CREATE TABLE` immediately followed by GRANTs to `authenticated` + `service_role` (no `anon` — admin-only), then RLS enable + policies using `public.is_admin(auth.uid())`.
- `bank_transactions` added to `supabase_realtime` publication so the dashboard updates live.
- Component follows the project's Realtime rule: subscribe inside `useEffect`, always `removeChannel` on cleanup.
- `service_role_key` is used only inside edge functions via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`; frontend uses the existing anon client.
