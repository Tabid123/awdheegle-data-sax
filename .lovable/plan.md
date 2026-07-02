## Reversal Alerts Feature — Plan

Otomaatig u ogow SMS-yada EVCPlus lacag-xirasho ah oo ka soo bandhig ogeysiisyo header-ka admin dashboard-ka.

### 1) Database migration (Supabase)

**Table `public.reversal_alerts`:**
- `id`, `sms_log_id` (nullable ref), `amount numeric`, `sender_phone text`, `ussd_code text`, `sms_body text NOT NULL`, `created_at`, `dismissed_at`, `dismissed_by`
- GRANTs: `SELECT, UPDATE` → authenticated; `ALL` → service_role
- RLS enabled + policies:
  - Admins SELECT via `is_admin(auth.uid())`
  - Admins UPDATE (dismiss) via `is_admin(auth.uid())`
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.reversal_alerts`

**Trigger `sms_logs_detect_reversal()`** — AFTER INSERT on `sms_logs`:
- POSIX regex: `\$[[:space:]]*([0-9]+(?:\.[0-9]+)?|\.[0-9]+)[[:space:]]+ayaa[[:space:]]+waxaa?[[:space:]]+kaa[[:space:]]+xanibay[[:space:]]+(\+?[0-9]{7,15}).*garaac[[:space:]]+([0-9*#+]+)`
- Amount `.05` → `0.05` normalization
- Phone: strip non-digits; USSD: keep `[0-9*#+]`
- Dedupe: skip if same `sms_log_id` or `sms_body` already exists
- SECURITY DEFINER, `search_path = public`

**Backfill** ee SMS-yadii hore matching-ka ah.

### 2) Frontend component

**`src/components/admin/ReversalAlertsHeader.tsx`:**
- `useQuery(['reversal-alerts-24h'])` → `dismissed_at IS NULL AND created_at >= now()-24h`, `refetchInterval: 60_000`
- Realtime channel inside `useEffect` with cleanup → invalidate query on changes
- ⚠️ AlertTriangle icon + red badge (semantic tokens `bg-destructive/text-destructive-foreground`), `animate-pulse` when count > 0
- Popover liis: waqti (`dd MMM HH:mm`), amount bold, sender (`font-mono`), USSD + Copy button (`navigator.clipboard`), "Xaqiiji oo qari" → UPDATE `dismissed_at = now(), dismissed_by = auth.uid()`
- Somali labels: "Reversal Alerts (24 saac)", "Fariimaha lacag-celin ah ee 24-saacii la soo dhaafay", "Wax reversal ah ma jiraan", "Xaqiiji oo qari", "La koobiyay"

### 3) Integration
- Ku dar `<ReversalAlertsHeader />` header-ka `SimpleAdminDashboard.tsx` (agagaarka refresh button-ka).

### 4) Verification
- Insert 5 test SMS rows (kuwa spec-ka) → xaqiiji in `reversal_alerts` uu helo dhammaan 5, oo header badge muujiso `5`.
- Insert SMS aan pattern-ka lahayn → xaqiiji in aan alert la abuurin.
- Screenshot header + popover.

### Xusuusin
- `is_admin(uuid)` horey ayey u jirtaa ✓
- Ma jiro CHECK constraint — kaliya trigger logic
- Semantic tokens kaliya (no hardcoded colors)
