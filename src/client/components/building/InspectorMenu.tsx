/**
 * InspectorMenu — the facility inspector's section menu, master/detail.
 *
 * A vertical list of the server-sent tabs. Picking one opens a drawer to the
 * right of the list with that section's content, the same shape the tycoon
 * profile uses (`ProfilePanel`).
 *
 * Nothing is selected on mount, and that is the point: a section's properties
 * are only read from the model server when the user opens it. The inspector
 * itself opens on the header group alone
 * (`collectHeaderPropertyNames`), instead of the whole template.
 */

import { ArrowLeft, ChevronRight, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BuildingDetailsTab } from '@/shared/types';
import styles from './InspectorMenu.module.css';

interface InspectorMenuProps {
  tabs: BuildingDetailsTab[];
  /** Open section, or null for the plain list. */
  activeTab: string | null;
  onSelect: (tabId: string | null) => void;
  /** Renders the open section's body. */
  children?: ReactNode;
}

export function InspectorMenu({ tabs, activeTab, onSelect, children }: InspectorMenuProps) {
  const sorted = [...tabs].sort((a, b) => a.order - b.order);
  const active = sorted.find((t) => t.id === activeTab) ?? null;

  return (
    <div className={`${styles.menu} ${active ? styles.split : ''}`}>
      <nav className={styles.sectionList} aria-label="Facility sections">
        {sorted.map((tab) => {
          const isActive = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-expanded={isActive}
              aria-current={isActive ? 'true' : undefined}
              className={`${styles.sectionItem} ${isActive ? styles.sectionItemActive : ''}`}
              onClick={() => onSelect(isActive ? null : tab.id)}
            >
              <span className={styles.sectionIcon}>{tab.icon || tab.name.charAt(0)}</span>
              <span className={styles.sectionLabel}>{tab.name}</span>
              <ChevronRight size={14} className={styles.sectionChevron} />
            </button>
          );
        })}
      </nav>

      {active && (
        <section className={styles.drawer} aria-label={active.name}>
          <header className={styles.drawerHeader}>
            <button
              type="button"
              className={styles.drawerBack}
              onClick={() => onSelect(null)}
              aria-label="Back to sections"
            >
              <ArrowLeft size={16} />
            </button>
            <h4 className={styles.drawerTitle}>{active.name}</h4>
            <button
              type="button"
              className={styles.drawerClose}
              onClick={() => onSelect(null)}
              aria-label="Close section"
            >
              <X size={15} />
            </button>
          </header>
          <div className={styles.drawerContent}>{children}</div>
        </section>
      )}
    </div>
  );
}
