/**
 * LoginScreen — Cinematic full-screen login experience.
 *
 * Three stages with cinematic transitions:
 * A) Authentication — centered glassmorphed card on atmospheric background
 * B) World Selection — centered world card grid with gold hover glow
 * C) Company Selection — role-grouped company cards + create new
 *
 * The LoginBackground component provides animated floating orbs.
 * Each stage is a self-contained component that receives callbacks.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '../store';
import { LoginBackground, AuthStage, WorldStage, CompanyStage } from '../components/login';
import type { WorldInfo, CompanyInfo } from '@/shared/types';
import styles from './LoginScreen.module.css';

type LoginStage = 'auth' | 'worlds' | 'companies';

export function LoginScreen() {
  const status = useGameStore((s) => s.status);
  const [stage, setStage] = useState<LoginStage>('auth');
  const [worlds, setWorlds] = useState<WorldInfo[]>([]);
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [selectedWorld, setSelectedWorld] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Stable ref to avoid re-registering on every render
  const stageRef = useRef({ setStage, setWorlds, setCompanies, setIsLoading });
  stageRef.current = { setStage, setWorlds, setCompanies, setIsLoading };

  // Register bridge handlers once — the bridge calls these when server responds
  useEffect(() => {
    window.__spoLoginHandlers = {
      showWorlds: (worldList: WorldInfo[]) => {
        stageRef.current.setWorlds(worldList);
        stageRef.current.setStage('worlds');
        stageRef.current.setIsLoading(false);
      },
      showCompanies: (companyList: CompanyInfo[]) => {
        stageRef.current.setCompanies(companyList);
        stageRef.current.setStage('companies');
        stageRef.current.setIsLoading(false);
      },
      setLoading: (loading: boolean) => {
        stageRef.current.setIsLoading(loading);
      },
    };
    return () => {
      window.__spoLoginHandlers = undefined;
    };
  }, []);

  // Bridge callback accessor
  const getBridge = useCallback(() => {
    return (window.__spoReactCallbacks ?? {}) as Record<string, (...args: unknown[]) => void>;
  }, []);

  // Stage A → B: authenticate
  const handleConnect = useCallback(
    (username: string, password: string) => {
      setIsLoading(true);
      getBridge().onDirectoryConnect?.(username, password);
    },
    [getBridge],
  );

  // Stage B → C: select world
  const handleWorldSelect = useCallback(
    (worldName: string) => {
      setIsLoading(true);
      setSelectedWorld(worldName);
      getBridge().onWorldSelect?.(worldName);
    },
    [getBridge],
  );

  // Stage C → game: select company
  const handleCompanySelect = useCallback(
    (companyId: string) => {
      setIsLoading(true);
      getBridge().onCompanySelect?.(companyId);
    },
    [getBridge],
  );

  const handleCreateCompany = useCallback(() => {
    getBridge().onCreateCompany?.();
  }, [getBridge]);

  const handleBackToWorlds = useCallback(() => {
    setStage('worlds');
  }, []);

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

      {stage === 'worlds' && (
        <WorldStage
          worlds={worlds}
          onSelect={handleWorldSelect}
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
