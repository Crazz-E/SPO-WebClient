import { describeExpectation, evaluate } from './oracle';
import type { StepOutcome } from './types';

const answered = (response: string, errorCode?: number): StepOutcome =>
  errorCode === undefined ? { response, elapsedMs: 1 } : { response, errorCode, elapsedMs: 1 };
const silence: StepOutcome = { response: null, error: 'Request timeout', elapsedMs: 60000 };

describe('oracle — evaluate', () => {
  it('silence is FAIL whatever the expectation, and says why', () => {
    expect(evaluate(silence, { kind: 'answered' })).toEqual({ kind: 'FAIL', detail: expect.stringMatching(/unanswered.*Request timeout/) });
    expect(evaluate(silence, { kind: 'exact', value: 'x' }).kind).toBe('FAIL');
    expect(evaluate(silence).kind).toBe('FAIL');
  });

  it('no expectation → UNKNOWN, with the observation preserved', () => {
    const v = evaluate(answered('UserName="$SPO_test3"'));
    expect(v.kind).toBe('UNKNOWN');
    expect(v.detail).toMatch(/no oracle; observed .*\$SPO_test3/);
  });

  it('a client failure after the server answered is FAIL, never silence', () => {
    const v = evaluate({ response: 'res="%x"', error: 'TypeError: cannot read', elapsedMs: 1 }, { kind: 'pattern', value: /^res=/ });
    expect(v.kind).toBe('FAIL');
    expect(v.detail).toMatch(/client failure after the server answered: TypeError/);
  });

  it('answered: any reply passes, including an error reply', () => {
    expect(evaluate(answered('error 9', 9), { kind: 'answered' }).kind).toBe('PASS');
  });

  it('exact: byte-for-byte', () => {
    expect(evaluate(answered('ServerBusy="#0"'), { kind: 'exact', value: 'ServerBusy="#0"' }).kind).toBe('PASS');
    // `#-1` must never be normalised to `#1` — the oracle is as literal as the wire.
    expect(evaluate(answered('X="#1"'), { kind: 'exact', value: 'X="#-1"' }).kind).toBe('FAIL');
    expect(evaluate(answered(''), { kind: 'exact', value: '' }).kind).toBe('PASS');
  });

  it('pattern: regex over the payload', () => {
    expect(evaluate(answered('MailAccount="$a@b.net"'), { kind: 'pattern', value: /^MailAccount="\$/ }).kind).toBe('PASS');
    expect(evaluate(answered('MailAccount="%a@b.net"'), { kind: 'pattern', value: /^MailAccount="\$/ }).kind).toBe('FAIL');
  });

  it('errorCode: the code decides, the optional payload pattern pins the grammar', () => {
    const e3 = answered('error 3 setting RdoConfProbe', 3);
    expect(evaluate(e3, { kind: 'errorCode', value: 3 }).kind).toBe('PASS');
    expect(evaluate(e3, { kind: 'errorCode', value: 4 }).kind).toBe('FAIL');
    expect(evaluate(e3, { kind: 'errorCode', value: 3, payload: /setting RdoConfProbe$/ }).kind).toBe('PASS');
    expect(evaluate(e3, { kind: 'errorCode', value: 3, payload: /getting/ }).kind).toBe('FAIL');
    // A success reply never satisfies an errorCode expectation.
    expect(evaluate(answered('res="#0"'), { kind: 'errorCode', value: 3 }).kind).toBe('FAIL');
  });

  it('predicate: arbitrary test, described in the verdict', () => {
    const v = evaluate(answered('res="%a=1"'), { kind: 'predicate', describe: 'blob lines', test: o => /=/.test(o.response ?? '') });
    expect(v.kind).toBe('PASS');
    expect(v.detail).toContain('blob lines');
    expect(evaluate(answered('res="%"'), { kind: 'predicate', describe: 'x', test: () => false }).kind).toBe('FAIL');
  });

  it('a FAIL detail names both sides — that is what a human acts on', () => {
    const v = evaluate(answered('UserName="%x"'), { kind: 'pattern', value: /"\$/ });
    expect(v.detail).toMatch(/expected pattern .*; got "UserName=\\"%x\\""/);
  });
});

describe('oracle — describeExpectation', () => {
  it('renders every kind', () => {
    expect(describeExpectation({ kind: 'exact', value: 'a' })).toBe('exact "a"');
    expect(describeExpectation({ kind: 'pattern', value: /^a$/i })).toBe('pattern /^a$/i');
    expect(describeExpectation({ kind: 'errorCode', value: 9 })).toBe('error 9');
    expect(describeExpectation({ kind: 'errorCode', value: 3, payload: /x/ })).toBe('error 3 matching /x/');
    expect(describeExpectation({ kind: 'predicate', describe: 'p', test: () => true })).toBe('predicate: p');
    expect(describeExpectation({ kind: 'answered' })).toBe('any answer');
  });
});
