# Dhamaystirka 4-ta USSD Flow (*870, *866, *212, *101)

Hadafka: waxa spec-ka `docs/USSD-FLOWS-SPEC-PROMPT.md` ku qoran oo dhan ka dhig nidaam shaqeynaya mashruucan — database, admin UI, iyo Android APK-ga.

## Xaaladda hadda (waxa la hubiyay)

- Discovery-ga *212 waa la dhisay: `ussd_package_discoveries`, `ussd_price_catalog`, `discovery_unmatched_labels`, RPC-yada `claim_next_discovery`, `complete_discovery`, `claim_discovery_selection`, `complete_discovery_selection`, `discovery_session_lost`, `discovery_delivery_fallback`, `get_package_discovery`, `get_discovery_queue_status`, iyo helper-yada `ussd_normalize_label`, `ussd_strip_price_prefix`, `ussd_duration_key`. Android-ka waxaa jira `DiscoveryApiClient.kt` + `UssdMenuParser.kt` iyo *212 poller `UssdDialerService.kt` gudihiisa. Admin-ka waxaa jira tab "Qiimaha *212" (`UssdDiscoveryManager.tsx`).
- Waxa weli maqan: trigger `enqueue_discovery_delivery` iyo `broadcast_discovery_change` (lama helin migrations/types), menu-step machine ee `*870/*866/*101` (dialer-ku hadda `buildFinalUssd` keliya isticmaalaa, `|` menu path lama fulinayo), iyo admin fields ee Menu1/Menu2/Menu3 + presets (`ConfigViews.tsx` waxaa u yaal hal field `ussd_code` oo bilaash ah).

## Weji 1 — Database

Hal migration:

- `delivery_queue`: hubi/kudar `discovery_menu_label`, `discovery_menu_index`, `discovery_session_id`, `pin_code`, `attempts` (waxa maqan keliya lagu darayo).
- `data_packages_config`: hubi `is_ussd_only`, `is_discovery_root`, `sim_password`.
- `android_devices`: hubi `primary_for_provider`, `sim1_provider`, `sim2_provider`, subscription ID / ICCID fields.
- Trigger `fill_delivery_pin_code`: PIN mar walba config-ka (`data_packages_config.sim_password`, kadib `delivery_instructions`) laga soo qaato — waligeed client-ka lagama qaadanayo.
- Trigger cusub `enqueue_discovery_delivery`: markii dalab discovery ah lacag bixinta lagu xaqiijiyo, haddii session-ku `open` yahay isla session-ka lagu doorto (`claim_discovery_selection` path), haddii kale row cusub `delivery_queue` (cold re-dial).
- Trigger cusub `broadcast_discovery_change`: realtime notify ee session-ka isbeddelka.
- `claim_next_delivery`: hubi provider filter, dispatch-lock (`dispatched_at IS NULL`), single-flight per device, iyo inuu soo celiyo `pin_code`, `discovery_menu_label`, `discovery_menu_index`.
- GRANT + RLS ee wax kasta cusub, iyo realtime publication ee `delivery_queue`/`ussd_package_discoveries`.

## Weji 2 — Android runtime

- Fayl cusub `UssdTemplate.kt`: `isFlow870()`, `dialPrefix()`, `triggerCode()`, `parseMenuPath()` — jarista `|`, wax ka dambeeya `|` waligood lama dialo.
- Fayl cusub `Ussd870Flow.kt`: step machine (order, matcher, `isPinField`) oo maamula 3-da flow:
  - `*870*<receiver>#` → Menu1 → Menu2 → PIN.
  - `*866*<receiver>#` → isku logic, laakiin delay dheer + retry badan (shabakad gaabis).
  - `*101#` → menu → xirmo → step `receiver_phone` (9 lambar, `252`/`0` la jaray) → PIN.
- Keyword matching: normalize Somali/English, ka saar price prefix, aqoonso duration tokens (isticmaal isla logic-ga `UssdMenuParser.kt`).
- `UssdDialerService.kt`: dooridda SIM-ka subscriptionId/ICCID → `PhoneAccountHandle` iyadoo `primary_for_provider` la raacayo; single-flight claim; wixii `dispatch` kadib waa `verification_required`, retry lama sameeyo.
- `UssdAccessibilityService.kt`: qorista input-ka step kasta, xaqiijinta qoraalka windows kasta, riixista Send, keyboard-digit fallback, flow watcher poller, session hold/keep-alive iyo `closeUssdSession()`.
- Jawaabta ugu dambeysa: guul markers → `delivered`; MMI error / "Connection problem" → waligeed guul lama dhigo; system noise (microphone notice, clock junk) waa la iska indhatiraa.

## Weji 3 — Admin UI

- `ConfigViews.tsx` (packages): presets USSD (`*870*`, `*866*`, `*212*`, `*101#`), fields gooni ah Menu1/Menu2/Menu3 oo la isku dhufto template `*<prefix>*<receiver>#|M1,M2[,M3]`, toggles `is_ussd_only` iyo `is_discovery_root`, iyo `sim_password`.
- `UssdDiscoveryManager.tsx`: ku dar retry logic (PIN reset) iyo muuqaalka session lifecycle (open/selected/delivering/consumed/lost).

## Weji 4 — Tijaabo

- Kotlin unit tests: `parseMenuPath`, `dialPrefix/triggerCode`, normalize/keyword matcher, receiver sanitizer (9 lambar).
- Tijaabo flow kasta: *870 guul, *866 gaabis + retry ka hor dispatch, *101 receiver step, *212 hot session vs cold re-dial.

## Faahfaahin farsamo

- Spec-ka `docs/USSD-FLOWS-SPEC-PROMPT.md` waa contract-ka; wax lagu bedelayo maaha.
- Isbeddelka database-ka waa mid compatibility-safe: `claim_next_delivery` shape-kii hore ilaalinayo, dispatch-lock invariant-ka lama jebinayo.
- Waxaa lagu bilaabayaa migration, kadib Android, ugu dambeyn admin UI, si types-ka Supabase loo helo ka hor code-ka.
