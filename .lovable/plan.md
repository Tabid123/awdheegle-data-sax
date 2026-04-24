
## Dhibaatada (Root Cause Analysis)

Sawiradaada waxay si cad u muujinayaan dhacdo soo noqnoqonaysa:

| Dalab | Attempts | Status | Natiijada (USSD response) |
|-------|----------|--------|---------------------------|
| 1aad | 4 | ❌ Failed - "No USSD response received" | `"Waxaad $0.8 ugu shubtay 252616277356, Haraagaagu waa $37.1..."` ✅ GUUL DHAB AH |
| 2aad (Dib u Daar) | 2 | ✅ Delivered in 6-16s | Isla jawaabta guul leh |

**Tani waxay xaqiijinaysaa lacagta DHAB AHAANTII la diray markii hore**, laakiin Android-ku khaldan ayaa "Failed" u soo sheegay. Markaan baadhay code-ka (`UssdDialerService.kt`), waxaa jira **3 cilad oo isku xidhan**:

### Cilad #1 — Sugitaanka jawaabta aad ayaa loo gaabiyay (`getLastUssdResponse`)
- Hadda: `1s wait + 3 retries × 500ms = 2.5s` total.
- Hormuud silent USSD wuxuu qaataa **3-8 ilbiriqsi** si uu jawaab u soo celiyo.
- Natiijo: response-ka wuu yimaadaa, laakiin `processOrder` mar hore wuu dhammaystay → soo sheegay `"timeout"`.

### Cilad #2 — Race condition: jawaabta dib u soo gaadho ka dib timeout
- `dialUssdViaIntent` wuxuu return `true` ka dib `15s` keliya, kadib wuxuu wacaa `getLastUssdResponse()` taasoo akhrida + **xayuubinaysa** (line 1467-1471) jawaabta SharedPreferences-ka.
- Marka silent USSD uu mar dambe yimaado (5-10s ka dib), wuxuu kaydiyaa jawaab cusub. Re-attempt-ka 2aad ayaa qaata jawaabtaas → "Delivered in 6s" — sidoo kale waxaa loo arkaa "guul" mararka qaar inkasta oo lacag dheeraad ah la diray!

### Cilad #3 — Server retry waxay ku darsataa attempts ka hor success-check
`activate-package/index.ts` line 584-586:
```typescript
} else if (status === 'timeout' || (status === 'completed' && !providerIndicatesSuccess)) {
  normalizedStatus = currentAttempts < 2 ? 'pending' : 'failed';
}
```
Tani **ma hubiso** haddii `provider_response` hore ee la kaydiyay uu hore u xambaarsanaa marker guul ah. Sidaas darteed dalabka oo dhab ahaantii dhacay wuxuu helaa `failed` ka dib 2 timeout — taas oo USSD dial dheeraad ah keenta (lacag-luminta!).

---

## Xalka — Dalab Kasta %99 Markii Ugu Horeysay Ha Dhaco

### 1. **Kor u qaad sugitaanka USSD response (UssdDialerService.kt)**
- `getLastUssdResponse()`: `2s wait + 8 retries × 1000ms = 10s`
- `trySilentUssd()` timeout: `10s → 15s`
- `dialUssdViaIntent` post-timeout: ku dar `5s extra polling` ka hor inta aan la return-gareyn

### 2. **Tag responses with queue_id (prevent cross-order leak)**
- `saveUssdResponse()`: ku dar `KEY_LAST_USSD_RESPONSE_QUEUE_ID = order.id`
- `getLastUssdResponse()`: kaliya isticmaal jawaabta haddii `queue_id` uu la mid yahay dalabka socda
- Ka hortagaysa cilad #2 ee jawaab daahay oo lagu khaldo dalab cusub

### 3. **Ka hor "timeout" → re-check SharedPreferences (delayed capture)**
Ka hor inta aan la soo sheegin `detectedStatus = "timeout"` (line 1277-1280), sii sug **3s extra**, kadib akhri SharedPreferences mar kale. Haddii la helay jawaab oo `hasSuccessfulDeliveryMarkers` → soo sheeg `"completed"` halkii `"timeout"`.

### 4. **Server-side guard: hubi prior-success ka hor retry (activate-package)**
Ka hor inta aan la jajabin retry `pending`, ka soo akhri `delivery_queue.provider_response`. Haddii uu hore u xambaarsanaa keyword guul (`ugu shubtay`, `Haraagaagu waa`, `transaction id`):
- Toos u dhig `completed` (ma diraan USSD mar kale!)
- Ka hortag duplicate USSD dial → ka hortag lacag-lumin

### 5. **Database cleanup migration**
Beddel orders-ka dhab ahaantii dhacay (lacagta la diray) laakiin loo calaamadeeyay `failed`:
```sql
UPDATE orders 
SET delivery_status = 'delivered', status = 'completed'
WHERE delivery_status IN ('failed', 'timeout')
  AND (delivery_notes ILIKE '%ugu shubtay%' OR delivery_notes ILIKE '%haraagaagu waa%');
```

### 6. **Yaree settle time ka hor USSD (degdeg)**
Line 1234: `delay(500)` waa hagaagsan tahay. Laakiin `lastOrderCompletedAt` cooldown 8s waa la yarayn karaa → `4s` si dalabyada xigta ay degdeg ula bilowdaan.

---

## Faallooyin Faafa Ah (Technical Files)

**Files la beddelayo:**

1. **`android-app/app/src/main/kotlin/com/awdheegle/data/service/UssdDialerService.kt`**
   - `getLastUssdResponse()` (line 1448-1488) — sugitaan 10s + queue-id check
   - `dialUssdViaIntent()` (line 1810-1826) — 5s extra polling ka hor return
   - `trySilentUssd()` (line 1718) — timeout `10s → 15s`
   - `saveUssdResponse()` (line 1730-1736) — ku dar queue_id tag
   - `processOrder()` (line 1262-1287) — re-check ka hor timeout
   - `ORDER_COOLDOWN_MS` (line 82) — `8000L → 4000L`

2. **`android-app/app/src/main/kotlin/com/awdheegle/data/service/UssdAccessibilityService.kt`**
   - `saveUssdResponse()` (line 384-396) — sidoo kale ku dar queue_id tag

3. **`supabase/functions/activate-package/index.ts`**
   - Line ~530-590 — ka hor retry, query `delivery_queue.provider_response` & hubi success markers. Haddii la helay → `completed` toos.

4. **Database migration** — clean up false-failed orders.

---

## Outcome (Filashada)

- **~99% dalabyada hal mar ayey ku dhacayaan markii ugu horeysay** (10s timeout vs. 2.5s siiyaa Hormuud waqti ku filan).
- "Dib u Daar" si dhif ah ayaa loo isticmaali doonaa (kaliya marka SIM-ku off yahay ama balance-ku yahay 0).
- Lacag-lumin (duplicate USSD dial) waa la xidhayaa server-side guard.
- Dalabyo hore oo khaldan ayaa la sax doonaa.

**⚠️ Android APK rebuild loo baahan yahay** si tani u shaqeyso aaladaha (GitHub Actions workflow `build-and-upload-apk.yml` ayaa si toos ah u dhisi doonta marka code-ka la commit-gareeyo).
