# Prompt buuxa: *212* Package Discovery (rebuild-from-zero spec)

> **Scope**: this file rebuilds **only the *212* discovery system** — end to end — for another
> project/AI. It contains the Maamuus category, the 3 discovery roots, the **full price catalog
> currently stored (cost/sell)**, and how unpriced packages surface in admin.
> **No database or code changes are made in this repository — documentation only.**

---

## 1. Dulmar guud (end-to-end flow)

```text
User: Hormuud → category "XIRMO ADIGA KUU GAAR AH" (Maamuus) → dooro root → geli lambarka
   → request_package_discovery()  → codsi pending (saf)
   → Android device (provider match) → claim_next_discovery()
   → dial *212*<phone>#  → menu1 magac-match  → menu-ga xirmooyinka
   → complete_discovery(raw_menu, items, hold=true)   [SESSION FURAN]
   → get_package_discovery() → qiimaha Riyokaab lagu dhejiyo → app tusayo
   → user doorto + lacag bixiyo
   → enqueue_discovery_delivery(): session furan? → SELECT isla dialog-ga
                                    session lumay? → dib-u-garaacis
   → complete_discovery_selection() → order delivered / failed
```

Key idea: discovery is a **two-phase** operation. Phase 1 scrapes the live provider menu and
**holds the USSD dialog open**. Phase 2 (after payment) either reuses that same open dialog
(hot path, one keypress) or re-dials from scratch (cold fallback).

---

## 2. Category + 3 root packages

Category (`package_categories`):

| Field | Value |
|---|---|
| `category_name` | `XIRMO ADIGA KUU GAAR AH` |
| provider | **Hormuud** (Maamuus) |
| `display_order` | `0` |
| `is_active` | `true` |

Three `data_packages_config` rows inside that category, each with
`is_discovery_root = true`, no menu path, no `is_ussd_only` menu template:

1. **Data**
2. **Kuhadal**
3. **Data iyo Kuhadal**

These three names are matched **directly** against the first *212* menu
(`1.Data 2.Kuhadal 3.Data iyo Kuhadal`), so the root name is the menu keyword.

---

## 3. Full `ussd_price_catalog` seed (cost / sell, USD)

Insert **all** of these. `label` is written the way the carrier prints it;
`normalized_label` is derived automatically by `ussd_normalize_label(label)`.

### Root: Data

| Label | Cost | Sell |
|---|---|---|
| Internet aan xadidnayn, 1 Saac | 0.10 | 0.11 |
| Internet aan xadidnayn, 3 Saac | 0.15 | 0.17 |
| Internet aan xadidnayn, 8 Saac | 0.25 | 0.25 |
| Internet aan xadidnayn, 20 Saac | 0.50 | 0.50 |
| Internet aan xadidnayn, 24 Saac | 0.60 | 0.60 |
| 12GB,30 Maalin | 5.00 | 5.00 |
| Internet aan xadidnayn, 15 Maalin | 9.00 | 9.00 |
| Internet aan xadidnayn, 30 Maalin | 18.00 | 18.00 |

### Root: Kuhadal

| Label | Cost | Sell |
|---|---|---|
| kuhadal aan xadidnayn, 3 saac | 0.10 | 0.11 |
| kuhadal aan xadidneyn, 6saac | 0.15 | 0.16 |
| kuhadal aan xadidneyn, 15 saac | 0.25 | 0.27 |
| kuhadal aan xadidneyn, 36 saac | 0.50 | 0.55 |
| kuhadal aan xadidneyn,7 maalin | 2.50 | 2.70 |
| Kuhadal aan xadidneyn, 30 Maalin | 8.00 | 8.50 |

### Root: Data iyo Kuhadal

| Label | Cost | Sell |
|---|---|---|
| internet iyo kuhadal aan xadidneyn,24 saac | 0.60 | 0.60 |
| internet+kuhadal aan xadidnayn,40 saac | 1.00 | 1.00 |
| Unlimit data iyo voice,2 maalin | 1.60 | 1.65 |
| internet iyo kuhadal aan xadidnayn,7 maalin | 4.20 | 4.20 |
| internet iyo kuhadal aan xadidnayn, 15 maalin | 9.00 | 9.00 |
| internet iyo kuhadal aan xadidneyn,30 maalin | 18.00 | 18.00 |

> **Digniin muhiim ah**: the spellings **xadidnayn / xadidneyn**, the form
> `internet+kuhadal`, and `6saac` (no space) are genuinely different raw strings.
> `ussd_normalize_label` MUST collapse them to the same normalized form —
> and you must **not** insert duplicate catalog rows for those variants.

---

## 4. How packages are discovered

- `request_package_discovery(root_id, phone)` → inserts into `ussd_package_discoveries`
  with `status = 'pending'`, `queued_at = now()`.
- `claim_next_discovery(device_id)`:
  - provider filter via `primary_for_provider`, `sim1_provider`, `sim2_provider`;
  - stale claims older than **2 min** are re-queued;
  - `processing` older than **90s** → `timeout`;
  - `pending` older than **5 min** → `no_device_available`.
- Android: dial `*212*<phone>#` → match menu 1 by root name (`findNumberForKeywords`)
  → scrape the package menu into `items[{ index, label }]`
  → `complete_discovery(session_id, items, raw_menu_text, hold = true)`
  with `expires_at = now() + 30 min`, `session_state = 'open'`.
- Realtime: trigger `broadcast_discovery_change` + RPC `get_discovery_queue_status`
  returning `position`, `ahead`, `active_sessions`.

---

## 5. Price matching

`get_package_discovery(session_id | phone)` resolves each scraped item in three tiers:

1. **Exact** `normalized_label` match — after `ussd_strip_price_prefix`
   (drops `$0.15=` prefixes) and `ussd_normalize_label`
   (Somali spelling folding, `saacad→saac`, `maalmood→maalin`, punctuation/space collapse).
2. **Duration tier** via `ussd_duration_key` (number + unit: `24 saac`, `30 maalin`).
3. No match → `price_missing = true`.

The user sees **label + Riyokaab sell price only**. Cost price and the carrier's own
printed price are never exposed to the client.

---

## 6. Unpriced (unmatched) packages

- Table `discovery_unmatched_labels(root_package_id, raw_label, normalized_label, hits, last_seen_at)`
  with `ON CONFLICT (root_package_id, normalized_label) DO UPDATE SET hits = hits + 1, last_seen_at = now()`.
- Admin `DiscoveryCatalogView`: a "Labels aan qiimo lahayn" section with a one-click action
  that creates a new catalog row (cost + sell) prefilled from the raw label.
- Selection UI: rows with `price_missing` are hidden, or shown with the IIBSO button disabled.

---

## 7. Session lifecycle & delivery

`session_state`: `open → selected → delivering → consumed | lost`
plus `session_device_id`, `session_expires_at`, `selected_label`, `selected_index`,
`selected_order_id`, `session_note`.

- Android holds the dialog open with a keep-alive watcher.
- Preemption: a new pending request may take over a held session that has **no selection yet**.
- `discovery_session_lost` is called **only** when the dialog genuinely disappears.
- `release_discovery_session` when the user leaves the page.
- After payment, `enqueue_discovery_delivery`:
  - session open → `selected` + index via `claim_discovery_selection` (hot path);
  - otherwise → `discovery_delivery_fallback` → `delivery_queue` row with
    `*212*<phone>#|<Menu1>,<Label(+price)>` (cold re-dial).
- `complete_discovery_selection(queue_id, success, response)` → order `delivered`, or fallback.

---

## 8. Invariants (never break)

1. A wrong row is **never** selected: label-match → price-tier match → `failed`.
2. The discovery menu is **never closed** until a selection happens or the session is lost.
3. One device holds at most **one** session.
4. Nothing after `|` is ever dialed as digits — it is a menu path, not a USSD code.
5. The carrier's price is never shown to the user.
6. `*212*` has **no configured menu path** in admin — packages are scanned live.

---

## 9. Full UI/UX spec (how it behaves today)

### 9.1 Page journey

```text
Hormuud → Categories → "XIRMO ADIGA KUU GAAR AH" (*212*)
   → PAYMENT PAGE (direct): choose payment provider
       + sender number (money is deducted from)
       + receiver number (gets the bundle)
   → button "Baar xirmooyinka"
   → DISCOVERY PAGE (DiscoverPackages): queue → scan → results
   → pick a bundle (IIBSO) → back to payment (autoConfirm) → confirm
```

The *212* category shows **no** bundles up front: numbers first, then the bundles of that
specific receiver number are scanned live.

### 9.2 Discovery page — three states

- `input`: card "Lambarka la siinayo", 9-digit digits-only input, clear error
  ("Fadlan gali lambarka oo dhan"), button "Soo baar xirmooyinka". If the number
  already came from the payment page, the scan **auto-starts**.
- `searching`: spinner plus two distinct messages:
  - **queued**: "Waxaad ku jirtaa safka — adigu waa #2 (1 qof hor kaaga jira)",
    plus "Lacag weli lama bixin — waad joojin kartaa" and a **Jooji** button.
  - **scanning**: "Waa la baarayaa… Fadlan sug 10–40 ilbiriqsi" with a seconds
    counter that starts at `claimed_at`, not at enqueue time.
  - Updates: Supabase broadcast (`discovery:<id>`, `discovery_queue`) with a 2.5s
    poll fallback; after 5 minutes show "isku day mar kale".
  - `no_device_available` → "Xiriirada shirkadda way mashquul yihiin, daqiiqad kadib isku day."
- `results`: countdown bar on top "Xiriirka shirkadda waa furan yahay — bixi lacagta gudaha **Xs**"
  (green); at 0 it turns destructive with "Waqtigii wuu dhamaaday" and a **Dib u baar**
  button. The countdown comes from the server field `session_seconds_left`.

### 9.3 Bundle card

Bundle name (Riyokaab label) left, `$X.XX` in large primary type right, primary border,
two info lines (Smartphone icon = `info_line1`, Clock icon = `info_line2`), full-width
**IIBSO** button. When `price_missing`: price renders `—` and the button reads
"Qiimo lama helin" and is disabled. All buy buttons disable once the countdown hits 0.

### 9.4 UX rules

- The carrier price (`$0.15=`) is never shown — only the Riyokaab sell price.
- Leaving the page (unmount) without buying calls `release_discovery_session`.
- A `PageErrorBoundary` wraps the page so a network error never yields a blank page.
- All copy is Somali; colors are semantic tokens (primary/destructive/muted), never hardcoded.

---

## 10. Schema + RPC contract + frontend spec


Tables: `ussd_package_discoveries`, `ussd_price_catalog`, `discovery_unmatched_labels`;
columns `orders.discovery_menu_label`, `orders.discovery_root_id`,
`delivery_queue.discovery_menu_label`, `pending_online_payments.discovery_menu_label`,
`pending_online_payments.discovery_menu_index`.

RPCs (input → output): `request_package_discovery`, `claim_next_discovery`,
`complete_discovery`, `get_package_discovery`, `get_discovery_queue_status`,
`claim_discovery_selection`, `complete_discovery_selection`,
`discovery_session_lost`, `discovery_delivery_fallback`, `release_discovery_session`,
`enqueue_discovery_delivery`, helpers `ussd_normalize_label`,
`ussd_strip_price_prefix`, `ussd_duration_key`.

Every new public table needs `GRANT` statements in the same migration
(anon read only where a policy allows it, `authenticated` CRUD, `service_role` ALL),
then `ENABLE ROW LEVEL SECURITY`, then policies.

Frontend: `DiscoverPackages.tsx` (queue + live list + selection),
`PaymentProviders.tsx` (carries `discovery_menu_label/index` into payment),
`DiscoveryCatalogView.tsx` (catalog CRUD, unmatched labels, live sessions).

---

## 11. Acceptance tests

1. Successful discovery: root → phone → menu scraped → priced list shown.
2. New carrier label → `discovery_unmatched_labels` row with `hits = 1`.
3. Catalog filled from admin → same label now shows a price.
4. Session lost before payment → cold fallback delivers correctly.
5. Two users at once → queue works, positions reported, no cross-session mixing.

---

## Kooban (Somali)

Prompt-kan wuxuu dib u dhisayaa **kaliya nidaamka *212***: category "XIRMO ADIGA KUU GAAR AH"
(Hormuud/Maamuus), 3 root (Data, Kuhadal, Data iyo Kuhadal), 20 xirmo oo qiimo (cost/sell)
leh, sida baarista (discovery) loo sameeyo, sida qiimaha Riyokaab lagu isku xiro,
sida labels-ka aan qiimo lahayn admin-ka u soo baxaan, iyo session lifecycle-ka
(furan → xulasho → gaarsiin) oo leh dib-u-garaacis haddii dialog-gu lumo.
Faylkan waa dukumenti keliya — database iyo code wax laga bedelin.

---

## Appendix — SQL seed block (ready to run in the target project)

```sql
-- 1) Category (Hormuud)
WITH p AS (SELECT id FROM public.providers_config WHERE provider_name ILIKE 'hormuud' LIMIT 1)
INSERT INTO public.package_categories (provider_id, category_name, display_order, sort_order, is_active)
SELECT p.id, 'XIRMO ADIGA KUU GAAR AH', 0, 0, true FROM p
ON CONFLICT DO NOTHING;

-- 2) Three discovery roots
WITH p AS (SELECT id FROM public.providers_config WHERE provider_name ILIKE 'hormuud' LIMIT 1),
     c AS (SELECT id FROM public.package_categories WHERE category_name = 'XIRMO ADIGA KUU GAAR AH' LIMIT 1)
INSERT INTO public.data_packages_config
  (provider_id, category_id, package_name, price, cost_price, is_active, is_discovery_root, sort_order)
SELECT p.id, c.id, v.name, 0, 0, true, true, v.ord
FROM p, c, (VALUES ('Data',1), ('Kuhadal',2), ('Data iyo Kuhadal',3)) AS v(name, ord);

-- 3) Price catalog (20 rows) — normalized_label derived by the helper
INSERT INTO public.ussd_price_catalog
  (normalized_label, duration_key, display_name, cost_price, selling_price, is_active)
SELECT public.ussd_normalize_label(v.label),
       public.ussd_duration_key(v.label),
       v.label, v.cost, v.sell, true
FROM (VALUES
  ('Internet aan xadidnayn, 1 Saac',            0.10, 0.11),
  ('Internet aan xadidnayn, 3 Saac',            0.15, 0.17),
  ('Internet aan xadidnayn, 8 Saac',            0.25, 0.25),
  ('Internet aan xadidnayn, 20 Saac',           0.50, 0.50),
  ('Internet aan xadidnayn, 24 Saac',           0.60, 0.60),
  ('12GB,30 Maalin',                            5.00, 5.00),
  ('Internet aan xadidnayn, 15 Maalin',         9.00, 9.00),
  ('Internet aan xadidnayn, 30 Maalin',        18.00, 18.00),
  ('kuhadal aan xadidnayn, 3 saac',             0.10, 0.11),
  ('kuhadal aan xadidneyn, 6saac',              0.15, 0.16),
  ('kuhadal aan xadidneyn, 15 saac',            0.25, 0.27),
  ('kuhadal aan xadidneyn, 36 saac',            0.50, 0.55),
  ('kuhadal aan xadidneyn,7 maalin',            2.50, 2.70),
  ('Kuhadal aan xadidneyn, 30 Maalin',          8.00, 8.50),
  ('internet iyo kuhadal aan xadidneyn,24 saac',0.60, 0.60),
  ('internet+kuhadal aan xadidnayn,40 saac',    1.00, 1.00),
  ('Unlimit data iyo voice,2 maalin',           1.60, 1.65),
  ('internet iyo kuhadal aan xadidnayn,7 maalin',4.20, 4.20),
  ('internet iyo kuhadal aan xadidnayn, 15 maalin',9.00, 9.00),
  ('internet iyo kuhadal aan xadidneyn,30 maalin',18.00,18.00)
) AS v(label, cost, sell)
ON CONFLICT (normalized_label) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      is_active = true;
```
