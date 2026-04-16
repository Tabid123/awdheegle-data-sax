import React from 'react';
import brandLogo from '@/assets/najax-logo.jpeg';

const HeroSection = () => {
  return (
    <div className="text-center space-y-4 pt-4">
      <div
        className="w-40 h-40 mx-auto flex items-center justify-center rounded-3xl bg-card p-4 ring-1 ring-primary/10 transition-shadow duration-300 hover:shadow-[0_20px_50px_-12px_hsl(var(--primary)/0.45)]"
        style={{
          boxShadow:
            '0 12px 30px -10px hsl(var(--primary) / 0.35), 0 4px 12px -4px hsl(var(--primary) / 0.18), 0 0 0 1px hsl(var(--primary) / 0.06)',
        }}
      >
        <img
          src={brandLogo}
          alt="Awdheegle Data Services"
          className="w-full h-full object-contain"
        />
      </div>

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
