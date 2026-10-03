// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Wifi, Smartphone, Clock, Zap, Copy, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dataIcon from '@/assets/mobile-data-icon.png';
import { formatPrice } from '@/lib/utils';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useToast } from '@/hooks/use-toast';
import { showBannerAd, hideBannerAd } from '@/services/admob';
import { logScreenView } from '@/services/firebase';
import { useConnectivity } from '@/contexts/ConnectivityContext';

interface Category {
  id: string;
  category_name: string;
  display_order: number;
  is_active: boolean;
  provider_id: string | null;
}

interface DataPackage {
  id: string;
  package_name: string;
  data_amount: string;
  validity_days: string;
  selling_price: number;
  cost_price: number;
  is_active: boolean;
  category_id: string | null;
  connection_type_label: string;
  provider_id: string;
  ussd_code: string | null;
  allowed_phone_lengths?: number[] | null;
}

const DataPackages = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { provider } = useParams<{ provider: string }>();
  const providerName = location.state?.providerName || 'Provider';
  const selectedPackageId = location.state?.selectedPackageId;
  const selectedCategoryId = location.state?.selectedCategoryId;
  const { isReallyOnline } = useConnectivity();
  
  // Get offline context passed from category selection
  const isOffline = location.state?.isOffline || false;
  const senderPhone = location.state?.senderPhone || '';
  const receiverPhone = location.state?.receiverPhone || '';
  const [offlineReceiverNumber, setOfflineReceiverNumber] = useState(receiverPhone);
  
  const [activeTab, setActiveTab] = useState('All');
  const packageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const queryClient = useQueryClient();
  const [showConfirmationScreen, setShowConfirmationScreen] = useState(false);
  const [selectedPackageData, setSelectedPackageData] = useState<any>(null);
  const [ussdCopied, setUssdCopied] = useState(false);
  const { queueOrder } = useOfflineSync();
  const { toast } = useToast();
  

  // Show AdMob banner on mount, hide on unmount
  useEffect(() => {
    showBannerAd();
    logScreenView('DataPackages');
    return () => {
      hideBannerAd();
    };
  }, []);

  // Realtime: packages & categories changes
  useEffect(() => {
    const channel = supabase
      .channel('packages-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'data_packages_config' }, () => {
        queryClient.invalidateQueries({ queryKey: ['packages', provider] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_categories' }, () => {
        queryClient.invalidateQueries({ queryKey: ['categories', provider] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, provider]);

  // Prefetch payment providers immediately
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ['paymentProviders'],
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_active_payment_providers');
        if (error) throw error;
        return data || [];
      },
      staleTime: 30 * 1000,
    });
  }, [queryClient]);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', provider],
    queryFn: async () => {
      // Try cache first only when offline is confirmed
      if (isReallyOnline === false) {
        const cached = localStorage.getItem('offline_categories');
        if (cached) {
          const allCategories = JSON.parse(cached);
          return provider ? allCategories.filter((c: any) => c.provider_id === provider) : allCategories;
        }
      }
      
      const { data, error } = await supabase.rpc('get_active_categories', { 
        p_provider_id: provider || null 
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!provider,
    staleTime: 5 * 60 * 1000,
    retry: false,
    placeholderData: () => {
      try {
        const cached = localStorage.getItem('offline_categories');
        if (cached) {
          const allCategories = JSON.parse(cached);
          return provider ? allCategories.filter((c: any) => c.provider_id === provider) : allCategories;
        }
      } catch (e) {}
      return [];
    },
  });

  // Get cached packages - self-contained, resolves provider UUID internally
  const getCachedPackages = (): DataPackage[] => {
    try {
      const cached = localStorage.getItem('offline_packages');
      const cachedProviders = localStorage.getItem('offline_providers');
      
      if (!cached) return [];
      
      const allPackages = JSON.parse(cached);
      
      // Resolve provider UUID from URL param
      let actualProviderId: string | null = null;
      
      // If provider param is already a UUID
      if (provider?.includes('-')) {
        actualProviderId = provider;
      } else if (provider && cachedProviders) {
        // Find provider by name in cache
        const providers = JSON.parse(cachedProviders);
        const prov = providers.find((p: any) => 
          p.provider_name.toLowerCase() === provider.toLowerCase() ||
          p.id === provider
        );
        if (prov) {
          actualProviderId = prov.id;
        }
      }
      
      if (!actualProviderId) return [];
      
      return allPackages[actualProviderId] || [];
    } catch (e) {
      console.error('Error loading cached packages:', e);
    }
    return [];
  };

  const { data: discoveryRootIds = [] } = useQuery({
    queryKey: ['discoveryRoots', provider],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_packages_config')
        .select('id')
        .eq('is_discovery_root', true)
        .eq('is_active', true);
      if (error) return [];
      return (data || []).map((r: any) => r.id as string);
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['packages', provider],
    queryFn: async () => {
      // Try cache first for offline
      const cachedPackages = getCachedPackages();
      
      // If offline is confirmed, return cache
      if (isReallyOnline === false) {
        return cachedPackages;
      }
      
      // If online but no provider UUID, return cache
      if (!provider?.includes('-')) {
        // Try to resolve UUID
        const cachedProviders = localStorage.getItem('offline_providers');
        if (cachedProviders) {
          const providers = JSON.parse(cachedProviders);
          const prov = providers.find((p: any) => 
            p.provider_name.toLowerCase() === provider?.toLowerCase()
          );
          if (prov) {
            const { data, error } = await supabase.rpc('get_public_packages', { p_provider_id: prov.id });
            if (error) return cachedPackages;
            return data || [];
          }
        }
        return cachedPackages;
      }
      
      const { data, error } = await supabase.rpc('get_public_packages', { p_provider_id: provider });
      if (error) return cachedPackages;
      return data || [];
    },
    enabled: !!provider,
    staleTime: 60 * 1000,
    retry: false,
    // Show cache immediately but still fetch fresh data
    placeholderData: () => getCachedPackages(),
  });

  const { data: promotionalTextData } = useQuery({
    queryKey: ['promotionalText', provider],
    queryFn: async () => {
      // Try cache first only when offline is confirmed
      if (isReallyOnline === false) {
        const cached = localStorage.getItem('offline_providers');
        if (cached) {
          const providers = JSON.parse(cached);
          const prov = providers.find((p: any) => p.id === provider);
          return prov?.promotional_text || null;
        }
        return null;
      }
      
      const { data, error } = await supabase
        .from('providers_config')
        .select('promotional_text')
        .eq('id', provider)
        .maybeSingle();
      if (error) throw error;
      return data?.promotional_text;
    },
    enabled: !!provider,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const promotionalText = promotionalTextData || 'Awdhegle Data ka iibso Internet adigoona qof wicin, waqti kasta, xitaa offline!';

  const getFilteredPackages = () => {
    // If coming from category selection, filter by that category
    if (selectedCategoryId) {
      return packages.filter(pkg => pkg.category_id === selectedCategoryId);
    }
    
    if (activeTab === 'All') return packages;
    
    const selectedCategory = categories.find(c => c.category_name === activeTab);
    if (!selectedCategory) return packages;
    
    return packages.filter(pkg => pkg.category_id === selectedCategory.id);
  };

  const getSelectedCategoryName = () => {
    if (selectedCategoryId) {
      const category = categories.find(c => c.id === selectedCategoryId);
      return category?.category_name || '';
    }
    return '';
  };

  const filteredPackages = getFilteredPackages();

  // Scroll to selected package when page loads
  useEffect(() => {
    if (selectedPackageId && packageRefs.current[selectedPackageId]) {
      setTimeout(() => {
        packageRefs.current[selectedPackageId]?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 300);
    }
  }, [selectedPackageId, filteredPackages]);

  const getBrandBackgroundClass = (providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'bg-hormuud';
      case 'somtel':
        return 'bg-somtel';
      case 'somlink':
        return 'bg-somlink';
      case 'somnet':
        return 'bg-somnet';
      case 'amtel':
        return 'bg-amtel';
      default:
        return 'bg-primary';
    }
  };

  const handlePurchase = (packageData: any) => {
    // *212 discovery roots: go to the payment page first (provider + numbers),
    // the packages are scanned after the receiver number is entered.
    if (discoveryRootIds.includes(packageData.id)) {
      navigate(`/payment/${provider}`, {
        state: {
          providerName,
          categoryName: packageData.name,
          discoveryRoot: { id: packageData.id, name: packageData.name },
        },
      });
      return;
    }


    // Get category name for this package
    const packageCategory = categories.find(c => c.id === packageData.categoryId);
    const categoryName = packageCategory?.category_name || '';
    
    // If offline mode, show confirmation directly
    if (isOffline) {
      setSelectedPackageData(packageData);
      setShowConfirmationScreen(true);
    } else {
      // Online mode: go to payment providers page
      navigate(`/payment/${provider}`, { 
        state: { 
          package: packageData, 
          providerName,
          categoryName // Pass category name for ADSL detection
        } 
      });
    }
  };

  const handleOfflineConfirmPurchase = () => {
    if (!selectedPackageData) return;
    const allowedLengths = Array.isArray(selectedPackageData.allowed_phone_lengths) && selectedPackageData.allowed_phone_lengths.length
      ? selectedPackageData.allowed_phone_lengths.map((length: unknown) => Number(length)).filter((length: number) => Number.isInteger(length))
      : [9];
    const cleanReceiverNumber = offlineReceiverNumber.replace(/\D/g, '');
    if (!allowedLengths.includes(cleanReceiverNumber.length)) {
      toast({ title: 'Lambarka khaldan', description: `Package-kan wuxuu aqbalayaa ${allowedLengths.join(' ama ')} tiro.`, variant: 'destructive' });
      return;
    }
    localStorage.setItem('offlineReceiverPhone', cleanReceiverNumber);

    const amount = selectedPackageData.price?.replace('$', '') || '0';
    
    // Get payment number from cached payment providers (admin-configured)
    const senderPrefix = senderPhone?.substring(0, 2) || '';
    const isSomnet = senderPrefix === '68';
    const cachedPaymentProviders = localStorage.getItem('offline_payment_providers');
    const paymentProvidersList = cachedPaymentProviders ? JSON.parse(cachedPaymentProviders) : [];
    let paymentNumber = paymentProvidersList[0]?.payment_number || '';
    let paymentPrefix = isSomnet ? '*812*' : '*712*';
    
    // Build USSD code correctly without encoding
    const amountFormatted = amount.replace('.', '*');
    const ussdCode = `${paymentPrefix}${paymentNumber}*${amountFormatted}#`;
    
    // Create offline order and queue it
    // customer_phone = app login phone (verifiedPhone), fallback to senderPhone
    const verifiedPhone = localStorage.getItem('verifiedPhone') || '';
    const customerPhone = verifiedPhone.startsWith('+252') ? verifiedPhone.substring(4) : (verifiedPhone || senderPhone);
    
    const offlineOrderData = {
      customer_phone: customerPhone,    // app login phone
      sender_phone: senderPhone,        // phone user pays FROM
      receiver_phone: cleanReceiverNumber, // phone that gets data package
      package_id: selectedPackageData.id || '',
      provider_id: provider || '',
      payment_provider_id: '',
      package_name: selectedPackageData.name || 'Data Package',
      data_amount: selectedPackageData.data || '',
      selling_price: parseFloat(amount),
      payment_number: paymentNumber,    // company number where money is sent TO
      status: 'pending_payment',
      delivery_status: 'pending'
    };
    
    const queuedOrderId = queueOrder(offlineOrderData as any);

    // Trigger USSD dial first - DO NOT encode the USSD code
    window.location.href = `tel:${ussdCode}`;
    
    // Show toast message after USSD dialer opens (user sees it while in USSD)
    setTimeout(() => {
      toast({
        title: "WAX HAKA BEDELIN 😊",
      });
    }, 500);

    // Skip success screen for offline - go directly to home
    setTimeout(() => {
      setShowConfirmationScreen(false);
      navigate('/');
    }, 2000);
  };

  const getBrandColor = (providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'text-hormuud';
      case 'somtel':
        return 'text-somtel';
      case 'somlink':
        return 'text-somlink';
      case 'somnet':
        return 'text-somnet';
      case 'amtel':
        return 'text-amtel';
      default:
        return 'text-primary';
    }
  };

  const getBrandButtonClass = (providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'bg-hormuud hover:bg-hormuud/90';
      case 'somtel':
        return 'bg-somtel hover:bg-somtel/90';
      case 'somlink':
        return 'bg-somlink hover:bg-somlink/90';
      case 'somnet':
        return 'bg-somnet hover:bg-somnet/90';
      case 'amtel':
        return 'bg-amtel hover:bg-amtel/90';
      default:
        return 'bg-primary hover:bg-primary/90';
    }
  };

  const getIcon = (feature: string) => {
    const iconClass = `w-4 h-4 ${getBrandColor(provider || '')}`;
    if (feature.includes('Internet')) return <Wifi className={iconClass} />;
    if (feature.includes('App')) return <Smartphone className={iconClass} />;
    return <Clock className={iconClass} />;
  };


  return (
    <div className="min-h-screen bg-background">
      {/* Header with safe-area padding for Android 12+ */}
      <div 
        className={`${getBrandBackgroundClass(providerName)} text-white py-4 px-4`}
        style={{ paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))', boxSizing: 'border-box' as const }}
      >
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="text-center">
            <h1 className="text-lg font-bold">
              {selectedCategoryId ? getSelectedCategoryName() : 'Awdhegle Data'}
            </h1>
            <p className="text-white/80 text-sm">{providerName}</p>
          </div>
          <div className="w-10"></div> {/* Spacer for centering */}
        </div>
      </div>

      {/* Tab Navigation - Only show if not coming from category selection */}
      {!selectedCategoryId && (
        <div className="bg-card border-b border-border">
          <div className="flex overflow-x-auto">
            <button
              onClick={() => setActiveTab('All')}
              className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'All'
                  ? `border-primary ${getBrandColor(providerName)} bg-primary/10`
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveTab(category.category_name)}
                className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === category.category_name
                    ? `border-primary ${getBrandColor(providerName)} bg-primary/10`
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {category.category_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Promotional Text */}
      <div className="p-4 bg-primary/5">
        <p className="text-sm text-foreground/80 text-center">
          {promotionalText}
        </p>
      </div>

      {/* Discovery roots (*212) — simple list rows */}
      {filteredPackages.some((pkg) => discoveryRootIds.includes(pkg.id)) && (
        <div className="p-3 space-y-3">
          {filteredPackages.filter((pkg) => discoveryRootIds.includes(pkg.id)).map((pkg) => (
            <button
              key={pkg.id}
              onClick={() => handlePurchase({
                id: pkg.id,
                providerId: provider,
                categoryId: pkg.category_id,
                name: pkg.package_name,
                price: `$${formatPrice(pkg.selling_price)}`,
                data: pkg.data_amount,
                validity: pkg.validity_days,
                allowed_phone_lengths: pkg.allowed_phone_lengths,
                ussdCode: pkg.ussd_code,
              })}
              className="w-full bg-card rounded-2xl border border-border shadow-sm hover:shadow-md active:scale-[0.99] transition-all px-4 py-4 flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-3 min-w-0">
                <Smartphone className={`w-4 h-4 shrink-0 ${getBrandColor(providerName)}`} />
                <span className="text-base font-semibold text-foreground truncate">{pkg.package_name}</span>
              </span>
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Data Packages */}
      <div className="p-3 grid grid-cols-2 gap-3">
        {filteredPackages.filter((pkg) => !discoveryRootIds.includes(pkg.id)).map((pkg) => {
          const brandText = getBrandColor(providerName);
          const brandBg = brandText.replace('text-', 'bg-');
          const brandTintMap: Record<string, string> = {
            'text-hormuud': 'bg-hormuud/10',
            'text-somtel': 'bg-somtel/10',
            'text-somlink': 'bg-somlink/10',
            'text-somnet': 'bg-somnet/10',
            'text-amtel': 'bg-amtel/10',
            'text-primary': 'bg-primary/10',
          };
          const brandTint = brandTintMap[brandText] || 'bg-primary/10';
          const isSomtel = providerName?.toLowerCase().includes('somtel');
          const dataAmountTextClass = isSomtel ? 'text-foreground' : brandText;
          const isSelected = selectedPackageId === pkg.id;
          return (
            <button
              key={pkg.id}
              ref={(el) => packageRefs.current[pkg.id] = el}
              onClick={() => handlePurchase({
                id: pkg.id,
                providerId: provider,
                categoryId: pkg.category_id,
                name: pkg.package_name,
                price: `$${formatPrice(pkg.selling_price)}`,
                data: pkg.data_amount,
                validity: pkg.validity_days,
                allowed_phone_lengths: pkg.allowed_phone_lengths,
                ussdCode: pkg.ussd_code,
              })}
              className={`group text-left bg-card rounded-2xl border border-border shadow-sm hover:shadow-md active:scale-[0.98] transition-all overflow-hidden flex flex-col ${
                isSelected ? 'ring-2 ring-primary shadow-lg' : ''
              }`}
            >
              {/* Tinted top band with data amount */}
              <div className={`${brandTint} px-3 py-5 flex items-center justify-center`}>
                <span className={`text-2xl font-extrabold tracking-tight ${dataAmountTextClass}`}>
                  {pkg.data_amount}
                </span>
              </div>

              {/* Price row */}
              <div className="px-3 pt-3 flex items-baseline justify-between">
                <span className="text-lg font-bold text-foreground">
                  ${formatPrice(pkg.selling_price)}
                </span>
                {pkg.cost_price != null && Number(pkg.cost_price) > Number(pkg.selling_price) && (
                  <span className="text-xs text-muted-foreground line-through">
                    ${formatPrice(pkg.cost_price)}
                  </span>
                )}
              </div>

              {/* Validity */}
              <div className="px-3 pt-2 pb-3 text-center">
                <span className="text-xs text-muted-foreground">
                  Valid: {pkg.validity_days}
                </span>
              </div>

              {/* Bottom meta icons */}
              <div className="mt-auto border-t border-border/60 px-3 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Smartphone className={`w-3.5 h-3.5 ${brandText}`} />
                  <span className="truncate">{pkg.connection_type_label || 'Mobile'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className={`w-3.5 h-3.5 ${brandText}`} />
                  <span className="truncate">{pkg.validity_days}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Offline Confirmation Screen */}
      {showConfirmationScreen && isOffline && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-center text-foreground">XAQIIJIN IIBSI</h2>
            
            {/* Package Details Card */}
            <div className="bg-card rounded-lg border border-border shadow-sm p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">{selectedPackageData?.name || 'Package'}</h3>
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-bold ${getBrandColor(providerName)}`}>{selectedPackageData?.price}</span>
                </div>
              </div>
              <div className={`h-0.5 mb-3 ${getBrandColor(providerName).replace('text-', 'bg-')}`} style={{ width: '100%' }}></div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                  <span className="text-sm text-muted-foreground">{selectedPackageData?.data || 'Data'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                  <span className="text-sm text-muted-foreground">Mobile Internet</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                  <span className="text-sm text-muted-foreground">{selectedPackageData?.validity || 'Validity'}</span>
                </div>
              </div>
            </div>

            {/* Sender Number */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase">Lambarka lacagta diraayo</p>
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
                <span className="text-lg font-bold text-foreground">+252-{senderPhone}</span>
              </div>
            </div>

            {/* Receiver Number */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase">Lambarka xirmada helaayo</p>
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
                <span className="text-sm text-muted-foreground">+252</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  aria-label="Lambarka xirmada helaayo"
                  value={offlineReceiverNumber}
                  onChange={(e) => setOfflineReceiverNumber(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  maxLength={15}
                  className="min-w-0 flex-1 bg-transparent text-lg font-bold text-foreground outline-none"
                />
              </div>
              <p className="text-xs text-muted-foreground">Lambarkan waa inuu leeyahay tirooyinka uu package-ku oggol yahay.</p>
            </div>

            {/* Confirmation Message - Flashing Warning */}
            <div className="bg-destructive text-destructive-foreground p-3 rounded-lg text-center animate-pulse">
              <p className="font-semibold text-sm">
                Ma hubtaa inaad {selectedPackageData?.price} ka dirtid {senderPhone}?
              </p>
            </div>

            {/* USSD Code with Copy Button */}
            {(() => {
              const amount = selectedPackageData?.price?.replace('$', '') || '0';
              const sp = senderPhone?.substring(0, 2) || '';
              const isSn = sp === '68';
              const cachedPP = localStorage.getItem('offline_payment_providers');
              const ppList = cachedPP ? JSON.parse(cachedPP) : [];
              let paymentNumber = ppList[0]?.payment_number || '';
              let paymentPrefix = isSn ? '*812*' : '*712*';
              
              const amountFormatted = amount.replace('.', '*');
              const ussdCode = `${paymentPrefix}${paymentNumber}*${amountFormatted}#`;
              
              const handleCopyUssd = async () => {
                try {
                  await navigator.clipboard.writeText(ussdCode);
                  setUssdCopied(true);
                  toast({
                    title: "La koobiyeeyey!",
                    description: "USSD code-ka waa la koobiyeeyey",
                    duration: 2000
                  });
                  setTimeout(() => setUssdCopied(false), 2000);
                } catch (e) {
                  toast({
                    title: "Khalad",
                    description: "Ma koobiyeyn karin",
                    variant: "destructive"
                  });
                }
              };
              
              return (
                <div 
                  onClick={handleCopyUssd}
                  className="flex items-center justify-between bg-muted rounded-lg p-3 border border-border cursor-pointer hover:bg-muted/80 transition-colors"
                >
                  <span className="text-lg font-bold text-accent-foreground">{ussdCode}</span>
                  <button className="p-2 hover:bg-background rounded-lg transition-colors">
                    {ussdCopied ? (
                      <Check className="w-5 h-5 text-accent-foreground" />
                    ) : (
                      <Copy className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setShowConfirmationScreen(false)} 
                className="flex-1 py-5 text-base font-bold border-2"
              >
                MAYA
              </Button>
              <Button 
                onClick={handleOfflineConfirmPurchase} 
                className="flex-1 py-5 text-base font-bold bg-accent text-accent-foreground hover:bg-accent/90"
              >
                HADA IIBSO
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataPackages;