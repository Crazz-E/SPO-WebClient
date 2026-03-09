/**
 * ChangelogModal — "What's New" release notes shown after updates.
 *
 * Auto-opens on first login after a version change (via useChangelogCheck hook).
 * Also accessible by clicking the VersionBadge.
 */

import { X } from 'lucide-react';
import { useUiStore } from '../../store/ui-store';
import { APP_VERSION } from '../../version';
import changelogData from '../../changelog-data.json';
import type { ChangelogRelease } from '../../changelog-types';
import styles from './ChangelogModal.module.css';

const releases = changelogData as ChangelogRelease[];

const DOT_CLASS: Record<string, string> = {
  added: styles.dotAdded,
  fixed: styles.dotFixed,
  changed: styles.dotChanged,
};

export function ChangelogModal() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);

  if (modal !== 'changelog') return null;

  const handleClose = () => {
    localStorage.setItem('spo-last-seen-version', APP_VERSION);
    closeModal();
  };

  return (
    <>
      <div className={styles.backdrop} onClick={handleClose} />
      <div className={styles.modal} role="dialog" aria-label="What's New">
        <div className={styles.header}>
          <h2 className={styles.title}>What&apos;s New</h2>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className={styles.content}>
          {releases.map((release) => (
            <section key={release.version} className={styles.release}>
              <h3 className={styles.versionHeader}>
                <span className={styles.versionTag}>v{release.version}</span>
                <span className={styles.date}>{release.date}</span>
              </h3>
              <ul className={styles.entries}>
                {release.entries.map((entry, i) => (
                  <li key={i} className={styles.entry}>
                    <span className={`${styles.dot} ${DOT_CLASS[entry.type] ?? ''}`} />
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
