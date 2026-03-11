/**
 * PropertyGroup — Renders building property values for the active tab.
 *
 * Uses property definitions from shared/building-details to determine
 * rendering: text, currency, percentage, slider (editable), boolean, etc.
 * Editable properties dispatch changes via the client callbacks.
 */

import { useState, useCallback, useRef, useEffect, memo, type JSX } from 'react';
import type { BuildingPropertyValue, BuildingProductData } from '@/shared/types';
import {
  PropertyType,
  type PropertyDefinition,
  type TableColumn,
  type RdoCommandMapping,
  formatCurrency,
  formatPercentage,
  formatNumber,
  getTemplateForVisualClass,
} from '@/shared/building-details';
import { isCivicBuilding } from '@/shared/building-details/civic-buildings';
import { useBuildingStore } from '../../store/building-store';
import { useGameStore } from '../../store/game-store';
import { useClient } from '../../context';
import { ResearchPanel } from './ResearchPanel';
import { RevenueGraph } from './RevenueGraph';
import { SaveIndicator } from './SaveIndicator';
import { SuppliesPanel } from './SuppliesGroup';
import { ProductsPanel } from './ProductsGroup';
import { CompInputsPanel } from './InputsGroup';
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
  const isPublicOfficeRole = useGameStore((s) => s.isPublicOfficeRole);

  // Get property definitions from template system.
  // Template cache is populated by the store's setDetails action (via registerInspectorTabs)
  // using the handlerName fields the server sends with each tab.
  const visualClass = details?.visualClass ?? '0';
  const template = getTemplateForVisualClass(visualClass);
  const activeGroup = template.groups.find((g) => g.id === currentTab) ?? template.groups[0];
  const definitions = activeGroup?.properties ?? [];

  // Check if this is a town tab (mayor can edit town properties)
  const isTownTab = activeGroup?.special === 'town';
  // President can edit civic building properties (Capitol Budget, Town taxes, etc.)
  const isCivic = isCivicBuilding(visualClass);
  const canEdit = isTownTab ? checkIsMayor(properties) : (isOwner || (isCivic && isPublicOfficeRole));

  // Special: supplies tab — render structured supply UI from details.supplies
  if (activeGroup?.special === 'supplies') {
    return (
      <div className={styles.group}>
        <SuppliesPanel
          supplies={details?.supplies ?? []}
          canEdit={canEdit}
          buildingX={buildingX}
          buildingY={buildingY}
        />
      </div>
    );
  }

  // Special: products tab — render structured product UI from details.products
  if (activeGroup?.special === 'products') {
    return (
      <div className={styles.group}>
        <ProductsPanel
          products={details?.products ?? []}
          canEdit={canEdit}
          buildingX={buildingX}
          buildingY={buildingY}
        />
      </div>
    );
  }

  // Special: compInputs tab — eager render of company inputs (cInputCount/cInput{i}.* protocol)
  if (activeGroup?.special === 'compInputs') {
    return (
      <div className={styles.group}>
        <CompInputsPanel
          compInputs={details?.compInputs ?? []}
          canEdit={canEdit}
          buildingX={buildingX}
          buildingY={buildingY}
        />
      </div>
    );
  }

  if (properties.length === 0) {
    return <div className={styles.empty}>No data available for this tab</div>;
  }

  // Build value map for lookups
  const valueMap = new Map<string, string>();
  for (const prop of properties) {
    valueMap.set(prop.name, prop.value);
  }

  return (
    <div className={styles.group}>
      {definitions.length > 0 ? (
        <DefinedProperties
          definitions={definitions}
          rdoCommands={activeGroup?.rdoCommands}
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
export function checkIsMayor(properties: BuildingPropertyValue[]): boolean {
  const ruler = properties.find((p) => p.name === 'ActualRuler');
  return ruler?.value !== undefined && ruler.value !== '';
}

// =============================================================================
// RDO COMMAND RESOLUTION
// =============================================================================

/**
 * Resolve a raw property name to the correct RDO command and params.
 * Uses the group's rdoCommands mapping to translate property names like
 * 'srvPrices0' → { command: 'RDOSetPrice', params: { index: '0' } }
 * 'Stopped' → { command: 'property', params: { propertyName: 'Stopped' } }
 */
export function resolveRdoCommand(
  propertyName: string,
  rdoCommands?: Record<string, RdoCommandMapping>,
): { command: string; params?: Record<string, string> } {
  if (!rdoCommands) {
    return { command: propertyName };
  }

  // Direct match (non-indexed): e.g., 'Stopped' → { command: 'property' }
  if (rdoCommands[propertyName]) {
    const mapping = rdoCommands[propertyName];
    if (mapping.command === 'property') {
      return { command: 'property', params: { propertyName, ...mapping.params } };
    }
    return { command: mapping.command, params: mapping.params };
  }

  // Indexed match: strip trailing digits to find base name.
  // e.g., 'srvPrices0' → base='srvPrices', index='0'
  const match = propertyName.match(/^(.+?)(\d+)$/);
  if (match) {
    const [, baseName, indexStr] = match;
    const mapping = rdoCommands[baseName];
    if (mapping?.indexed) {
      const params: Record<string, string> = { index: indexStr, ...mapping.params };
      if (mapping.command === 'property') {
        return { command: 'property', params: { propertyName, ...params } };
      }
      return { command: mapping.command, params };
    }
  }

  // Mid-index match for columnSuffix patterns: digits embedded in middle.
  // e.g., 'Tax0Percent' → prefix='Tax', index='0', suffix='Percent' → key='TaxPercent'
  const midMatch = propertyName.match(/^(.*?)(\d+)(.+)$/);
  if (midMatch) {
    const [, prefix, indexStr, suffix] = midMatch;
    const compositeKey = prefix + suffix;
    const mapping = rdoCommands[compositeKey];
    if (mapping?.indexed) {
      const params: Record<string, string> = { index: indexStr, ...mapping.params };
      if (mapping.command === 'property') {
        return { command: 'property', params: { propertyName, ...params } };
      }
      return { command: mapping.command, params };
    }
  }

  // No mapping found — pass through as-is
  return { command: propertyName };
}

/**
 * Compute the pending-update key for a property, matching the key format
 * used in client.ts setBuildingProperty: "command" or "command:{"index":"0"}"
 */
export function computePendingKey(
  rdoName: string,
  rdoCommands?: Record<string, RdoCommandMapping>,
): string {
  const { command, params } = resolveRdoCommand(rdoName, rdoCommands);
  return params ? `${command}:${JSON.stringify(params)}` : command;
}

// =============================================================================
// DEFINED PROPERTIES (template-driven rendering)
// =============================================================================

interface DefinedPropertiesProps {
  definitions: PropertyDefinition[];
  rdoCommands?: Record<string, RdoCommandMapping>;
  valueMap: Map<string, string>;
  properties: BuildingPropertyValue[];
  canEdit: boolean;
  buildingX: number;
  buildingY: number;
}

function DefinedProperties({
  definitions,
  rdoCommands,
  valueMap,
  properties,
  canEdit,
  buildingX,
  buildingY,
}: DefinedPropertiesProps) {
  const client = useClient();
  const details = useBuildingStore((s) => s.details);
  const currentTab = useBuildingStore((s) => s.currentTab);
  const rendered = new Set<string>();
  const elements: JSX.Element[] = [];

  const handlePropertyChange = useCallback(
    (propertyName: string, value: number) => {
      // Resolve raw property name to RDO command via rdoCommands mapping.
      // e.g., 'srvPrices0' → RDOSetPrice with index=0
      const resolved = resolveRdoCommand(propertyName, rdoCommands);
      client.onSetBuildingProperty(
        buildingX, buildingY,
        resolved.command, String(value),
        resolved.params,
      );
    },
    [buildingX, buildingY, client, rdoCommands],
  );

  const handleStringPropertyChange = useCallback(
    (propertyName: string, value: string) => {
      // String variant for widestring properties like Name.
      const resolved = resolveRdoCommand(propertyName, rdoCommands);
      client.onSetBuildingProperty(
        buildingX, buildingY,
        resolved.command, value,
        resolved.params,
      );
    },
    [buildingX, buildingY, client, rdoCommands],
  );

  const handleActionButton = useCallback(
    (actionId: string) => {
      client.onBuildingAction(actionId);
    },
    [client],
  );

  const handleRowAction = useCallback(
    (actionId: string, rowIndex: number) => {
      const rowData: Record<string, string> = {};
      const tableDef = definitions.find((d) => d.type === PropertyType.TABLE);
      if (tableDef?.columns) {
        const propSuffix = tableDef.indexSuffix || '';
        for (const col of tableDef.columns) {
          const colSuffix = col.columnSuffix || '';
          const idxSuffix = col.indexSuffix !== undefined ? col.indexSuffix : propSuffix;
          const key = `${col.rdoSuffix}${rowIndex}${colSuffix}${idxSuffix}`;
          rowData[col.rdoSuffix] = valueMap.get(key) ?? '';
        }
      }
      rowData['_index'] = String(rowIndex);
      client.onBuildingAction(actionId, rowData);
    },
    [definitions, valueMap, client],
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

    // Repair control (progress bar + conditional start/stop)
    if (def.type === PropertyType.REPAIR_CONTROL) {
      const repairValue = valueMap.get('Repair') ?? '';
      const repairPrice = valueMap.get('RepairPrice') ?? '0';
      elements.push(
        <RepairControl
          key="repair"
          repairValue={repairValue}
          repairPrice={repairPrice}
          canEdit={canEdit}
          onAction={handleActionButton}
        />,
      );
      rendered.add('Repair');
      rendered.add('RepairPrice');
      continue;
    }

    // Research panel (custom HQ inventions UI)
    if (def.type === PropertyType.RESEARCH_PANEL) {
      elements.push(
        <ResearchPanel key="research" buildingX={buildingX} buildingY={buildingY} />,
      );
      rendered.add(def.rdoName);
      continue;
    }

    // Stop toggle button (Close/Open building) — owner only
    if (def.type === PropertyType.STOP_TOGGLE) {
      const stoppedValue = valueMap.get(def.rdoName) ?? '0';
      if (canEdit) {
        elements.push(
          <StopToggle
            key="stop-toggle"
            stoppedValue={stoppedValue}
            onPropertyChange={handlePropertyChange}
          />,
        );
      }
      rendered.add(def.rdoName);
      continue;
    }

    // Trade connect/disconnect buttons (visible to all players)
    if (def.type === PropertyType.TRADE_CONNECT_BUTTONS) {
      elements.push(
        <TradeConnectButtons
          key="trade-connect"
          onAction={handleActionButton}
        />,
      );
      rendered.add(def.rdoName);
      continue;
    }

    // Action button
    if (def.type === PropertyType.ACTION_BUTTON) {
      // Owner-only actions (connectMap, demolish) hidden from non-owners
      const ownerOnlyActions = new Set(['connectMap', 'demolish']);
      if (ownerOnlyActions.has(def.actionId ?? '') && !canEdit) {
        rendered.add(def.rdoName);
        continue;
      }
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

    // Clone settings (checklist of clone options + Apply button)
    if (def.type === PropertyType.CLONE_SETTINGS) {
      const cloneMenuValue = valueMap.get('CloneMenu0') ?? '';
      elements.push(
        <CloneSettings
          key="clone-settings"
          cloneMenuValue={cloneMenuValue}
          buildingX={buildingX}
          buildingY={buildingY}
        />,
      );
      rendered.add(def.rdoName);
      continue;
    }

    // Revenue graph (MoneyGraphInfo)
    if (def.type === PropertyType.GRAPH) {
      const hasGraph = valueMap.get('MoneyGraph') ?? '0';
      if (details?.moneyGraph?.length && hasGraph !== '0') {
        elements.push(
          <RevenueGraph key="revenue-graph" data={details.moneyGraph} />,
        );
      }
      rendered.add(def.rdoName);
      continue;
    }

    // SERVICE_CARDS — card-per-service layout with price slider + avg marker
    if (def.type === PropertyType.SERVICE_CARDS && def.columns && def.columns.length > 0) {
      const propSuffix = def.indexSuffix || '';

      let rowCount = 0;
      if (def.countProperty) {
        rowCount = parseInt(valueMap.get(def.countProperty) ?? '0', 10) || 0;
        rendered.add(def.countProperty);
      }

      // Mark all column keys as rendered
      for (let i = 0; i < rowCount; i++) {
        for (const col of def.columns) {
          const colSuffix = col.columnSuffix || '';
          const idxSuffix = col.indexSuffix !== undefined ? col.indexSuffix : propSuffix;
          rendered.add(`${col.rdoSuffix}${i}${colSuffix}${idxSuffix}`);
        }
      }

      if (rowCount > 0) {
        elements.push(
          <ServiceCardList
            key={`svc-cards-${def.rdoName}`}
            def={def}
            rowCount={rowCount}
            valueMap={valueMap}
            canEdit={canEdit}
            onPropertyChange={handlePropertyChange}
          />,
        );
      }
      continue;
    }

    // TABLE property — multi-column indexed data
    if (def.type === PropertyType.TABLE && def.columns && def.columns.length > 0) {
      const propSuffix = def.indexSuffix || '';

      // Determine row count
      let rowCount = 0;
      if (def.countProperty) {
        rowCount = parseInt(valueMap.get(def.countProperty) ?? '0', 10) || 0;
        rendered.add(def.countProperty);
      } else if (def.indexMax !== undefined) {
        rowCount = def.indexMax + 1;
      } else {
        // Scan for first column keys to detect row count
        const firstCol = def.columns[0];
        const colSuffix = firstCol.columnSuffix || '';
        const idxSuffix = firstCol.indexSuffix !== undefined ? firstCol.indexSuffix : propSuffix;
        for (let i = 0; i < 50; i++) {
          if (valueMap.has(`${firstCol.rdoSuffix}${i}${colSuffix}${idxSuffix}`)) rowCount = i + 1;
          else break;
        }
      }

      // Mark all column keys as rendered
      for (let i = 0; i < rowCount; i++) {
        for (const col of def.columns) {
          const colSuffix = col.columnSuffix || '';
          const idxSuffix = col.indexSuffix !== undefined ? col.indexSuffix : propSuffix;
          rendered.add(`${col.rdoSuffix}${i}${colSuffix}${idxSuffix}`);
        }
      }

      if (rowCount > 0) {
        elements.push(
          <DataTable
            key={`table-${def.rdoName}`}
            def={def}
            rowCount={rowCount}
            valueMap={valueMap}
            canEdit={canEdit}
            rdoCommands={rdoCommands}
            onPropertyChange={handlePropertyChange}
            onRowAction={handleRowAction}
          />,
        );
      }
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
        onStringPropertyChange={handleStringPropertyChange}
        rdoCommands={rdoCommands}
      />,
    );
  }

  // Product summary on General tab for industrial buildings
  // Only show if we're on a General tab and products data exists
  const isGeneralTab = currentTab?.endsWith('General') || currentTab === 'generic';
  const products = details?.products ?? [];
  if (isGeneralTab && products.length > 0) {
    elements.push(
      <ProductSummaryCards
        key="product-summary"
        products={products}
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
  onStringPropertyChange?: (name: string, value: string) => void;
  rdoCommands?: Record<string, RdoCommandMapping>;
}

function DefinedPropertyRow({ def, value, maxValue, canEdit, onPropertyChange, onStringPropertyChange, rdoCommands }: DefinedPropertyRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.name} title={def.tooltip}>{def.displayName}</span>
      <PropertyValue
        def={def}
        value={value}
        maxValue={maxValue}
        canEdit={canEdit}
        onPropertyChange={onPropertyChange}
        onStringPropertyChange={onStringPropertyChange}
        rdoCommands={rdoCommands}
      />
    </div>
  );
}

const RawPropertyRow = memo(function RawPropertyRow({ prop }: { prop: BuildingPropertyValue }) {
  return (
    <div className={styles.row}>
      <span className={styles.name}>{prop.name}</span>
      <span className={styles.value}>{prop.value}</span>
    </div>
  );
});

// =============================================================================
// VALUE RENDERERS
// =============================================================================

interface PropertyValueProps {
  def: PropertyDefinition;
  value: string;
  maxValue?: string;
  canEdit: boolean;
  onPropertyChange: (name: string, value: number) => void;
  onStringPropertyChange?: (name: string, value: string) => void;
  rdoCommands?: Record<string, RdoCommandMapping>;
}

function PropertyValue({ def, value, maxValue, canEdit, onPropertyChange, onStringPropertyChange, rdoCommands }: PropertyValueProps) {
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

    case PropertyType.ENUM: {
      const label = def.enumLabels?.[value] ?? def.enumLabels?.[String(parseInt(value, 10))] ?? value;
      return <span className={styles.value}>{label}</span>;
    }

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
            pendingKey={computePendingKey(def.rdoName, rdoCommands)}
            onPropertyChange={onPropertyChange}
          />
        );
      }
      return <span className={styles.value}>{isNaN(num) ? value : `${num}${def.unit ?? ''}`}</span>;

    case PropertyType.TEXT:
      if (canEdit && def.editable && onStringPropertyChange) {
        return (
          <TextInput
            value={value}
            rdoName={def.rdoName}
            pendingKey={computePendingKey(def.rdoName, rdoCommands)}
            onStringPropertyChange={onStringPropertyChange}
          />
        );
      }
      return <span className={styles.value}>{value || '-'}</span>;

    default:
      return <span className={styles.value}>{value || '-'}</span>;
  }
}

export function getColorClass(num: number, colorCode?: string): string {
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
  pendingKey?: string;
  onPropertyChange: (name: string, value: number) => void;
}

function SliderInput({ value, min, max, step, unit, rdoName, pendingKey, onPropertyChange }: SliderInputProps) {
  const [localVal, setLocalVal] = useState(isNaN(value) ? min : value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Revert local value on server failure
  const failedUpdates = useBuildingStore((s) => s.failedUpdates);
  useEffect(() => {
    if (!pendingKey) return;
    const failed = failedUpdates.get(pendingKey);
    if (failed) {
      setLocalVal(parseFloat(failed.originalValue) || min);
    }
  }, [failedUpdates, pendingKey, min]);

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
        {pendingKey && <SaveIndicator propertyKey={pendingKey} />}
      </span>
    </div>
  );
}

// =============================================================================
// TEXT INPUT (editable widestring property, e.g., Name)
// =============================================================================

interface TextInputProps {
  value: string;
  rdoName: string;
  pendingKey?: string;
  onStringPropertyChange: (name: string, value: string) => void;
}

function TextInput({ value, rdoName, pendingKey, onStringPropertyChange }: TextInputProps) {
  const [localVal, setLocalVal] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Revert local value on server failure
  const failedUpdates = useBuildingStore((s) => s.failedUpdates);
  useEffect(() => {
    if (!pendingKey) return;
    const failed = failedUpdates.get(pendingKey);
    if (failed) {
      setLocalVal(failed.originalValue);
    }
  }, [failedUpdates, pendingKey]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = e.target.value;
      setLocalVal(newVal);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onStringPropertyChange(rdoName, newVal);
      }, 500);
    },
    [rdoName, onStringPropertyChange],
  );

  return (
    <span className={styles.textInputWrapper}>
      <input
        type="text"
        className={styles.textInput}
        value={localVal}
        onChange={handleChange}
        maxLength={40}
      />
      {pendingKey && <SaveIndicator propertyKey={pendingKey} />}
    </span>
  );
}

// =============================================================================
// CURRENCY INPUT (editable currency value in table cells)
// =============================================================================

function CurrencyInput({
  value,
  rdoName,
  pendingKey,
  onPropertyChange,
}: {
  value: number;
  rdoName: string;
  pendingKey?: string;
  onPropertyChange: (name: string, value: number) => void;
}) {
  const [localVal, setLocalVal] = useState(isNaN(value) ? '' : formatCurrency(value));
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef(false);

  const pendingUpdates = useBuildingStore((s) => s.pendingUpdates);
  const pending = pendingKey ? pendingUpdates.get(pendingKey) : undefined;

  const failedUpdates = useBuildingStore((s) => s.failedUpdates);
  useEffect(() => {
    if (!pendingKey) return;
    const failed = failedUpdates.get(pendingKey);
    if (failed) {
      setLocalVal(formatCurrency(parseFloat(failed.originalValue) || 0));
    }
  }, [failedUpdates, pendingKey]);

  // Sync from server when not editing and no pending update in flight
  useEffect(() => {
    if (!isEditing && !pending && !isNaN(value)) {
      setLocalVal(formatCurrency(value));
    }
  }, [value, isEditing, pending]);

  const cancel = useCallback(() => {
    setIsEditing(false);
    setLocalVal(isNaN(value) ? '' : formatCurrency(value));
  }, [value]);

  const commit = useCallback(() => {
    commitRef.current = true;
    setIsEditing(false);
    const parsed = parseFloat(localVal.replace(/[^0-9.-]/g, ''));
    if (!isNaN(parsed) && parsed !== value) {
      onPropertyChange(rdoName, parsed);
      setLocalVal(formatCurrency(parsed));
    } else {
      setLocalVal(isNaN(value) ? '' : formatCurrency(value));
    }
  }, [localVal, rdoName, value, onPropertyChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commit();
        inputRef.current?.blur();
      }
      if (e.key === 'Escape') {
        cancel();
        inputRef.current?.blur();
      }
    },
    [commit, cancel],
  );

  const handleBlur = useCallback(() => {
    // If the user clicked the confirm button, commitRef is already true — don't cancel.
    // Use requestAnimationFrame to let the tick button's mousedown fire first.
    requestAnimationFrame(() => {
      if (!commitRef.current) {
        cancel();
      }
      commitRef.current = false;
    });
  }, [cancel]);

  return (
    <span className={styles.currencyInputWrapper}>
      <input
        ref={inputRef}
        type="text"
        className={styles.currencyInput}
        value={localVal}
        onFocus={() => {
          setIsEditing(true);
          commitRef.current = false;
          setLocalVal(isNaN(value) ? '' : String(value));
        }}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {isEditing && (
        <button
          type="button"
          className={styles.currencyConfirmBtn}
          onMouseDown={(e) => {
            e.preventDefault(); // keep focus on input until commit
            commit();
          }}
          title="Confirm"
        >
          &#10003;
        </button>
      )}
      {!isEditing && pendingKey && (
        <span className={styles.currencyIndicator}>
          <SaveIndicator propertyKey={pendingKey} />
        </span>
      )}
    </span>
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
// STOP TOGGLE BUTTON (Close/Open building)
// =============================================================================

/**
 * Renders a "Close" or "Open" button based on the Stopped wordbool property.
 * Stopped=0  → building is open   → shows "Close" (danger: will stop operations)
 * Stopped≠0  → building is closed → shows "Open"  (safe: resumes operations)
 * Click sends: SET Stopped "#-1" (close) or "#0" (open) on CurrBlock.
 */
function StopToggle({
  stoppedValue,
  onPropertyChange,
}: {
  stoppedValue: string;
  onPropertyChange: (name: string, value: number) => void;
}) {
  const numVal = parseInt(stoppedValue, 10);
  const isStopped = !isNaN(numVal) && numVal !== 0;
  const label = isStopped ? 'Open' : 'Close';
  const isDanger = !isStopped; // Closing an open building = destructive action

  return (
    <div className={styles.stopToggleRow}>
      <button
        className={`${styles.stopToggleBtn} ${isDanger ? styles.stopToggleBtnDanger : ''}`}
        onClick={() => onPropertyChange('Stopped', isStopped ? 0 : -1)}
      >
        {label}
      </button>
    </div>
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
// REPAIR CONTROL (progress bar + conditional start/stop)
// =============================================================================

function RepairControl({
  repairValue,
  repairPrice,
  canEdit,
  onAction,
}: {
  repairValue: string;
  repairPrice: string;
  canEdit: boolean;
  onAction: (id: string) => void;
}) {
  const progress = parseInt(repairValue, 10) || 0;
  const isRepairing = progress > 0 && progress < 100;
  const cost = parseFloat(repairPrice) || 0;

  return (
    <div className={styles.repairContainer}>
      <div className={styles.repairHeader}>
        <span className={styles.name}>Repair</span>
        {isRepairing && (
          <span className={styles.repairPercent}>{progress}%</span>
        )}
      </div>

      {isRepairing && (
        <div className={styles.repairBar}>
          <div className={styles.repairFill} style={{ width: `${progress}%` }} />
        </div>
      )}

      {canEdit && (
        <div className={styles.repairActions}>
          {isRepairing ? (
            <button
              className={styles.repairStopBtn}
              onClick={() => onAction('stopRepair')}
            >
              Stop Repair
            </button>
          ) : (
            <button
              className={styles.repairStartBtn}
              onClick={() => onAction('startRepair')}
            >
              Repair{cost > 0 ? ` (${formatCurrency(cost)})` : ''}
            </button>
          )}
        </div>
      )}

      {!canEdit && !isRepairing && (
        <span className={styles.value}>-</span>
      )}
    </div>
  );
}

// =============================================================================
// TRADE CONNECT BUTTONS (Quick Trade — visible to all players)
// =============================================================================

const TRADE_KINDS = [
  { kind: '1', label: 'Stores' },
  { kind: '2', label: 'Factories' },
  { kind: '4', label: 'Warehouses' },
] as const;

function TradeConnectButtons({ onAction }: { onAction: (id: string) => void }) {
  return (
    <div className={styles.tradeConnectGrid}>
      {TRADE_KINDS.map(({ kind, label }) => (
        <div key={kind} className={styles.tradeConnectRow}>
          <button
            className={`${styles.tradeConnectBtn} ${styles.tradeConnectBtnLink}`}
            onClick={() => onAction(`tradeConnect:${kind}`)}
            title={`Connect all your ${label.toLowerCase()} to this building`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {label}
          </button>
          <button
            className={`${styles.tradeConnectBtn} ${styles.tradeConnectBtnUnlink}`}
            onClick={() => onAction(`tradeDisconnect:${kind}`)}
            title={`Disconnect all your ${label.toLowerCase()} from this building`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
            {label}
          </button>
        </div>
      ))}
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

// =============================================================================
// CLONE SETTINGS (PropertyType.CLONE_SETTINGS)
// =============================================================================

/**
 * Parse pipe-delimited CloneMenu0 value into option pairs.
 * Delphi format: "Label|decimalValue|Label|decimalValue|..."
 * Archaeology: ManagementSheet.pas:137-149, CompStringsParser.pas:93-116
 */
export function parseCloneMenu(value: string): Array<{ label: string; value: number }> {
  if (!value) return [];
  const parts = value.split('|').filter(s => s.length > 0);
  const options: Array<{ label: string; value: number }> = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const label = parts[i].trim();
    const numVal = parseInt(parts[i + 1], 10);
    if (label && !isNaN(numVal)) {
      options.push({ label, value: numVal });
    }
  }
  return options;
}

/**
 * Clone Settings panel — propagate building configuration to same-type buildings.
 * Hardcoded: "Same Company" (0x02, checked), "Same Town" (0x01, checked).
 * Dynamic: from CloneMenu0 pipe-delimited property value.
 * Apply button OR's checked flags → fire-and-forget CloneFacility on ClientView.
 * Archaeology: ManagementSheet.pas:132-149,388-403, CloneOptions.pas
 */
function CloneSettings({
  cloneMenuValue,
  buildingX,
  buildingY,
}: {
  cloneMenuValue: string;
  buildingX: number;
  buildingY: number;
}) {
  const client = useClient();
  const isOwner = useBuildingStore((s) => s.isOwner);

  const dynamicOptions = parseCloneMenu(cloneMenuValue);

  // Hardcoded scope options (always present, checked by default) + dynamic building-specific options
  const allOptions: Array<{ label: string; value: number; defaultChecked: boolean }> = [
    { label: 'Same Company', value: 0x02, defaultChecked: true },
    { label: 'Same Town', value: 0x01, defaultChecked: true },
    ...dynamicOptions.map(opt => ({ ...opt, defaultChecked: false })),
  ];

  const [checkedValues, setCheckedValues] = useState<Set<number>>(() => {
    const defaults = new Set<number>();
    for (const opt of allOptions) {
      if (opt.defaultChecked) defaults.add(opt.value);
    }
    return defaults;
  });

  const handleToggle = useCallback((value: number) => {
    setCheckedValues(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    let bitmask = 0;
    for (const v of checkedValues) bitmask |= v;
    client.onCloneFacility(buildingX, buildingY, bitmask);
  }, [checkedValues, buildingX, buildingY, client]);

  if (!isOwner) return null;

  return (
    <div className={styles.cloneSettings}>
      <div className={styles.cloneSettingsLabel}>Clone Settings</div>
      {allOptions.map((opt) => (
        <label key={opt.value} className={styles.cloneOption}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={checkedValues.has(opt.value)}
            onChange={() => handleToggle(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
      <div className={styles.actionBtnContainer}>
        <button className={styles.actionBtn} onClick={handleApply}>
          Apply Clone
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// DATA TABLE (PropertyType.TABLE)
// =============================================================================

function DataTable({
  def,
  rowCount,
  valueMap,
  canEdit,
  rdoCommands,
  onPropertyChange,
  onRowAction,
}: {
  def: PropertyDefinition;
  rowCount: number;
  valueMap: Map<string, string>;
  canEdit: boolean;
  rdoCommands?: Record<string, RdoCommandMapping>;
  onPropertyChange: (name: string, value: number) => void;
  onRowAction?: (actionId: string, rowIndex: number) => void;
}) {
  const propSuffix = def.indexSuffix || '';
  const cols = def.columns!;

  return (
    <table className={styles.dataTable}>
      <thead>
        <tr>
          {cols.map((col) => (
            <th key={col.rdoSuffix} style={col.width ? { width: col.width } : undefined}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }, (_, i) => {
          // Build row values map for conditional visibility (visibleWhen)
          const rowValues: Record<string, string> = {};
          for (const c of cols) {
            const cSuffix = c.columnSuffix || '';
            const iSuffix = c.indexSuffix !== undefined ? c.indexSuffix : propSuffix;
            rowValues[c.rdoSuffix] = valueMap.get(`${c.rdoSuffix}${i}${cSuffix}${iSuffix}`) ?? '';
          }
          return (
            <tr key={i} className={styles.dataRow}>
              {cols.map((col) => {
                const colSuffix = col.columnSuffix || '';
                const idxSuffix = col.indexSuffix !== undefined ? col.indexSuffix : propSuffix;
                const key = `${col.rdoSuffix}${i}${colSuffix}${idxSuffix}`;
                const value = valueMap.get(key) ?? '';
                return (
                  <td key={col.rdoSuffix} className={styles.tableCell}>
                    <TableCellValue
                      col={col}
                      value={value}
                      rdoName={key}
                      rowIndex={i}
                      canEdit={canEdit && !!col.editable}
                      rdoCommands={rdoCommands}
                      onPropertyChange={onPropertyChange}
                      onRowAction={onRowAction}
                      rowValues={rowValues}
                    />
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TableCellValue({
  col,
  value,
  rdoName,
  rowIndex,
  canEdit,
  rdoCommands,
  onPropertyChange,
  onRowAction,
  rowValues,
}: {
  col: TableColumn;
  value: string;
  rdoName: string;
  rowIndex: number;
  canEdit: boolean;
  rdoCommands?: Record<string, RdoCommandMapping>;
  onPropertyChange: (name: string, value: number) => void;
  onRowAction?: (actionId: string, rowIndex: number) => void;
  rowValues: Record<string, string>;
}) {
  const num = parseFloat(value);
  switch (col.type) {
    case PropertyType.ACTION_BUTTON: {
      if (col.visibleWhen) {
        const colVal = rowValues[col.visibleWhen.column] ?? '';
        const isEmpty = !colVal || colVal.trim() === '';
        const show = col.visibleWhen.condition === 'empty' ? isEmpty : !isEmpty;
        if (!show) {
          // Check for altAction (e.g., Elect/Depose sharing one column)
          if (col.altAction) {
            const altColVal = rowValues[col.visibleWhen.column] ?? '';
            const altEmpty = !altColVal || altColVal.trim() === '';
            const altShow = col.altAction.condition === 'empty' ? altEmpty : !altEmpty;
            if (altShow) {
              const isDanger = col.altAction.buttonLabel === 'Depose';
              return (
                <button
                  className={isDanger ? styles.tableActionBtnDanger : styles.tableActionBtn}
                  onClick={() => onRowAction?.(col.altAction!.actionId, rowIndex)}
                >
                  {col.altAction.buttonLabel}
                </button>
              );
            }
          }
          return null;
        }
      }
      return (
        <button
          className={styles.tableActionBtn}
          onClick={() => col.actionId && onRowAction?.(col.actionId, rowIndex)}
        >
          {col.buttonLabel || 'Action'}
        </button>
      );
    }
    case PropertyType.CURRENCY:
      if (canEdit) {
        return (
          <CurrencyInput
            value={num}
            rdoName={rdoName}
            pendingKey={computePendingKey(rdoName, rdoCommands)}
            onPropertyChange={onPropertyChange}
          />
        );
      }
      return <span className={styles.value}>{formatCurrency(num)}</span>;
    case PropertyType.PERCENTAGE:
      return <span className={styles.value}>{formatPercentage(num)}</span>;
    case PropertyType.NUMBER:
      return <span className={styles.value}>{isNaN(num) ? value || '-' : formatNumber(num)}</span>;
    case PropertyType.BOOLEAN:
      return <span className={styles.value}>{num !== 0 ? 'Yes' : 'No'}</span>;
    case PropertyType.SLIDER:
      if (canEdit) {
        return (
          <SliderInput
            value={num}
            min={col.min ?? 0}
            max={col.max ?? 300}
            step={col.step ?? 5}
            rdoName={rdoName}
            pendingKey={computePendingKey(rdoName, rdoCommands)}
            onPropertyChange={onPropertyChange}
          />
        );
      }
      return <span className={styles.value}>{isNaN(num) ? value || '-' : String(num)}</span>;
    default:
      return <span className={styles.value}>{value || '-'}</span>;
  }
}

// =============================================================================
// PRODUCT SALE CARDS (for services on General tab + product summary)
// =============================================================================

function ServiceCardList({
  def,
  rowCount,
  valueMap,
  canEdit,
  onPropertyChange,
}: {
  def: PropertyDefinition;
  rowCount: number;
  valueMap: Map<string, string>;
  canEdit: boolean;
  onPropertyChange: (name: string, value: number) => void;
}) {
  const propSuffix = def.indexSuffix || '';
  const cols = def.columns!;
  const colByPrefix = new Map(cols.map((c) => [c.rdoSuffix, c]));

  const getVal = (suffix: string, i: number) => {
    const col = colByPrefix.get(suffix);
    const colSuffix = col?.columnSuffix || '';
    const idxSuffix = col?.indexSuffix !== undefined ? col.indexSuffix : propSuffix;
    return valueMap.get(`${suffix}${i}${colSuffix}${idxSuffix}`) ?? '';
  };

  return (
    <div className={styles.pscList}>
      {Array.from({ length: rowCount }, (_, i) => {
        const price = parseFloat(getVal('srvPrices', i)) || 0;
        const marketPrice = parseFloat(getVal('srvMarketPrices', i)) || 0;
        const dollarPrice = marketPrice > 0 ? (price / 100) * marketPrice : 0;

        return (
          <ProductSaleCard
            key={i}
            name={getVal('srvNames', i) || `Service ${i + 1}`}
            supply={parseFloat(getVal('srvSupplies', i)) || 0}
            demand={parseFloat(getVal('srvDemands', i)) || 0}
            pricePc={price}
            avgPricePc={parseFloat(getVal('srvAvgPrices', i)) || 0}
            dollarPrice={dollarPrice}
            priceMax={colByPrefix.get('srvPrices')?.max ?? 500}
            priceStep={colByPrefix.get('srvPrices')?.step ?? 10}
            canEdit={canEdit && !!colByPrefix.get('srvPrices')?.editable}
            rdoName={`srvPrices${i}${propSuffix}`}
            onPropertyChange={onPropertyChange}
          />
        );
      })}
    </div>
  );
}

function ProductSummaryCards({
  products,
  canEdit,
  onPropertyChange,
}: {
  products: BuildingProductData[];
  canEdit: boolean;
  onPropertyChange: (name: string, value: number) => void;
}) {
  if (products.length === 0) return null;

  return (
    <div className={styles.pscList}>
      <div className={styles.pscSectionLabel}>Products</div>
      {products.map((product, i) => {
        const pricePc = parseFloat(product.pricePc) || 0;
        const marketPrice = parseFloat(product.marketPrice) || 0;
        const dollarPrice = marketPrice > 0 ? (pricePc / 100) * marketPrice : 0;

        return (
          <ProductSaleCard
            key={i}
            name={product.name || product.metaFluid}
            pricePc={pricePc}
            avgPricePc={parseFloat(product.avgPrice) || 0}
            dollarPrice={dollarPrice}
            priceMax={300}
            priceStep={5}
            canEdit={canEdit}
            rdoName={`PricePc`}
            productPath={product.path}
            onPropertyChange={onPropertyChange}
          />
        );
      })}
    </div>
  );
}

function ProductSaleCard({
  name,
  supply,
  demand,
  pricePc,
  avgPricePc,
  dollarPrice,
  priceMax,
  priceStep,
  canEdit,
  rdoName,
  productPath: _productPath,
  onPropertyChange,
}: {
  name: string;
  supply?: number;
  demand?: number;
  pricePc: number;
  avgPricePc: number;
  dollarPrice: number;
  priceMax: number;
  priceStep: number;
  canEdit: boolean;
  rdoName: string;
  productPath?: string;
  onPropertyChange: (name: string, value: number) => void;
}) {
  const supplyColor =
    supply === undefined
      ? ''
      : supply >= 100
        ? styles.pscSupplyGood
        : supply > 0
          ? styles.pscSupplyWarn
          : styles.pscSupplyBad;

  return (
    <div className={styles.pscCard}>
      <div className={styles.pscHeader}>
        <span className={styles.pscName}>{name}</span>
        {supply !== undefined && (
          <span className={`${styles.pscSupply} ${supplyColor}`}>
            Supply {supply}%
          </span>
        )}
      </div>

      {demand !== undefined && (
        <span className={styles.pscDemand}>Local Demand: {demand}%</span>
      )}

      <span className={styles.pscPrice}>
        {dollarPrice > 0 ? `${formatCurrency(dollarPrice)} (${pricePc}%)` : `${pricePc}%`}
      </span>

      <PriceSliderWithMarker
        value={pricePc}
        avgPrice={avgPricePc}
        max={priceMax}
        step={priceStep}
        canEdit={canEdit}
        rdoName={rdoName}
        onPropertyChange={onPropertyChange}
      />
    </div>
  );
}

function PriceSliderWithMarker({
  value,
  avgPrice,
  max,
  step,
  canEdit,
  rdoName,
  onPropertyChange,
}: {
  value: number;
  avgPrice: number;
  max: number;
  step: number;
  canEdit: boolean;
  rdoName: string;
  onPropertyChange: (name: string, value: number) => void;
}) {
  const [localVal, setLocalVal] = useState(isNaN(value) ? 0 : value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = parseFloat(e.target.value);
      setLocalVal(newVal);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onPropertyChange(rdoName, newVal);
      }, 300);
    },
    [rdoName, onPropertyChange],
  );

  const markerPct = max > 0 ? Math.min(100, (avgPrice / max) * 100) : 0;

  if (!canEdit) {
    return <span className={styles.pscPriceReadonly}>{value}%</span>;
  }

  return (
    <div className={styles.pscSlider}>
      <div className={styles.pscSliderTrack}>
        <input
          type="range"
          className={styles.slider}
          min={0}
          max={max}
          step={step}
          value={localVal}
          onChange={handleChange}
        />
        <div
          className={styles.pscAvgMarker}
          style={{ left: `${markerPct}%` }}
          title={`Avg: ${avgPrice}%`}
        />
      </div>
      <span className={styles.sliderValue}>{localVal}%</span>
    </div>
  );
}

