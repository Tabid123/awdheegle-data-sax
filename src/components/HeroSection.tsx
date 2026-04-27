import React from 'react';
import brandLogo from '@/assets/awdhegle-logo-new.png';

const HeroSection = () => {
  return (
    <div className="text-center space-y-4 pt-4">
      <img
        src={brandLogo}
        alt="Awdhegle Data"
        className="w-40 h-40 mx-auto object-contain rounded-2xl"
        style={{ filter: 'drop-shadow(0 12px 24px hsl(var(--primary) / 0.35))' }}
      />

      <div className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-accent leading-none">
          AWDHEEGLE
        </h1>
        <p className="text-primary font-semibold text-sm tracking-[0.3em] uppercase">
          Data Services
        </p>
      </div>

      <div className="flex items-center gap-3 justify-center">
        <span className="h-px w-10 bg-border" />
        <p className="text-sm text-muted-foreground font-medium">
          Internet aad ku kalsoon tahay
        </p>
        <span className="h-px w-10 bg-border" />
      </div>
    </div>
  );
};

export default HeroSection;
