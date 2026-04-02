/**
 * TycoonProfileView — Displays a tycoon's profile from RenderTycoon.asp data.
 * Used inside SearchPanel when currentPage is 'tycoon-profile'.
 */

import { User, DollarSign, Trophy, Star, Award } from 'lucide-react';
import { formatMoney } from '../../format-utils';
import { useSearchStore } from '../../store/search-store';
import { GlassCard } from '../common';
import styles from './SearchPanel.module.css';

export function TycoonProfileView() {
  const profile = useSearchStore((s) => s.tycoonProfileData?.profile);

  if (!profile) {
    return <div className={styles.emptyState}>No profile data available.</div>;
  }


  return (
    <div className={styles.listContainer}>
      <GlassCard className={styles.profileCard} light>
        {/* Header: photo + name */}
        <div className={styles.profileHeader}>
          {profile.photoUrl ? (
            <img
              className={styles.profilePhoto}
              src={profile.photoUrl}
              alt={profile.name}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className={styles.profilePhotoPlaceholder}>
              <User size={28} />
            </div>
          )}
          <span className={styles.profileName}>{profile.name}</span>
        </div>

        {/* Stats grid */}
        <div className={styles.profileStatsGrid}>
          <span className={styles.profileStatLabel}>
            <DollarSign size={12} /> Fortune
          </span>
          <span className={styles.profileStatValue}>{formatMoney(profile.fortune)}</span>

          <span className={styles.profileStatLabel}>
            <DollarSign size={12} /> This Year
          </span>
          <span className={styles.profileStatValue}>{formatMoney(profile.thisYearProfit)}</span>

          <span className={styles.profileStatLabel}>
            <Trophy size={12} /> NTA Ranking
          </span>
          <span className={styles.profileStatValue}>{profile.ntaRanking}</span>

          <span className={styles.profileStatLabel}>
            <Award size={12} /> Level
          </span>
          <span className={styles.profileStatValue}>{profile.level}</span>

          <span className={styles.profileStatLabel}>
            <Star size={12} /> Prestige
          </span>
          <span className={styles.profileStatValue}>{profile.prestige} points</span>
        </div>
      </GlassCard>
    </div>
  );
}
