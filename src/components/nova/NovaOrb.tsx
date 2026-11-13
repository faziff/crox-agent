import React from 'react';

export type NovaState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'generating'
  | 'executing'
  | 'completed'
  | 'waiting_approval'
  | 'error';

interface NovaOrbProps {
  state?: NovaState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const STATE_COLORS: Record<NovaState, { outer: string; core: string; ring: string }> = {
  idle: { outer: '#18181B', core: '#DC2626', ring: 'rgba(220, 38, 38, 0.25)' },
  listening: { outer: '#18181B', core: '#EF4444', ring: 'rgba(239, 68, 68, 0.45)' },
  thinking: { outer: '#18181B', core: '#F59E0B', ring: 'rgba(245, 158, 11, 0.45)' },
  generating: { outer: '#18181B', core: '#DC2626', ring: 'rgba(220, 38, 38, 0.55)' },
  executing: { outer: '#18181B', core: '#2563EB', ring: 'rgba(37, 99, 235, 0.45)' },
  completed: { outer: '#18181B', core: '#16A34A', ring: 'rgba(22, 163, 74, 0.4)' },
  waiting_approval: { outer: '#18181B', core: '#D97706', ring: 'rgba(217, 119, 6, 0.4)' },
  error: { outer: '#450A0A', core: '#EF4444', ring: 'rgba(239, 68, 68, 0.55)' },
};

/**
 * NOVA — Abstract floating oval/orb AI companion without a human face.
 */
export const NovaOrb: React.FC<NovaOrbProps> = ({ state = 'idle', size = 'md', className = '' }) => {
  const palette = STATE_COLORS[state];
  const dim = size === 'sm' ? 32 : size === 'lg' ? 52 : 42;
  const height = Math.round(dim * 1.12);
  const animClass =
    state === 'thinking' || state === 'generating' || state === 'executing'
      ? 'animate-nova-think'
      : 'animate-nova-breathe';

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${animClass} ${className}`}
      style={{ width: dim, height }}
      aria-label={`NOVA state: ${state}`}
    >
      <svg width={dim} height={height} viewBox="0 0 44 50" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Outer soft aura */}
        <ellipse cx="22" cy="25" rx="20" ry="23" fill={palette.ring} />
        {/* Sleek dark oval shell */}
        <ellipse
          cx="22"
          cy="25"
          rx="16.5"
          ry="19.5"
          fill={palette.outer}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1.2"
        />
        {/* Abstract acoustic/resonance waveform band (no human face) */}
        <ellipse cx="22" cy="25" rx="10" ry="11.5" stroke={palette.core} strokeWidth="1.5" strokeOpacity="0.65" />
        <rect x="14" y="23.5" width="3.5" height="3" rx="1.5" fill={palette.core} />
        <rect x="19.5" y="20.5" width="5" height="9" rx="2.5" fill="#FFFFFF" />
        <rect x="26.5" y="23.5" width="3.5" height="3" rx="1.5" fill={palette.core} />
      </svg>
    </span>
  );
};
