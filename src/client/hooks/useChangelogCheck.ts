import { useEffect } from 'react';
import { APP_VERSION } from '../version';
import { useUiStore } from '../store/ui-store';

/** Opens the changelog modal if the user hasn't seen the current version yet. */
export function useChangelogCheck() {
  const openModal = useUiStore((s) => s.openModal);

  useEffect(() => {
    const lastSeen = localStorage.getItem('spo-last-seen-version');
    if (lastSeen !== APP_VERSION) {
      const timer = setTimeout(() => openModal('changelog'), 500);
      return () => clearTimeout(timer);
    }
  }, [openModal]);
}
