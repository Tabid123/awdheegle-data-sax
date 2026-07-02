## Muxuu dhibku yahay
Marka telefoonku diraayo USSD-ka, mararka qaar network-ku wuu jabaa ka hor inta jawaabta USSD-ka aan la helin — sidaas darteed `provider_response` waa banaan, oo dalabku wuxuu noqonayaa `verification_required` ("Jawaab lama helin"). Laakiin dhab ahaantii, provider-ku wuxuu inta badan soo diraa SMS xaqiijin ah (tusaale "Waxaad u shubtay 62‑869‑5569 $0.45…") kaas oo horeba loogu keydiyay `sms_logs` (SmsReceiver-ka Android-ku wuu forward-gareeyaa).

## Xalka
Marka aad furto dalab `verification_required` ah oo aan `provider_response` lahayn, si toos ah uga raadi `sms_logs` device-kaas SMS ku habboon dalabka — oo ku muuji goobta "📩 SMS" beddelka "Jawaab lama helin".

## Sida uu shaqeynaayo (matching)
Waxaan raadinnaa in `sms_logs`:
- `device_id` = device-ka delivery queue-ga (map: `android_devices.device_id` → `android_devices.id`)
- `direction` inbound (`sms_in`, `evc_in`, `evc_out`, iwm — kasta oo aan `sms_out` ahayn)
- `created_at` u dhexeeya `[dispatched_at − 30s, dispatched_at + 5min]` (haddii `dispatched_at` maqan yahay, `delivery_queue.created_at`)
- Kaddibna kala saar heerar (score):
  1. `message` ka koobantahay 7-ta lambar ee ugu dambeeya `receiver_phone`
  2. `message` ka koobantahay qiimaha (`selling_price` ama `cost_price`) sida `0.45` / `$0.45`
  3. Haddii labada sax ay yihiin → si buuxda ayaa lagu kalsoonaan karaa

Haddii mid la helo, tus jawaabta SMS-ka goobta uu hore uga muuqday "Jawaab lama helin" oo leh calaamad cad ("📥 SMS-ka la helay") iyo waqtiga la helay. Haddii aan la helin, sii day qoraalka hadda ee "Jawaab lama helin".

## Meesha isbeddellada
Kaliya frontend — `src/components/admin/simple/AbdiqafarView.tsx`:
- `loadOrders`: markaad `delivery_queue` soo qaadanayso, sidoo kale ku dar `dispatched_at`.
- Ku dar tallaabo cusub: markaad hesho dhammaan deliveries-ka ka baxsan `verification_required` / `pending` oo aan `provider_response` lahayn, sameey hal query `sms_logs`:
  - `.in('device_id', deviceUuids)` oo `.gte('created_at', earliestWindow)` (5 daqiiqo ka dib xogta ugu dambeysay)
  - Filter client-side matching-ka kore
- Ku muji jawaabta la helay marka la fidiyo dalabka (expanded view), lakin ha bedelin `provider_response` database-ka — kaliya tus.

## Waxa aan la taaban
- `activate-package` iyo Android app: iska daa.
- Database schema iyo RLS: iska daa (sms_logs horeba public read ah).
- Logic-ka `verification_required` waa iska sii socda; dalabku wuxuu ahaanayaa mid gacanta lagu xaqiijiyo, laakin admin-ku wuxuu hadda arki doonaa SMS-ka runta ah.
