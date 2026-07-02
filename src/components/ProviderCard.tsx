import React from 'react';

interface ProviderCardProps {
  name: string;
  logo: string;
  onClick: () => void;
  disabled?: boolean;
}

const PROVIDER_COLORS: Record<string, string> = {
  hormuud: '142 72% 40%',
  somnet: '205 64% 53%',
  somtel: '47 95% 53%',
  amtel: '0 78% 55%',
  somlink: '276 55% 47%',
};

const getProviderColor = (name: string): string => {
  const key = name.toLowerCase().trim();

  for (const [provider, color] of Object.entries(PROVIDER_COLORS)) {
    if (key.includes(provider)) return color;
  }

  return '281 100% 20%';
};

const ProviderCard = ({ name, logo, onClick, disabled = false }: ProviderCardProps) => {
  const providerColor = getProviderColor(name);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={disabled ? undefined : {
        borderColor: `hsl(${providerColor} / 0.42)`,
        boxShadow: `0 0 0 2px hsl(${providerColor} / 0.14)`,
      }}
      className={`group relative w-full rounded-2xl bg-card border-2 p-3 sm:p-4 flex flex-col items-center gap-2 sm:gap-3 transition-all duration-300 ${
        !disabled
          ? 'hover:shadow-elegant hover:-translate-y-1 active:scale-[0.97]'
          : 'opacity-50 cursor-not-allowed'
      }`}
    >
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background: `linear-gradient(135deg, hsl(${providerColor} / 0.12), hsl(${providerColor} / 0.04))`,
        }}
      />

      <div
        className="relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full border-2 bg-background/80"
        style={{
          borderColor: `hsl(${providerColor} / 0.58)`,
          boxShadow: `0 0 0 4px hsl(${providerColor} / 0.14)`,
        }}
      >
        {logo ? (
          <img
            src={logo}
            alt={`${name} logo`}
            className="h-9 w-9 sm:h-11 sm:w-11 object-contain"
            loading="eager"
            decoding="async"
          />
        ) : (
          <span className="text-lg font-bold text-foreground">
            {name.trim().charAt(0).toUpperCase() || '?'}
          </span>
        )}
      </div>

      <span className="relative text-xs sm:text-sm font-semibold text-foreground tracking-tight">{name}</span>
    </button>
  );
};

export default ProviderCard;