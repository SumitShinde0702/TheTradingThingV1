import React, { useMemo, useState } from 'react';

interface ModelLogoProps {
  model: string;
  size?: number;
  color?: string;
}

type KnownLogoConfig = {
  id: string;
  matches: string[];
  src: string;
  alt: string;
  fallbackText: string;
  scale?: number;
  filter?: string;
  accent?: string;
  background?: string;
  borderColor?: string;
  boxShadow?: string;
};

const DEFAULT_COLOR = '#848E9C';

const KNOWN_LOGOS: KnownLogoConfig[] = [
  {
    id: 'openai',
    matches: ['openai', 'gpt-oss', 'gpt'],
    src: '/assets/logos/OpenAI_logo.svg',
    alt: 'OpenAI',
    fallbackText: 'OA',
    scale: 0.72,
    filter: 'none',
    accent: '#9AA8FF',
    background:
      'linear-gradient(140deg, rgba(20, 24, 38, 0.92) 0%, rgba(12, 16, 28, 0.78) 100%)',
    borderColor: 'rgba(138, 158, 255, 0.55)',
    boxShadow: '0 8px 18px rgba(66, 93, 255, 0.22)',
  },
  {
    id: 'qwen',
    matches: ['qwen', 'qwen3'],
    src: '/assets/logos/Qwen_logo.svg',
    alt: 'Qwen',
    fallbackText: 'QW',
    scale: 0.78,
    filter: 'none',
    accent: '#3CD4FF',
    background:
      'linear-gradient(135deg, rgba(15, 38, 68, 0.95) 0%, rgba(6, 18, 35, 0.85) 100%)',
    borderColor: 'rgba(59, 196, 255, 0.55)',
    boxShadow: '0 10px 24px rgba(24, 128, 255, 0.25)',
  },
];

// Converts a short or long hex color to rgba so we can add transparency accents.
function hexToRgba(color: string, alpha = 1): string {
  if (!color) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  const trimmed = color.trim();

  if (trimmed.startsWith('rgba')) {
    return trimmed;
  }

  if (trimmed.startsWith('rgb(')) {
    const values = trimmed.match(/\d+/g);
    if (!values) {
      return `rgba(255, 255, 255, ${alpha})`;
    }
    const [r, g, b] = values.map(Number);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  let hex = trimmed.replace('#', '');

  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  if (hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const originalAlpha = parseInt(hex.slice(6, 8), 16) / 255;
    return `rgba(${r}, ${g}, ${b}, ${Math.min(1, originalAlpha * alpha)})`;
  }

  if (hex.length !== 6) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const ModelLogo: React.FC<ModelLogoProps> = ({
  model,
  size = 24,
  color = DEFAULT_COLOR,
}) => {
  const [loadFailed, setLoadFailed] = useState(false);

  const config = useMemo(() => {
    const normalized = model.toLowerCase();
    return KNOWN_LOGOS.find((entry) =>
      entry.matches.some((keyword) => normalized.includes(keyword))
    );
  }, [model]);

  const accentColor = config?.accent ?? color ?? DEFAULT_COLOR;

  const containerStyle = useMemo(() => ({
    width: size,
    height: size,
    borderRadius: '50%',
    background: config ? '#FFFFFF' : 
      `radial-gradient(circle at 30% 25%, ${hexToRgba(
        accentColor,
        0.28
      )} 0%, rgba(6, 9, 20, 0.85) 70%, rgba(4, 6, 14, 0.95) 100%)`,
    border: `1px solid ${
      config?.borderColor ?? hexToRgba(accentColor, 0.45)
    }`,
    boxShadow:
      config?.boxShadow ?? `0 8px 20px ${hexToRgba(accentColor, 0.22)}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    padding: config ? '2px' : '0',
  }), [size, config, accentColor]);

  const fallbackText =
    config?.fallbackText ?? (model.slice(0, 2).toUpperCase() || 'AI');

  const textScale = Math.max(0.4, Math.min(0.68, (fallbackText.length <= 2 ? 0.58 : 0.48)));

  if (!config || loadFailed) {
    return (
      <div style={containerStyle}>
        <span
          style={{
            color: '#FFFFFF',
            fontSize: `${size * textScale}px`,
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          {fallbackText}
        </span>
      </div>
    );
  }

  const imageScale = config.scale ?? 0.68;

  return (
    <div style={containerStyle}>
      <img
        src={config.src}
        alt={config.alt}
        style={{
          width: size * imageScale,
          height: size * imageScale,
          objectFit: 'contain',
          filter: config.filter,
          display: 'block',
        }}
        onError={() => setLoadFailed(true)}
      />
    </div>
  );
};

