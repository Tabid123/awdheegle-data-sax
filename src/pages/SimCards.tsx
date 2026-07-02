import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, CreditCard, Star, Info } from 'lucide-react';
import { BottomNavigation } from '@/components/BottomNavigation';

type SimType = 'PREPAID' | 'GOLD NUMBER' | 'STANDARD' | 'VIP';

interface SimCard {
  id: string;
  type: SimType;
  provider: string;
  number: string;
  price: string;
  features: string;
  popular?: boolean;
}

const SIM_CARDS: SimCard[] = [
  { id: '1', type: 'PREPAID', provider: 'Hormuud', number: '+252 61 789 4432', price: '$2.00', features: '5G Ready • Instant Activation' },
  { id: '2', type: 'GOLD NUMBER', provider: 'Somtel', number: '+252 62 555 0101', price: '$5.00', features: 'Premium • 10GB Welcome Data' },
  { id: '3', type: 'STANDARD', provider: 'Somnet', number: '+252 68 221 8890', price: '$1.50', features: '4G LTE • Low Roaming Fees' },
  { id: '4', type: 'VIP', provider: 'Hormuud', number: '+252 61 111 0000', price: '$50.0', features: 'Exclusive Number • Priority Support', popular: true },
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

  const handleBuy = (sim: SimCard) => {
    navigate('/sim-cards/register', { state: { sim } });
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
            <h2 className="text-xl font-extrabold">Choose Your Number</h2>
            <p className="text-sm text-primary-foreground/85 mt-1.5 leading-snug">
              Select a high-speed 5G ready SIM card from Somalia's top providers.
            </p>
          </div>
        </div>

        {/* Section header */}
        <div className="px-4 mt-5 flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-widest text-muted-foreground">AVAILABLE SIM CARDS</h3>
          <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
            {SIM_CARDS.length} Found
          </span>
        </div>

        {/* SIM cards list */}
        <div className="px-4 mt-3 space-y-3">
          {SIM_CARDS.map((sim) => (
            <div
              key={sim.id}
              className="relative rounded-2xl bg-card border border-border/60 p-3.5 shadow-sm overflow-hidden"
            >
              {sim.popular && (
                <div className="absolute top-0 right-0">
                  <div className="bg-primary text-primary-foreground text-[10px] font-bold px-6 py-1 rotate-45 translate-x-6 translate-y-2 shadow-md">
                    POPULAR
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  {sim.type === 'VIP' ? (
                    <Star className="w-6 h-6 text-primary fill-primary" />
                  ) : (
                    <CreditCard className="w-6 h-6 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeBadgeClass(sim.type)}`}>
                      {sim.type}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">{sim.provider}</span>
                  </div>
                  <p className="text-sm font-bold text-foreground tracking-tight">{sim.number}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{sim.features}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className="text-lg font-extrabold text-primary">{sim.price}</span>
                  <button
                    onClick={() => handleBuy(sim)}
                    className="bg-primary text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-lg hover:opacity-90 active:scale-95 transition-all"
                  >
                    Iibso
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="px-4 mt-5">
          <div className="rounded-2xl bg-muted/60 border border-border/60 p-4 flex gap-3">
            <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-foreground">How it works</h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                After selection, your physical SIM will be delivered within 2 hours in Mogadishu. eSIM activation is instant.
              </p>
            </div>
          </div>
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
};

export default SimCards;