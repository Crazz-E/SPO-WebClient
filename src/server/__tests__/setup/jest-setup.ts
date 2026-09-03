/**
 * Jest Setup File
 * Loads custom matchers for all tests
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { rdoMatchers } from '../matchers/rdo-matchers';

// Extend Jest matchers with RDO-specific matchers
expect.extend(rdoMatchers);

// action b5.4: force SPO_BENCH_DIR to a fresh, empty, throwaway directory for every test FILE,
// before that file's own module code (and therefore its first `import`/`require`) runs.
// setupFilesAfterEnv modules load ahead of the test file itself, so this assignment lands
// before anything in the file can read process.env.SPO_BENCH_DIR — including a subprocess env
// built as `{ ...process.env, ... }`, which is how most of this suite's scripted-script tests
// (src/e2e/finish.test.ts, src/e2e/verify-gate.test.ts, …) construct the child's environment.
//
// Without this, any test that spawns a real process without setting SPO_BENCH_DIR itself falls
// through to that process's own default — scripts/verify-gate.js and src/e2e/bench/paths.ts
// both compute it as `$HOME/.spo-bench` when the var is unset — which is the MAINTAINER'S REAL
// bench corpus, the evidence store a multi-day audit was built on. Measured: 6,938 of 7,172
// files under ~/.spo-bench/logs/gate-* were test-written (96.7%, most empty, 224 carrying the
// literal "fake npm: … failed" string this suite's own fake npm stubs emit) — this is that
// leak's root cause, closed at the one place every test file passes through.
//
// This is a global default only: any test that deliberately wants to exercise `SPO_BENCH_DIR`
// itself (e.g. src/e2e/bench/paths.test.ts, src/__tests__/nightly-check.test.ts) still
// overrides it explicitly, the same way a test overriding any other default value would — this
// assignment just makes "unset" resolve somewhere harmless instead of somewhere real.
process.env.SPO_BENCH_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-jest-bench-'));
