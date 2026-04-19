import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Banner {
  id: string;
  banner_image: string;
  alt_text: string | null;
  display_order: number;
  link_url: string | null;
}

interface BannerRow {
  id: string;
  image_url: string;
  title: string | null;
  sort_order: number;
  link_url: string | null;
}

const RotatingBanner = () => {
  const [banners, setBanners] = useState<Banner[]>(() => {
    try {
      const cached = localStorage.getItem('offline_banners');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [currentBanner, setCurrentBanner] = useState(() => {
    try {
      const sessionActive = sessionStorage.getItem('session_active');
      if (!sessionActive) {
        sessionStorage.setItem('session_active', 'true');
        sessionStorage.removeItem('banner_position');
        return 0;
      }
      const saved = sessionStorage.getItem('banner_position');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      sessionStorage.setItem('banner_position', currentBanner.toString());
    } catch {
      // Ignore storage errors
    }
  }, [currentBanner]);

  useEffect(() => {
    if (banners.length > 0 && currentBanner >= banners.length) {
      setCurrentBanner(0);
    }
  }, [banners.length, currentBanner]);

  useEffect(() => {
    const loadBanners = async () => {
      try {
        const { data, error } = await supabase
          .from('banners_config')
          .select('id, image_url, title, sort_order, link_url')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (error) throw error;

        const freshBanners = ((data ?? []) as BannerRow[]).map((row) => ({
          id: row.id,
          banner_image: row.image_url,
          alt_text: row.title,
          display_order: row.sort_order,
          link_url: row.link_url,
        }));

        setBanners(freshBanners);
        localStorage.setItem('offline_banners', JSON.stringify(freshBanners));
      } catch {
        // Use cached data if available
      } finally {
        setIsLoading(false);
      }
    };

    loadBanners();
  }, []);

  useEffect(() => {
    if (banners.length === 0) return;

    const interval = window.setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [banners.length]);

  if (banners.length === 0) {
    if (isLoading) {
      return (
        <div className="w-full space-y-2">
          <div
            className="w-full rounded-xl overflow-hidden bg-muted animate-pulse"
            style={{ aspectRatio: '2.5/1', maxHeight: '320px' }}
          />
          <div className="flex justify-center space-x-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-6 h-1.5 rounded-full bg-muted-foreground/20" />
            ))}
          </div>
        </div>
      );
    }
    return null;
  }

  const currentMedia = banners[currentBanner];
  if (!currentMedia) return null;

  const handleClick = () => {
    if (currentMedia.link_url) {
      window.open(currentMedia.link_url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="w-full space-y-2">
      <button
        type="button"
        onClick={handleClick}
        className="w-full rounded-xl overflow-hidden shadow-elegant relative text-left"
        style={{ aspectRatio: '2.5/1', maxHeight: '320px' }}
      >
        <img
          key={currentMedia.banner_image}
          src={currentMedia.banner_image}
          alt={currentMedia.alt_text || 'Promotional banner'}
          className="w-full h-full object-cover animate-fade-in"
          width={1200}
          height={400}
          sizes="(max-width: 768px) 100vw, 1200px"
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      </button>

      <div className="flex justify-center space-x-1.5">
        {banners.map((_, index) => (
          <div
            key={index}
            className={`h-1.5 rounded-full transition-all duration-500 ease-in-out ${
              index === currentBanner ? 'w-8 bg-primary' : 'w-4 bg-muted-foreground/30'
            }`}
            aria-label={`Banner ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default RotatingBanner;
