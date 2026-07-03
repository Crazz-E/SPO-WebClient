/**
 * capture-cli — convert a gateway NDJSON debug log into a captured RDO scenario.
 *
 * Usage (bundled by npm run capture:convert):
 *   npm run capture:convert -- <log.ndjson> --name <scenario-name>
 *     [--out <dir>]                default: src/mock-server/scenarios/captured
 *     [--sid <session-id>]         isolate one gateway session
 *     [--var name=value]...        extra variable substitutions (e.g. --var username=SPO_test3)
 *     [--description "..."]
 *     [--source "world planitia, 2026-07-03"]
 *
 * Capture recipe:
 *   LOG_LEVEL=debug LOG_JSON=true LOG_FILE=logs/capture.ndjson npm run dev
 *   → play exactly one flow → stop server → run this converter.
 */

import * as fs from 'fs';
import * as path from 'path';
import { convertNdjsonToScenario } from './log-capture-converter';

interface CliArgs {
  input: string;
  name: string;
  out: string;
  sid?: string;
  description?: string;
  source?: string;
  vars: Record<string, string>;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    input: '',
    name: '',
    out: 'src/mock-server/scenarios/captured',
    vars: {},
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--name': args.name = argv[++i] ?? ''; break;
      case '--out': args.out = argv[++i] ?? args.out; break;
      case '--sid': args.sid = argv[++i]; break;
      case '--description': args.description = argv[++i]; break;
      case '--source': args.source = argv[++i]; break;
      case '--var': {
        const pair = argv[++i] ?? '';
        const eq = pair.indexOf('=');
        if (eq > 0) args.vars[pair.slice(0, eq)] = pair.slice(eq + 1);
        break;
      }
      default:
        if (!arg.startsWith('--') && !args.input) args.input = arg;
    }
  }

  if (!args.input || !args.name) {
    throw new Error(
      'Usage: capture-cli <log.ndjson> --name <scenario-name> [--out dir] [--sid id] [--var k=v]...'
    );
  }
  return args;
}

export function runCaptureCli(argv: string[]): string {
  const args = parseCliArgs(argv);
  const ndjson = fs.readFileSync(args.input, 'utf8');

  const { scenario, report, code } = convertNdjsonToScenario(ndjson, {
    name: args.name,
    description: args.description,
    knownVariables: args.vars,
    sid: args.sid,
    sourceNote: args.source ?? path.basename(args.input),
  });

  fs.mkdirSync(args.out, { recursive: true });
  const outFile = path.join(args.out, `${args.name}-captured.scenario.ts`);
  fs.writeFileSync(outFile, code, 'utf8');

  const lines = [
    `Scenario "${scenario.name}" written to ${outFile}`,
    `  entries:            ${report.totalEntries}`,
    `  exchanges:          ${report.exchanges} (void pushes: ${report.voidPushes}, push-only: ${report.pushOnlyExchanges})`,
    `  attached pushes:    ${report.attachedServerPushes}`,
    `  answered srv reqs:  ${report.answeredServerRequests}`,
    `  variables:          ${Object.keys(report.variables).join(', ') || '(none)'}`,
    `  sessions in log:    ${report.sids.join(', ') || '(none)'}`,
    `  sockets:            ${report.sockets.join(', ')}`,
  ];
  if (report.orphanAnswers.length > 0) {
    lines.push(`  ! orphan answers:   ${report.orphanAnswers.length}`);
  }
  if (report.unansweredRequests.length > 0) {
    lines.push(`  ! unanswered:       ${report.unansweredRequests.join(', ')}`);
  }
  for (const w of report.warnings) {
    lines.push(`  ! warning: ${w}`);
  }
  return lines.join('\n');
}

/* istanbul ignore next — process entry point */
if (require.main === module) {
  try {
    console.log(runCaptureCli(process.argv.slice(2)));
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
