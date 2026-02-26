/**
 * Accordion — Expandable section with animated collapse.
 */

import { type ReactNode, useState, useRef, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import styles from './Accordion.module.css';

interface AccordionProps {
  title: string;
  children: ReactNode;
  /** Start expanded. Defaults to false. */
  defaultOpen?: boolean;
  /** Badge/count shown next to title */
  badge?: ReactNode;
  className?: string;
}

export function Accordion({ title, children, defaultOpen = false, badge, className }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);

  useEffect(() => {
    if (!contentRef.current) return;
    if (open) {
      setHeight(contentRef.current.scrollHeight);
      // After transition, set to auto for dynamic content
      const timer = setTimeout(() => setHeight(undefined), 200);
      return () => clearTimeout(timer);
    } else {
      // Set explicit height first for transition
      setHeight(contentRef.current.scrollHeight);
      requestAnimationFrame(() => setHeight(0));
    }
  }, [open]);

  return (
    <div className={`${styles.accordion} ${className ?? ''}`}>
      <button
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <ChevronRight
          size={14}
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
        />
        <span className={styles.title}>{title}</span>
        {badge && <span className={styles.badge}>{badge}</span>}
      </button>
      <div
        ref={contentRef}
        className={styles.content}
        style={{ height: height !== undefined ? `${height}px` : 'auto' }}
        aria-hidden={!open}
      >
        <div className={styles.inner}>{children}</div>
      </div>
    </div>
  );
}
