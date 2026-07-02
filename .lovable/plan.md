# Qorshaha: WaafiPay API kaliya SIM Card Payment

## Baaxadda (Scope)
- WaafiPay API waxaa loo isticmaalayaa **kaliya** popup-ka lacag-bixinta ee `SimCardConfirm.tsx` (marka "Bixi Hadda" la taabto).
- Waxa kale oo dhan (dalabyada xirmooyinka, bulk SMS, USSD dispatch, admin dashboards, iwm.) **wax isbadal ah kuma sameynayo** — sida ay hadda u shaqeynayaan ayay u sii shaqeyn doonaan.

## 1) Database — shax cusub `sim_card_orders`
Fields:
- `full_name`, `mother_name`, `guarantor_phone`
- `sim_provider`, `sim_number`, `sim_type`, `price` (numeric)
- `payment_provider` (evc / edahab / sahal), `payment_phone`
- `payment_status` (pending / paid / failed) default `pending`
- `order_status` (new / processing / delivered / cancelled) default `new`
- `waafipay_transaction_id`, `waafipay_reference_id`, `waafipay_response` (jsonb), `error_message`
- `user_id` (nullable — guests OK)
- `created_at`, `updated_at`

RLS + GRANTs:
- Authenticated: INSERT + SELECT own rows (`user_id = auth.uid()`).
- Admin (`is_admin(auth.uid())`): SELECT / UPDATE / DELETE all.
- service_role: ALL.
- `GRANT SELECT, INSERT, UPDATE ON public.sim_card_orders TO authenticated; GRANT ALL TO service_role;` (No anon.)

## 2) Edge Function cusub — `waafipay-simcard-payment`
- Path: `supabase/functions/waafipay-simcard-payment/index.ts` iyo geli `supabase/config.toml` (`verify_jwt = true`).
- Input: `{ orderId, amount, paymentPhone, paymentProvider }`.
- Waxay isticmaashaa secrets-ka horeba u jira: `WAAFIPAY_API_USER_ID`, `WAAFIPAY_API_KEY`, `WAAFIPAY_MERCHANT_UID`.
- Waxay u dirtaa `https://api.waafipay.net/asm` codsi `API_PURCHASE` ah oo `paymentMethod: "MWALLET_ACCOUNT"` leh, `mwalletAccount` waa MSISDN buuxa (`252XXXXXXXX`).
- Guul (`responseCode = "2001"`) → cusboonaysii row-ga `payment_status='paid'` + kaydso `transactionId`/`referenceId`/`waafipay_response`.
- Khalad → `payment_status='failed'` + `error_message` (`responseMsg`).
- Ka celi `{ success, message, transactionId?, error? }`.

## 3) Frontend — `src/pages/SimCardConfirm.tsx`
Beddel `handleConfirm`:
1. Validate `payNumber` (7-9 digits, normalize prefix `252`).
2. Insert row cusub `sim_card_orders` (`payment_status='pending'`).
3. Call `supabase.functions.invoke('waafipay-simcard-payment', { body: {...} })`.
4. Tus `PaymentLoadingOverlay` inta la sugayo.
5. Guul → toast "Lacagta waa la helay", xir popup, u geey `/sim-cards`.
6. Khalad → toast qalad ah oo tusa `responseMsg`; popup furan ha ka dhigo si isku day mar kale loo sameyn karo.
- WhatsApp send-off waa laga saarayaa qeybtan lacag-bixinta — WaafiPay ayaa hadda default ah.

## 4) Waxa aan la taabanayn
- UI SIM cards, foomka diiwaangelinta, design-ka xaqiijinta.
- Dalabyada xirmooyinka (packages), USSD dispatch, bulk SMS, admin dashboards — dhammaan sida ay hadda yihiin.

## Talaabooyinka fulinta
1. `supabase--migration` — abuur `sim_card_orders` + RLS + GRANTs + trigger `updated_at`.
2. Abuur `supabase/functions/waafipay-simcard-payment/index.ts` + geli `config.toml`.
3. Cusboonaysii `src/pages/SimCardConfirm.tsx` si loo isticmaalo edge function-ka + `PaymentLoadingOverlay`.
4. Xaqiiji build + tijaabi.
