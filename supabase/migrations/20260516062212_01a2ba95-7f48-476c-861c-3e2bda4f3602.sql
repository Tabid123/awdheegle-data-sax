DROP POLICY IF EXISTS "Admins manage bulk_sms_queue" ON public.bulk_sms_queue;
CREATE POLICY "Admins manage bulk_sms_queue" ON public.bulk_sms_queue
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));