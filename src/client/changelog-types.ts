export interface ChangelogEntry {
  type: 'added' | 'fixed' | 'changed';
  text: string;
}

export interface ChangelogRelease {
  version: string;
  date: string;
  entries: ChangelogEntry[];
}
