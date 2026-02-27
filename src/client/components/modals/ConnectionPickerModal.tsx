/**
 * ConnectionPickerModal — Find suppliers/clients for a building fluid connection.
 *
 * Replaces the legacy ConnectionPickerDialog.
 * Managed by ui-store modal state ('connectionPicker') + building-store connectionPicker data.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { useUiStore } from '../../store/ui-store';
import { useBuildingStore } from '../../store/building-store';
import { useClient } from '../../context';
import styles from './ConnectionPickerModal.module.css';

/** Facility role bitmask values (from Voyager TFacilityRoleSet) */
const ROLE_PRODUCER = 1;
const ROLE_DISTRIBUTER = 2;
const ROLE_BUYER = 4;
const ROLE_EXPORTER = 8;
const ROLE_IMPORTER = 16;

export function ConnectionPickerModal() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);
  const picker = useBuildingStore((s) => s.connectionPicker);
  const clearConnectionPicker = useBuildingStore((s) => s.clearConnectionPicker);

  const [company, setCompany] = useState('');
  const [town, setTown] = useState('');
  const [maxResults, setMaxResults] = useState('20');
  const [roles, setRoles] = useState({
    producer: true,
    distributer: true,
    importer: true,
    buyer: true,
    exporter: true,
  });
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const client = useClient();
  const companyRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (modal === 'connectionPicker') {
      setCompany('');
      setTown('');
      setMaxResults('20');
      setRoles({ producer: true, distributer: true, importer: true, buyer: true, exporter: true });
      setSelectedIndices(new Set());
      requestAnimationFrame(() => companyRef.current?.focus());
    }
  }, [modal]);

  // Clear selection when results change
  useEffect(() => {
    setSelectedIndices(new Set());
  }, [picker?.results]);

  const handleClose = useCallback(() => {
    clearConnectionPicker();
    closeModal();
  }, [clearConnectionPicker, closeModal]);

  const handleSearch = useCallback(() => {
    if (!picker) return;

    let rolesMask = 0;
    if (roles.producer) rolesMask |= ROLE_PRODUCER;
    if (roles.distributer) rolesMask |= ROLE_DISTRIBUTER;
    if (roles.importer) rolesMask |= ROLE_IMPORTER;
    if (roles.buyer) rolesMask |= ROLE_BUYER;
    if (roles.exporter) rolesMask |= ROLE_EXPORTER;

    client.onConnectionSearch(
      picker.buildingX,
      picker.buildingY,
      picker.fluidId,
      picker.direction,
      {
        company: company || undefined,
        town: town || undefined,
        maxResults: parseInt(maxResults) || 20,
        roles: rolesMask || 255,
      },
    );
  }, [picker, company, town, maxResults, roles, client]);

  const toggleIndex = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!picker) return;
    const all = new Set<number>();
    for (let i = 0; i < picker.results.length; i++) all.add(i);
    setSelectedIndices(all);
  }, [picker]);

  const clearSelection = useCallback(() => {
    setSelectedIndices(new Set());
  }, []);

  const handleConnect = useCallback(() => {
    if (!picker || selectedIndices.size === 0) return;

    const coords = Array.from(selectedIndices)
      .map((i) => picker.results[i])
      .filter(Boolean)
      .map((r) => ({ x: r.x, y: r.y }));

    client.onConnectionConnect(picker.fluidId, picker.direction, coords);
    handleClose();
  }, [picker, selectedIndices, handleClose, client]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    },
    [handleClose],
  );

  if (modal !== 'connectionPicker' || !picker) return null;

  const dirLabel = picker.direction === 'input' ? 'Find Suppliers' : 'Find Clients';
  const results = picker.results;

  return (
    <>
      <div className={styles.backdrop} onClick={handleClose} aria-hidden="true" />
      <div
        className={styles.modal}
        role="dialog"
        aria-label={`${dirLabel} for ${picker.fluidName}`}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            {dirLabel} for: <span className={styles.fluidName}>{picker.fluidName}</span>
          </h2>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <div className={styles.filterRow}>
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>Company</label>
              <input
                ref={companyRef}
                className={styles.filterInput}
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>Town</label>
              <input
                className={styles.filterInput}
                type="text"
                value={town}
                onChange={(e) => setTown(e.target.value)}
              />
            </div>
            <div className={styles.filterFieldSmall}>
              <label className={styles.filterLabel}>Max</label>
              <input
                className={styles.filterInput}
                type="number"
                min="1"
                max="100"
                value={maxResults}
                onChange={(e) => setMaxResults(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.rolesRow}>
            <label className={styles.roleLabel}>
              <input
                type="checkbox"
                checked={roles.producer}
                onChange={(e) => setRoles((r) => ({ ...r, producer: e.target.checked }))}
              />
              Factories
            </label>
            <label className={styles.roleLabel}>
              <input
                type="checkbox"
                checked={roles.distributer}
                onChange={(e) => setRoles((r) => ({ ...r, distributer: e.target.checked }))}
              />
              Warehouses
            </label>
            <label className={styles.roleLabel}>
              <input
                type="checkbox"
                checked={roles.importer}
                onChange={(e) => setRoles((r) => ({ ...r, importer: e.target.checked }))}
              />
              Trade Centers
            </label>
            {picker.direction === 'output' ? (
              <label className={styles.roleLabel}>
                <input
                  type="checkbox"
                  checked={roles.buyer}
                  onChange={(e) => setRoles((r) => ({ ...r, buyer: e.target.checked }))}
                />
                Stores
              </label>
            ) : (
              <label className={styles.roleLabel}>
                <input
                  type="checkbox"
                  checked={roles.exporter}
                  onChange={(e) => setRoles((r) => ({ ...r, exporter: e.target.checked }))}
                />
                Exporters
              </label>
            )}
            <button
              className={styles.searchBtn}
              onClick={handleSearch}
              disabled={picker.isSearching}
            >
              <Search size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {picker.isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className={styles.results}>
          {picker.isSearching ? (
            <div className={styles.emptyState}>Searching...</div>
          ) : results.length === 0 ? (
            <div className={styles.emptyState}>
              {picker.results === undefined || picker.results.length === 0
                ? 'Click Search to find available connections'
                : 'No facilities found'}
            </div>
          ) : (
            results.map((r, i) => (
              <div
                key={`${r.x}-${r.y}`}
                className={styles.resultRow}
                onClick={() => toggleIndex(i)}
              >
                <input
                  type="checkbox"
                  className={styles.resultCheckbox}
                  checked={selectedIndices.has(i)}
                  onChange={() => toggleIndex(i)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className={styles.resultInfo}>
                  <div className={styles.resultName}>{r.facilityName}</div>
                  <div className={styles.resultMeta}>
                    {r.companyName}
                    {r.price ? ` — $${r.price}` : ''}
                    {r.quality ? ` (Q: ${r.quality})` : ''}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.secondaryBtn} onClick={selectAll} disabled={results.length === 0}>
            Select All
          </button>
          <button className={styles.secondaryBtn} onClick={clearSelection} disabled={selectedIndices.size === 0}>
            Clear
          </button>
          <button
            className={styles.connectBtn}
            onClick={handleConnect}
            disabled={selectedIndices.size === 0}
          >
            Connect Selected ({selectedIndices.size})
          </button>
        </div>
      </div>
    </>
  );
}
