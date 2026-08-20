/**
 * RulerCard — the left header of the Politics page (`mayordata.asp`).
 *
 * Six figures and a portrait, or the "No Mayor" / "No President" placeholder
 * the page shows when the seat is empty (`mayordata.asp:102-110`).
 *
 * Voyager renders the portrait at 150×200 in a full-screen frameset. Here it is
 * a 64 px thumbnail: the modal has no room for a poster, and the figures are
 * what the panel is for.
 */

import { useState } from 'react';
import type { PoliticsData } from '@/shared/types';
import styles from './PoliticsPanel.module.css';

interface RulerCardProps {
  data: PoliticsData;
}

export function RulerCard({ data }: RulerCardProps) {
  // `mayordata.asp:40` ships the <img> behind an `if true then` where a
  // FileExists check used to be, so most rulers have no photo on disk. The
  // initial is the fallback, as everywhere else in this client.
  const [photoFailed, setPhotoFailed] = useState(false);

  const title = data.isCapitol ? 'The President' : 'The Mayor';

  if (!data.hasRuler || !data.mayorName) {
    return (
      <section className={styles.politicsCard}>
        <h4 className={styles.politicsCardTitle}>{title}</h4>
        <div className={styles.politicsVacant}>
          {data.isCapitol ? 'No President' : 'No Mayor'}
        </div>
      </section>
    );
  }

  const showPhoto = data.rulerPhotoUrl !== '' && !photoFailed;

  return (
    <section className={styles.politicsCard}>
      <h4 className={styles.politicsCardTitle}>{title}</h4>
      <div className={styles.rulerLayout}>
        {showPhoto ? (
          <img
            className={styles.rulerPhoto}
            src={data.rulerPhotoUrl}
            alt=""
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <div className={styles.rulerAvatar}>{data.mayorName.charAt(0).toUpperCase()}</div>
        )}
        <dl className={styles.rulerFigures}>
          <dt>Name</dt><dd className={styles.rulerFigureName}>{data.mayorName}</dd>
          <dt>Prestige</dt><dd>{data.mayorPrestige.toLocaleString()} points</dd>
          <dt>Popular Rating</dt><dd>{data.mayorRating}%</dd>
          <dt>Tycoons Rating</dt><dd>{data.tycoonsRating}%</dd>
          <dt>IFEL&apos;s Rating</dt><dd>{data.ifelRating}%</dd>
          <dt>Mandate No</dt><dd>{data.mandateNo}</dd>
        </dl>
      </div>
    </section>
  );
}
