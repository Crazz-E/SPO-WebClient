/**
 * Oracle — turns a step outcome and its expectation into a verdict.
 *
 * Pure. Neither knows about the session nor the transport, so every rule here
 * is testable without a socket, and the CLI's exit code is a fold over these
 * verdicts and nothing else.
 */

import type { Expectation, StepOutcome, Verdict } from './types';

/** Render an expectation for a report line. */
export function describeExpectation(expect: Expectation): string {
  switch (expect.kind) {
    case 'exact': return `exact ${JSON.stringify(expect.value)}`;
    case 'pattern': return `pattern /${expect.value.source}/${expect.value.flags}`;
    case 'errorCode':
      return `error ${expect.value}` + (expect.payload ? ` matching /${expect.payload.source}/` : '');
    case 'predicate': return `predicate: ${expect.describe}`;
    case 'answered': return 'any answer';
  }
}

function describeOutcome(outcome: StepOutcome): string {
  if (outcome.response === null) return `NO ANSWER (${outcome.error ?? 'unknown'})`;
  return JSON.stringify(outcome.response);
}

/**
 * Judge one outcome.
 *
 * Silence is FAIL whatever the expectation — an unanswered frame is the worst
 * outcome a probe can have (the request thread may be gone), and it is also
 * the one the runner stops on. No expectation → UNKNOWN: observed, not judged.
 */
export function evaluate(outcome: StepOutcome, expect?: Expectation): Verdict {
  const got = describeOutcome(outcome);

  if (outcome.response === null) {
    return { kind: 'FAIL', detail: `unanswered — ${outcome.error ?? 'no reply'}` };
  }
  if (outcome.error) {
    // The server answered; the client did not cope. Not silence — a defect on our side.
    return { kind: 'FAIL', detail: `client failure after the server answered: ${outcome.error}; got ${got}` };
  }
  if (!expect) {
    return { kind: 'UNKNOWN', detail: `no oracle; observed ${got}` };
  }

  const want = describeExpectation(expect);
  const pass = (): Verdict => ({ kind: 'PASS', detail: `${want}; got ${got}` });
  const fail = (): Verdict => ({ kind: 'FAIL', detail: `expected ${want}; got ${got}` });

  switch (expect.kind) {
    case 'answered':
      return pass();
    case 'exact':
      return outcome.response === expect.value ? pass() : fail();
    case 'pattern':
      return expect.value.test(outcome.response) ? pass() : fail();
    case 'errorCode': {
      if (outcome.errorCode !== expect.value) return fail();
      if (expect.payload && !expect.payload.test(outcome.response)) return fail();
      return pass();
    }
    case 'predicate':
      return expect.test(outcome) ? pass() : fail();
  }
}
