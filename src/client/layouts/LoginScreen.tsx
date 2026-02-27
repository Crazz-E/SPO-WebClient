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
import { LoginBackground, AuthStage, ZoneStage, WorldStage, CompanyStage } from '../components/login';
import type { WorldZone } from '@/shared/types';
import styles from './LoginScreen.module.css';

export function LoginScreen() {
  const status = useGameStore((s) => s.status);
  const stage = useGameStore((s) => s.loginStage);
  const worlds = useGameStore((s) => s.loginWorlds);
  const companies = useGameStore((s) => s.companies);
  const isLoading = useGameStore((s) => s.loginLoading);
  const setLoginStage = useGameStore((s) => s.setLoginStage);
  const setLoginLoading = useGameStore((s) => s.setLoginLoading);

  const client = useClient();
  const [storedCreds, setStoredCreds] = useState<{ username: string; password: string } | null>(null);
  const [selectedWorld, setSelectedWorld] = useState('');

  // Stage A → B: store credentials, advance to zone selector (no server call yet)
  const handleConnect = useCallback(
    (username: string, password: string) => {
      setStoredCreds({ username, password });
      setLoginStage('zones');
    },
    [setLoginStage],
  );

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
    </div>
  );
}
