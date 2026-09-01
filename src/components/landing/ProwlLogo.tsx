// ProwlLogo — animated SVG logo with glow effect
'use client';

interface ProwlLogoProps {
  size?: number;
  className?: string;
}

export default function ProwlLogo({ size = 18, className = 'text-white' }: ProwlLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
    >
      {/* Paw print — 3 toes + pad */}
      {/* Center pad */}
      <ellipse cx="50" cy="62" rx="18" ry="15" />
      {/* Left toe */}
      <ellipse cx="28" cy="38" rx="10" ry="12" transform="rotate(-15 28 38)" />
      {/* Center toe */}
      <ellipse cx="50" cy="30" rx="10" ry="13" />
      {/* Right toe */}
      <ellipse cx="72" cy="38" rx="10" ry="12" transform="rotate(15 72 38)" />
    </svg>
  );
}
