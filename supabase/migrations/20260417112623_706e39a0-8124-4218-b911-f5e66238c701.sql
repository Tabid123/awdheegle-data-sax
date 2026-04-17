INSERT INTO storage.buckets (id, name, public)
VALUES ('provider-logos', 'provider-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Provider logos are publicly viewable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'provider-logos');

CREATE POLICY "Admins can upload provider logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'provider-logos'
  AND public.is_admin(auth.uid())
);

CREATE POLICY "Admins can update provider logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'provider-logos'
  AND public.is_admin(auth.uid())
)
WITH CHECK (
  bucket_id = 'provider-logos'
  AND public.is_admin(auth.uid())
);

CREATE POLICY "Admins can delete provider logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'provider-logos'
  AND public.is_admin(auth.uid())
);