/**
 * MapLoadingScreen — Full-viewport overlay shown while map resources load
 * after a company is selected. Shows rotating funny quotes and an orbiting
 * spinner, then fades out once data is ready.
 */

import { useState, useEffect } from 'react';
import { useGameStore } from '../../store/game-store';
import { LoginBackground } from '../login/LoginBackground';
import { useRotatingQuote } from '../../hooks/useRotatingQuote';
import styles from './MapLoadingScreen.module.css';
import spinnerStyles from './LoadingSpinner.module.css';

export function MapLoadingScreen() {
  const { active, progress } = useGameStore((s) => s.mapLoading);
  const [exiting, setExiting] = useState(false);
  const [unmounted, setUnmounted] = useState(false);
  const quote = useRotatingQuote('map', 2500);

  useEffect(() => {
    if (!active && !exiting && progress > 0) {
      setExiting(true);
      const t = setTimeout(() => setUnmounted(true), 400);
      return () => clearTimeout(t);
    }
  }, [active, exiting, progress]);

  // Not yet active and never been active — nothing to show
  if (unmounted || (!active && progress === 0 && !exiting)) return null;

  return (
    <div className={`${styles.root} ${exiting ? styles.exiting : ''}`}>
      <LoginBackground />
      <div className={styles.content}>
        <h2 className={styles.logo}>Starpeace Online</h2>

        <div className={spinnerStyles.spinner}>
          <div className={spinnerStyles.dot} />
          <div className={spinnerStyles.dot} />
          <div className={spinnerStyles.dot} />
        </div>

        <div className={spinnerStyles.quoteWrap}>
          <p className={spinnerStyles.quote} key={quote}>{quote}</p>
        </div>
      </div>
    </div>
  );
}
