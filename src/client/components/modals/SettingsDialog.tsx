/**
 * SettingsDialog — Game settings modal.
 *
 * Toggle switches for visual/audio settings + keyboard shortcuts reference.
 */

import { useCallback } from 'react';
import { X } from 'lucide-react';
import { useGameStore, type GameSettings } from '../../store/game-store';
import { useUiStore } from '../../store/ui-store';
import styles from './SettingsDialog.module.css';

export function SettingsDialog() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);
  const settings = useGameStore((s) => s.settings);
  const updateSettings = useGameStore((s) => s.updateSettings);

  const getBridge = useCallback(
    () => (window.__spoReactCallbacks ?? {}) as Record<string, (...args: unknown[]) => void>,
    [],
  );

  // Update store + notify client.ts to apply to renderer/sound/localStorage
  const handleSettingChange = useCallback(
    (partial: Partial<GameSettings>) => {
      updateSettings(partial);
      // Read the merged settings from the store after update
      const merged = { ...useGameStore.getState().settings, ...partial };
      getBridge().onSettingsChange?.(merged);
    },
    [updateSettings, getBridge],
  );

  if (modal !== 'settings') return null;

  const handleLogout = () => {
    closeModal();
    getBridge().onLogout?.();
  };

  return (
    <>
      <div className={styles.backdrop} onClick={closeModal} aria-hidden="true" />
      <div className={styles.modal} role="dialog" aria-label="Settings">
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button className={styles.closeBtn} onClick={closeModal} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className={styles.content}>
          {/* Visual settings */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Visual</h3>
            <ToggleRow
              label="Hide vegetation on move"
              checked={settings.hideVegetationOnMove}
              onChange={(v) => handleSettingChange({ hideVegetationOnMove: v })}
            />
            <ToggleRow
              label="Vehicle animations"
              checked={settings.vehicleAnimations}
              onChange={(v) => handleSettingChange({ vehicleAnimations: v })}
            />
            <ToggleRow
              label="Edge scroll"
              checked={settings.edgeScrollEnabled}
              onChange={(v) => handleSettingChange({ edgeScrollEnabled: v })}
            />
            <ToggleRow
              label="Debug overlay"
              checked={settings.debugOverlay}
              onChange={(v) => handleSettingChange({ debugOverlay: v })}
            />
          </section>

          {/* Audio settings */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Audio</h3>
            <ToggleRow
              label="Sound enabled"
              checked={settings.soundEnabled}
              onChange={(v) => handleSettingChange({ soundEnabled: v })}
            />
            <div className={styles.sliderRow}>
              <span className={styles.sliderLabel}>Volume</span>
              <input
                type="range"
                className={styles.slider}
                min="0"
                max="1"
                step="0.05"
                value={settings.soundVolume}
                onChange={(e) => handleSettingChange({ soundVolume: parseFloat(e.target.value) })}
              />
              <span className={styles.sliderValue}>
                {Math.round(settings.soundVolume * 100)}%
              </span>
            </div>
          </section>

          {/* Keyboard shortcuts reference */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Keyboard Shortcuts</h3>
            <div className={styles.shortcutGrid}>
              <ShortcutRow keys="B" action="Build Menu" />
              <ShortcutRow keys="E" action="Empire Overview" />
              <ShortcutRow keys="M" action="Mail" />
              <ShortcutRow keys="R" action="Refresh Map" />
              <ShortcutRow keys="Cmd+K" action="Command Palette" />
              <ShortcutRow keys="Esc" action="Close Panel/Modal" />
              <ShortcutRow keys="D" action="Debug Overlay" />
            </div>
          </section>

          {/* Logout */}
          <section className={styles.section}>
            <button className={styles.logoutBtn} onClick={handleLogout}>
              Logout
            </button>
          </section>
        </div>
      </div>
    </>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label className={styles.toggleRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <div className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`} onClick={() => onChange(!checked)}>
        <div className={styles.toggleThumb} />
      </div>
    </label>
  );
}

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className={styles.shortcutRow}>
      <kbd className={styles.kbd}>{keys}</kbd>
      <span className={styles.shortcutAction}>{action}</span>
    </div>
  );
}
