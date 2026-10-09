import React from 'react';

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
  className = '',
}) => {
  const isDark = theme === 'dark';
  const imageClass = {
    sm: variant === 'mark-only' ? 'h-8 w-8' : 'w-[150px]',
    md: variant === 'mark-only' ? 'h-10 w-10' : 'w-[190px]',
    lg: variant === 'mark-only' ? 'h-14 w-14' : 'w-[240px]',
    xl: variant === 'mark-only' ? 'h-16 w-16' : 'w-[280px]',
  }[size];
  const src = variant === 'mark-only'
    ? '/brand/angels-oasis-mark-mauve-deep.svg'
    : isDark
      ? '/brand/angels-oasis-logo-reversed.svg'
      : '/brand/angels-oasis-logo-positive.svg';

  return (
    <div className={className} aria-label="Angels Oasis">
      <img src={src} alt="Angels Oasis" className={`${imageClass} h-auto max-w-full object-contain`} />
    </div>
  );
};
