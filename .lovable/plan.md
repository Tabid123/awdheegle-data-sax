## Hadafka

Sameey nidaam admin uu ku xidhi karo lambar gaar ah xirmo gaar ah. Markii lambarkaas uu lacag soo dirsado, xirmadaas ayaa loo diraa — ma ka tegayo qiime-ka guud (selling_price match).

## Xaaladda Hadda

- Edge function `process-payment-receipt` mar hore wuu eegi karaa table la yidhaahdo `auto_topup_phone_mappings` (lines 873-942 ee `index.ts`).
- Logic-ku waa: hadduu sender-ka lambarkiisu ku jiro mapping → ku xidh xirmadaas si toos ah; haddii kale → ku xulo qiimaha guud.
- Laakiin **table-kaas weli ma jiro** database-ka, UI-na ma jiro lagu maamulo.

## Qorshe

### 1. Database — table cusub `auto_topup_phone_mappings`

Goobaha:
- `id` uuid PK
- `phone_number` text (sender-ka loo xidhayo, normalized)
- `package_id` uuid → `auto_topup_packages.id`
- `custom_amount` text nullable (qiime/qiimooyin gaar ah comma-separated; haddii NULL la isticmaalo `selling_price` xirmada)
- `label` text nullable
- `is_active` boolean default true
- `created_at`, `updated_at`

RLS: Admins manage (ALL, `is_admin(auth.uid())`), Public read (si edge function-ku u akhriyo) — la mid ah `auto_topup_packages`.

Index: `(phone_number, is_active)`.

### 2. UI Admin — tab cusub `AutoTopUpView.tsx`

Tab cusub oo la dhigayo dhinaca packages-ka kor: **"Lambar → Xirmo"** (Phone Mappings).

Waxa uu user-ku qaban karo:
- Geli lambar (sender phone) + label
- Dooro xirmo (`auto_topup_packages` liiska, lagu kala saari karo provider/topup-number)
- Dooro qiime gaar ah (ikhtiyaari, comma-separated tusaale `0.50, 1.00`); haddii la dhaafo, `selling_price` xirmada ayaa la isticmaalaa
- Beddel/Tirtir/Toggle active

Liis ka muuqdaa: lambarka, label, xirmada (magac + provider), qiimaha la rabo, xaalada.

### 3. Sidee u shaqayso (warar)

Lambar 615123456 → la xidho xirmada "24 Saac Hormuud" oo qiimo $0.50.
Markii 615123456 lacag $0.50 dirsado → si toos ah loo diro xirmada 24 Saac, iyada oo aan la eegin xirmooyin kale oo $0.50 leh.

### Faylasha la beddelayo

- `supabase/migrations/<new>.sql` — table cusub + RLS + index
- `src/components/admin/simple/AutoTopUpView.tsx` — tab cusub iyo CRUD UI
