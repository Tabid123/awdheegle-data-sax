
-- Create public storage bucket for banner images
INSERT INTO storage.buckets (id, name, public)
VALUES ('banners', 'banners', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Public read banners bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners');

-- Public upload (admin uploads from app)
CREATE POLICY "Public upload banners bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'banners');

-- Public update/delete for admin management
CREATE POLICY "Public update banners bucket"
ON storage.objects FOR UPDATE
USING (bucket_id = 'banners');

CREATE POLICY "Public delete banners bucket"
ON storage.objects FOR DELETE
USING (bucket_id = 'banners');
