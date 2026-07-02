import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import simCardImage from '@/assets/sim-card-mockup.png';

const SellSimCard = () => {
  const navigate = useNavigate();

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
      </div>
    </div>
  );
};

export default SellSimCard;