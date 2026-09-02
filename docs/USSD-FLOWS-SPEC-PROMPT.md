# USSD Delivery Flows — Full Rebuild Specification

> **Purpose:** This is a single-file, self-contained specification that another AI agent can use to
> rebuild the Riyokaab USSD delivery system **100%** from scratch — database contract, admin UI,
> and the Android APK runtime — for the four flows `*870*` (Hormuud), `*866*` (Somnet),
> `*101#` (Somtel), and `*212*` (Maamuus / package discovery).
>
> This document describes **behaviour and contracts**, not a source dump. Where SQL or Kotlin
> appears, it shows a signature or a template shape so the implementer can rewrite it correctly.

---

## 0. Somali Summary (Kooban)

Nidaamkan wuxuu automate gareeyaa gaarsiinta xirmooyinka internetka isagoo adeegsanaya USSD codes oo
Android telefoon ah ayaa si otomaatig ah u garaacaya.

**Qulqulka guud:**

```
order (macmiil wuu bixiyay lacagta)
   ↓
delivery_queue (row cusub oo ussd_code + provider_name + pin_code leh)
   ↓
Android device (claim_next_delivery — hal shaqo mar)
   ↓
Dialer (tel: intent) + Accessibility Service (menu-yada wuu buuxiyaa)
   ↓
status update (delivered / failed) + jawaabta ugu dambeysa la keydiyo
```

**Afarta flow:**

| Flow | Provider | Dial-ka | Farqiga muhiim ah |
|---|---|---|---|
| `*870*` | Hormuud | `*870*<receiver>#` | Lambarka qaataha wuxuu dial-ka ku jiraa. Menu1 → Menu2 → PIN. |
| `*866*` | Somnet | `*866*<receiver>#` | Isla logic-ga `*870`, laakiin shabakadda gaabis — delay dheer, retry badan. |
| `*101#` | Somtel | `*101#` **kaliya** | Lambarka qaataha **lagama darayo** dial-ka — waa step gaar ah oo menu-ga dhexdiisa la geliyo. |
| `*212*` | Maamuus | `*212*<phone>#` | Labo weji: (a) discovery — xirmooyinka la scrape gareeyo, (b) delivery — session-ka la reuse gareeyo. |

**Xeerarka aan la jebin karin:** PIN mar walba config-ka laga soo qaataa (weligeed template-ka lagu hardcode
ma aha in la sameeyo si khaldan); wax kasta oo ka dambeeya `|` **waligiis lama dialo**; MMI error
**waligeed** guul lama dhigo; discovery session ha la xirin ilaa xirmada la doorato; hal device hal
shaqo mar.

---

## 1. Architecture Overview

### 1.1 Components

| Layer | Responsibility |
|---|---|
| **Web app (React)** | Customer picks provider → category → package → pays. Creates `orders` row. |
| **Postgres (Supabase)** | Holds the delivery contract: `delivery_queue`, discovery tables, claim/complete RPCs, triggers. All concurrency safety lives here (`FOR UPDATE SKIP LOCKED`). |
| **Android APK** | Long-running foreground service. Polls a claim RPC, dials USSD via the system dialer, drives the on-screen USSD dialog through an `AccessibilityService`, reports the final result. |
| **Admin UI** | Configures USSD templates (presets + Menu1/2/3 fields), PIN/sim password, `is_ussd_only` / discovery-root packages, discovery price catalog, unmatched-label review, manual retry. |

### 1.2 End-to-end sequence (non-discovery flows)

```
1. Customer pays               → orders row (payment_status='matched', status='processing')
2. Trigger/edge function       → delivery_queue row
                                  ussd_code   = rendered template (with '|menu path')
                                  provider_name = 'hormuud' | 'somnet' | 'somtel' | 'maamuus'
                                  status      = 'pending', attempts = 0
3. Trigger fill_delivery_pin_code → pin_code copied from package/provider config
4. Device polls claim_next_delivery(device_id, providers[])
                                  → row locked, status='claimed', claimed_by=device
5. Device dials  ussd_code.substringBefore('|')
6. AccessibilityService walks the menu path after '|', then types PIN
7. Final USSD response text classified:
      success keywords     → mark_delivery_status(id,'delivered', response)
      MMI / error keywords → mark_delivery_status(id,'failed',    response)
8. orders.status / delivery_status updated by trigger or by the same RPC
```

### 1.3 End-to-end sequence (`*212*` discovery)

```
PHASE A — Discovery (read the live menu)
1. Customer opens the Maamuus (*212) provider page for their own number
2. App calls get_package_discovery(phone) → cached result OR enqueues a discovery job
3. Device polls claim_next_discovery() → dials *212*<phone>#
4. AccessibilityService scrapes the menu text, parses items (label + optional price)
5. complete_discovery(session_id, items[]) stores rows in ussd_package_discoveries
      - session_state = 'open'   (the USSD session is deliberately KEPT ALIVE)
      - each label normalized via ussd_normalize_label / ussd_strip_price_prefix
      - price resolved from ussd_price_catalog; unresolved → discovery_unmatched_labels
6. Realtime broadcast (broadcast_discovery_change) pushes items to the web app

PHASE B — Delivery (buy one of the discovered items)
7. Customer selects an item and pays → orders row
8. Trigger enqueue_discovery_delivery decides:
      session_state='open' AND not expired → claim_discovery_selection(...)  (reuse live session)
      otherwise                            → discovery_delivery_fallback()  (fresh re-dial)
9. Device selects the item index in the live menu (or re-dials from scratch)
10. complete_discovery_selection(...) → session_state='consumed', delivery marked delivered
11. If the dialog disappeared mid-way → discovery_session_lost() → state='lost' → fallback re-dial
```

---

## 2. Database Contract

> Rebuild these objects. Column lists below are the **required minimum**; add `id uuid pk default
> gen_random_uuid()`, `created_at`, `updated_at` + touch trigger to every table.
> **Every `CREATE TABLE` in `public` must be followed by `GRANT` statements in the same migration**
> (`anon`/`authenticated` per policy, always `service_role`), then `ENABLE ROW LEVEL SECURITY`, then
> policies.

### 2.1 `orders`

Purpose: the customer-facing purchase record.

| Column | Type | Notes |
|---|---|---|
| `order_number` | text unique | human reference |
| `provider_id` | uuid → `providers_config` | |
| `package_id` | uuid → `data_packages_config` | nullable for discovery items |
| `sender_phone`, `receiver_phone` | text | store as `2526XXXXXXX` |
| `amount`, `selling_price`, `cost_price` | numeric | |
| `status` | enum `order_status` | pending/processing/completed/failed/cancelled/refunded |
| `payment_status` | enum `payment_status` | pending/matched/unmatched/refunded/failed |
| `delivery_status` | text | mirrors the queue outcome |
| `delivered_at` | timestamptz | |

### 2.2 `delivery_queue` — the core work table

| Column | Type | Notes |
|---|---|---|
| `order_id` | uuid → `orders` **not null** | |
| `package_id` | uuid → `data_packages_config` | null for discovery items |
| `ussd_code` | text | **full template incl. the `\|menu,path`** (see §3) |
| `provider_name` | text | lowercase slug; the device claim filters on this |
| `receiver_phone` | text | normalized 9 digits — used by the Somtel `receiver_phone` step |
| `sim_slot` | int | 1 or 2, resolved from device SIM mapping |
| `status` | text | `pending` → `claimed` → `delivered` \| `failed` \| `scheduled` \| `verification_required` |
| `attempts` | int not null default 0 | incremented on every claim |
| `pin_code` | text | filled by `fill_delivery_pin_code` trigger — **never** typed into the template |
| `discovery_menu_label` | text | `*212` only: the exact menu label to select |
| `claimed_by` | uuid → `android_devices` | |
| `claimed_at`, `dispatched_at`, `completed_at` | timestamptz | |
| `ussd_dispatched` | bool not null default false | set the instant the dial intent fires |
| `dispatch_device_id` | uuid | which device actually dialed |
| `provider_response` | text | the final USSD text, verbatim |
| `error_message` | text | |
| `scheduled_at` | timestamptz | for scheduled sends |
| `execution_order`, `delay_seconds` | int | multi-step deliveries |

**Invariant:** once `ussd_dispatched = true`, a timeout must **never** silently re-dial. Move the row
to `verification_required` instead, so an admin (or an SMS-log matcher) confirms it.

### 2.3 `data_packages_config`

Adds, on top of normal package fields (`package_name`, `price`, `cost_price`, `data_amount`,
`validity_days`, `category_id`, `provider_id`, `sort_order`, `is_active`):

| Column | Type | Meaning |
|---|---|---|
| `ussd_template` | text | the template of §3 |
| `is_ussd_only` | bool default false | package is delivered purely by USSD, no e-voucher/API path |
| `is_discovery_root` | bool default false | this "package" is the `*212` discovery entry point, not a sellable bundle |
| `sim_password` / `pin_code` | text | the PIN the accessibility service types at the last step |

### 2.4 `providers_config`

`provider_name` (slug), `display_name`, `logo_url`, `phone_prefixes text[]`, `ussd_code` (default
template), `is_active`, `sort_order`. Prefixes are what map a customer number to a provider.

### 2.5 `android_devices`

| Column | Notes |
|---|---|
| `device_id` text unique | app-generated stable ID |
| `sim1_provider`, `sim2_provider` text | provider slug per physical slot |
| `sim1_subscription_id`, `sim2_subscription_id` int | Android `SubscriptionInfo.subscriptionId` |
| `sim1_iccid`, `sim2_iccid` text | fallback identity when subscriptionId shifts |
| `primary_for_provider` text | if set, this device wins claims for that provider |
| `status` enum, `last_heartbeat`, `battery_level`, `is_charging`, `is_active`, `archived_at` | health |

**Claim rule:** if any active device has `primary_for_provider = X`, only that device may claim `X`
while its heartbeat is fresh (< 90s). Otherwise any device whose `sim1/sim2_provider` matches may claim.

### 2.6 Discovery tables (`*212` only)

**`ussd_package_discoveries`** — one row per discovery *session*, plus its items.

| Column | Notes |
|---|---|
| `phone_number` | the number whose menu was read |
| `session_state` | `open` \| `selected` \| `delivering` \| `consumed` \| `lost` |
| `session_expires_at` | keep-alive deadline (e.g. now() + 100s) |
| `claimed_by`, `claimed_at` | device holding the live session |
| `items jsonb` | `[{index, raw_label, normalized_label, price, duration_key, data_amount}]` |
| `raw_menu_text` | verbatim scraped dialog text (debugging) |
| `status` | `queued` \| `dialing` \| `ready` \| `failed` |

**`ussd_price_catalog`** — admin-maintained mapping from a normalized menu label to a sellable price.

| Column | Notes |
|---|---|
| `normalized_label` | output of `ussd_normalize_label` |
| `duration_key` | output of `ussd_duration_key` (`daily`/`weekly`/`monthly`/`3days`/…) |
| `data_amount` | display string |
| `cost_price`, `selling_price` | numeric |
| `is_active` | |

Unique on `(normalized_label, duration_key)`.

**`discovery_unmatched_labels`** — every scraped label that found no catalog match, with `seen_count`
and `last_seen_at`, so an admin can price it once and unlock it for everyone.

### 2.7 RPCs (all `security definer`, `set search_path = public`)

| Function | Signature → returns | Behaviour |
|---|---|---|
| `claim_next_delivery` | `(p_device_id uuid, p_providers text[])` → table(queue row fields) | Picks the oldest eligible `pending` row whose `provider_name = any(p_providers)` **and** whose provider isn't reserved to another device. `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1`. Sets `status='claimed'`, `claimed_by`, `claimed_at`, `attempts = attempts + 1`. Returns 0 rows when nothing to do. |
| `claim_next_discovery` | `(p_device_id uuid)` → table(session_id, phone_number, ussd_code) | Same locking pattern over `ussd_package_discoveries` where `status='queued'`. Sets `status='dialing'`. |
| `claim_discovery_selection` | `(p_device_id uuid)` → table(queue_id, session_id, menu_index, discovery_menu_label, pin_code) | Finds a `delivery_queue` row whose session is still `open` and un-expired; sets session `session_state='delivering'` and the queue row `claimed`. |
| `complete_discovery` | `(p_session_id uuid, p_items jsonb, p_raw_text text)` → void | Stores items, resolves prices against `ussd_price_catalog`, inserts misses into `discovery_unmatched_labels`, sets `status='ready'`, `session_state='open'`, extends `session_expires_at`. |
| `complete_discovery_selection` | `(p_queue_id uuid, p_success bool, p_response text)` → void | Marks the queue row `delivered`/`failed`, sets session `session_state='consumed'`, updates the order. |
| `discovery_session_lost` | `(p_session_id uuid, p_reason text)` → void | Sets `session_state='lost'`; any queue row still waiting on it is returned to `pending` **only if `ussd_dispatched = false`**. |
| `discovery_delivery_fallback` | `(p_queue_id uuid)` → void | Rewrites the queue row for a cold re-dial: fresh `ussd_code` = `*212*<phone>#\|<discovery_menu_label>`, `status='pending'`, clears session link. |
| `get_package_discovery` | `(p_phone text)` → jsonb | Returns cached `ready` items if fresh; otherwise inserts a `queued` session and returns `{status:'queued'}`. |
| `get_discovery_queue_status` | `(p_phone text)` → jsonb | Lightweight poll: `{status, session_state, item_count, updated_at}`. |
| `mark_delivery_dispatched` | `(p_queue_id uuid, p_device_id uuid)` → bool | Idempotent latch: sets `ussd_dispatched=true`, `dispatched_at=now()`, `dispatch_device_id`. Returns false if already latched. |
| `mark_delivery_status` | `(p_queue_id uuid, p_device_id uuid, p_status text, p_response text)` → bool | The single write path for a final outcome; also updates `orders`. |

### 2.8 Triggers

| Trigger | On | Does |
|---|---|---|
| `fill_delivery_pin_code` | BEFORE INSERT on `delivery_queue` | If `pin_code IS NULL`, copy it from `data_packages_config.sim_password` → else `providers_config` default. The PIN must **never** come from the client. |
| `enqueue_discovery_delivery` | AFTER INSERT/UPDATE on `orders` (payment matched, discovery item) | Creates the `delivery_queue` row; reuses a live `open` session if one exists, otherwise falls back to a cold re-dial row. |
| `broadcast_discovery_change` | AFTER UPDATE on `ussd_package_discoveries` | `pg_notify` / realtime publication so the web app updates instantly. Requires `ALTER PUBLICATION supabase_realtime ADD TABLE public.ussd_package_discoveries;`. |
| `touch_updated_at` | BEFORE UPDATE, every table | standard |

### 2.9 Normalization helpers (`immutable`)

| Function | Input → output |
|---|---|
| `ussd_normalize_label(text)` | lowercase, strip accents/punctuation, collapse whitespace, drop leading list numbers (`"1. "`, `"1) "`), drop trailing `"\n"`. `"1) 5GB Bisha $5"` → `"5gb bisha"` |
| `ussd_strip_price_prefix(text)` | removes a leading/trailing currency token (`$5`, `5$`, `USD 5`, `5.00`) and returns the label without it |
| `ussd_duration_key(text)` | maps Somali/English duration words to a canonical key: `maalin/daily/24 saac` → `daily`; `toddobaad/wiig/weekly/7 maalin` → `weekly`; `bil/bisha/monthly/30 maalin` → `monthly`; `3 maalin` → `3days`; else `null` |

All three must be `IMMUTABLE` so they can back functional unique indexes.

---

## 3. The `ussd_code` Template Format

### 3.1 Grammar

```
template   := dial_part [ "|" menu_path ]
dial_part  := "*" prefix "*" placeholder "#"        ; flows 870 / 866 / 212
            | "*101#"                               ; flow 101 (Somtel) — no receiver in the dial
menu_path  := menu_item ( "," menu_item ){0,2}      ; 1..3 items
menu_item  := free text keyword, or a literal digit, or the token "receiver_phone"
placeholder:= "{receiver_phone}" | "{phone}" | literal digits
```

### 3.2 Examples

```
*870*{receiver_phone}#|Internet,5GB Bisha        ← Hormuud: dial, then two menu steps, then PIN
*866*{receiver_phone}#|Xirmooyin,Toddobaad       ← Somnet: same shape, slower network
*101#|Xirmooyin,5GB,receiver_phone               ← Somtel: 3rd step types the receiver number
*212*{phone}#                                    ← Maamuus discovery root: no menu path
*212*{phone}#|10GB Bisha                         ← Maamuus cold delivery of a known label
```

### 3.3 Hard rules

1. **Everything after the first `|` is never dialed.** The device computes
   `dialString = ussd_code.substringBefore("|")` and dials only that.
2. The menu path is a **keyword list**, not a digit list. The accessibility service matches each
   keyword against the live menu lines (after normalization) and types the matching line's index.
   A pure digit item (`"2"`) is allowed as an escape hatch and is typed literally.
3. The literal token `receiver_phone` as a menu item means: "at this step, type the 9-digit
   normalized receiver number" (strip `252` prefix, strip a leading `0`).
4. The PIN is **never** part of the template. It is always the last step and always comes from
   `delivery_queue.pin_code`.
5. `{receiver_phone}` / `{phone}` are substituted server-side when the queue row is created, so the
   device receives a fully-rendered `ussd_code`.
6. Sanitize on render: strip all whitespace, collapse `##` → `#`.

---

## 4. Flow-by-Flow Specification

### 4.1 `*870*` — Hormuud (reference implementation)

```
dial   *870*615123456#
step 1 match Menu1 keyword in dialog → type index → Send
step 2 match Menu2 keyword in dialog → type index → Send
step 3 isPinField → type delivery_queue.pin_code → Send
final  classify response text
```

- Timings: 1500 ms after the dial before reading the first dialog; 900 ms between steps.
- If a step's keyword matches nothing after 3 dialog reads, fail with
  `error_message = "menu step N not found: <keyword>"` and keep the raw text in `provider_response`.
- Retry policy: max 2 attempts (`attempts <= 2`), and only when `ussd_dispatched = false`.

### 4.2 `*866*` — Somnet (same logic, slow network profile)

Identical step machine to `*870`, but:

- First dialog wait 3500 ms, inter-step wait 2000 ms, per-step dialog read retries 6.
- Total flow watchdog 90 s (vs 45 s).
- Retry policy max 3 attempts.
- Somnet frequently emits an intermediate "Please wait…" dialog — treat any dialog whose normalized
  text matches `/(please wait|fadlan sug|processing)/` as **not** a menu and keep polling.

### 4.3 `*101#` — Somtel (receiver typed inside the menu)

```
dial   *101#                      ← receiver number is NOT in the dial string
step 1 match Menu1 keyword        → index → Send
step 2 match Menu2 keyword        → index → Send        (the bundle)
step 3 token "receiver_phone"     → type 9-digit receiver → Send
step 4 isPinField                 → type pin_code → Send
final  classify
```

- Receiver normalization before typing: strip non-digits → drop leading `252` → drop leading `0` →
  take the last 9 digits. Reject and fail the delivery if the result is not exactly 9 digits.
- Somtel echoes the number back in a confirmation dialog. Treat a dialog containing the typed number
  plus a `1`/`Haa`-style confirm option as a confirm step and answer it before the PIN.

### 4.4 `*212*` — Maamuus (two-phase discovery + delivery)

#### Phase A — discovery

1. Web app calls `get_package_discovery(phone)`.
   - Fresh `ready` session (`updated_at > now() - 5 min`) → return items immediately.
   - Otherwise insert a `queued` session and return `{status:'queued'}`; the app then polls
     `get_discovery_queue_status(phone)` (or listens to realtime).
2. Device claims via `claim_next_discovery`, dials `*212*<phone>#`.
3. Accessibility service reads the dialog and **does not press anything**. It:
   - splits `raw_menu_text` into lines,
   - keeps lines that look like `^\s*(\d+)\s*[).:-]?\s*(.+)$`,
   - for each: `raw_label`, `index`, `price = extracted currency token or null`,
     `normalized_label = ussd_normalize_label(ussd_strip_price_prefix(raw_label))`,
     `duration_key = ussd_duration_key(raw_label)`.
4. Calls `complete_discovery(session_id, items, raw_text)`.
5. **The dialog is deliberately kept open.** A keep-alive watcher re-asserts the window every 10 s
   until `session_expires_at`, so a purchase within that window can select an item without re-dialing.
6. If the dialog vanishes → `discovery_session_lost(session_id, 'dialog_dismissed')`.

#### Phase B — delivery

7. Customer picks an item (priced from `ussd_price_catalog`; unpriced items are shown as
   "not available" and logged to `discovery_unmatched_labels`) and pays.
8. `enqueue_discovery_delivery` trigger:
   - session still `open` and un-expired → queue row linked to the session, plus
     `discovery_menu_label`; device picks it up via `claim_discovery_selection` and types the index in
     the **already-open** dialog.
   - otherwise → `discovery_delivery_fallback`: queue row with a cold template
     `*212*<phone>#|<discovery_menu_label>`, handled exactly like a `*870` two-step flow.
9. `complete_discovery_selection(queue_id, success, response)` closes the loop and sets
   `session_state='consumed'`.

**Discovery invariants**

- Never close the session between Phase A and item selection.
- A `lost`/`consumed` session must never be selected against — always fall back to a cold re-dial.
- One live session per phone number at a time (partial unique index on
  `phone_number WHERE session_state IN ('open','selected','delivering')`).

---

## 5. Android Runtime Specification

### 5.1 `UssdDialerService` (foreground service)

Responsibilities:

- **Foreground notification** + `WAKE_LOCK`; `START_STICKY`; restarted by `BootReceiver`.
- **Heartbeat** every 30 s: `android_devices.last_heartbeat`, battery, charging, app version.
- **Polling loop** every 5 s (backoff to 15 s when idle > 5 min).
- **Single-flight claim:** an `AtomicBoolean busy` guard — the service must never claim a second job
  while a USSD dialog is on screen. One device = one job at a time.
- Claim order per tick: `claim_discovery_selection` → `claim_next_delivery` → `claim_next_discovery`.
- Immediately after firing the dial intent, call `mark_delivery_dispatched(queue_id, device_id)`.
  If it returns `false`, abort — someone already dispatched this row.

### 5.2 SIM selection

```
provider_name → android_devices.sim{1,2}_provider  → slot
slot → sim{N}_subscription_id  → SubscriptionManager.getActiveSubscriptionInfo(subId)
     → fallback: match sim{N}_iccid against SubscriptionInfo.iccId
     → TelecomManager.callCapablePhoneAccounts[index] → PhoneAccountHandle
dial: Intent(ACTION_CALL, "tel:" + Uri.encode(dialString))
        .putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle)
        .putExtra("com.android.phone.extra.slot", slotIndex)   // OEM fallback
```

If `primary_for_provider` is set for another device, this device must not have been given the job at
all — the filter lives in the RPC, not the client.

### 5.3 Template parsing helpers

```kotlin
fun isFlow870(code: String): Boolean      // dial part starts with "*870*" or "*866*" or "*212*"
fun dialPrefix(code: String): String      // "870" | "866" | "212" | "101"
fun triggerCode(code: String): String     // code.substringBefore('|').replace(" ", "")
fun parseMenuPath(code: String): List<String>
        // code.substringAfter('|', "").split(',').map(String::trim).filter(String::isNotEmpty)
```

`triggerCode` is the **only** string ever handed to the dialer.

### 5.4 Step machine

```kotlin
data class UssdStep(
    val order: Int,
    val matcher: String,        // keyword | literal digit | "receiver_phone"
    val isPinField: Boolean = false
)
```

Built as: `parseMenuPath(...)` items in order, then a final `UssdStep(order = n+1, matcher = pin_code,
isPinField = true)`. Steps are consumed strictly in order; a step is only advanced after the input was
verified on screen and Send was pressed.

### 5.5 Keyword matching + normalization (client-side mirror of §2.9)

```
normalize(s) = s.lowercase()
                .replace(Regex("[^a-z0-9 ]"), " ")
                .replace(Regex("\\s+"), " ")
                .trim()
```

Matching a step keyword against a menu line, in priority order:

1. exact normalized equality,
2. normalized line **contains** normalized keyword,
3. price-prefix-stripped comparison (`$5 5GB Bisha` vs `5GB Bisha`),
4. duration-token equivalence (Somali ↔ English: `maalin`↔`daily`, `toddobaad`/`wiig`↔`weekly`,
   `bil`/`bisha`↔`monthly`, `saac`↔`hour`, `24 saac`↔`daily`),
5. token-subset match (every keyword token appears somewhere in the line).

The winning line's leading digit is what gets typed. If two lines tie, fail rather than guess.

### 5.6 `UssdAccessibilityService`

Configured with `android:accessibilityFlags="flagDefault|flagRetrieveInteractiveWindows"`,
`canRetrieveWindowContent="true"`.

Loop per step:

1. **Find the dialog** — scan `windows` for an `AlertDialog`/`android:id/message` node, or any window
   whose package is the phone/telecom app. Collect all `TextView` text into `dialogText`.
2. **Classify** — final response? menu? "please wait" noise?
3. **Write the input** — locate the `EditText` node (`isEditable == true`) in **any** window (not just
   the active one) and `ACTION_SET_TEXT` the value.
4. **Verify the input across all windows** — re-read the editable node's text and confirm it equals
   what was written. If a soft keyboard swallowed it, fall back to
   **keyboard-digit fallback**: dispatch per-digit clicks on nodes whose text equals each digit, or
   `performGlobalAction`-driven key events.
5. **Press Send** — click the node whose text matches `/(send|ok|dir|haa|yes)/i` or the positive
   button `android:id/button1`. If none, `ACTION_CLICK` on the last clickable button in the dialog.
6. **Flow watcher poller** — an independent 500 ms poller re-checks that a dialog still exists.
   If no dialog for 4 consecutive polls → the session died → report `failed`
   (or `discovery_session_lost` for `*212`).

### 5.7 Final-response classification

```
SUCCESS  → /(waad ku guuleysatay|success|guul|waa la diray|has been sent|la gudbiyay|
             sent successfully|waad heshay|balance)/i
FAILURE  → /(connection problem|invalid mmi|mmi code|not allowed|failed|khalad|
             lama diri karo|insufficient|balance-?kaaga ma filna|try again)/i
NOISE    → /(microphone|camera|is using your|notification)/i   → ignore, keep waiting
```

Rules:

- **MMI / "Connection problem" is never a success.** No exceptions.
- Empty/timeout response with `ussd_dispatched = true` → `verification_required`, **not** `failed`
  and **never** an automatic re-dial.
- Always persist the verbatim final text into `provider_response`, even on success.

### 5.8 Session hold and close

```kotlin
fun holdUssdSession(untilMs: Long)  // *212 discovery: re-assert window, block new claims
fun closeUssdSession()              // press the negative button / BACK, then release `busy`
```

`closeUssdSession()` is called after every terminal outcome **except** a successful `*212` discovery
scrape, which intentionally leaves the dialog open until `session_expires_at`.

---

## 6. Invariants (must-hold list)

1. The PIN is always read from `delivery_queue.pin_code` (filled by trigger from config) — never from
   the template, never from the client, never hardcoded.
2. Nothing after `|` is ever dialed.
3. An MMI error or "Connection problem" is never recorded as `delivered`.
4. A `*212` discovery session stays open until an item is selected or it expires.
5. One device processes exactly one job at a time (`busy` latch + `FOR UPDATE SKIP LOCKED`).
6. Every claim RPC filters by provider **and** by `primary_for_provider` reservation.
7. `mark_delivery_dispatched` is the single dispatch latch; a `false` return aborts the attempt.
8. After dispatch, a timeout produces `verification_required` — never an automatic retry.
9. `attempts` increments on claim, and the claim query excludes rows over the flow's retry cap.
10. Each menu step is only advanced after the typed input was verified on screen.
11. Receiver numbers are normalized to 9 digits before being typed; a non-9-digit result fails the job.
12. Discovery labels are only sellable once priced in `ussd_price_catalog`; misses go to
    `discovery_unmatched_labels`.
13. All DB writes from the device go through `security definer` RPCs — the device never does raw
    `UPDATE`s on `delivery_queue`.

---

## 7. Admin UI Specification

### 7.1 USSD code editor (per package / per provider)

- **Preset buttons:** `*870*` Hormuud, `*866*` Somnet, `*101#` Somtel, `*212*` Maamuus. Choosing a
  preset fills the dial part and locks its shape.
- **Menu 1 / Menu 2 / Menu 3** text fields (Menu 3 optional). A `receiver_phone` chip inserts the
  literal token — required for the Somtel preset.
- **Live preview** of the rendered template and of the exact string that will be dialed
  (`substringBefore('|')`), so the admin can see the PIN and menu path are not dialed.
- **PIN / SIM password** field, stored on the package (fallback: provider).
- Validation: dial part matches the grammar; 1–3 menu items; the Somtel preset must contain
  `receiver_phone`; no `|` inside a menu item.

### 7.2 Package flags

- `is_ussd_only` toggle — hides e-voucher/API delivery options for that package.
- `is_discovery_root` toggle — marks the `*212` entry point; such a package is not sellable and is
  excluded from the storefront grid.

### 7.3 `DiscoveryCatalogView`

- Table of `ussd_price_catalog`: normalized label, duration key, data amount, cost, selling price,
  active toggle. Inline edit + add.
- **Unmatched labels panel** from `discovery_unmatched_labels`, sorted by `seen_count desc`, each with
  a one-click "price this" action that pre-fills a catalog row.
- Live sessions panel: phone, `session_state`, item count, `session_expires_at` countdown, and a
  "force lost" button.

### 7.4 Retry / manual actions

- **Retry** on a failed queue row: resets `status='pending'`, `claimed_by=null`, `claimed_at=null`,
  `ussd_dispatched=false`, `error_message=null`, and **re-reads `pin_code` from config** (PIN reset —
  a stale PIN is the most common cause of a repeat failure).
- **Resend** dialog: provider → category → package → receiver, optional schedule
  (`status='scheduled'` + `scheduled_at`).
- **Mark delivered** manual override, writing both `delivery_queue` and `orders`.
- Retry is blocked while `ussd_dispatched = true` unless the admin explicitly confirms a possible
  double-delivery.

---

## 8. Acceptance Tests

### 8.1 Per-flow end-to-end

| # | Flow | Expected |
|---|---|---|
| 1 | `*870` happy path | dials `*870*<recv>#`, two menu steps matched by keyword, PIN typed, success text → `delivered`, `provider_response` stored |
| 2 | `*870` wrong keyword | fails with `menu step N not found`, raw text kept, no PIN typed |
| 3 | `*866` slow network | intermediate "Fadlan sug" dialog ignored, completes within the 90 s watchdog |
| 4 | `*101` happy path | dials `*101#` only; receiver typed at step 3 as 9 digits; PIN at step 4 |
| 5 | `*101` bad receiver | `2526151234` (10 digits after normalization) → job fails before dialing |
| 6 | `*212` discovery | items parsed with index/label/price, session stays `open`, realtime push received |
| 7 | `*212` warm delivery | purchase within the window reuses the open session, no second dial |
| 8 | `*212` cold fallback | expired session → `discovery_delivery_fallback` re-dials and selects by label |
| 9 | `*212` session lost | dialog dismissed → `session_state='lost'`, un-dispatched queue row returns to `pending` |
| 10 | MMI error | "Connection problem or invalid MMI code" → `failed`, never `delivered` |
| 11 | Post-dispatch timeout | `ussd_dispatched=true` + no response → `verification_required`, no re-dial |
| 12 | Double claim | two devices poll simultaneously → exactly one gets the row (`SKIP LOCKED`) |
| 13 | Primary device | `primary_for_provider='hormuud'` set → only that device receives Hormuud jobs |
| 14 | PIN reset on retry | PIN changed in config → retry types the new PIN |

### 8.2 Kotlin unit tests

- `triggerCodeStripsMenuPath` — `"*870*615123456#|A,B"` → `"*870*615123456#"`.
- `parseMenuPathHandlesOneToThreeItems` and trims whitespace/empties.
- `isFlow870TrueFor870_866_212_falseFor101`.
- `normalizeMatchesSomaliAndEnglishDurations` — `"5GB Bisha"` matches `"5GB Monthly"`.
- `stripPricePrefixRemovesCurrencyTokens` — `"$5 5GB Bisha"` → `"5gb bisha"`.
- `normalizeReceiverTo9Digits` — `"252615123456"`, `"0615123456"`, `"615123456"` → `"615123456"`.
- `classifyResponse` — success / MMI failure / microphone noise cases.
- `stepMachineAppendsPinAsLastStep`.

### 8.3 SQL tests

- `claim_next_delivery` returns 0 rows for a provider no device serves.
- `fill_delivery_pin_code` populates from package, then falls back to provider.
- Partial unique index prevents two live sessions for the same phone.
- `ussd_normalize_label` / `ussd_duration_key` are `IMMUTABLE` and usable in an index.

---

## 9. Build Order (recommended)

1. Migration 1: `providers_config`, `data_packages_config` flags, `android_devices` SIM columns.
2. Migration 2: `delivery_queue` + `fill_delivery_pin_code` + `claim_next_delivery` +
   `mark_delivery_dispatched` + `mark_delivery_status`.
3. Android: service skeleton, heartbeat, claim loop, dial, accessibility step machine → verify `*870`.
4. Add `*866` timing profile and the `*101` `receiver_phone` step.
5. Migration 3: discovery tables, helpers, discovery RPCs, triggers, realtime publication.
6. Android: discovery scrape + session hold + selection.
7. Admin UI: template editor, package flags, discovery catalog, retry.
8. Run the acceptance matrix in §8.

---

*End of specification. An implementer following §2 → §5 → §7 in the order of §9, and passing §8,
reproduces the system 100%.*
