import React, { useState } from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'mark-only' | 'horizontal' | 'compact';
  theme?: 'dark' | 'light' | 'auto';
  subtitle?: string;
  badge?: string;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  variant = 'horizontal',
  theme = 'dark',
  subtitle = 'Congregate Living Health Facility',
  badge = 'CRM',
  className = '',
}) => {
  const [imageError, setImageError] = useState(false);

  // Size dimensions
  const dimensions = {
    sm: { img: 'w-7 h-7', text: 'text-sm', sub: 'text-[9px]', badge: 'text-[9px] px-1 py-0.2' },
    md: { img: 'w-9 h-9', text: 'text-base', sub: 'text-[10px]', badge: 'text-[10px] px-1.5 py-0.5' },
    lg: { img: 'w-12 h-12', text: 'text-lg', sub: 'text-xs', badge: 'text-[11px] px-2 py-0.5' },
    xl: { img: 'w-16 h-16', text: 'text-2xl', sub: 'text-sm', badge: 'text-xs px-2.5 py-1' },
  }[size];

  const isDark = theme === 'dark';

  // SVG Emblem fallback if image is loading or fails
  const EmblemFallback = (
    <svg 
      className={`${dimensions.img} shrink-0 drop-shadow-sm rounded-lg overflow-hidden`} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="aoPlumGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4A1525" />
          <stop offset="100%" stopColor="#260710" />
        </linearGradient>
        <linearGradient id="aoGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="50%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
        <linearGradient id="aoMintGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      
      {/* Background container */}
      <rect width="100" height="100" rx="20" fill="url(#aoPlumGrad)" stroke="rgba(245,158,11,0.3)" strokeWidth="2" />
      
      {/* Halo / Aura */}
      <circle cx="50" cy="30" r="14" stroke="url(#aoGoldGrad)" strokeWidth="3" strokeDasharray="3 2" fill="none" opacity="0.85" />
      
      {/* Angel Wings Left */}
      <path 
        d="M50 48 C42 35 25 32 18 42 C16 45 18 52 24 55 C20 57 20 63 26 65 C22 68 25 74 34 72 C40 70 47 62 50 56 Z" 
        fill="url(#aoGoldGrad)" 
        opacity="0.95"
      />
      
      {/* Angel Wings Right */}
      <path 
        d="M50 48 C58 35 75 32 82 42 C84 45 82 52 76 55 C80 57 80 63 74 65 C78 68 75 74 66 72 C60 70 53 62 50 56 Z" 
        fill="url(#aoGoldGrad)" 
        opacity="0.95"
      />
      
      {/* Center Sanctuary Oasis & Care Leaf */}
      <path 
        d="M50 36 C45 44 43 54 50 68 C57 54 55 44 50 36 Z" 
        fill="url(#aoMintGrad)" 
      />
      <circle cx="50" cy="46" r="3.5" fill="#FFFFFF" />
    </svg>
  );

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo Emblem Icon */}
      <div className="relative shrink-0 flex items-center justify-center">
        {!imageError ? (
          <img
            src="/assets/angels_oasis_logo.jpg"
            alt="Angels Oasis Logo"
            className={`${dimensions.img} rounded-lg object-cover ring-1 ring-amber-400/30 shadow-sm`}
            onError={() => setImageError(true)}
          />
        ) : (
          EmblemFallback
        )}
      </div>

      {/* Typography Brand Block */}
      {variant !== 'mark-only' && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-serif font-bold tracking-wide leading-tight ${dimensions.text} ${
                isDark ? 'text-white' : 'text-[#4A1525]'
              }`}
            >
              Angels Oasis
            </span>
            {badge && (
              <span
                className={`font-sans font-bold uppercase rounded tracking-wider border ${dimensions.badge} ${
                  isDark
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                }`}
              >
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <span
              className={`font-sans tracking-wider uppercase font-medium mt-0.5 leading-none ${dimensions.sub} ${
                isDark ? 'text-rose-200/75' : 'text-slate-500'
              }`}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
