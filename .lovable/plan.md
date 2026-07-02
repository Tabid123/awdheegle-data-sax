## Cusbooneysii design-ka packages-ka `/packages/:provider`

Waxaan dib u qaabeeyaa kaadhka package kasta oo ku yaal `src/pages/DataPackages.tsx` si uu ula mid noqdo sawirka tixraaca — laakiin **la'aan** "10% OFF" badge, iyo iyadoo la adeegsanayo midabada shirkad-goboleedka (hormuud/somtel/somnet/somlink/amtel).

### Muuqaalka cusub ee kaadhka
- **Grid 2-tiirar ah** (mobile & desktop) halkii saf keli ah.
- **Xariiqda sare (soft tinted band)**: waxay ku qaadataa midabka brand-ka `10%` opacity ah oo background ah, oo ka dhigan qaybta pink-tinted ee sawirka. Dhexdeeda:
  - Data amount aad u weyn oo bold ah (e.g. `850MB`, `2GB`, `28GB`), oo ah midabka brand-ka.
- **Qaybta hoose**:
  - Bidix: qiimaha iibinta (`$0.45`) oo bold ah + qiimaha asalka ah oo line-through ah dhinaca midig ee agtiisa (`$0.5`).
  - `Valid: {validity_days}` xariiq muted ah.
  - Xariiq hoose oo leh 2 icon oo yar: `Smartphone` icon + `connection_type_label` (tusaale "Mobile Internet"), iyo `Clock` icon + validity. *(Reference-ka wuxuu tusayaa Mins/SMS, laakiin xogtaas kuma jirto `data_packages_config`. Waxaan ku bedelayaa xogta hadda taal si aan u ilaaliyo functionality.)*
- **Corners**: `rounded-2xl`, shadow yar `shadow-sm hover:shadow-md`, border `border-border`.
- **Kaadhku dhan wuu la taabtaa** (tap-to-purchase) — sidoo kale kaadhka hoosta wuxuu weli haystaa button `IIBSO` oo yar / ama kaadh-dhan clickable ah (waan ilaalinayaa button-ka `IIBSO`).
- Sidoo kale waxaan cusbooneysiin doonaa "Offline Confirmation" card gudaha isla file-ka si uu ula mid noqdo qaabkan cusub.

### Midabada
- Waxaan adeegsan doonaa helpers hadda jira `getBrandColor` / `getBrandBackgroundClass` (hormuud, somtel, somnet, somlink, amtel) — sidaas bandhig-tinted band iyo data amount labaduba waxay raacaan midabka shirkadda la doortay.
- Ma jiraan `10% OFF` badge; waa la saarayaa dhammaan noocyada.

### Waxa la beddelayo
- **`src/pages/DataPackages.tsx`** – kaliya file-kan. Grid + kaadh markup ayaa dib loo qoray, laakiin data-fetching, purchase flow, offline logic, iyo state kale wax ma is beddelayaan.

### Waxa aan taabaneyn
- Schema-da database — mid cusub lagu darin.
- API/RPC calls, offline sync, USSD dial flow.
- Ma jiro badge dhinaca dhinac ah oo "10% OFF" ah (sida uu codsaday).
