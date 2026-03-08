/**
 * LoginScreen — Cinematic full-screen login experience.
 *
 * Four stages with cinematic transitions:
 * A) Authentication — centered glassmorphed card on atmospheric background
 * B) Zone/Region Selection — BETA, Free Space, Restricted Space
 * C) World Selection — centered world card grid with gold hover glow
 * D) Company Selection — role-grouped company cards + create new
 *
 * The LoginBackground component provides animated floating orbs.
 * Each stage is a self-contained component that receives callbacks.
 */

import { useState, useCallback } from 'react';
import { useGameStore } from '../store';
import { useClient } from '../context';
import { LoginBackground, AuthStage, AuthErrorModal, ZoneStage, WorldStage, CompanyStage } from '../components/login';
import type { WorldZone } from '@/shared/types';
import styles from './LoginScreen.module.css';

export function LoginScreen() {
  const status = useGameStore((s) => s.status);
  const stage = useGameStore((s) => s.loginStage);
  const worlds = useGameStore((s) => s.loginWorlds);
  const companies = useGameStore((s) => s.companies);
  const isLoading = useGameStore((s) => s.loginLoading);
  const authError = useGameStore((s) => s.authError);
  const setLoginStage = useGameStore((s) => s.setLoginStage);
  const setLoginLoading = useGameStore((s) => s.setLoginLoading);
  const setAuthError = useGameStore((s) => s.setAuthError);

  const client = useClient();
  const [storedCreds, setStoredCreds] = useState<{ username: string; password: string } | null>(null);
  const [selectedWorld, setSelectedWorld] = useState('');

  // Stage A: validate credentials via RDO auth check, then advance to zones on success
  const handleConnect = useCallback(
    (username: string, password: string) => {
      setStoredCreds({ username, password });
      setLoginLoading(true);
      client.onAuthCheck(username, password);
    },
    [client, setLoginLoading],
  );

  // Dismiss auth error modal
  const handleDismissAuthError = useCallback(() => {
    setAuthError(null);
  }, [setAuthError]);

  // Stage B → C: select zone, then perform directory connect with stored creds + zone path
  const handleZoneSelect = useCallback(
    (zone: WorldZone) => {
      if (!storedCreds) return;
      setLoginLoading(true);
      client.onDirectoryConnect(storedCreds.username, storedCreds.password, zone.path);
    },
    [client, storedCreds, setLoginLoading],
  );

  // Stage C → D: select world
  const handleWorldSelect = useCallback(
    (worldName: string) => {
      setLoginLoading(true);
      setSelectedWorld(worldName);
      client.onWorldSelect(worldName);
    },
    [client, setLoginLoading],
  );

  // Stage D → game: select company
  const handleCompanySelect = useCallback(
    (companyId: string) => {
      setLoginLoading(true);
      client.onCompanySelect(companyId);
    },
    [client, setLoginLoading],
  );

  const handleCreateCompany = useCallback(() => {
    client.onCreateCompany();
  }, [client]);

  const handleBackToZones = useCallback(() => {
    setLoginStage('zones');
  }, [setLoginStage]);

  const handleBackToWorlds = useCallback(() => {
    setLoginStage('worlds');
  }, [setLoginStage]);

  return (
    <div className={styles.screen}>
      <LoginBackground />

      {stage === 'auth' && (
        <AuthStage
          onConnect={handleConnect}
          isLoading={isLoading}
          status={status}
        />
      )}

      {stage === 'zones' && (
        <ZoneStage
          onSelect={handleZoneSelect}
          isLoading={isLoading}
        />
      )}

      {stage === 'worlds' && (
        <WorldStage
          worlds={worlds}
          onSelect={handleWorldSelect}
          onBack={handleBackToZones}
          isLoading={isLoading}
        />
      )}

      {stage === 'companies' && (
        <CompanyStage
          companies={companies}
          worldName={selectedWorld}
          onSelect={handleCompanySelect}
          onCreate={handleCreateCompany}
          onBack={handleBackToWorlds}
          isLoading={isLoading}
        />
      )}

      {authError && (
        <AuthErrorModal error={authError} onDismiss={handleDismissAuthError} />
      )}
    </div>
  );
}
