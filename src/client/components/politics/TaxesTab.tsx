/**
 * TaxesTab — the mayor's tax table (`townTaxes`, Voyager `TownTaxesSheet.pas`).
 *
 * The single most important control a mayor has, and until now the one civic
 * group the client fetched and threw away: the gateway ships `townTaxes` with
 * every Town Hall read, and no tab rendered it.
 *
 * Voyager's layout is a list on the left and an editor on the right that stays
 * empty until a row is selected, and that is hidden outright from anyone who
 * does not own the facility (`:493-512`). Here the editor sits under the table,
 * because the modal is narrower than a frameset — but it appears on the same
 * condition, and only for the row in hand.
 *
 * Two kinds of tax exist (`BasicTaxes.pas:9-10`):
 *
 *   tkPercent (0)  a rate, 0..100, with subsidy as its own mode
 *   tkValue   (1)  a currency amount per unit
 *
 * Every tax a stock world registers is tkPercent — `TMetaTaxToAccount.Create`
 * hardcodes it (`BasicTaxes.pas:174`) and `StdTaxes` creates nothing else — so
 * the currency editor below is faithful but, on shipped data, unreachable.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { BuildingPropertyValue } from '@/shared/types';
import { useClient } from '../../context';
import { SaveIndicator } from '../building/SaveIndicator';
import { buildValueMap, getNum } from './capitol-utils';
import styles from './PoliticsPanel.module.css';

/** `Voyager/TownTaxesSheet.pas:18-19` — the `Tax<i>Kind` discriminator. */
const TAX_KIND_PERCENT = 0;
const TAX_KIND_VALUE = 1;

/**
 * What Voyager sends to subsidise: the literal string, never the slider value.
 *
 *     if subsidize
 *       then MSProxy.RDOSetTaxValue(TaxId, '-10')
 *
 * `TownTaxesSheet.pas:336-338`. The magnitude is not a rate — the server's
 * subsidy branch ignores it entirely and refunds the whole loss, so -1% and
 * -900% behave identically (`BasicTaxes.pas:197-210`). Subsidy is a mode, not a
 * number, and offering a negative slider would invent a mechanic.
 */
const SUBSIDY_VALUE = '-10';

/**
 * What replaces the green tick on a tax write.
 *
 * The tick claims "the server holds this value now", and nothing here can
 * support that claim. `RDOSetTaxValue` is a `procedure`, so no answer comes
 * back, and the read-back the gateway performs reads a cached copy that the
 * server never invalidates: it invalidates the TOWN (`Kernel/Population.pas:1285`)
 * while `Tax<i>Percent` is written onto the TOWN HALL facility
 * (`TTownHall.StoreToCache`, `:1061`/`:1243`). The figure therefore only moves
 * when that facility's own TTL lapses. That TTL is **two minutes**:
 * `CreateTTL(0,0,2,0)` at `:1192`, and the signature is
 * `CreateTTL(Days, Hours, Min, Sec)` (`Cache/CacheCommon.pas:66`). It is
 * re-checked on every SetObject (`Cache/CachedObjectWrap.pas:320`). Two minutes
 * is a deliberate exception, not the norm — every other object defaults to
 * `NULLTTL`, a zero duration that re-pulls on every read
 * (`Cache/CacheAgent.pas:90`, `CacheCommon.pas:34`).
 *
 * The rate itself is set at once — `Tax.ParseValue` runs outside the
 * authenticity guard (`:1257-1258`) — it is only collected later, at the next
 * `perYear` boundary (`Kernel/Kernel.pas:4176-4184`).
 */
const TAX_EFFECTIVE_NOTICE = 'The new tax rate will take effect tomorrow.';

interface TaxRow {
  index: number;
  name: string;
  kind: number;
  /** Signed, as cached. Negative means subsidised (`BasicTaxes.pas:235-238`). */
  percent: number;
  lastYear: string;
}

interface TaxesTabProps {
  properties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
  /** Does this player govern this Town Hall? See `grantAccess`. */
  canGovern: boolean;
}

export function TaxesTab({ properties, buildingX, buildingY, canGovern }: TaxesTabProps) {
  const client = useClient();
  const [selected, setSelected] = useState<number | null>(null);

  const rows = useMemo<TaxRow[]>(() => {
    const valueMap = buildValueMap(properties);
    const count = getNum(valueMap, 'TaxCount');
    return Array.from({ length: count }, (_, i) => ({
      index: i,
      name: valueMap.get(`Tax${i}Name0`) ?? '',
      kind: getNum(valueMap, `Tax${i}Kind`),
      percent: parseInt(valueMap.get(`Tax${i}Percent`) ?? '0', 10) || 0,
      lastYear: valueMap.get(`Tax${i}LastYear`) ?? '',
    }));
  }, [properties]);

  const setTax = useCallback(
    (row: TaxRow, value: string) => {
      // The server resolves Tax{index}Id into the real TaxId — an account id,
      // not the row ordinal (`building-property-handler.ts:141-153`).
      client.onSetBuildingProperty(buildingX, buildingY, 'RDOSetTaxValue', value, {
        index: String(row.index),
      });
    },
    [client, buildingX, buildingY],
  );

  if (rows.length === 0) {
    return <div className={styles.empty}>No taxes are levied here.</div>;
  }

  const active = selected !== null ? rows.find((r) => r.index === selected) ?? null : null;

  return (
    <>
      <div className={styles.tableScroll}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Value</th>
              <th>Last Year</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const subsidised = row.percent < 0;
              return (
                <tr
                  key={row.index}
                  className={row.index === selected ? styles.taxRowSelected : undefined}
                  onClick={() => canGovern && setSelected(row.index)}
                  aria-selected={row.index === selected}
                >
                  <td>
                    {/* Voyager encodes the state twice: in the cell text and in
                        a red/green badge (`:255-297`). Colour alone would not
                        survive a colourblind reader, so the word carries it. */}
                    <span
                      className={subsidised ? styles.taxBadgeSubsidised : styles.taxBadgeTaxed}
                      aria-hidden="true"
                    >
                      $
                    </span>
                    {row.name}
                  </td>
                  <td>{subsidised ? 'Subsidized' : `${row.percent}%`}</td>
                  <td>{row.lastYear}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Voyager hides the whole editor from anyone who does not own the
          facility, rather than disabling it (`:493-512`). */}
      {canGovern && (
        active === null ? (
          <p className={styles.railNote}>Select a tax to set its rate or subsidise it.</p>
        ) : (
          <TaxEditor key={active.index} row={active} onCommit={setTax} />
        )
      )}
    </>
  );
}

function TaxEditor({
  row,
  onCommit,
}: {
  row: TaxRow;
  onCommit: (row: TaxRow, value: string) => void;
}) {
  const subsidised = row.percent < 0;
  // `Data.Perc := abs(perc)` — the bar keeps the last rate while subsidised, so
  // switching back to Tax restores it rather than snapping to zero (`:264-270`).
  const [rate, setRate] = useState(Math.abs(row.percent));
  const pendingKey = `RDOSetTaxValue:{"index":"${row.index}"}`;

  /**
   * The signed value we believe the town holds — the server's when nothing has
   * been sent, otherwise the last thing we sent it. Signed, so a subsidy (`-10`)
   * and the rate it hides behind (`10`) are two different states.
   *
   * It is the whole guard. Three events end one gesture (pointer up, key up,
   * and the blur that follows either), and the tab used to emit on all three:
   * the live run of 2026-08-20 shows every value arriving twice — `520, 12` at
   * 8:23:53 and again at 8:23:58, `520, 14` twice, `520, 16` twice. The first
   * pair was not even a change: the row already stood at 12, and selecting it
   * then clicking away wrote 12 back. Each non-subsidy write also posts an
   * event to the town's news feed (`Kernel/Population.pas:1265-1276`), so a
   * duplicate is visible in the game, not just on the wire.
   */
  const lastSent = useRef<number>(row.percent);

  // The server has the last word. It takes up to two minutes to get it — the
  // Town Hall's cache TTL, see TAX_EFFECTIVE_NOTICE — and until then this must
  // not snap back, so it reacts to the figure changing rather than to every
  // refresh. Clearing the guard here is what lets a rate be set again after the
  // town has moved off it.
  useEffect(() => {
    setRate(Math.abs(row.percent));
    lastSent.current = row.percent;
  }, [row.percent]);

  /**
   * One frame per gesture, and never a value the town already carries.
   *
   * `wire` exists so the subsidy keeps reaching the server as the literal
   * `SUBSIDY_VALUE` rather than as a number this function re-rendered — the
   * guard needs a number, the wire wants the string Voyager sends.
   */
  const commit = useCallback(
    (percent: number, wire: string = String(percent)) => {
      if (percent === lastSent.current) return;
      lastSent.current = percent;
      onCommit(row, wire);
    },
    [onCommit, row],
  );

  if (row.kind === TAX_KIND_VALUE) {
    return <FixedTaxEditor row={row} onCommit={onCommit} pendingKey={pendingKey} />;
  }

  if (row.kind !== TAX_KIND_PERCENT) {
    // `Data.Page := 0` — a kind the client does not model shows no editor at all.
    return <p className={styles.railNote}>This tax cannot be edited from here.</p>;
  }

  return (
    <div className={styles.taxEditor}>
      <div className={styles.taxEditorHeader}>
        <span className={styles.sectionTitle}>{row.name}</span>
        <SaveIndicator propertyKey={pendingKey} confirmedMessage={TAX_EFFECTIVE_NOTICE} />
      </div>

      <div className={styles.taxModes} role="radiogroup" aria-label="Tax mode">
        <label className={styles.taxMode}>
          <input
            type="radio"
            name={`taxmode-${row.index}`}
            checked={!subsidised}
            onChange={() => commit(rate)}
          />
          Tax
        </label>
        <label className={styles.taxMode}>
          <input
            type="radio"
            name={`taxmode-${row.index}`}
            checked={subsidised}
            onChange={() => commit(parseInt(SUBSIDY_VALUE, 10), SUBSIDY_VALUE)}
          />
          Subsidize
        </label>
      </div>

      {/* Choosing Subsidize HIDES the rate control in Voyager rather than
          disabling it (`:403-406`): a subsidy carries no percentage at all. */}
      {!subsidised && (
        <div className={styles.sliderCell}>
          <label className={styles.sliderLabel} htmlFor={`taxrate-${row.index}`}>
            Tax: {rate}%
          </label>
          <input
            id={`taxrate-${row.index}`}
            type="range"
            className={styles.slider}
            min={0}
            max={100}
            step={1}
            value={rate}
            onChange={(e) => setRate(parseInt(e.target.value, 10))}
            // One frame per gesture, as Voyager emits on MouseUp only
            // (`PercentEdit.pas:357-362`) — keyboard and blur included, so an
            // arrow-key change is not silently lost.
            onPointerUp={(e) => commit(parseInt(e.currentTarget.value, 10))}
            onKeyUp={(e) => commit(parseInt(e.currentTarget.value, 10))}
            onBlur={(e) => commit(parseInt(e.currentTarget.value, 10))}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The tkValue editor: a currency amount and an explicit Set button
 * (`TownTaxesSheet.pas:416-440`). Unreachable on stock world data — see the
 * module comment — but the group models `Kind`, so the branch exists.
 */
function FixedTaxEditor({
  row,
  onCommit,
  pendingKey,
}: {
  row: TaxRow;
  onCommit: (row: TaxRow, value: string) => void;
  pendingKey: string;
}) {
  const [text, setText] = useState(String(row.percent));
  const parsed = Number(text);
  const isValid = text.trim() !== '' && Number.isFinite(parsed);

  return (
    <div className={styles.taxEditor}>
      <div className={styles.taxEditorHeader}>
        <span className={styles.sectionTitle}>{row.name}</span>
        <SaveIndicator propertyKey={pendingKey} confirmedMessage={TAX_EFFECTIVE_NOTICE} />
      </div>
      <div className={styles.taxValueRow}>
        <input
          className={styles.budgetInput}
          type="number"
          step="any"
          aria-label={`Amount per unit for ${row.name}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className={styles.actionBtn}
          disabled={!isValid}
          onClick={() => onCommit(row, String(parsed))}
        >
          Set
        </button>
      </div>
    </div>
  );
}
