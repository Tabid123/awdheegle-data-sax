import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import HeroSection from '@/components/HeroSection';
import PhoneInput from '@/components/PhoneInput';
import Footer from '@/components/Footer';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import najaxLogoSplash from '@/assets/najax-logo.jpeg';

 // Validate Somali phone format: 9 digits starting with 61, 77, 62, or 68
const isValidSomaliPhone = (phone: string | null): boolean => {
  if (!phone) return false;
  return /^(61|77|62|68)\d{7}$/.test(phone);
};

const Index = () => {
  const navigate = useNavigate();
  
  // Check if app was already initialized in this session
  const wasAlreadyInitialized = sessionStorage.getItem('appInitialized') === 'true';
  
  // If already initialized, skip splash entirely
  const [isChecking, setIsChecking] = useState(() => {
    if (wasAlreadyInitialized) {
      return false;
    }
    return true; // Show splash only for first-time app open
  });
  const hasInitialized = useRef(false);

  // Check if user has completed offline registration or skipped it
  const hasOfflineRegistration = (): boolean => {
    const hasSkipped = localStorage.getItem('hasSkippedOfflineRegistration') === 'true';
    if (hasSkipped) return true;
    const sender = localStorage.getItem('offlineSenderPhone');
    const receiver = localStorage.getItem('offlineReceiverPhone');
    return !!sender && !!receiver && sender.length === 9 && receiver.length >= 7;
  };

  // Handle already initialized case - immediate navigation
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    
    if (wasAlreadyInitialized) {
      const verifiedPhone = localStorage.getItem('verifiedPhone');
      
      if (isValidSomaliPhone(verifiedPhone)) {
        // Check if offline registration is complete
        if (hasOfflineRegistration()) {
          navigate('/providers', { replace: true });
        } else {
          navigate('/offline-mode', { replace: true });
        }
      }
      return;
    }
  }, [navigate, wasAlreadyInitialized]);

// Get connectivity status - ping runs in background
  const { isReallyOnline, isChecking: connectivityChecking } = useConnectivity();
  const { forceRefreshCache } = useOfflineCache();
  
  // Force refresh cache during splash screen
  const splashRefreshDone = useRef(false);
  useEffect(() => {
    if (!splashRefreshDone.current && isReallyOnline && isChecking) {
      splashRefreshDone.current = true;
      forceRefreshCache();
    }
  }, [isReallyOnline, isChecking]);
  
  // Track if minimum splash time has passed (2 seconds - fast internet)
  const [splashMinimumReached, setSplashMinimumReached] = useState(false);
  
  // Extended splash for slow/no internet (4 seconds)
  const [extendedSplashReached, setExtendedSplashReached] = useState(false);
  
  // Safety net - force exit after 8 seconds MAX (4s splash + 4s skeleton)
  const [forceExit, setForceExit] = useState(false);

  // Minimum 2 second splash timer (fast internet case)
  useEffect(() => {
    if (wasAlreadyInitialized) return;
    if (!isChecking) return;
    
    const splashTimer = setTimeout(() => {
      setSplashMinimumReached(true);
    }, 2000); // 2 seconds
    
    return () => clearTimeout(splashTimer);
  }, [wasAlreadyInitialized, isChecking]);

  // Extended 4 second splash timer (data on + no internet case)
  useEffect(() => {
    if (wasAlreadyInitialized) return;
    if (!isChecking) return;
    
    const extendedTimer = setTimeout(() => {
      setExtendedSplashReached(true);
    }, 4000); // 4 seconds
    
    return () => clearTimeout(extendedTimer);
  }, [wasAlreadyInitialized, isChecking]);

  // Safety timer - 8 seconds MAX (4s splash + 4s skeleton)
  useEffect(() => {
    if (wasAlreadyInitialized) return;
    if (!isChecking) return;
    
    const forceTimer = setTimeout(() => {
      setForceExit(true);
    }, 8000);
    
    return () => clearTimeout(forceTimer);
  }, [wasAlreadyInitialized, isChecking]);

  // Navigation logic - 2 different paths based on connectivity speed
  useEffect(() => {
    if (wasAlreadyInitialized) return;
    if (!isChecking) return;
    if (!splashMinimumReached) return; // Min 2 seconds always
    
    // CASE 1: Fast Internet - ping done + online = navigate after 2s
    if (!connectivityChecking && isReallyOnline) {
      const verifiedPhone = localStorage.getItem('verifiedPhone');
      
      if (isValidSomaliPhone(verifiedPhone)) {
        sessionStorage.setItem('appInitialized', 'true');
        // Check if offline registration is complete
        if (hasOfflineRegistration()) {
          navigate('/providers', { replace: true });
        } else {
          navigate('/offline-mode', { replace: true });
        }
      } else {
        if (verifiedPhone) localStorage.removeItem('verifiedPhone');
        sessionStorage.setItem('appInitialized', 'true');
        setIsChecking(false);
      }
      return;
    }
    
    // CASE 2: Data ON + No Internet - wait for 4s splash, then skeleton, then offline
    if (!extendedSplashReached) return; // Sug 4s splash
    
    // After 4s: if offline confirmed OR forceExit
    if (forceExit || (!connectivityChecking && !isReallyOnline)) {
      const verifiedPhone = localStorage.getItem('verifiedPhone');
      
      if (isValidSomaliPhone(verifiedPhone)) {
        sessionStorage.setItem('appInitialized', 'true');
        // Check if offline registration is complete
        if (hasOfflineRegistration()) {
          navigate('/providers', { replace: true });
        } else {
          navigate('/offline-mode', { replace: true });
        }
      } else {
        if (verifiedPhone) localStorage.removeItem('verifiedPhone');
        sessionStorage.setItem('appInitialized', 'true');
        setIsChecking(false);
      }
    }
  }, [navigate, wasAlreadyInitialized, isChecking, splashMinimumReached, extendedSplashReached, connectivityChecking, isReallyOnline, forceExit]);

  // Show splash screen
  if (isChecking) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center z-50 overflow-hidden" style={{ background: '#1370F0' }}>
        {/* Ambient radial glow behind logo */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: '520px',
            height: '520px',
            background:
              'radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 35%, rgba(255,255,255,0) 70%)',
            filter: 'blur(20px)',
          }}
        />

        {/* Logo card with rich layered shadow */}
        <div
          className="relative w-44 h-44 flex items-center justify-center rounded-[2rem] bg-white p-5 animate-pulse"
          style={{
            boxShadow:
              '0 40px 80px -20px rgba(0,0,0,0.55), 0 25px 50px -12px rgba(11,36,71,0.6), 0 12px 24px -8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.15)',
          }}
        >
          {/* Inner glow ring */}
          <div
            className="absolute inset-0 rounded-[2rem] pointer-events-none"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.05) 100%)',
            }}
          />
          <img
            src={najaxLogoSplash}
            alt="Awdhegle Data"
            className="relative w-full h-full object-contain"
            style={{ filter: 'drop-shadow(0 6px 12px rgba(19,112,240,0.35))' }}
          />
        </div>

        <div className="w-10 h-10 mt-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />

        {extendedSplashReached && connectivityChecking && !forceExit && (
          <div className="flex flex-col items-center mt-6">
            <div className="w-48 h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full animate-pulse" style={{ width: '70%' }} />
            </div>
            <p className="text-white/80 text-xs mt-2">Xiriirka la hubinayo...</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 py-6 gap-4">
      <div className="w-full max-w-md space-y-5">
        <HeroSection />
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50">
          <PhoneInput />
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Index;
