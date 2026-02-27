/**
 * CompanyCreationModal — Modal dialog for creating a new company.
 *
 * Allows the user to enter a company name and select an industry cluster.
 * Managed by ui-store modal state ('createCompany').
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useUiStore } from '../../store/ui-store';
import { useGameStore } from '../../store/game-store';
import { useClient } from '../../context';
import styles from './CompanyCreationModal.module.css';

const MAX_NAME_LENGTH = 50;

export function CompanyCreationModal() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);
  const clusters = useGameStore((s) => s.companyCreationClusters);

  const [name, setName] = useState('');
  const [cluster, setCluster] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const client = useClient();
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (modal === 'createCompany') {
      setName('');
      setCluster(clusters[0] ?? '');
      setLoading(false);
      setError('');
      // Focus the name input after render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [modal, clusters]);

  const handleCancel = useCallback(() => {
    closeModal();
  }, [closeModal]);

  const handleSubmit = useCallback(async () => {
    if (loading) return;

    // Validate
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Company name cannot be empty');
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`Company name must be ${MAX_NAME_LENGTH} characters or less`);
      return;
    }
    if (!cluster) {
      setError('Please select a cluster');
      return;
    }

    setError('');
    setLoading(true);

    try {
      if (client.onCreateCompanySubmit) {
        await client.onCreateCompanySubmit(trimmed, cluster);
      }
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create company';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [name, cluster, loading, closeModal]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !loading) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        handleCancel();
      }
    },
    [loading, handleSubmit, handleCancel],
  );

  if (modal !== 'createCompany') return null;

  return (
    <>
      <div className={styles.backdrop} onClick={handleCancel} aria-hidden="true" />
      <div className={styles.modal} role="dialog" aria-label="Create New Company" onKeyDown={handleKeyDown}>
        <div className={styles.header}>
          <h2 className={styles.title}>Create New Company</h2>
          <button className={styles.closeBtn} onClick={handleCancel} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className={styles.content}>
          {/* Company name */}
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Company Name</label>
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              maxLength={MAX_NAME_LENGTH}
              placeholder="Enter company name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Industry cluster */}
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Industry Cluster</label>
            <select
              className={styles.select}
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              disabled={loading}
            >
              {clusters.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Error message */}
          {error && <div className={styles.error}>{error}</div>}

          {/* Buttons */}
          <div className={styles.buttonRow}>
            <button className={styles.cancelBtn} onClick={handleCancel} disabled={loading}>
              Cancel
            </button>
            <button className={styles.submitBtn} onClick={handleSubmit} disabled={loading}>
              {loading ? 'Creating...' : 'Create Company'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
