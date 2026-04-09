# Coverage Check and Ratchet Verification

Run the test suite with coverage and verify against the ratchet thresholds.

If `$ARGUMENTS` contains "update", update jest.config.js thresholds to match current coverage.

## Procedure

### 1. Run Coverage

```bash
npm run test:coverage
```

Capture the full output including the coverage summary table.

### 2. Read Current Thresholds

Read `jest.config.js` and extract the `coverageThreshold` section. Expected baseline:

| Directory | Lines | Functions | Branches | Statements |
|-----------|-------|-----------|----------|------------|
| Global | 38% | 39% | 29% | 38% |
| `./src/shared/` | 54% | 65% | 37% | 54% |
| `./src/shared/building-details/` | 92% | 100% | 80% | 91% |
| `./src/shared/types/` | 96% | 73% | 90% | 96% |

### 3. Compare Actual vs Thresholds

Parse the coverage output and for each directory in the threshold config, extract the actual coverage percentages.

### 4. Report

Print a per-directory report:

```
| Directory                       | Metric     | Actual | Threshold | Delta  | Status         |
|---------------------------------|------------|--------|-----------|--------|----------------|
| Global                          | lines      | 42.1%  | 38%       | +4.1%  | CAN_RATCHET_UP |
| Global                          | functions  | 40.2%  | 39%       | +1.2%  | PASS           |
| Global                          | branches   | 30.5%  | 29%       | +1.5%  | PASS           |
| Global                          | statements | 42.0%  | 38%       | +4.0%  | CAN_RATCHET_UP |
| ./src/shared/                   | lines      | 55.0%  | 54%       | +1.0%  | PASS           |
| ...                             | ...        | ...    | ...       | ...    | ...            |
```

Status logic:
- **FAIL** — actual < threshold
- **PASS** — actual >= threshold AND delta <= 2%
- **CAN_RATCHET_UP** — actual exceeds threshold by > 2%

### 5. Ratchet Suggestions

If any metric has status `CAN_RATCHET_UP`, suggest updating the threshold. Thresholds can only go UP, never down.

Example:
```
Suggested threshold updates:
  Global lines: 38% -> 42%
  Global statements: 38% -> 42%
```

### 6. Auto-Update (if requested)

If `$ARGUMENTS` contains "update":
1. Read `jest.config.js`
2. For each metric where actual > threshold, update the threshold to `Math.floor(actual)`
3. Write the updated `jest.config.js`
4. Report all changes made

**Important**: Thresholds can only go UP. If actual < threshold for any metric, do NOT lower the threshold — report it as FAIL and leave it unchanged.