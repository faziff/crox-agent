import React from 'react';

interface CroxLogoProps {
  showWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'light' | 'dark';
  className?: string;
}

/**
 * CROX geometric monogram combining intersecting execution paths and connected workflow nodes.
 */
export const CroxLogo: React.FC<CroxLogoProps> = ({
  showWordmark = true,
  size = 'md',
  variant = 'default',
  className = '',
}) => {
  const px = size === 'sm' ? 24 : size === 'lg' ? 36 : 28;
  const textClass =
    size === 'sm'
      ? 'text-[15px] font-bold tracking-[0.06em]'
      : size === 'lg'
        ? 'text-[22px] font-extrabold tracking-[0.06em]'
        : 'text-[18px] font-bold tracking-[0.06em]';

  const wordmarkColor =
    variant === 'light'
      ? 'text-white'
      : variant === 'dark'
        ? 'text-zinc-900'
        : 'text-zinc-900 dark:text-zinc-50';

  const containerFill = variant === 'dark' ? '#111114' : '#18181B';
  const strokeSecondary = '#FFFFFF';

  return (
    <span className={`inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0 ${className}`}>
      <svg
        width={px}
        height={px}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="36" height="36" rx="9" fill={containerFill} />
        {/* Left & Right interlocking X-node paths */}
        <path
          d="M11.5 11L18 18L11.5 25"
          stroke="#E11D48"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M24.5 11L18 18L24.5 25"
          stroke={strokeSecondary}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Subtle horizontal signal bridge */}
        <path d="M11.5 18H24.5" stroke="#52525B" strokeWidth="1.25" strokeDasharray="2 2" />
        {/* Connected workflow nodes */}
        <circle cx="11.5" cy="11" r="2.3" fill="#E11D48" />
        <circle cx="11.5" cy="25" r="2.3" fill="#E11D48" />
        <circle cx="24.5" cy="11" r="2.3" fill={strokeSecondary} />
        <circle cx="24.5" cy="25" r="2.3" fill={strokeSecondary} />
        <circle cx="18" cy="18" r="2.7" fill="#18181B" stroke="#E11D48" strokeWidth="1.8" />
      </svg>
      {showWordmark && (
        <span className={`font-display uppercase ${wordmarkColor} ${textClass}`}>CROX</span>
      )}
    </span>
  );
};

interface CroxLoaderProps {
  label?: string;
  size?: 'sm' | 'md';
}

/**
 * Branded geometric loading indicator for application initialization & heavy workspace transitions.
 */
export const CroxLoader: React.FC<CroxLoaderProps> = ({
  label = 'Loading workspace',
  size = 'md',
}) => {
  const px = size === 'sm' ? 28 : 42;
  return (
    <div className="flex flex-col items-center justify-center gap-3 select-none" role="status" aria-live="polite">
      <svg
        width={px}
        height={px}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="animate-pulse"
        aria-hidden="true"
      >
        <rect width="36" height="36" rx="9" fill="#18181B" />
        <path
          d="M11.5 11L18 18L11.5 25"
          stroke="#E11D48"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M24.5 11L18 18L24.5 25"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="11.5" cy="11" r="2.2" fill="#E11D48" />
        <circle cx="11.5" cy="25" r="2.2" fill="#E11D48" />
        <circle cx="24.5" cy="11" r="2.2" fill="#FFFFFF" />
        <circle cx="24.5" cy="25" r="2.2" fill="#FFFFFF" />
        <circle cx="18" cy="18" r="2.6" fill="#E11D48" />
      </svg>
      {label && (
        <span className="text-xs font-medium tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
      )}
    </div>
  );
};
