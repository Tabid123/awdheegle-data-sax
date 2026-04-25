# Sababta Somtel SIM Uu U Mari Waayay

Somtel SIM way jirtaa, sida sawirkaaga ka muuqata. Ciladu ma ahan in Somtel SIM la waayay guud ahaan. Ciladu waxay ahayd:

**Dalabka Somtel waxaa qaatay aalad kale oo aan lahayn Somtel SIM.**

Xogta dalabka aan arkay:

```text
Order: 3ff7e7e1 / a8c03439
Provider: somtel
USSD: *831*622622705*020*5641#
Claimed device: 036f842573c40cc8
Device SIMs: SIM1 = Somnet, SIM2 = empty/null
```

Laakiin sawirkaaga wuxuu muujinayaa aalad kale oo leh:

```text
SIM1: Hormuud
SIM2: Somtel
```

Marka dalabku Somtel SIM buu lahaa meesha uu ku dhici lahaa, laakiin **server-ka ayaa u dhiibay device khaldan**. Device-ka khaldan wuxuu lahaa Somnet SIM kaliya, kadib Android app-ka wuxuu isku dayay fallback, wuxuuna USSD-ga Somtel ka diray Somnet SIM. Sidaas ayaa Somnet u soo celisay:

```text
Receiver Airtime Partner not found
```

## Root Cause

Waxaa jira labo meel oo u baahan in la adkeeyo:

1. **Database RPC `claim_next_delivery`**
   - Waa inuu dalab Somtel ah u dhiibaa kaliya device leh Somtel active SIM.
   - Hadda waxaa dhacay in device Somnet-only uu claim gareeyay Somtel order.

2. **Android fallback logic**
   - Haddii Android-ku uusan helin SIM-ka provider-ka saxda ah, waa inuusan USSD dirin.
   - Waa inuu yiraahdaa `NO_SIM_FOR_PROVIDER:somtel`, kadib dalabka server-ku ha u celiyo queue-ga si device kale oo Somtel leh u qaato.

# Qorshaha Fix-ka

## 1. Adkeyn Database Claiming

Waxaan cusboonaysiin doonaa `claim_next_delivery` RPC si:

- Somtel order → kaliya device leh `sim1_provider='Somtel'` ama `sim2_provider='Somtel'`
- Somnet order → kaliya Somnet SIM device
- Hormuud order → kaliya Hormuud SIM device
- Haddii provider-ka uusan ku jirin device-ka, order-ka lama siinayo device-kaas.

## 2. Ka saar Android fallback-ka khatarta ah

`UssdDialerService.kt` waxaa laga saari doonaa fallback-ka ku dira SIM kale marka provider SIM la waayo.

Logic cusub:

```text
If provider = somtel:
  find active Somtel SIM
  if found: dial from Somtel SIM
  if not found: do not dial, return NO_SIM_FOR_PROVIDER:somtel
```

Tani waxay joojinaysaa in Somnet SIM lagu diro Somtel USSD.

## 3. Server-ku ha re-queue gareeyo haddii SIM sax ah la waayo

Haddii Android soo celiso:

```text
NO_SIM_FOR_PROVIDER:somtel
```

Edge function-ku wuxuu dalabka u celin doonaa `pending`, si device-ka leh Somtel SIM uu u qaato.

## 4. Sax status-ka khaldan

Waxaa la adkeyn doonaa success detection-ka:

- `AWDHEEGLE DATA | ALWAYS ON...` looma aqoonsan doono success.
- `Receiver Airtime Partner not found` waxaa loo aqoonsan doonaa failure cad.
- Success wuxuu noqon doonaa kaliya haddii jawaabtu leedahay marker cad sida:
  - `ugu shubtay`
  - `ku shubtay`
  - `transaction id`
  - `successfully sent`

## 5. Cleanup dalabyadan khaldan

Dalabyada sida kuwa sawirkaaga oo kale:

- provider = Somtel
- provider_response = status text ama `Receiver Airtime Partner not found`
- status = completed

waxaa loo beddeli doonaa `failed` ama `pending` si dib loogu diro device-ka saxda ah.

## Natiijada

Kadib fix-kan:

- Somtel dalab → Somtel SIM kaliya ayuu ka bixi doonaa.
- Somnet SIM mar dambe ma qaadan doono Somtel order.
- Haddii device sax ah offline yahay, order-ku ma bixi doono SIM khaldan; wuxuu sugi doonaa device sax ah.
- Jawaabta khaldan looma calaamadin doono `Successfully`.

Markaad approve gareyso, waxaan sameyn doonaa migration-ka database, edge function update, iyo Android app update. APK cusub ayaa loo baahan doonaa in lagu rakibo devices-ka.