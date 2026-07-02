import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import simCardImage from '@/assets/sim-card-mockup.png';
import { supabase } from '@/integrations/supabase/client';

type MiniProvider = { provider_name: string; display_name: string; logo_url: string | null };
const TARGET = ['Hormuud', 'Somnet', 'Somtel'];

const SellSimCard = () => {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<MiniProvider[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('providers_config')
        .select('provider_name, display_name, logo_url')
        .in('provider_name', TARGET);
      if (!mounted || !data) return;
      const ordered = TARGET
        .map((n) => data.find((d: any) => d.provider_name === n))
        .filter(Boolean) as MiniProvider[];
      setProviders(ordered);
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-primary">Adeegyada Cusub</h2>

      <div className="relative rounded-2xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                  <path d="M18 2H9a2 2 0 0 0-2 2v3h2V4h9v16H9v-3H7v3a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
                  <rect x="3" y="9" width="10" height="6" rx="1" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-foreground leading-tight">Iibso SIM Card VIP</h3>
                <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Dalbo SIM kaaga cusub hadda</p>
              </div>
            </div>

            <button
              onClick={() => navigate('/sim-cards')}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-xs sm:text-sm font-semibold px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full hover:opacity-90 active:scale-95 transition-all shadow-sm"
            >
              Bilaw
              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          <img
            src={simCardImage}
            alt="SIM card"
            width={96}
            height={96}
            loading="lazy"
            className="w-20 h-20 sm:w-24 sm:h-24 object-contain flex-shrink-0"
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {(providers.length ? providers : TARGET.map((n) => ({ provider_name: n, display_name: n, logo_url: null }))).map((p) => (
            <button
              key={p.provider_name}
              onClick={() => navigate('/sim-cards')}
              className="flex items-center justify-center gap-1.5 rounded-full border border-border/60 bg-background px-2 py-1.5 hover:bg-muted active:scale-95 transition-all shadow-sm"
            >
              {p.logo_url ? (
                <img src={p.logo_url} alt={`${p.display_name} logo`} className="w-4 h-4 rounded-full object-contain" loading="lazy" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-muted" />
              )}
              <span className="text-[11px] font-semibold text-foreground truncate">{p.display_name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SellSimCard;