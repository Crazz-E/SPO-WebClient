/**
 * BuildingInspector — Figma-like property sheet for building details.
 *
 * Slides in via RightPanel when a building is focused.
 * Structure:
 * - Toolbar: refresh + close buttons (top-right)
 * - Header: building name, owner, visual class
 * - QuickStats: revenue, profit, workers, efficiency
 * - TabNavigation: driven by server-sent tab config
 * - Tab content: property rows, supply/product accordions
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Edit3, RefreshCw, X, Check } from 'lucide-react';
import { useBuildingStore } from '../../store/building-store';
import { usePoliticsStore } from '../../store/politics-store';
import { useGameStore } from '../../store/game-store';
import { useUiStore } from '../../store';
import { useClient } from '../../context';
import { isCivicBuilding } from '@/shared/building-details/civic-buildings';
import type { BuildingDetailsTab, BuildingPropertyValue } from '@/shared/types';
import { IconButton, Skeleton } from '../common';
import { QuickStats } from './QuickStats';
import { InspectorTabs } from './InspectorTabs';
import { PropertyGroup } from './PropertyGroup';
import { TownsTab } from '../politics/TownsTab';
import { MinistriesTab } from '../politics/MinistriesTab';
import { EconomyTab } from '../politics/EconomyTab';
import { ElectionsTab } from '../politics/ElectionsTab';
import { buildValueMap, getNum } from '../politics/capitol-utils';
import styles from './BuildingInspector.module.css';

/** Auto-refresh interval for open building panel (ms). */
const AUTO_REFRESH_INTERVAL = 30_000;

/** Group IDs that have rich civic tab components (replaces generic PropertyGroup). */
const CIVIC_TAB_OVERRIDES = new Set([
  'capitolTowns',
  'ministeries',
  'townJobs',
  'votes',
]);

/** Server-sent tabs hidden from the pill bar (consumed by merged components). */
const HIDDEN_CIVIC_TABS = new Set(['townRes']);

/** Client-side tab label overrides for semantic clarity. */
const CIVIC_TAB_LABELS: Record<string, string> = {
  'townJobs': 'Economy',
  'votes': 'Elections',
};

interface BuildingInspectorProps {
  /** Hide the built-in header (used when wrapped in a modal that already shows the name). */
  hideHeader?: boolean;
}

export function BuildingInspector({ hideHeader }: BuildingInspectorProps = {}) {
  const focusedBuilding = useBuildingStore((s) => s.focusedBuilding);
  const details = useBuildingStore((s) => s.details);
  const isLoading = useBuildingStore((s) => s.isLoading);
  const currentTab = useBuildingStore((s) => s.currentTab);
  const setCurrentTab = useBuildingStore((s) => s.setCurrentTab);
  const isOwner = useBuildingStore((s) => s.isOwner);
  const closeRightPanel = useUiStore((s) => s.closeRightPanel);
  const client = useClient();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  const isCivic = details ? isCivicBuilding(details.visualClass) : false;
  const username = useGameStore((s) => s.username);
  const holdsOffice = useGameStore((s) => s.isPublicOfficeRole);

  // For civic buildings, hide merged tabs and relabel for semantic clarity
  const tabs = useMemo(() => {
    if (!details) return [];
    if (!isCivic) return details.tabs;
    return details.tabs
      .filter((t) => !HIDDEN_CIVIC_TABS.has(t.id))
      .map((t) => CIVIC_TAB_LABELS[t.id] ? { ...t, name: CIVIC_TAB_LABELS[t.id] } : t);
  }, [details, isCivic]);

  // Derive campaign state (needed for Ratings tab)
  // Primary: PoliticsData.campaigns (works for both Capitol and Town Hall)
  const politicsCampaigns = usePoliticsStore((s) => s.data?.campaigns);
  const isCandidateFromPolitics = (politicsCampaigns ?? []).some(
    (c) => c.candidateName.toLowerCase() === (username ?? '').toLowerCase()
  );
  // Fallback: votes group (only populated for Capitol)
  const votesGroup = details?.groups['votes'] ?? [];
  const valueMap = buildValueMap(votesGroup);
  const candidateCount = getNum(valueMap, 'CampaignCount');
  const isCandidateFromVotes = Array.from({ length: candidateCount }, (_, i) =>
    valueMap.get(`Candidate${i}`) ?? ''
  ).some((name) => name.toLowerCase() === (username ?? '').toLowerCase());
  const isCandidate = isCandidateFromPolitics || isCandidateFromVotes;

  // Fetch politics data (ratings, campaigns) when a civic building is opened
  // townName may be empty for Capitol buildings — still fetch (server uses coords)
  const politicsTownName = usePoliticsStore((s) => s.townName);
  useEffect(() => {
    if (isCivic && details) {
      client.onRequestPoliticsData(politicsTownName, details.x, details.y);
    }
  }, [isCivic, details?.x, details?.y, politicsTownName, client]);

  const handleRefresh = useCallback(() => {
    if (details) client.onRefreshBuilding(details.x, details.y);
  }, [details?.x, details?.y, client]);

  const handleClose = useCallback(() => {
    closeRightPanel();
  }, [closeRightPanel]);

  const handleStartRename = useCallback(() => {
    setNewName(details?.buildingName ?? '');
    setIsRenaming(true);
  }, [details]);

  const handleConfirmRename = useCallback(() => {
    if (newName.trim() && details) {
      client.onRenameBuilding(details.x, details.y, newName.trim());
    }
    setIsRenaming(false);
  }, [details?.x, details?.y, newName, client]);

  const handleCancelRename = useCallback(() => {
    setIsRenaming(false);
  }, []);

  // Auto-refresh building details while panel is open (prevents stale QuickStats)
  // Pauses when browser tab is hidden to avoid wasting resources
  const refreshTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => {
    if (!details) return;
    const x = details.x;
    const y = details.y;

    const startTimer = () => {
      clearInterval(refreshTimer.current);
      refreshTimer.current = setInterval(() => {
        client.onRefreshBuilding(x, y);
      }, AUTO_REFRESH_INTERVAL);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(refreshTimer.current);
      } else {
        startTimer();
      }
    };

    startTimer();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(refreshTimer.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [details?.x, details?.y, client]);

  // Loading state
  if (isLoading || (!details && focusedBuilding)) {
    return (
      <div className={styles.inspector}>
        <div className={styles.loadingState}>
          <Skeleton width="60%" height="20px" />
          <Skeleton width="40%" height="14px" />
          <Skeleton width="100%" height="60px" />
          <Skeleton width="100%" height="200px" />
        </div>
      </div>
    );
  }

  // No building selected
  if (!details || !focusedBuilding) {
    return (
      <div className={styles.inspector}>
        <div className={styles.empty}>
          Click a building on the map to inspect it
        </div>
      </div>
    );
  }

  // Find active tab's properties (filter out Name — shown in header instead)
  const activeGroupId = tabs.find((t) => t.id === currentTab)?.id ?? tabs[0]?.id ?? '';
  const properties = (details.groups[activeGroupId] ?? []).filter((p) => p.name !== 'Name');

  return (
    <div className={styles.inspector}>
      {/* Toolbar — refresh + close (top-right) */}
      <div className={styles.toolbar}>
        <IconButton
          icon={<RefreshCw size={16} />}
          label="Refresh"
          size="sm"
          variant="ghost"
          onClick={handleRefresh}
        />
        <IconButton
          icon={<X size={16} />}
          label="Close"
          size="sm"
          variant="ghost"
          onClick={handleClose}
        />
      </div>

      {/* Header (hidden when inside modal — modal provides its own title) */}
      {!hideHeader && (
        <div className={`${styles.header} ${styles.stagger0} ${isOwner ? styles.ownerBorder : styles.rivalBorder}`}>
          <div className={styles.nameRow}>
            {isRenaming ? (
              <>
                <input
                  type="text"
                  className={styles.renameInput}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmRename();
                    if (e.key === 'Escape') handleCancelRename();
                  }}
                  autoFocus
                />
                <IconButton
                  icon={<Check size={14} />}
                  label="Confirm rename"
                  size="sm"
                  variant="ghost"
                  onClick={handleConfirmRename}
                />
                <IconButton
                  icon={<X size={14} />}
                  label="Cancel rename"
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelRename}
                />
              </>
            ) : (
              <>
                <h3 className={styles.buildingName}>{details.buildingName}</h3>
                {isOwner && (
                  <IconButton
                    icon={<Edit3 size={14} />}
                    label="Rename building"
                    size="sm"
                    variant="ghost"
                    onClick={handleStartRename}
                  />
                )}
              </>
            )}
          </div>
          <div className={styles.headerMeta}>
            <span className={styles.ownerName}>{details.ownerName}</span>
            {(details.x !== undefined && details.y !== undefined) && (
              <span className={styles.visualClass}>{details.x}, {details.y}</span>
            )}
          </div>
        </div>
      )}

      {/* Quick stats from focus info */}
      <div className={styles.stagger1}>
        <QuickStats focus={focusedBuilding} />
      </div>

      {/* Tab navigation */}
      {tabs.length > 0 && (
        <div className={styles.stagger2}>
          <InspectorTabs
            tabs={tabs}
            activeTab={currentTab || activeGroupId}
            onTabChange={setCurrentTab}
          />
        </div>
      )}

      {/* Tab content — scrollable */}
      <div className={`${styles.content} ${styles.stagger3}`}>
        <CivicOrGenericTab
          isCivic={isCivic}
          activeGroupId={activeGroupId}
          properties={properties}
          buildingX={details.x}
          buildingY={details.y}
          isCandidate={isCandidate}
          holdsOffice={holdsOffice}
          tabs={details.tabs}
          details={details}
        />
      </div>
    </div>
  );
}

/** Renders a rich civic tab component or falls back to generic PropertyGroup. */
function CivicOrGenericTab({
  isCivic,
  activeGroupId,
  properties,
  buildingX,
  buildingY,
  isCandidate,
  holdsOffice,
  tabs,
  details,
}: {
  isCivic: boolean;
  activeGroupId: string;
  properties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
  isCandidate: boolean;
  holdsOffice: boolean;
  tabs: BuildingDetailsTab[];
  details: { groups: Record<string, BuildingPropertyValue[]> };
}) {
  if (!isCivic || !CIVIC_TAB_OVERRIDES.has(activeGroupId)) {
    return <PropertyGroup properties={properties} buildingX={buildingX} buildingY={buildingY} />;
  }

  switch (activeGroupId) {
    case 'capitolTowns':
      return <TownsTab properties={properties} buildingX={buildingX} buildingY={buildingY} />;
    case 'ministeries':
      return <MinistriesTab properties={properties} buildingX={buildingX} buildingY={buildingY} />;
    case 'townJobs': {
      const isCapitol = tabs.some(t => t.handlerName === 'capitolGeneral');
      const resProperties = details.groups['townRes'] ?? [];
      return <EconomyTab jobProperties={properties} resProperties={resProperties} buildingX={buildingX} buildingY={buildingY} isCapitol={isCapitol} />;
    }
    case 'votes':
      return <ElectionsTab voteProperties={properties} buildingX={buildingX} buildingY={buildingY} isCandidate={isCandidate} holdsOffice={holdsOffice} />;
    default:
      return <PropertyGroup properties={properties} buildingX={buildingX} buildingY={buildingY} />;
  }
}
