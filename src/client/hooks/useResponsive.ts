/**
 * useResponsive — Breakpoint detection hook.
 * Returns current device tier based on viewport width.
 */

import { useState, useEffect } from 'react';

export type DeviceTier = 'mobile' | 'tablet' | 'desktop';

const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
} as const;

function getDeviceTier(): DeviceTier {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < BREAKPOINTS.tablet) return 'mobile';
  if (width < BREAKPOINTS.desktop) return 'tablet';
  return 'desktop';
}

export function useResponsive(): { device: DeviceTier; isMobile: boolean; isDesktop: boolean } {
  const [device, setDevice] = useState<DeviceTier>(getDeviceTier);

  useEffect(() => {
    const handleResize = () => {
      const next = getDeviceTier();
      setDevice((prev) => (prev !== next ? next : prev));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    device,
    isMobile: device === 'mobile',
    isDesktop: device === 'desktop',
  };
}
