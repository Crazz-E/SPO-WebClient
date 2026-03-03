/**
 * Cluster Data — Static metadata for company creation cluster selection.
 *
 * Display names and ordering extracted from the original game's
 * createCompany.asp / toptabs.asp / info.asp pages.
 */

/** Canonical cluster IDs in display order (matches original tab order). */
export const CLUSTER_IDS = ['Dissidents', 'PGI', 'Mariko', 'Moab', 'Magna'] as const;

export type ClusterId = (typeof CLUSTER_IDS)[number];

/** Human-readable display names for each cluster. */
export const CLUSTER_DISPLAY_NAMES: Record<ClusterId, string> = {
  Dissidents: 'Dissidents',
  PGI: 'PGI',
  Mariko: 'Mariko Enterprises',
  Moab: 'The Moab',
  Magna: 'Magna Corp',
};

/**
 * Characters forbidden in company names.
 * From the original ASP validation: `\/:*?"<>|&+%`
 */
export const INVALID_COMPANY_NAME_CHARS = /[\\/:*?"<>|&+%]/;
