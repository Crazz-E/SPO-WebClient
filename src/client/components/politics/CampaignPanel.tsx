/**
 * CampaignPanel — the right half of the Politics page.
 *
 * The opposition header (`opositiondata.asp`) sits above two sub-tabs
 * (`campaigntabs.asp:88-119`):
 *
 *   YOUR CAMPAIGN — `tycooncampaign.asp`, one of four mutually exclusive states
 *   ALL CAMPAIGNS — `allcampaigns.asp`, shown only when someone is running
 */

import { useCallback, useState } from 'react';
import type { PoliticsData, PoliticsProjectEntry } from '@/shared/types';
import { usePoliticsStore } from '../../store/politics-store';
import { useClient } from '../../context';
import styles from './PoliticsPanel.module.css';

interface CampaignPanelProps {
  data: PoliticsData;
  buildingX: number;
  buildingY: number;
}

/** `tycooncampaign.asp:275-281` — the three proposal states and what they mean. */
const PROPOSAL_STATE_TEXT: Record<number, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  1: { label: 'Unknown tycoon name', tone: 'warn' },
  2: { label: 'This tycoon cannot act as a Minister', tone: 'bad' },
  3: { label: 'This proposal is OK', tone: 'ok' },
};

/** One editable project row — a minister name or a percentage goal. */
function ProjectRow({ project }: { project: PoliticsProjectEntry }) {
  const client = useClient();
  const pending = usePoliticsStore((s) => s.pendingProjects.get(project.id));
  const [draft, setDraft] = useState<string | null>(null);

  const commit = useCallback((value: string) => {
    setDraft(null);
    if (value !== (pending ?? project.ministerName ?? '')) {
      client.onSetCampaignProject(project.id, value);
    }
  }, [client, project.id, project.ministerName, pending]);

  if (project.kind === 'minister') {
    const current = draft ?? pending ?? project.ministerName ?? '';
    const state = project.proposalState ? PROPOSAL_STATE_TEXT[project.proposalState] : undefined;
    return (
      <tr>
        <td>{project.name}</td>
        <td>
          <input
            className={styles.projectInput}
            aria-label={project.name}
            placeholder="None"
            value={current}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value.trim())}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          {/* The icon only describes what the SERVER last validated, so it is
              hidden as soon as an unsent edit is on screen. */}
          {state && draft === null && pending === undefined && (
            <span className={styles[`proposal_${state.tone}`]}>{state.label}</span>
          )}
        </td>
      </tr>
    );
  }

  const value = pending !== undefined ? parseInt(pending, 10) : project.value ?? 0;
  return (
    <tr>
      <td>
        {project.name}
        {/* `strMoreThan` / `strLessThan` — localised by the server, printed as-is. */}
        {project.comparator && <span className={styles.projectComparator}>{project.comparator}</span>}
      </td>
      <td>
        <select
          className={styles.ratingSelect}
          aria-label={project.name}
          value={10 * Math.floor(value / 10)}
          onChange={(e) => client.onSetCampaignProject(project.id, e.target.value)}
        >
          {[100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0].map((v) => (
            <option key={v} value={v}>{v}%</option>
          ))}
        </select>
      </td>
    </tr>
  );
}

export function CampaignPanel({ data, buildingX, buildingY }: CampaignPanelProps) {
  const client = useClient();
  const rail = usePoliticsStore((s) => s.activeCampaignRail);
  const setRail = usePoliticsStore((s) => s.setActiveCampaignRail);

  const office = data.isCapitol ? 'President' : 'Mayor';
  // `opositiondata.asp:46` — `Tycoon0`, the head of the campaign list.
  const strongest = data.campaigns[0];
  // `campaigntabs.asp:104` — the second tab exists only when someone is running.
  const showAll = data.campaigns.length > 0;

  return (
    <>
      <section className={styles.politicsCard}>
        <h4 className={styles.politicsCardTitle}>The Opposition</h4>
        {strongest ? (
          <div className={styles.rulerLayout}>
            <div className={styles.rulerAvatar}>
              {strongest.candidateName.charAt(0).toUpperCase()}
            </div>
            <dl className={styles.rulerFigures}>
              <dt>Name</dt>
              <dd className={styles.rulerFigureName}>
                {strongest.candidateName}
                <span className={styles.strongestBadge}>Strongest candidate</span>
              </dd>
              <dt>Prestige</dt><dd>{strongest.prestige.toLocaleString()} points</dd>
              <dt>Rating</dt><dd>{strongest.rating}%</dd>
            </dl>
          </div>
        ) : (
          <div className={styles.politicsVacant}>No candidates</div>
        )}
      </section>

      <div className={styles.railBar} role="tablist" aria-label="Campaigns">
        <button
          role="tab"
          aria-selected={rail === 'mine' || !showAll}
          className={rail === 'mine' || !showAll ? `${styles.railTab} ${styles.railTabActive}` : styles.railTab}
          onClick={() => setRail('mine')}
        >
          Your campaign
        </button>
        {showAll && (
          <button
            role="tab"
            aria-selected={rail === 'all'}
            className={rail === 'all' ? `${styles.railTab} ${styles.railTabActive}` : styles.railTab}
            onClick={() => setRail('all')}
          >
            All campaigns
          </button>
        )}
      </div>

      <div className={styles.railBody}>
        {rail === 'all' && showAll ? (
          <table className={styles.dataTable}>
            <thead>
              <tr><th>Place</th><th>Name</th><th>Rating</th></tr>
            </thead>
            <tbody>
              {data.campaigns.map((c, i) => (
                <tr key={c.candidateName}>
                  <td>{i + 1}</td>
                  <td>{c.candidateName}</td>
                  <td>{c.rating}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            {data.campaignState === 'available' && (
              <>
                {/* StrCo0nCampaign_6 — ePolitics.lng:43, with the page's own threshold. */}
                <p className={styles.railLead}>
                  You are not participating in the coming elections. Launch your
                  political campaign below. To be accepted, your prestige must be
                  higher than {data.prestigeThreshold.toLocaleString()} points.
                </p>
                <button
                  className={styles.launchBtn}
                  onClick={() => client.onLaunchCampaign(buildingX, buildingY)}
                >
                  Launch Campaign
                </button>
              </>
            )}

            {data.campaignState === 'ruler' && (
              <p className={styles.railLead}>
                You are the {office}. You cannot have a campaign.
              </p>
            )}

            {data.campaignState === 'refused' && (
              <p className={styles.campaignMessage}>{data.campaignMessage}</p>
            )}

            {data.campaignState === 'running' && (
              <>
                <button
                  className={styles.cancelCampaignBtn}
                  onClick={() => client.onCancelCampaign(buildingX, buildingY)}
                >
                  Withdraw Campaign
                </button>

                {data.projects.length > 0 && (
                  <>
                    <h5 className={styles.railHeading}>Your programme</h5>
                    <table className={styles.dataTable}>
                      <thead>
                        <tr><th>Commitment</th><th>Your proposal</th></tr>
                      </thead>
                      <tbody>
                        {data.projects.map((p) => <ProjectRow key={p.id} project={p} />)}
                      </tbody>
                    </table>
                    {/* StrCo0nCampaign_5 — ePolitics.lng:42. The button is a plain
                        re-read: `tycooncampaign.asp:346` links back to itself with
                        `Recache=YES` and nothing else, which is what re-runs the
                        minister-name validation server-side. */}
                    <button
                      className={styles.actionBtn}
                      onClick={() => usePoliticsStore.getState().setLoadState('idle')}
                    >
                      Check Minister Names
                    </button>
                  </>
                )}

                {data.promise && (
                  <>
                    <h5 className={styles.railHeading}>Your promise</h5>
                    <p className={styles.campaignPromise}>{data.promise}</p>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
