import { APP_VERSION, BUILD_DATE } from '../../version';
import { useUiStore } from '../../store/ui-store';
import styles from './VersionBadge.module.css';

export function VersionBadge() {
  const openModal = useUiStore((s) => s.openModal);

  return (
    <div
      className={styles.badge}
      onClick={() => openModal('changelog')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') openModal('changelog'); }}
    >
      <div>Alpha {APP_VERSION} ({BUILD_DATE})</div>
      <div>Created by Robin &ldquo;Crazz&rdquo; Aleman</div>
    </div>
  );
}
