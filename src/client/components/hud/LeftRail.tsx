/**
 * LeftRail — Vertical action button stack on the left edge.
 *
 * Bottom-left corner, z-200.
 * Primary: Build, Search, Empire
 * Secondary: Road, Demolish
 * Tertiary: Mail (with badge), Settings
 */

import { useState } from 'react';
import { Hammer, Search, User, Mail, Settings, Globe, Heart, Layers, Landmark } from 'lucide-react';
import { IconButton } from '../common';
import { ZoneIcon } from '../icons/ZoneIcon';
import { RoadIcon, BuildRoadIcon, RemoveRoadIcon } from '../icons/RoadIcons';
import { useUiStore } from '../../store/ui-store';
import { useGameStore } from '../../store/game-store';
import { useMailStore } from '../../store/mail-store';
import { useClient } from '../../context';
import styles from './LeftRail.module.css';

export function LeftRail() {
  const [roadExpanded, setRoadExpanded] = useState(false);
  const openModal = useUiStore((s) => s.openModal);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const rightPanel = useUiStore((s) => s.rightPanel);
  const leftPanel = useUiStore((s) => s.leftPanel);
  const unreadCount = useMailStore((s) => s.unreadCount);
  const isRoadBuildingMode = useGameStore((s) => s.isRoadBuildingMode);
  const isRoadDemolishMode = useGameStore((s) => s.isRoadDemolishMode);
  const isZonePaintingMode = useGameStore((s) => s.isZonePaintingMode);
  const isPublicOfficeRole = useGameStore((s) => s.isPublicOfficeRole);
  const isCityZonesEnabled = useGameStore((s) => s.isCityZonesEnabled);
  const activeOverlay = useGameStore((s) => s.activeOverlay);
  const client = useClient();
  const roadActive = isRoadBuildingMode || isRoadDemolishMode;

  const railClass = [styles.rail, leftPanel ? styles.shifted : ''].filter(Boolean).join(' ');

  return (
    <nav className={railClass} aria-label="Game actions">
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
          icon={<User size={22} />}
          label="Profile (E)"
          size="lg"
          variant="glass"
          active={leftPanel === 'empire'}
          onClick={() => toggleLeftPanel('empire')}
        />
      </div>

      <div className={styles.divider} />

      {/* Secondary — tools */}
      <div className={styles.group}>
        <div className={styles.roadRow}>
          <IconButton
            icon={<RoadIcon size={20} />}
            label="Road"
            size="lg"
            variant="glass"
            active={roadActive || roadExpanded}
            onClick={() => setRoadExpanded((v) => !v)}
          />
          {roadExpanded && (
            <div className={styles.roadSub}>
              <IconButton
                icon={<BuildRoadIcon size={20} />}
                label="Build Road"
                size="lg"
                variant="glass"
                active={isRoadBuildingMode}
                onClick={() => { client.onBuildRoad(); setRoadExpanded(false); }}
              />
              <IconButton
                icon={<RemoveRoadIcon size={20} />}
                label="Demolish Road"
                size="lg"
                variant="glass"
                active={isRoadDemolishMode}
                onClick={() => { client.onDemolishRoad(); setRoadExpanded(false); }}
              />
            </div>
          )}
        </div>
        {isPublicOfficeRole && (
          <IconButton
            icon={<ZoneIcon size={20} />}
            label="Zone Painting"
            size="lg"
            variant="glass"
            active={isZonePaintingMode}
            onClick={() => isZonePaintingMode ? client.onCancelZonePainting() : openModal('zonePicker')}
          />
        )}
        <IconButton
          icon={<Landmark size={20} />}
          label="Capitol"
          size="lg"
          variant="glass"
          onClick={() => client.onOpenCapitol()}
        />
        <IconButton
          icon={<Layers size={20} />}
          label="Overlays"
          size="lg"
          variant="glass"
          active={isCityZonesEnabled || activeOverlay !== null || leftPanel === 'overlays'}
          onClick={() => toggleLeftPanel('overlays')}
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

      <div className={styles.divider} />

      {/* Quaternary — panels & navigation */}
      <div className={styles.group}>
        <IconButton
          icon={<Heart size={20} />}
          label="Facilities"
          size="lg"
          variant="glass"
          active={leftPanel === 'facilities'}
          onClick={() => toggleLeftPanel('facilities')}
        />
        <IconButton
          icon={<Globe size={20} />}
          label="Switch Server"
          size="lg"
          variant="glass"
          onClick={() => client.onSwitchServer()}
        />
      </div>
    </nav>
  );
}
