import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, CreditCard, Star, Info } from 'lucide-react';
import { BottomNavigation } from '@/components/BottomNavigation';
import { supabase } from '@/integrations/supabase/client';

type SimType = 'PREPAID' | 'GOLD NUMBER' | 'STANDARD' | 'VIP';

interface ProviderOption {
  provider: string;
  price: string; // e.g. "$9.00" or "Free"
  free?: boolean;
}

interface SimCard {
  id: string;
  type: SimType;
  number: string;
  features: string;
  popular?: boolean;
  providers: ProviderOption[]; // primary + bundled free providers
  sold?: boolean;
}

const FALLBACK_SIMS: SimCard[] = [
  {
    id: '1',
    type: 'PREPAID',
    number: '+252 61 789 4432',
    features: '5G Ready • Instant Activation',
    providers: [
      { provider: 'Hormuud', price: '$2.00' },
      { provider: 'Somtel', price: 'Free', free: true },
      { provider: 'Somnet', price: 'Free', free: true },
    ],
  },
  {
    id: '2',
    type: 'GOLD NUMBER',
    number: '+252 62 555 0101',
    features: 'Premium • 10GB Welcome Data',
    providers: [
      { provider: 'Somtel', price: '$5.00' },
      { provider: 'Hormuud', price: 'Free', free: true },
    ],
  },
  {
    id: '3',
    type: 'STANDARD',
    number: '+252 61 953 5029',
    features: '4G LTE • Multi-Network',
    providers: [
      { provider: 'Hormuud', price: '$9.00' },
      { provider: 'Somtel', price: 'Free', free: true },
      { provider: 'Somnet', price: 'Free', free: true },
    ],
  },
  {
    id: '4',
    type: 'VIP',
    number: '+252 61 111 0000',
    features: 'Exclusive Number • Priority Support',
    popular: true,
    providers: [
      { provider: 'Hormuud', price: '$50.00' },
      { provider: 'Somtel', price: 'Free', free: true },
      { provider: 'Somnet', price: 'Free', free: true },
    ],
  },
];

const typeBadgeClass = (type: SimType) => {
  switch (type) {
    case 'PREPAID':
      return 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300';
    case 'GOLD NUMBER':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
    case 'STANDARD':
      return 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300';
    case 'VIP':
      return 'bg-primary text-primary-foreground';
  }
};

const SimCards = () => {
  const navigate = useNavigate();
  const [selectedProvider, setSelectedProvider] = React.useState<Record<string, number>>({});
  const [simList, setSimList] = React.useState<SimCard[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from('sim_cards_catalog')
        .select('id, sim_type, number, features, popular, providers, sort_order, sold_at')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (cancelled) return;
      if (!error && data) {
        setSimList(
          data.map((r: any) => ({
            id: r.id,
            type: (r.sim_type || 'STANDARD') as SimType,
            number: r.number,
            features: r.features || '',
            popular: !!r.popular,
            providers: Array.isArray(r.providers) ? r.providers : [],
            sold: !!r.sold_at,
          })),
        );
      }
      setLoading(false);
    };
    load();
    const channel = supabase
      .channel('sim_cards_catalog_public')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sim_cards_catalog' },
        () => load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const handleBuy = (sim: SimCard) => {
    if (sim.sold) return;
    const idx = selectedProvider[sim.id] ?? 0;
    const opt = sim.providers[idx];
    navigate('/sim-cards/register', {
      state: {
        sim: {
          id: sim.id,
          type: sim.type,
          number: sim.number,
          provider: opt.provider,
          price: opt.price,
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div
        className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border/60"
        style={{ paddingTop: 'var(--effective-safe-area-top, 0px)' }}
      >
        <div className="p-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-primary" />
          </button>
          <h1 className="text-base font-bold text-primary">Dooro SIM Card</h1>
          <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
            <Search className="w-5 h-5 text-primary" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: 'calc(4.5rem + var(--effective-safe-area-top, 0px))',
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Hero banner */}
        <div className="px-4 pt-2">
          <div className="rounded-2xl bg-primary text-primary-foreground p-5 shadow-elegant">
            <h2 className="text-xl font-extrabold">Dooro Nambarkaaga VIP-ga</h2>
            <p className="text-sm text-primary-foreground/85 mt-1.5 leading-snug">
              Iibso Sim kaar fudud oo VIP ah watana GB internet
            </p>
          </div>
        </div>

        {/* Section header */}
        <div className="px-4 mt-5 flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-widest text-muted-foreground">AVAILABLE SIM CARDS</h3>
          <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
            {simList.length} Found
          </span>
        </div>

        {/* SIM cards list */}
        <div className="px-4 mt-3 space-y-3">
          {loading && (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl bg-card border border-border/60 p-3.5 h-24 animate-pulse" />
              ))}
            </>
          )}
          {!loading && simList.length === 0 && (
            <div className="rounded-2xl bg-card border border-border/60 p-6 text-center text-sm text-muted-foreground">
              Wax SIM card ah oo diyaar ah hadda ma jiraan.
            </div>
          )}
          {!loading && simList.map((sim) => {
            const hasFree = sim.providers.some((p) => p.free);
            const onlyOne = sim.providers.length === 1;

            // Compact variant: no free providers OR a single provider — matches reference image
            if (!hasFree || onlyOne) {
              const opt = sim.providers[0];
              return (
                <div
                  key={sim.id}
                  className={`relative rounded-2xl bg-card border p-3.5 shadow-sm overflow-hidden ${sim.sold ? 'border-green-500/50 opacity-95' : 'border-border/60'}`}
                >
                  {sim.sold && (
                    <div className="absolute top-2 left-2 z-10 bg-green-600 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full shadow">
                      ✓ WAA LA IIBSADAY
                    </div>
                  )}
                  {sim.popular && !sim.sold && (
                    <div className="absolute top-0 right-0">
                      <div className="bg-primary text-primary-foreground text-[8px] font-bold px-4 py-0.5 rotate-45 translate-x-6 translate-y-1.5 shadow-md">
                        POPULAR
                      </div>
                    </div>
                  )}
                  <div className={`flex items-center gap-3 ${sim.sold ? 'mt-3' : ''}`}>
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                      {sim.type === 'VIP' ? (
                        <Star className="w-6 h-6 text-primary fill-primary" />
                      ) : (
                        <CreditCard className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeBadgeClass(sim.type)}`}>
                          {sim.type}
                        </span>
                        <span className="text-[11px] font-semibold text-muted-foreground">{opt.provider}</span>
                      </div>
                      <p className={`text-sm font-bold tracking-tight truncate ${sim.sold ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{sim.number}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sim.features}</p>
                    </div>
                    <div className={`flex flex-col items-end gap-1.5 flex-shrink-0 ${sim.popular ? 'mt-8' : ''}`}>
                      <span className="text-base font-extrabold text-primary leading-none">{opt.price}</span>
                      <button
                        onClick={() => handleBuy(sim)}
                        disabled={sim.sold}
                        className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${sim.sold ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]'}`}
                      >
                        {sim.sold ? 'La iibiyay' : 'Iibso'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
            <div
              key={sim.id}
              className={`relative rounded-2xl bg-card border p-3.5 shadow-sm overflow-hidden ${sim.sold ? 'border-green-500/50 opacity-95' : 'border-border/60'}`}
            >
              {sim.sold && (
                <div className="absolute top-2 left-2 z-10 bg-green-600 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full shadow">
                  ✓ WAA LA IIBSADAY
                </div>
              )}
              {sim.popular && !sim.sold && (
                <div className="absolute top-0 right-0">
                  <div className="bg-primary text-primary-foreground text-[8px] font-bold px-4 py-0.5 rotate-45 translate-x-6 translate-y-1.5 shadow-md">
                    POPULAR
                  </div>
                </div>
              )}
              {(() => {
                const primary = sim.providers.find((p) => !p.free) || sim.providers[0];
                return (
                  <div className={`flex items-center gap-3 ${sim.sold ? 'mt-3' : ''}`}>
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                      {sim.type === 'VIP' ? (
                        <Star className="w-6 h-6 text-primary fill-primary" />
                      ) : (
                        <CreditCard className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeBadgeClass(sim.type)}`}>
                          {sim.type}
                        </span>
                        <span className="text-[11px] font-semibold text-muted-foreground">{primary.provider}</span>
                      </div>
                      <p className={`text-sm font-bold tracking-tight truncate ${sim.sold ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{sim.number}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sim.features}</p>
                    </div>
                    <div className={`flex flex-col items-end gap-1.5 flex-shrink-0 ${sim.popular ? 'mt-8' : ''}`}>
                      <span className="text-base font-extrabold text-primary leading-none">{primary.price}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Provider chooser */}

              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground mb-2">SIM CARDS KA DIYAARKA AH</p>
                <div className="grid grid-cols-3 gap-2">
                  {sim.providers.map((opt, i) => {
                    return (
                      <div
                        key={opt.provider}
                        className="relative flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-border/60 bg-card py-2 px-1"
                      >
                        {opt.free && (
                          <span className="absolute -top-1.5 -right-1.5 bg-green-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow">
                            FREE
                          </span>
                        )}
                        <span className="text-[11px] font-bold text-foreground">
                          {opt.provider}
                        </span>
                        <span
                          className={`text-[11px] font-extrabold ${
                            opt.free ? 'text-green-600 dark:text-green-400' : 'text-primary'
                          }`}
                        >
                          {opt.price}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => handleBuy(sim)}
                  disabled={sim.sold}
                  className={`mt-3 w-full text-sm font-bold py-2.5 rounded-xl transition-all ${sim.sold ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]'}`}
                >
                  {sim.sold ? 'La iibiyay' : 'Iibso'}
                </button>
              </div>
            </div>
            );
          })}
        </div>

      </div>

      <BottomNavigation />
    </div>
  );
};

export default SimCards;