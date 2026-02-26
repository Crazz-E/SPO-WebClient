/**
 * ActionBar — Sticky bottom actions for building inspector.
 * Rename, refresh, delete (owner only). Upgrade/downgrade handled by PropertyGroup.
 */

import { useState, useCallback } from 'react';
import { Edit3, Trash2, RefreshCw, Check, X } from 'lucide-react';
import { IconButton } from '../common';
import { useBuildingStore } from '../../store/building-store';
import styles from './ActionBar.module.css';

interface ActionBarProps {
  buildingX: number;
  buildingY: number;
  securityId: string;
}

export function ActionBar({ buildingX, buildingY }: ActionBarProps) {
  const isOwner = useBuildingStore((s) => s.isOwner);
  const details = useBuildingStore((s) => s.details);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  const getBridge = () =>
    (window.__spoReactCallbacks ?? {}) as Record<string, (...args: unknown[]) => void>;

  const handleRefresh = useCallback(() => {
    getBridge().onRefreshBuilding?.(buildingX, buildingY);
  }, [buildingX, buildingY]);

  const handleDelete = useCallback(() => {
    if (confirm('Are you sure you want to delete this building?')) {
      getBridge().onDeleteBuilding?.(buildingX, buildingY);
    }
  }, [buildingX, buildingY]);

  const handleStartRename = useCallback(() => {
    setNewName(details?.buildingName ?? '');
    setIsRenaming(true);
  }, [details]);

  const handleConfirmRename = useCallback(() => {
    if (newName.trim()) {
      getBridge().onRenameBuilding?.(buildingX, buildingY, newName.trim());
    }
    setIsRenaming(false);
  }, [buildingX, buildingY, newName]);

  const handleCancelRename = useCallback(() => {
    setIsRenaming(false);
  }, []);

  if (isRenaming) {
    return (
      <div className={styles.bar}>
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
          icon={<Check size={16} />}
          label="Confirm"
          size="sm"
          variant="glass"
          onClick={handleConfirmRename}
        />
        <IconButton
          icon={<X size={16} />}
          label="Cancel"
          size="sm"
          variant="ghost"
          onClick={handleCancelRename}
        />
      </div>
    );
  }

  return (
    <div className={styles.bar}>
      {isOwner && (
        <>
          <IconButton
            icon={<Edit3 size={16} />}
            label="Rename"
            size="sm"
            variant="glass"
            onClick={handleStartRename}
          />
          <IconButton
            icon={<Trash2 size={16} />}
            label="Delete"
            size="sm"
            variant="glass"
            danger
            onClick={handleDelete}
          />
        </>
      )}
      <div className={styles.spacer} />
      <IconButton
        icon={<RefreshCw size={16} />}
        label="Refresh"
        size="sm"
        variant="ghost"
        onClick={handleRefresh}
      />
    </div>
  );
}
