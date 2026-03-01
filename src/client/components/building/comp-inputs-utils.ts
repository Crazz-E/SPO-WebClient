/**
 * Data parsing utilities for the CompInputsPanel (company services tab).
 * Extracted from PropertyGroup to enable unit testing without JSX dependencies.
 */

export interface CompInputService {
  index: number;
  name: string;
  receiving: number;
  requesting: number;
  ratio: number;
  max: number;
  editable: boolean;
  units: string;
}

/** Check if an RDO boolean value is truthy: "-1" (OLE), "yes", "true", "1" */
function isRdoTrue(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower === '-1' || lower === 'yes' || lower === 'true' || lower === '1';
}

export type ServiceStatus = 'healthy' | 'warning' | 'critical';

/** Demand status: is the slider at 100%? Drops after facility upgrades. */
export function getDemandStatus(demandPerc: number): ServiceStatus {
  if (demandPerc >= 100) return 'healthy';
  if (demandPerc >= 50) return 'warning';
  return 'critical';
}

/** Fulfillment status: are we receiving what we requested? */
export function getFulfillmentStatus(ratio: number): ServiceStatus {
  if (ratio >= 95) return 'healthy';
  if (ratio >= 50) return 'warning';
  return 'critical';
}

export function parseCompInputServices(valueMap: Map<string, string>): CompInputService[] {
  const count = parseInt(valueMap.get('cInputCount') ?? '0', 10) || 0;
  const services: CompInputService[] = [];

  for (let i = 0; i < count; i++) {
    services.push({
      index: i,
      name: valueMap.get(`cInput${i}.0`) ?? `Service ${i + 1}`,
      receiving: parseFloat(valueMap.get(`cInputSup${i}`) ?? '0') || 0,
      requesting: parseFloat(valueMap.get(`cInputDem${i}`) ?? '0') || 0,
      ratio: parseInt(valueMap.get(`cInputRatio${i}`) ?? '0', 10) || 0,
      max: parseFloat(valueMap.get(`cInputMax${i}`) ?? '0') || 0,
      editable: isRdoTrue(valueMap.get(`cEditable${i}`)),
      units: valueMap.get(`cUnits${i}.0`) ?? '',
    });
  }

  return services;
}
