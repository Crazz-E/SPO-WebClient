/**
 * BottomNav — Mobile bottom navigation bar.
 *
 * Five tabs: Map / Chat / Build / Fav / More.
 * Active tab highlighted with gold accent.
 * Tapping the active tab dismisses (returns to map).
 * Chat badge from chat-store, Mail badge on More tab from mail-store.
 */

import { Map, MessageSquare, Hammer, Heart, MoreHorizontal } from 'lucide-react';
import { useUiStore, type MobileTab } from '../../store/ui-store';
import { useChatStore } from '../../store/chat-store';
import { useMailStore } from '../../store/mail-store';
import { Badge } from '../common';
import styles from './BottomNav.module.css';

const TABS: { id: MobileTab; label: string; icon: typeof Map }[] = [
  { id: 'map', label: 'Map', icon: Map },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'build', label: 'Build', icon: Hammer },
  { id: 'favorites', label: 'Fav', icon: Heart },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

export function BottomNav() {
  const activeTab = useUiStore((s) => s.mobileTab);
  const setTab = useUiStore((s) => s.setMobileTab);
  const closeRightPanel = useUiStore((s) => s.closeRightPanel);
  const unreadChat = useChatStore((s) => s.unreadChatCount);
  const unreadMail = useMailStore((s) => s.unreadCount);

  const handleTabClick = (id: MobileTab) => {
    // Tapping the active tab dismisses (returns to map)
    if (id === activeTab && id !== 'map') {
      setTab('map');
    } else {
      // Clear any open right panel when switching tabs
      closeRightPanel();
      setTab(id);
    }
  };

  // Determine badge count per tab
  const getBadge = (id: MobileTab): number => {
    if (id === 'chat') return unreadChat;
    if (id === 'more') return unreadMail;
    return 0;
  };

  return (
    <nav className={styles.nav} role="tablist">
      {TABS.map(({ id, label, icon: Icon }) => {
        const badge = getBadge(id);
        return (
          <button
            key={id}
            className={`${styles.tab} ${activeTab === id ? styles.active : ''}`}
            onClick={() => handleTabClick(id)}
            role="tab"
            aria-selected={activeTab === id}
            aria-label={label}
          >
            <span className={styles.iconWrap}>
              <Icon size={20} />
              {badge > 0 && (
                <Badge variant="danger" className={styles.badge}>
                  {badge > 9 ? '9+' : badge}
                </Badge>
              )}
            </span>
            <span className={styles.label}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
