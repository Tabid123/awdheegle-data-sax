# Plan: Joojin Double-Delivery ee USSD

Dhibaatada: marka USSD response uu yahay timeout / "Connection problem" / "Invalid MMI" / no-response, nidaamku wuxuu u qaataa `failed` oo auto-retry sameeyaa, halka provider-ku dhab ahaantii xirmada horey u diray. Natiijada: hal dalab laba jeer ayaa loo shubaa (sida screenshot Jeeb).

Xalka guud: marka USSD mar la dial-gareeyo, **mar dambe lama dirayo** ilaa admin uu hubiyo. Server-ku wuxuu noqonayaa final authority on "dispatched" state.

---

## 1. Database migration (delivery_queue + RPCs)

Ku dar safe-dispatch columns iyo index:
- `dispatched_at timestamptz` — waqtiga USSD la diray
- `ussd_dispatched boolean default false`
- `dispatch_device_id uuid` — aaladda diray (audit)
- Index `(order_id, status)` haddii aysan jirin

Wax ka beddel `claim_next_delivery(...)`:
- Marna ha soo celin row leh `dispatched_at IS NOT NULL` xitaa haddii `processing` stuck yahay. Row noocaas ah waa la geynayaa `verification_required`, ma noqonayo `pending`.

Wax ka beddel `auto_recover_stuck_deliveries()` (haddii jirta):
- Stuck `processing` + `dispatched_at NOT NULL` → `verification_required` (admin review), ma `pending` lama dhigayo.
- Stuck `processing` + `dispatched_at NULL` → safe inuu noqdo `pending` (USSD weligii lama dirin).

Ku dar `mark_delivery_dispatched(queue_id, device_id)` RPC:
- Atomic UPDATE oo dhiga `ussd_dispatched=true, dispatched_at=now(), dispatch_device_id=...` haddii `dispatched_at IS NULL`. Soo celiya boolean.

## 2. Edge function: `activate-package`

- Ku dar route `/dispatch` (ama beddel `/status`) oo Android uu ugu sheego "USSD diray".
- Status-handling rules:
  - Success keywords (`completed`, `delivered`, provider OK) → `completed` (sida hadda).
  - Ambiguous statuses (`timeout`, `connection problem`, `invalid MMI`, `no response`, empty) + `dispatched_at NOT NULL` → `verification_required`. **Never** `pending`.
  - Cad oo aan dirin (SIM locked, no permission, dial error ka hor) + `dispatched_at IS NULL` → `pending` retry waa OK.
- Idempotent: status update dambe ee row hore u final ah waa la aqbalayaa, retry cusub lama abuurayo.

## 3. Android app

`DeliveryApiClient.kt`:
- Ku dar `markDeliveryDispatched(queueId, deviceId)` → wuxuu wacayaa RPC ama `/dispatch` endpoint.

`UssdDialerService.kt`:
- Isla marka `telephonyManager.sendUssdRequest(...)` la billaabay (ama isla marka call la sameeyay), wac `markDeliveryDispatched(queueId)` hal mar.
- Hay single-flight lock-ka jira, laakiin server-ka ayaa hadda final authority.
- Haddii network go'o kahor confirmation, retry the dispatch mark (idempotent), laakiin USSD mar dambe ha la dirin.

## 4. Status / UI

- `verification_required` waa state cusub (ama isticmaal `delivery_status='needs_verification'` haddii enum-ka adag yahay).
- Admin dashboard: dar filter/badge cusub ee dalabyada hubinta loo baahan yahay — admin wuxuu calaamadin karaa `completed` ama `failed` gacanta.

---

## Natiijada la sugayo

- Hal USSD dial per order, xitaa haddii response uu ambiguous yahay.
- Ambiguous → manual verification queue, ma resend.
- Double-delivery sida Jeeb screenshot-ka waa la joojinayaa.

---

## Technical files affected

- `supabase/migrations/<new>.sql` — columns, index, `claim_next_delivery`, `auto_recover_stuck_deliveries`, `mark_delivery_dispatched`.
- `supabase/functions/activate-package/index.ts` — `/dispatch` route + retry rule changes.
- `android-app/app/src/main/kotlin/com/awdheegle/data/api/DeliveryApiClient.kt` — `markDeliveryDispatched()`.
- `android-app/app/src/main/kotlin/com/awdheegle/data/service/UssdDialerService.kt` — call mark before/at dial.
- (Optional) admin UI: `src/components/admin/DeliveryTracker.tsx` ama `TransactionsDashboard.tsx` — filter/badge `verification_required`.

Ma fulinaa plan-kan?