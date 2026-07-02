## Waxa la doonayo

Ku dar kaadhad cusub oo qurux badan oo "Iibso SIM Card" ah (sida sawirka la soo diray) bogga hore, oo la dhigo ka sarreeya qeybta "Xirmooyinka La Doortay".

## Meesha uu ku dhici doono

Faylka: `src/pages/ProviderSelection.tsx` (bogga ka soo baxa `/providers` — oo ay ku jiraan Dooro Shirkada iyo Xirmooyinka La Doortay).

Sida uu u kala hormari doono:
```
[Banner rotating]
[Dooro Shirkada — grid provider-yada]
[Adeegyada Cusub — Iibso SIM Card card]   ← CUSUB
[Xirmooyinka La Doortay — PopularPackages]
[Footer]
```

## Component-ka cusub

Component cusub: `src/components/SellSimCard.tsx`

Naqshadeynta (waafaqsan sawirka + brand-ka Awdheegle):
- Cinwaan yar oo buluug ah `"Adeegyada Cusub"` kor ku qoran
- Kaadhad `rounded-2xl` leh `border` khafiif ah oo `bg-card` ah
- Bidix:
  - Astaan wareegsan (buluug `bg-primary`) oo leh `Sim` icon lucide-ka
  - Ciwaan weyn `"Iibso SIM Card"`
  - Qoraal khafiif ah `"Dalbo SIM kaaga cusub hadda"`
  - Batan buluug ah `"Bilaw"` oo leh arrow → (rounded-full)
- Midig: sawir yar oo mockup ah oo SIM card ah (dhinaca kaliya, aan qaadan meel badan)
- Marka la taabto batan-ka → wuxuu u wareegaa route cusub `/sim-cards` (ama fur WhatsApp — la go'aamin doono marka la implement gareeyo)

## Faahfaahin farsamo

1. Samee `src/components/SellSimCard.tsx`:
   - Isticmaal `Card` shadcn + `Button`
   - Icon `Sim` ama `CreditCard` laga soo qaato `lucide-react`
   - Sawirka SIM-ka: `imagegen` (sawir yar, transparent PNG, style-ka Awdheegle)
   - `onClick` → `navigate('/sim-cards')` (placeholder — bog cusub markaan sameyno)

2. Ku dar `ProviderSelection.tsx` isla meesha:
   ```tsx
   <SellSimCard />
   <PopularPackages />
   ```

3. Ma dhisayno bogga `/sim-cards` hadda — kaliya kaadhka bandhig ah.

## Waxa aan la beddelayn

- Hab-shaqeynta bogga hore, phone input, splash, iwm — dhammaan waa la ilaalinayaa.
- `PopularPackages` iyo `RotatingBanner` waa siday u yihiin.
