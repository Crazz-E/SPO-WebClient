/**
 * PropertyGroup — Renders building property values for the active tab.
 *
 * Uses property definitions from shared/building-details to determine
 * rendering: text, currency, percentage, slider (editable), boolean, etc.
 * Editable properties dispatch changes via the client callbacks.
 */

import { useState, useCallback, useRef } from 'react';
import type { BuildingPropertyValue } from '@/shared/types';
import {
  PropertyType,
  type PropertyDefinition,
  type PropertyGroup as PropertyGroupDef,
  formatCurrency,
  formatPercentage,
  formatNumber,
  getTemplateForVisualClass,
} from '@/shared/building-details';
import { useBuildingStore } from '../../store/building-store';
import { useClient } from '../../context';
import styles from './PropertyGroup.module.css';

interface PropertyGroupProps {
  properties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
}

export function PropertyGroup({ properties, buildingX, buildingY }: PropertyGroupProps) {
  const details = useBuildingStore((s) => s.details);
  const isOwner = useBuildingStore((s) => s.isOwner);
  const currentTab = useBuildingStore((s) => s.currentTab);

  if (properties.length === 0) {
    return <div className={styles.empty}>No data available for this tab</div>;
  }

  // Build value map for lookups
  const valueMap = new Map<string, string>();
  for (const prop of properties) {
    valueMap.set(prop.name, prop.value);
  }

  // Get property definitions from template system
  const visualClass = details?.visualClass ?? '0';
  const template = getTemplateForVisualClass(visualClass);
  const activeGroup = template.groups.find((g) => g.id === currentTab) ?? template.groups[0];
  const definitions = activeGroup?.properties ?? [];

  // Check if this is a town tab (mayor can edit town properties)
  const isTownTab = activeGroup?.special === 'town';
  const canEdit = isTownTab ? checkIsMayor(properties) : isOwner;

  return (
    <div className={styles.group}>
      {definitions.length > 0 ? (
        <DefinedProperties
          definitions={definitions}
          valueMap={valueMap}
          properties={properties}
          canEdit={canEdit}
          buildingX={buildingX}
          buildingY={buildingY}
        />
      ) : (
        // Fallback: render raw name/value pairs
        properties.map((prop, i) => (
          <RawPropertyRow key={`${prop.name}-${i}`} prop={prop} />
        ))
      )}
    </div>
  );
}

/** Check if current player is mayor of this town (from ActualRuler property) */
function checkIsMayor(properties: BuildingPropertyValue[]): boolean {
  const ruler = properties.find((p) => p.name === 'ActualRuler');
  return ruler?.value !== undefined && ruler.value !== '';
}

// =============================================================================
// DEFINED PROPERTIES (template-driven rendering)
// =============================================================================

interface DefinedPropertiesProps {
  definitions: PropertyDefinition[];
  valueMap: Map<string, string>;
  properties: BuildingPropertyValue[];
  canEdit: boolean;
  buildingX: number;
  buildingY: number;
}

function DefinedProperties({
  definitions,
  valueMap,
  properties,
  canEdit,
  buildingX,
  buildingY,
}: DefinedPropertiesProps) {
  const client = useClient();
  const rendered = new Set<string>();
  const elements: JSX.Element[] = [];

  const handlePropertyChange = useCallback(
    (propertyName: string, value: number) => {
      client.onSetBuildingProperty(buildingX, buildingY, propertyName, String(value));
    },
    [buildingX, buildingY, client],
  );

  const handleActionButton = useCallback(
    (actionId: string) => {
      client.onBuildingAction(actionId);
    },
    [client],
  );

  for (const def of definitions) {
    // Workforce table
    if (def.type === PropertyType.WORKFORCE_TABLE) {
      elements.push(
        <WorkforceTable
          key="workforce"
          properties={properties}
          canEdit={canEdit}
          onPropertyChange={handlePropertyChange}
        />,
      );
      for (let i = 0; i < 3; i++) {
        rendered.add(`Workers${i}`);
        rendered.add(`WorkersMax${i}`);
        rendered.add(`WorkersK${i}`);
        rendered.add(`Salaries${i}`);
        rendered.add(`WorkForcePrice${i}`);
        rendered.add(`WorkersCap${i}`);
        rendered.add(`MinSalaries${i}`);
      }
      continue;
    }

    // Upgrade actions
    if (def.type === PropertyType.UPGRADE_ACTIONS) {
      elements.push(
        <UpgradeActions
          key="upgrade"
          properties={properties}
          canEdit={canEdit}
          buildingX={buildingX}
          buildingY={buildingY}
        />,
      );
      for (const name of ['UpgradeLevel', 'MaxUpgrade', 'NextUpgCost', 'Upgrading', 'Pending']) {
        rendered.add(name);
      }
      continue;
    }

    // Action button
    if (def.type === PropertyType.ACTION_BUTTON) {
      elements.push(
        <ActionButton
          key={`action-${def.actionId ?? def.rdoName}`}
          def={def}
          onAction={handleActionButton}
        />,
      );
      rendered.add(def.rdoName);
      continue;
    }

    // Regular property
    const value = valueMap.get(def.rdoName);
    if (value === undefined) continue;

    // Skip hidden empties
    if (def.hideEmpty && (!value || value.trim() === '' || value === '0')) continue;
    // Skip upgrade properties (rendered by UPGRADE_ACTIONS)
    if (['UpgradeLevel', 'MaxUpgrade', 'NextUpgCost', 'Upgrading', 'Pending'].includes(def.rdoName)) {
      rendered.add(def.rdoName);
      continue;
    }

    rendered.add(def.rdoName);
    elements.push(
      <DefinedPropertyRow
        key={def.rdoName}
        def={def}
        value={value}
        maxValue={def.maxProperty ? valueMap.get(def.maxProperty) : undefined}
        canEdit={canEdit}
        onPropertyChange={handlePropertyChange}
      />,
    );
  }

  // Fallback: unmatched properties
  for (const prop of properties) {
    if (!rendered.has(prop.name) && !prop.name.startsWith('_') && prop.name !== 'ObjectId' && prop.name !== 'SecurityId') {
      elements.push(<RawPropertyRow key={`raw-${prop.name}`} prop={prop} />);
    }
  }

  return <>{elements}</>;
}

// =============================================================================
// PROPERTY ROW COMPONENTS
// =============================================================================

interface DefinedPropertyRowProps {
  def: PropertyDefinition;
  value: string;
  maxValue?: string;
  canEdit: boolean;
  onPropertyChange: (name: string, value: number) => void;
}

function DefinedPropertyRow({ def, value, maxValue, canEdit, onPropertyChange }: DefinedPropertyRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.name} title={def.tooltip}>{def.displayName}</span>
      <PropertyValue
        def={def}
        value={value}
        maxValue={maxValue}
        canEdit={canEdit}
        onPropertyChange={onPropertyChange}
      />
    </div>
  );
}

function RawPropertyRow({ prop }: { prop: BuildingPropertyValue }) {
  return (
    <div className={styles.row}>
      <span className={styles.name}>{prop.name}</span>
      <span className={styles.value}>{prop.value}</span>
    </div>
  );
}

// =============================================================================
// VALUE RENDERERS
// =============================================================================

interface PropertyValueProps {
  def: PropertyDefinition;
  value: string;
  maxValue?: string;
  canEdit: boolean;
  onPropertyChange: (name: string, value: number) => void;
}

function PropertyValue({ def, value, maxValue, canEdit, onPropertyChange }: PropertyValueProps) {
  const num = parseFloat(value);
  const colorClass = getColorClass(num, def.colorCode);

  switch (def.type) {
    case PropertyType.CURRENCY:
      return <span className={`${styles.value} ${colorClass}`}>{formatCurrency(num)}</span>;

    case PropertyType.PERCENTAGE:
      return <span className={`${styles.value} ${colorClass}`}>{formatPercentage(num)}</span>;

    case PropertyType.NUMBER:
      return (
        <span className={`${styles.value} ${colorClass}`}>
          {isNaN(num) ? value : formatNumber(num, def.unit)}
        </span>
      );

    case PropertyType.RATIO:
      return <RatioValue current={num} max={maxValue ? parseFloat(maxValue) : 0} />;

    case PropertyType.BOOLEAN:
      return <BooleanValue value={value} canEdit={canEdit && !!def.editable} rdoName={def.rdoName} onPropertyChange={onPropertyChange} />;

    case PropertyType.SLIDER:
      if (canEdit && def.editable) {
        return (
          <SliderInput
            value={num}
            min={def.min ?? 0}
            max={def.max ?? 300}
            step={def.step ?? 5}
            unit={def.unit}
            rdoName={def.rdoName}
            onPropertyChange={onPropertyChange}
          />
        );
      }
      return <span className={styles.value}>{isNaN(num) ? value : `${num}${def.unit ?? ''}`}</span>;

    default:
      return <span className={styles.value}>{value || '-'}</span>;
  }
}

function getColorClass(num: number, colorCode?: string): string {
  if (!colorCode) return '';
  if (colorCode === 'positive') return styles.positive;
  if (colorCode === 'negative') return styles.negative;
  if (colorCode === 'auto') {
    if (num > 0) return styles.positive;
    if (num < 0) return styles.negative;
  }
  return '';
}

// =============================================================================
// SLIDER INPUT (editable numeric property)
// =============================================================================

interface SliderInputProps {
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  rdoName: string;
  onPropertyChange: (name: string, value: number) => void;
}

function SliderInput({ value, min, max, step, unit, rdoName, onPropertyChange }: SliderInputProps) {
  const [localVal, setLocalVal] = useState(isNaN(value) ? min : value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = parseFloat(e.target.value);
      setLocalVal(newVal);

      // Debounce server call
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onPropertyChange(rdoName, newVal);
      }, 300);
    },
    [rdoName, onPropertyChange],
  );

  return (
    <div className={styles.sliderContainer}>
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={localVal}
        onChange={handleChange}
      />
      <span className={styles.sliderValue}>
        {localVal}{unit ?? ''}
      </span>
    </div>
  );
}

// =============================================================================
// RATIO VALUE (progress bar)
// =============================================================================

function RatioValue({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  return (
    <div className={styles.ratioContainer}>
      <div className={styles.ratioBar}>
        <div className={styles.ratioFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.ratioText}>
        {max > 0 ? `${current}/${max}` : `${current}`}
      </span>
    </div>
  );
}

// =============================================================================
// BOOLEAN VALUE (checkbox for editable, text for read-only)
// =============================================================================

function BooleanValue({
  value,
  canEdit,
  rdoName,
  onPropertyChange,
}: {
  value: string;
  canEdit: boolean;
  rdoName: string;
  onPropertyChange: (name: string, value: number) => void;
}) {
  const numVal = parseInt(value, 10);
  const isTrue = (!isNaN(numVal) && numVal !== 0) || value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';

  if (canEdit) {
    return (
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={isTrue}
        onChange={(e) => onPropertyChange(rdoName, e.target.checked ? -1 : 0)}
      />
    );
  }

  return (
    <span className={`${styles.value} ${isTrue ? styles.positive : styles.muted}`}>
      {isTrue ? 'Yes' : 'No'}
    </span>
  );
}

// =============================================================================
// WORKFORCE TABLE
// =============================================================================

function WorkforceTable({
  properties,
  canEdit,
  onPropertyChange,
}: {
  properties: BuildingPropertyValue[];
  canEdit: boolean;
  onPropertyChange: (name: string, value: number) => void;
}) {
  const vm = new Map<string, string>();
  for (const p of properties) vm.set(p.name, p.value);

  const getNum = (name: string) => parseFloat(vm.get(name) ?? '0') || 0;
  const isActive = (i: number) => {
    const cap = vm.has(`WorkersCap${i}`) ? getNum(`WorkersCap${i}`) : getNum(`WorkersMax${i}`);
    return cap > 0;
  };

  const classes = ['Executives', 'Professionals', 'Workers'];

  return (
    <table className={styles.workforceTable}>
      <thead>
        <tr>
          <th />
          {classes.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {/* Jobs row */}
        <tr>
          <td className={styles.wfLabel}>Jobs</td>
          {[0, 1, 2].map((i) => (
            <td key={i} className={styles.wfValue}>
              {isActive(i) ? `${getNum(`Workers${i}`)}/${getNum(`WorkersMax${i}`)}` : ''}
            </td>
          ))}
        </tr>
        {/* Quality row */}
        <tr>
          <td className={styles.wfLabel}>Quality</td>
          {[0, 1, 2].map((i) => (
            <td key={i} className={styles.wfValue}>
              {isActive(i) ? formatPercentage(getNum(`WorkersK${i}`)) : ''}
            </td>
          ))}
        </tr>
        {/* Salaries row */}
        <tr>
          <td className={styles.wfLabel}>Salaries</td>
          {[0, 1, 2].map((i) => (
            <td key={i} className={styles.wfValue}>
              {isActive(i) && (
                <SalaryCell
                  index={i}
                  price={getNum(`WorkForcePrice${i}`)}
                  salary={getNum(`Salaries${i}`)}
                  minSalary={getNum(`MinSalaries${i}`)}
                  canEdit={canEdit}
                  onPropertyChange={onPropertyChange}
                />
              )}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function SalaryCell({
  index,
  price,
  salary,
  minSalary,
  canEdit,
  onPropertyChange,
}: {
  index: number;
  price: number;
  salary: number;
  minSalary: number;
  canEdit: boolean;
  onPropertyChange: (name: string, value: number) => void;
}) {
  const [localVal, setLocalVal] = useState(salary);

  const handleBlur = useCallback(() => {
    let v = localVal;
    if (v < minSalary) v = minSalary;
    if (v > 250) v = 250;
    setLocalVal(v);
    onPropertyChange(`Salaries${index}`, v);
  }, [localVal, minSalary, index, onPropertyChange]);

  return (
    <div className={styles.salaryCell}>
      <span className={styles.salaryPrice}>{formatCurrency(price)}</span>
      {canEdit && (
        <div className={styles.salaryInput}>
          <input
            type="number"
            className={styles.salaryField}
            min={minSalary > 0 ? minSalary : 0}
            max={250}
            step={1}
            value={localVal}
            onChange={(e) => setLocalVal(parseInt(e.target.value, 10) || 0)}
            onBlur={handleBlur}
          />
          <span className={styles.salaryPercent}>%</span>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// UPGRADE ACTIONS
// =============================================================================

function UpgradeActions({
  properties,
  canEdit,
  buildingX,
  buildingY,
}: {
  properties: BuildingPropertyValue[];
  canEdit: boolean;
  buildingX: number;
  buildingY: number;
}) {
  const client = useClient();
  const [qty, setQty] = useState(1);
  const vm = new Map<string, string>();
  for (const p of properties) vm.set(p.name, p.value);

  const isUpgrading = vm.get('Upgrading') === '1' || vm.get('Upgrading')?.toLowerCase() === 'yes';
  const currentLevel = parseInt(vm.get('UpgradeLevel') ?? '0');
  const maxLevel = parseInt(vm.get('MaxUpgrade') ?? '0');
  const pending = parseInt(vm.get('Pending') ?? '0');
  const remaining = Math.max(0, maxLevel - currentLevel);

  return (
    <div className={styles.upgradeContainer}>
      <div className={styles.upgradeLevel}>
        Level {currentLevel}
        {isUpgrading && pending > 0 && <span className={styles.upgradePending}>(+{pending})</span>}
        /{maxLevel}
      </div>

      {canEdit && (
        <>
          {isUpgrading && pending > 0 ? (
            <button
              className={styles.upgradeStopBtn}
              onClick={() => client.onUpgradeBuilding(buildingX, buildingY, 'STOP_UPGRADE')}
            >
              STOP
            </button>
          ) : (
            remaining > 0 && (
              <div className={styles.upgradeRow}>
                <span className={styles.upgradeLabel}>Upgrade</span>
                <button className={styles.upgradeBtn} onClick={() => setQty((q) => Math.max(1, q - 1))}>-</button>
                <input
                  type="number"
                  className={styles.upgradeQty}
                  min={1}
                  max={remaining}
                  value={qty}
                  onChange={(e) => setQty(Math.min(remaining, Math.max(1, parseInt(e.target.value) || 1)))}
                />
                <button className={styles.upgradeBtn} onClick={() => setQty((q) => Math.min(remaining, q + 1))}>+</button>
                <button
                  className={styles.upgradeOkBtn}
                  onClick={() => client.onUpgradeBuilding(buildingX, buildingY, 'START_UPGRADE', qty)}
                >
                  OK
                </button>
              </div>
            )
          )}

          {currentLevel > 0 && (
            <button
              className={styles.downgradeBtn}
              onClick={() => client.onUpgradeBuilding(buildingX, buildingY, 'DOWNGRADE')}
            >
              Downgrade
            </button>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// ACTION BUTTON
// =============================================================================

function ActionButton({ def, onAction }: { def: PropertyDefinition; onAction: (id: string) => void }) {
  return (
    <div className={styles.actionBtnContainer}>
      <button
        className={styles.actionBtn}
        onClick={() => def.actionId && onAction(def.actionId)}
      >
        {def.buttonLabel ?? def.displayName}
      </button>
    </div>
  );
}
