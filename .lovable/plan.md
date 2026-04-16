

# Laba Beddel: Xirmooyin Collapsible + Category Mapping

## 1. Xirmooyin Isku Xiran — Collapsible (sida NumberCard)
DeliveryRulesSection waxaa lagu daraa `expanded` state. Marka title-ka la taabto, rules-ka ayaa soo baxaya/xiraya sida lambarada auto top-up. ChevronDown arrow ayaa loo isticmaalaa.

**Fayl:** `src/components/admin/simple/AutoTopUpView.tsx` — DeliveryRulesSection component

## 2. Mapping-ka — Category Support
Hadda mapping-ku wuxuu ku xiraa lambar → 1 package gaar ah. Waxaan ku daraa in admin-ku dooran karo **category** (tusaale: "Anfac", "Anfac Plus") oo dhan, badalkii 1 package keliya.

### Database beddel
- `auto_topup_phone_mappings` table-ka waxaa lagu daraa column cusub `category_name` (text, nullable)
- `package_id` waxaa laga dhigaa nullable (sababtoo ah category la doortay, package gaar ah lama dooranayo)
- Mapping-ku wuxuu noqon karaa: lambar → 1 package GAAR AH, ama lambar → category (dhammaan packages-ka magacaas leh)

### UI beddel (PhoneMappingSection)
- Mapping form-ka waxaa lagu daraa toggle: "Package Gaar Ah" vs "Category"
- Haddii "Category" la doorto → dropdown-ka wuxuu muujiyaa package_name-yada unique (Anfac, Anfac Plus, Unlimited, iwm)
- Haddii "Package Gaar Ah" la doorto → sida hadda (1 package la doorto)

### Edge Function beddel (process-payment-receipt)
- Haddii mapping-ku category_name leeyahay (package_id null):
  - Ka raadi `auto_topup_packages` dhammaan packages-ka `package_name = category_name` oo `topup_number_id` la mid ah
  - Haddii lacagtu la mid tahay mid ka mid ah → isticmaal package kaas
  - Haddii lacagtu ka waayo dhammaan → UNMATCHED (ha raadin meel kale)
- Haddii mapping-ku package_id leeyahay → sida hadda (1 package keliya)

## Faylasha la beddeli doono
1. **Migration SQL** — `category_name` column + `package_id` nullable
2. **`AutoTopUpView.tsx`** — DeliveryRules collapsible + Mapping category toggle
3. **`process-payment-receipt/index.ts`** — category mapping logic
4. **`types.ts`** — auto-updated

