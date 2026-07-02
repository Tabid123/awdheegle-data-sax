
# Xal Bishaan — Ka fogow Supabase Upgrade (Realtime sida uu yahay)

Database-ku 35MB oo kaliya yahay, markaa cidhiidhigu ma aha storage. Cidhiidhiga dhabta ah ee kugu keena upgrade waa **Egress (data-out)** iyo **DB rows** ee sii kordhaya. Realtime waan iska daynayaa sidii uu ahaa.

## Qorshaha (3 qeybood)

### 1) Auto-cleanup xogta duugoobtay
Samee `cleanup_old_data()` DB function + `pg_cron` maalinle 2:00 subax:
- `sms_logs` > 60 maalmood → tirtir (~5,700 saf hadda)
- `payment_receipts` matched > 90 maalmood → tirtir (~2,700)
- `delivery_queue` completed/cancelled > 30 maalmood → tirtir (~2,850)
- `pending_online_payments` > 7 maalmood → tirtir (~1,970)
- `bulk_sms_queue` sent > 30 maalmood → tirtir (~425)
- `audit_logs` > 60 maalmood, `notifications` la aqriyay > 30 maalmood → tirtir

Waxay yareyneysaa DB size ~50%, waxayna ilaalineysaa realtime-ka inuu si degdeg ah u shaqeeyo (rows yar).

### 2) Yaree egress polling-ka
Realtime channel-ada waa la ilaalinayaa, laakiin polling-ka `setInterval` ee dashboard-yada waa in la yareeyo:
- `SimpleAdminDashboard`: devices refresh 10s → 30s
- `AbdiqafarView`: orders refresh 5s → 20s, `.limit(200)` + `created_at >= today`
- `SimCardsManager` Orders tab: 10s → 30s
- Ku beddel `select('*')` → columns gaar ah oo laga baahan yahay (yaree payload size)

### 3) Yaree query cost
- Ku dar index-yo ku saabsan `created_at` (for cleanup DELETE speed)
- Filter realtime channel-yada: e.g. `ReversalAlertsHeader` kaliya `is_read=eq.false`
- Ka saar console.log-yada waaweyn ee production

## Faylasha la beddelaayo

**Migration:**
- `cleanup_old_data()` function + `pg_cron` schedule
- Index-yo `created_at` haddii aan jirin

**Frontend:**
- `src/pages/SimpleAdminDashboard.tsx` — interval + select columns
- `src/components/admin/simple/AbdiqafarView.tsx` — interval + limit + date filter
- `src/components/admin/SimCardsManager.tsx` — interval
- `src/components/admin/ReversalAlertsHeader.tsx` — realtime filter

## Natiijada la filayo
- DB rows hoos u dhac ~70% (35MB → ~15MB, sii joogtee dheer)
- Egress hoos u dhac ~40–50% (payloads yaraaday + polling yaraaday)
- Realtime side same — dhammaan features-ka sida ay yihiin

Ma sii wadaa oo aan implement-gareeyaa?
