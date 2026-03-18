/**
 * MobileMenu — Drawer menu replacing the old "More" tab.
 *
 * Lists secondary features: Mail, Chat, Search, Transport, Settings.
 * Each item opens the corresponding panel/modal and dismisses the menu.
 */

import { Mail, MessageSquare, Search, Train, Settings } from 'lucide-react';
import { useUiStore } from '../../store/ui-store';
import { useMailStore } from '../../store/mail-store';
import { Badge } from '../common';
import styles from './MobileMenu.module.css';

interface MenuItem {
  label: string;
  icon: typeof Mail;
  action: () => void;
  badge?: number;
}

export function MobileMenu() {
  const openRightPanel = useUiStore((s) => s.openRightPanel);
  const openModal = useUiStore((s) => s.openModal);
  const setMobileTab = useUiStore((s) => s.setMobileTab);
  const unreadCount = useMailStore((s) => s.unreadCount);

  const goTo = (fn: () => void) => {
    fn();
    setMobileTab('map');
  };

  const items: MenuItem[] = [
    { label: 'Mail', icon: Mail, action: () => goTo(() => openRightPanel('mail')), badge: unreadCount },
    { label: 'Chat', icon: MessageSquare, action: () => goTo(() => openRightPanel('search')) }, // placeholder — chat not yet a panel
    { label: 'Search', icon: Search, action: () => goTo(() => openRightPanel('search')) },
    { label: 'Transport', icon: Train, action: () => goTo(() => openRightPanel('transport')) },
    { label: 'Settings', icon: Settings, action: () => goTo(() => openModal('settings')) },
  ];

  return (
    <div className={styles.menu}>
      {items.map(({ label, icon: Icon, action, badge }) => (
        <button key={label} className={styles.item} onClick={action}>
          <Icon size={20} className={styles.icon} />
          <span className={styles.label}>{label}</span>
          {badge != null && badge > 0 && (
            <Badge variant="danger" className={styles.badge}>
              {badge > 9 ? '9+' : badge}
            </Badge>
          )}
        </button>
      ))}
    </div>
  );
}
