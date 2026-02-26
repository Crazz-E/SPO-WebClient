/**
 * BottomNav — Mobile bottom navigation bar.
 *
 * Five tabs: Map / Empire / Build / Mail / More.
 * Active tab highlighted with gold accent. Unread badge on Mail.
 */

import { Map, Briefcase, Hammer, Mail, MoreHorizontal } from 'lucide-react';
import { useUiStore, type MobileTab } from '../../store/ui-store';
import { useMailStore } from '../../store/mail-store';
import { Badge } from '../common';
import styles from './BottomNav.module.css';

const TABS: { id: MobileTab; label: string; icon: typeof Map }[] = [
  { id: 'map', label: 'Map', icon: Map },
  { id: 'empire', label: 'Empire', icon: Briefcase },
  { id: 'build', label: 'Build', icon: Hammer },
  { id: 'mail', label: 'Mail', icon: Mail },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

export function BottomNav() {
  const activeTab = useUiStore((s) => s.mobileTab);
  const setTab = useUiStore((s) => s.setMobileTab);
  const unreadCount = useMailStore((s) => s.unreadCount);

  return (
    <nav className={styles.nav} role="tablist">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={`${styles.tab} ${activeTab === id ? styles.active : ''}`}
          onClick={() => setTab(id)}
          role="tab"
          aria-selected={activeTab === id}
          aria-label={label}
        >
          <span className={styles.iconWrap}>
            <Icon size={20} />
            {id === 'mail' && unreadCount > 0 && (
              <Badge variant="danger" className={styles.badge}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </span>
          <span className={styles.label}>{label}</span>
        </button>
      ))}
    </nav>
  );
}
