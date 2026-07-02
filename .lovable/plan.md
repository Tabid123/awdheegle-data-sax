## Muuqaal: Kaarka "Iibso SIM Card" wuxuu ku qarsoonyahay bottom nav-ka mobile-lada yaryar

Sawirka ka muuqda: bogga `/providers` — SellSimCard + PopularPackages waxay hoos u dhacayaan bottom navigation-ka sababtoo ah:
- `paddingBottom: 5rem` ma ku filna nav-ka (kaas oo leh `mb-2` + `py-2` + border, oo dhan ~76-88px + safe area).
- Xajmiga banner-ka, provider grid-ka, iyo spacing-ka waa la sameeyay iPhone dherer dheer, mana la yarayo devices sida iPhone SE (375×667) ama Android 360×640.

## Wax laga qabanayo (front-end kaliya)

### 1) `src/pages/ProviderSelection.tsx`
- Kordhi `paddingBottom` scroll container-ka: `calc(6.5rem + env(safe-area-inset-bottom, 0px))` si aan uga qarsoon SellSimCard/PopularPackages.
- Sameey banner + provider grid responsive:
  - Banner wrapper: `pt-1 pb-2` on small, `sm:pt-2 sm:pb-3`.
  - Provider grid gap: `gap-2 sm:gap-3`.
  - Section title: `text-sm sm:text-base`.
- SellSimCard container margin `mt-4 sm:mt-6`.

### 2) `src/components/ProviderCard.tsx`
- U yaree tallaalka mobile: `p-3 sm:p-4`, `gap-2 sm:gap-3`.
- Circle logo: `h-14 w-14 sm:h-16 sm:w-16`, image `h-9 w-9 sm:h-11 sm:w-11`.
- Label text: `text-xs sm:text-sm`.
- Offline card ProviderSelection.tsx isla format-ka (icon + label) ha ahaato: `p-3 sm:p-4`, circle `w-10 h-10 sm:w-12 sm:h-12`.

### 3) `src/components/SellSimCard.tsx`
- Yaree padding-ka gudaha si aysan ugu qaadan meel badan: `p-3 sm:p-4`, title `text-sm sm:text-base`.

### 4) `src/components/RotatingBanner.tsx` (haddii aspect ratio fixed uu qaado sare oo dheer)
- Hubi in banner-ku uu isticmaalo `aspect-[16/9] sm:aspect-[16/8]` ama height cap si aysan ugu qaadan bar dheer oo screen yar.

### 5) Support FAB
- Yaree bal: `w-12 h-12 sm:w-14 sm:h-14`, `bottom-20 sm:bottom-24` si aysan ugu qarin content-ka.

## Hubinta
- Playwright screenshot 360×640, 375×667, 390×844 → hubi in SellSimCard + Popular Packages ay si buuxda u muuqdaan xagga hoose iyada oo aan la qarin bottom nav-ka.

Waa UI kaliya — dhinaca database/edge functions wax isbeddel ah ma jiraan.
