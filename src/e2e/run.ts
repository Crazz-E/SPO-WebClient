/**
 * The L2 live drive — `npm run test:live`, and the live stage of `npm run gate`.
 *
 * Sequential by construction: live runs are single-flight (doc/E2E-POLICY.md §6), so the
 * flows share one lock and never overlap.
 */

import * as fs from 'fs';
import * as path from 'path';
import { toErrorMessage } from '../shared/error-utils';
import { REPORT_DIR, WORLD_NAME } from './config';
import { checkCapability, type Capability, type CapabilityEvidence } from './capability';
import { FLOWS, flowByName, runFlow, type FlowResult } from './flows';
import { preflight, type PreflightResult } from './preflight';
import { WorldLock } from './world-lock';

export interface LiveRunResult {
  world: string;
  branch: string;
  startedAt: string;
  finishedAt: string;
  status: 'PASS' | 'FAIL' | 'ENVIRONMENT' | 'BLOCKED';
  preflight: PreflightResult;
  flows: FlowResult[];
  /** What the server says the test account may do — read-only, gathered before the flows. */
  capabilities: CapabilityEvidence[];
  error?: string;
}

export interface LiveRunOptions {
  flows: string[];
  branch: string;
  lock?: WorldLock;
  /** Capabilities the diff depends on (doc/E2E-POLICY.md §7); the gate judges the evidence. */
  capabilities?: Capability[];
}

export async function runLive(options: LiveRunOptions): Promise<LiveRunResult> {
  const lock = options.lock ?? new WorldLock();
  const startedAt = new Date().toISOString();
  const base = { world: WORLD_NAME, branch: options.branch, startedAt };

  // A rate-limit or dirty-world refusal is a BLOCK, not a test failure: nothing ran.
  try {
    lock.checkRateLimit(options.branch);
    lock.acquire(options.branch);
  } catch (err: unknown) {
    return {
      ...base,
      finishedAt: new Date().toISOString(),
      status: 'BLOCKED',
      preflight: { ok: false, checks: [], environmentAbort: false },
      flows: [],
      capabilities: [],
      error: toErrorMessage(err),
    };
  }

  const checks = await preflight();
  if (!checks.ok) {
    lock.release();
    return {
      ...base,
      finishedAt: new Date().toISOString(),
      status: 'ENVIRONMENT',
      preflight: checks,
      flows: [],
      capabilities: [],
      error: checks.checks.filter(c => !c.ok).map(c => `${c.what}: ${c.detail}`).join('; '),
    };
  }

  lock.recordRun(options.branch);
  const results: FlowResult[] = [];
  const capabilities: CapabilityEvidence[] = [];
  let releaseError: string | undefined;

  try {
    // Capability reads come first: they mutate nothing, and the gate needs the answer
    // whether or not a flow then runs.
    for (const capability of options.capabilities ?? []) {
      capabilities.push(await checkCapability(capability));
    }
    for (const name of options.flows) {
      results.push(await runFlow(flowByName(name), { lock, survivalLogUrl: checks.survivalLogUrl }));
    }
  } finally {
    try {
      lock.release();
    } catch (err: unknown) {
      // A dirty world is worse than a failed flow — surface it as the headline.
      releaseError = toErrorMessage(err);
    }
  }

  const failed = releaseError !== undefined || results.some(r => r.status === 'FAIL');
  return {
    ...base,
    finishedAt: new Date().toISOString(),
    status: failed ? 'FAIL' : 'PASS',
    preflight: checks,
    flows: results,
    capabilities,
    error: releaseError,
  };
}

/** `npm run test:live -- --flows=a,b --branch=fix/x` */
export async function main(
  argv: string[] = process.argv.slice(2),
  runner: (options: LiveRunOptions) => Promise<LiveRunResult> = runLive,
  out: NodeJS.WritableStream = process.stdout,
): Promise<number> {
  const flagged = (name: string): string | undefined =>
    argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

  const flows = flagged('flows')?.split(',').filter(Boolean) ?? FLOWS.map(f => f.name);
  const branch = flagged('branch') ?? 'local';

  const result = await runner({ flows, branch });
  const file = path.join(REPORT_DIR, `live-${result.startedAt.replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  out.write(`${formatSummary(result)}\nArtifact: ${file}\n`);
  return result.status === 'PASS' ? 0 : 1;
}

export function formatSummary(result: LiveRunResult): string {
  const lines = [`L2 live drive on ${result.world} — ${result.status}`];
  if (result.error) lines.push(`  ! ${result.error}`);
  for (const check of result.preflight.checks.filter(c => !c.ok)) {
    lines.push(`  pre-flight FAIL  ${check.what}: ${check.detail ?? ''}`);
  }
  for (const cap of result.capabilities) {
    const verdict = !cap.determined ? 'UNDETERMINED' : cap.granted ? 'GRANTED' : 'NOT GRANTED';
    lines.push(`  capability ${cap.capability}: ${verdict} for ${cap.account}${cap.error ? ` — ${cap.error}` : ''}`);
    for (const check of cap.checks) lines.push(`          ${check.what} = ${check.value}`);
  }
  for (const flow of result.flows) {
    lines.push(`  ${flow.status.padEnd(4)}  ${flow.name}${flow.error ? ` — ${flow.error}` : ''}`);
    for (const assertion of flow.assertions.filter(a => !a.ok)) {
      lines.push(`          x ${assertion.what}${assertion.detail ? ` (${assertion.detail})` : ''}`);
    }
    for (const probe of flow.probes) {
      lines.push(
        `          probe ${probe.status}: ${probe.what} — log=${probe.logLine ? 'yes' : 'NO'}, ` +
          `readBack=${probe.readBack}, restored=${probe.restored}`,
      );
    }
  }
  return lines.join('\n');
}

if (require.main === module) {
  main()
    .then(code => process.exit(code))
    .catch((err: unknown) => {
      process.stderr.write(`${toErrorMessage(err)}\n`);
      process.exit(1);
    });
}
