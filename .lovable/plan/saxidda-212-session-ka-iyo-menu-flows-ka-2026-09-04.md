# Saxidda *212 session-ka iyo menu flows-ka

## Waxa la xaqiijiyay

- Log-ga *212 wuxuu muujinayaa in discovery-gu sax u gaaray liiska xirmooyinka, laakiin dalabka lacag-bixinta ka dib waxaa qabsaday jidka guud ee delivery-ga, kaas oo mar labaad garaacay `*212*619535029#`; taas ayaa keentay `Invalid menu option`.
- Queue-ga dalabka *212 wuxuu leeyahay session-ka iyo xirmada saxda ah (`discovery_session_id`, `discovery_menu_index = 1`), laakiin generic claim ayaa ka hormaray `claim_discovery_selection`.
- Admin-ku wuxuu keydiyay `Data iyo Kuhadal,Unlimited data,voice,8 saac-`. Comma-ga hadda waxaa loo isticmaalaa kala-qaybinta steps-ka, sidaas darteed magaca xirmada gudaheeda ku jira comma waxaa si khaldan looga dhigay steps badan.
- Queue-ga *870 wuxuu sidoo kale lumiyay spaces-ka template-ka, kadibna matcher-ku `Data iyo Kuhadal` wuxuu si qalad ah ugu dhacay safka gaaban ee `Data`, sababtoo ah partial match ayaa ka horreeya exact/full-label match.
- Flow-ga saddexaad waa `*101`, ma aha `*300`.

## Qorshaha fulinta

### 1. *212 — ku dir xirmada isla session-ka furan

- Database claim-ka ka dhig atomic: queue row leh discovery session furan waxaa heli kara oo keliya `claim_discovery_selection`; `claim_next_delivery` generic-ga kama qaadan karo.
- Marka payment-ku yimaado, session ID, menu index, iyo label-ka xirmada si buuxda ugu xiro queue-ga; session-ka u beddel `selected/delivering` iyadoo aan dial cusub la samayn.
- Android-ka ku dar difaac labaad: delivery kasta oo discovery metadata leh waligiis ha marin silent/general `processOrder`; wuxuu ku qoraa index-ka xirmada dialog-ga furan, riixaa Send, kadibna geliyaa PIN haddii provider-ku dalbado.
- Session hold/sweep-ka sii noolow ilaa selection la helo ama session-ku dhab ahaan xirmo; guul/fashil hal mar oo keliya server-ka ugu celi, auto-retry/redial-na ka mamnuuc kadib dispatch.

### 2. Admin — menu values ha isbeddelin marka la save-gareeyo

- Ka saar comma inuu yahay separator-ka steps-ka; u beddel qaab aan dhaawacayn qoraalka menu-ga (structured/versioned encoding), iyadoo templates-kii hore weli la akhrin karo.
- Jooji code-ka/trigger-ka ka saaraya spaces-ka ama ku daraya `#` menu path-ka; dial part-ka keliya ayaa la nadiifinayaa, menu labels-kuna sida admin-ku u qoray ayay u kaydsamayaan.
- Edit → Save → Edit mar kale waa inuu soo celiyaa Menu 1/2/3 isla qoraalkoodii, oo ay ku jiraan commas iyo spaces.

### 3. Android — exact menu matching ee *870, *866, *101

- Matcher-ka ka dhig laba-pass: marka hore exact normalized full-label dhammaan safafka, kadib synonyms/controlled fuzzy fallback; `Data iyo Kuhadal` waligiis kama hormarin karo `Data`.
- Menu kasta oo admin-ku qoray u fulin hal step, sida isku xigxiga Menu 1 → Menu 2 → Menu 3 (haddii jiro) → receiver step (*101 keliya) → PIN.
- Haddii menu label la waayo, Send madhan ha la riixin, PIN ha loo gudbin, dalabkana ku celi jawaab cad oo sheegaysa step-ka la waayay.
- *866 timeout/retry-ga gaabiska ah sii ilaali; *870 iyo *101-na isla exact-step engine-ka ha isticmaalaan.

### 4. Tijaabo iyo xaqiijin

- Ku dar unit tests: menu label leh comma, edit/save round-trip, `Data` vs `Data iyo Kuhadal`, synonyms, iyo qorshaha PIN/receiver.
- Tijaabi log-ga labada xaaladood:
  - *212: hal dial oo keliya → discovery → payment → index-ka la doortay isla dialog-ga → PIN/natiijo.
  - *870: `Data iyo Kuhadal` → `Unlimited data,voice,8 saac-` → PIN `5516`, iyada oo aan template-ku isbeddelin.
- Hubi web TypeScript, Android tests/build haddii deegaanka oggolaado, iyo database rows-ka cusub si loo xaqiijiyo inaan generic claim/redial dhicin.

## Faahfaahin farsamo

- Migration-ku wuxuu ilaalinayaa return shape-ka hore, wuxuuna ku darayaa keliya routing/locking-ka discovery-ga iyo compatibility parsing-ka templates-ka hore.
- Sawirrada iyo logcat-yada waxaa loo adeegsanayaa tijaabo/reference; app-ka laguma dhex darayo.
- Isbeddelladani waxay u baahan yihiin APK cusub, sababtoo ah matcher-ka, session hold-ka, iyo template parser-ku waa Android code.
- Scope-kan si ula kac ah ayaa loogu koobay labada bug. 4–5 credits gudahood in la dhammeeyo waa bartilmaameed macquul ah, laakiin isticmaalka credits-ka saxda ah lama dammaanad qaadi karo.
