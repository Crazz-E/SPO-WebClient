/**
 * BuildingInspector — Figma-like property sheet for building details.
 *
 * Slides in via RightPanel when a building is focused.
 * For civic buildings (Capitol/TownHall), uses consolidated tabs:
 *   Overview | Administration | Demographics | Elections
 * For other buildings, uses the server-sent pill grid tabs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Edit3, RefreshCw, X, Check } from 'lucide-react';
import { useBuildingStore } from '../../store/building-store';
import { usePoliticsStore } from '../../store/politics-store';
import { useGameStore } from '../../store/game-store';
import { useUiStore } from '../../store';
import { useClient } from '../../context';
import { isLazyTab } from '../../handlers/building-action-handler';
import { isCivicBuilding } from '@/shared/building-details/civic-buildings';
import type { BuildingDetailsTab, BuildingPropertyValue } from '@/shared/types';
import { IconButton, Skeleton, TabBar } from '../common';
import { QuickStats } from './QuickStats';
import { InspectorTabs } from './InspectorTabs';
import { PropertyGroup } from './PropertyGroup';
import {
  OverviewSection,
  AdministrationSection,
  DemographicsSection,
  ElectionsSection,
  buildCivicTabs,
  getGeneralGroupId,
} from '../politics';
import { buildValueMap, getNum } from '../politics/capitol-utils';
import type { CivicTabId } from '../politics/CivicTabConfig';
import styles from './BuildingInspector.module.css';

/** Auto-refresh interval for open building panel (ms). */
const AUTO_REFRESH_INTERVAL = 30_000;

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
  const connectionStatus = useGameStore((s) => s.status);
  const isConnected = connectionStatus === 'connected';

  // Build civic tabs from server groups (only for civic buildings)
  const civicTabs = useMemo(() => {
    if (!details || !isCivic) return [];
    return buildCivicTabs(details.tabs);
  }, [details, isCivic]);

  // For non-civic buildings, use server-sent tabs directly
  const standardTabs = details?.tabs ?? [];

  // Derive campaign state (needed for Elections tab) — memoized to avoid
  // recomputing buildValueMap on every unrelated details change.
  const politicsCampaigns = usePoliticsStore((s) => s.data?.campaigns);
  const isCandidateFromPolitics = (politicsCampaigns ?? []).some(
    (c) => c.candidateName.toLowerCase() === (username ?? '').toLowerCase()
  );
  const votesGroup = details?.groups['votes'];
  const valueMap = useMemo(() => buildValueMap(votesGroup ?? []), [votesGroup]);
  const candidateCount = getNum(valueMap, 'CampaignCount');
  const isCandidateFromVotes = Array.from({ length: candidateCount }, (_, i) =>
    valueMap.get(`Candidate${i}`) ?? ''
  ).some((name) => name.toLowerCase() === (username ?? '').toLowerCase());
  const isCandidate = isCandidateFromPolitics || isCandidateFromVotes;

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

  // Auto-refresh building details while panel is open.
  // Refreshes basic properties and resets the active lazy tab so it re-fetches.
  const refreshTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => {
    if (!details || !isConnected) return;
    const x = details.x;
    const y = details.y;
    const vc = details.visualClass;

    const doRefresh = () => {
      if (!isConnected) return;
      client.onRefreshBuilding(x, y);
      // Tab re-fetch is handled by the useEffect at line ~162 which reacts
      // to resetTabLoadingStates() inside refreshBuildingDetails().
      // The previous 2-second setTimeout here caused race conditions by
      // overwriting in-flight 'loading' states with 'idle'.
    };

    const startTimer = () => {
      clearInterval(refreshTimer.current);
      refreshTimer.current = setInterval(doRefresh, AUTO_REFRESH_INTERVAL);
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
  }, [details?.x, details?.y, details?.visualClass, details?.tabs, currentTab, isConnected, client]);

  // Lazy tab loading state
  const tabLoadingStates = useBuildingStore((s) => s.tabLoadingStates);

  // Trigger lazy fetch when switching to a tab that needs on-demand data
  useEffect(() => {
    if (!details || isCivic || !isConnected) return;

    const activeTab = details.tabs.find((t) => t.id === currentTab);
    const tabSpecial = activeTab?.special;
    const lazyId = tabSpecial && isLazyTab(tabSpecial) ? tabSpecial
      : activeTab && isLazyTab(activeTab.id) ? activeTab.id
      : null;

    if (lazyId && tabLoadingStates[lazyId] !== 'loaded' && tabLoadingStates[lazyId] !== 'loading' && tabLoadingStates[lazyId] !== 'error') {
      client.onRequestTabData(details.x, details.y, lazyId, details.visualClass);
    }
  }, [currentTab, details?.x, details?.y, details?.visualClass, details?.tabs, isCivic, isConnected, tabLoadingStates, client]);

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

  // Determine active tab
  const activeCivicTab = (isCivic && civicTabs.some((t) => t.id === currentTab))
    ? currentTab as CivicTabId
    : civicTabs[0]?.id as CivicTabId | undefined;

  const activeStandardGroupId = (!isCivic)
    ? (standardTabs.find((t) => t.id === currentTab)?.id ?? standardTabs[0]?.id ?? '')
    : '';

  const activeGroupData = activeStandardGroupId ? details.groups[activeStandardGroupId] : undefined;
  const standardProperties = useMemo(
    () => activeGroupData ? activeGroupData.filter((p) => p.name !== 'Name') : [],
    [activeGroupData],
  );

  return (
    <div className={styles.inspector}>
      {/* Toolbar — refresh + close (top-right, hidden when modal provides its own) */}
      {!hideHeader && (
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
      )}

      {/* Header (hidden when inside modal — modal provides its own title) */}
      {!hideHeader && (
        <div className={`${styles.header} ${styles.stagger0}`}>
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

      {/* Quick stats from focus info (hidden for civic — revenue/workers not meaningful) */}
      {!isCivic && (
        <div className={styles.stagger1}>
          <QuickStats focus={focusedBuilding} />
        </div>
      )}

      {/* Tab navigation */}
      {isCivic ? (
        /* Civic: horizontal TabBar with consolidated tabs */
        civicTabs.length > 0 && (
          <div className={styles.stagger2}>
            <TabBar
              tabs={civicTabs}
              activeTab={activeCivicTab ?? civicTabs[0]?.id ?? ''}
              onTabChange={setCurrentTab}
            />
          </div>
        )
      ) : (
        /* Non-civic: pill grid with server-sent tabs */
        standardTabs.length > 0 && (
          <div className={styles.stagger2}>
            <InspectorTabs
              tabs={standardTabs}
              activeTab={currentTab || activeStandardGroupId}
              onTabChange={setCurrentTab}
            />
          </div>
        )
      )}

      {/* Tab content — scrollable */}
      <div className={`${styles.content} ${styles.stagger3}`}>
        {isCivic ? (
          <CivicTabContent
            activeTab={activeCivicTab ?? 'overview'}
            details={details}
            buildingX={details.x}
            buildingY={details.y}
            isCandidate={isCandidate}
            holdsOffice={holdsOffice}
          />
        ) : (() => {
          // Check if active tab needs lazy data that's still loading
          const activeTabDef = details.tabs.find((t) => t.id === currentTab);
          const lazyId = activeTabDef?.special && isLazyTab(activeTabDef.special)
            ? activeTabDef.special
            : activeTabDef && isLazyTab(activeTabDef.id) ? activeTabDef.id : null;
          const tabState = lazyId ? tabLoadingStates[lazyId] : undefined;

          if (lazyId && tabState === 'error') {
            return (
              <div className={styles.loadingState}>
                <span>Failed to load tab data. Click refresh to retry.</span>
              </div>
            );
          }

          if (lazyId && tabState !== 'loaded') {
            return (
              <div className={styles.loadingState}>
                <Skeleton width="100%" height="24px" />
                <Skeleton width="80%" height="18px" />
                <Skeleton width="100%" height="120px" />
              </div>
            );
          }

          return (
            <PropertyGroup
              properties={standardProperties}
              buildingX={details.x}
              buildingY={details.y}
            />
          );
        })()}
      </div>
    </div>
  );
}

/** Routes civic tab IDs to the appropriate section component. */
function CivicTabContent({
  activeTab,
  details,
  buildingX,
  buildingY,
  isCandidate,
  holdsOffice,
}: {
  activeTab: CivicTabId;
  details: NonNullable<ReturnType<typeof useBuildingStore.getState>['details']>;
  buildingX: number;
  buildingY: number;
  isCandidate: boolean;
  holdsOffice: boolean;
}) {
  const groups = details.groups ?? {};
  const generalGroupId = getGeneralGroupId(details.tabs);
  const generalProps = generalGroupId ? (groups[generalGroupId] ?? []) : [];
  const votesProps = groups['votes'] ?? [];
  const townsProps = groups['capitolTowns'] ?? [];
  const ministriesProps = groups['ministeries'] ?? [];
  const jobsProps = groups['townJobs'] ?? [];
  const resProps = groups['townRes'] ?? [];

  switch (activeTab) {
    case 'overview':
      return (
        <OverviewSection
          generalProperties={generalProps}
          votesProperties={votesProps}
          buildingX={buildingX}
          buildingY={buildingY}
          serverTabs={details.tabs}
        />
      );
    case 'administration':
      return (
        <AdministrationSection
          townsProperties={townsProps}
          ministriesProperties={ministriesProps}
          buildingX={buildingX}
          buildingY={buildingY}
        />
      );
    case 'demographics':
      return (
        <DemographicsSection
          jobsProperties={jobsProps}
          residentialsProperties={resProps}
          buildingX={buildingX}
          buildingY={buildingY}
          serverTabs={details.tabs}
        />
      );
    case 'elections':
      return (
        <ElectionsSection
          votesProperties={votesProps}
          buildingX={buildingX}
          buildingY={buildingY}
          isCandidate={isCandidate}
          holdsOffice={holdsOffice}
        />
      );
    default:
      return null;
  }
}
