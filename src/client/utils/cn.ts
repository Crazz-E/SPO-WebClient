/**
 * Combines class names, filtering out falsy values.
 * Usage: cn(styles.base, isActive && styles.active, isError && styles.error)
 */
export function cn(...classes: (string | false | null | undefined | 0)[]): string {
  return classes.filter(Boolean).join(' ');
}
