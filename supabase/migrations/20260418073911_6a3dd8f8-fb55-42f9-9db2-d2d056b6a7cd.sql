-- Allow public DELETE on offline_registrations (simple admin has no auth)
DROP POLICY IF EXISTS "Public delete offline regs" ON public.offline_registrations;
CREATE POLICY "Public delete offline regs"
  ON public.offline_registrations
  FOR DELETE
  USING (true);

-- Allow public DELETE on sms_logs
DROP POLICY IF EXISTS "Public delete sms_logs" ON public.sms_logs;
CREATE POLICY "Public delete sms_logs"
  ON public.sms_logs
  FOR DELETE
  USING (true);

-- Allow public DELETE on payment_sms_log
DROP POLICY IF EXISTS "Public delete payment_sms_log" ON public.payment_sms_log;
CREATE POLICY "Public delete payment_sms_log"
  ON public.payment_sms_log
  FOR DELETE
  USING (true);