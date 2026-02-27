/**
 * LeftRail — Vertical action button stack on the left edge.
 *
 * Bottom-left corner, z-200.
 * Primary: Build, Search, Empire
 * Secondary: Road, Demolish
 * Tertiary: Mail (with badge), Settings
 */

import { Hammer, Search, Briefcase, Route, Trash2, Mail, Settings } from 'lucide-react';
import { IconButton } from '../common';
import { useUiStore } from '../../store/ui-store';
import { useGameStore } from '../../store/game-store';
import { useMailStore } from '../../store/mail-store';
import { useClient } from '../../context';
import styles from './LeftRail.module.css';

export function LeftRail() {
  const openModal = useUiStore((s) => s.openModal);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const rightPanel = useUiStore((s) => s.rightPanel);
  const leftPanel = useUiStore((s) => s.leftPanel);
  const unreadCount = useMailStore((s) => s.unreadCount);
  const isRoadBuildingMode = useGameStore((s) => s.isRoadBuildingMode);
  const isRoadDemolishMode = useGameStore((s) => s.isRoadDemolishMode);

  const client = useClient();

  return (
    <nav className={styles.rail} aria-label="Game actions">
      {/* Primary actions */}
      <div className={styles.group}>
        <IconButton
          icon={<Hammer size={22} />}
          label="Build (B)"
          size="lg"
          variant="glass"
          onClick={() => openModal('buildMenu')}
        />
        <IconButton
          icon={<Search size={22} />}
          label="Search"
          size="lg"
          variant="glass"
          active={rightPanel === 'search'}
          onClick={() => toggleRightPanel('search')}
        />
        <IconButton
          icon={<Briefcase size={22} />}
          label="Empire (E)"
          size="lg"
          variant="glass"
          active={leftPanel === 'empire'}
          onClick={() => toggleLeftPanel('empire')}
        />
      </div>

      <div className={styles.divider} />

      {/* Secondary — tools */}
      <div className={styles.group}>
        <IconButton
          icon={<Route size={20} />}
          label="Build Road"
          size="lg"
          variant="glass"
          active={isRoadBuildingMode}
          onClick={() => client.onBuildRoad()}
        />
        <IconButton
          icon={<Trash2 size={20} />}
          label="Demolish"
          size="lg"
          variant="glass"
          active={isRoadDemolishMode}
          onClick={() => client.onDemolishRoad()}
        />
      </div>

      <div className={styles.divider} />

      {/* Tertiary — communication & settings */}
      <div className={styles.group}>
        <IconButton
          icon={<Mail size={20} />}
          label="Mail (M)"
          size="lg"
          variant="glass"
          active={rightPanel === 'mail'}
          badge={unreadCount > 0 ? unreadCount : undefined}
          onClick={() => toggleRightPanel('mail')}
        />
        <IconButton
          icon={<Settings size={20} />}
          label="Settings"
          size="lg"
          variant="glass"
          onClick={() => openModal('settings')}
        />
      </div>
    </nav>
  );
}
