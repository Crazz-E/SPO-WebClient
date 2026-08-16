/**
 * RDO conformance suite — CLI entry point.
 *
 * Successor of the live probe harness (`rdo-probe.ts`, lot L9-pré). Same
 * engine — the REAL `StarpeaceSession`, so every frame comes off the
 * production formatter, guards, timeouts and error contract — generalised into
 * suites with per-step oracles, machine output, an exit code, a replayable
 * transport and a baseline diff. Plan: `report/plan-outil-conformite-rdo.md`.
 *
 * ## Read this before running it live
 *
 * `--transport live` puts frames on a real Interface Server. On 2026-08-15 a
 * single `"^"` frame on a 2-parameter procedure froze the SHARED production
 * one. The catalogue refuses that class statically (`assertSuitesSafe`), the
 * session refuses it again at emit (`assertNotVariantOnVoidMember`), mutations
 * are refused unless `--target dedicated`, and one unanswered frame stops the
 * run. None of that is scaffolding to remove.
 *
 * ## Usage
 *
 *   npm run conformance -- --suite all --recording rec.ndjson             # offline replay (CI)
 *   npm run conformance -- --suite types,errors --transport live --live   # shared server, reads only
 *   npm run conformance -- --suite all --transport live --live --target dedicated --record rec.ndjson --record-baseline base.json
 *   npm run conformance -- --suite all --recording rec.ndjson --diff-baseline base.json --json
 *
 * Bundled with esbuild (like capture:convert) because the replay engine lives
 * in src/mock-server, which the tsc build does not emit.
 */

import './conformance/quiet-log';
import { CliRefusal, parseConformanceArgs, USAGE } from './conformance/cli';
import { runConformance } from './conformance/run';
import { toErrorMessage } from '../shared/error-utils';

/* istanbul ignore next -- CLI shell; the pieces are unit-tested */
async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(USAGE);
    return;
  }
  let options;
  try {
    options = parseConformanceArgs(process.argv.slice(2));
  } catch (err: unknown) {
    if (err instanceof CliRefusal) {
      console.error(`[conformance] ${err.message}`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }
  const { exitCode } = await runConformance(options);
  process.exitCode = exitCode;
}

/* istanbul ignore next */
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`[conformance] ${toErrorMessage(err)}`);
    process.exitCode = 1;
  });
}
