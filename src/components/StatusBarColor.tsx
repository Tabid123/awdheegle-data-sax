import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';

const providerColors: Record<string, { light: string; dark: string }> = {
  hormuud: { light: '#22C55E', dark: '#22C55E' },
  somtel: { light: '#ffd600', dark: '#ffd600' },
  somlink: { light: '#9c27b0', dark: '#9c27b0' },
  somnet: { light: '#42a5f5', dark: '#42a5f5' },
  amtel: { light: '#ef5350', dark: '#ef5350' },
};

// Awdhegle Data — premium dark default
const BRAND_BLUE = '#1E40FF';
const BRAND_DARK = '#0A0F2C';

const pageColors: Record<string, { light: string; dark: string }> = {
  '/': { light: BRAND_BLUE, dark: BRAND_DARK },
  '/providers': { light: BRAND_BLUE, dark: BRAND_DARK },
  '/payment-success': { light: '#22C55E', dark: '#22C55E' },
  '/admin/login': { light: BRAND_BLUE, dark: BRAND_DARK },
  '/admin': { light: BRAND_BLUE, dark: BRAND_DARK },
  '/history': { light: BRAND_BLUE, dark: BRAND_DARK },
  '/profile': { light: BRAND_BLUE, dark: BRAND_DARK },
  '/notifications': { light: BRAND_BLUE, dark: BRAND_DARK },
};

export const StatusBarColor = () => {
  const location = useLocation();
  const { theme } = useTheme();

  useEffect(() => {
    let color = pageColors[location.pathname]?.[theme] || pageColors['/'][theme];

    const providerName = (location.state as { providerName?: string })?.providerName?.toLowerCase().trim();
    if (providerName && providerColors[providerName]) {
      color = providerColors[providerName][theme];
    }

    let metaTag = document.querySelector('meta[name="theme-color"]');
    if (!metaTag) {
      metaTag = document.createElement('meta');
      metaTag.setAttribute('name', 'theme-color');
      document.head.appendChild(metaTag);
    }
    metaTag.setAttribute('content', color);
  }, [location.pathname, location.state, theme]);

  return null;
};
