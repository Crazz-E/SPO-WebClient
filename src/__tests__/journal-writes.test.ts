/**
 * The journal-writes hook (.claude/hooks/journal-writes.{sh,js}).
 *
 * This hook journals every write that reaches a "judging instrument" — files the gate
 * reads to know if something went wrong. The hook detects writes to these file families:
 *  - .claude/hooks/** (the hook infrastructure itself)
 *  - .claude/settings.json (hook configuration)
 *  - src/e2e/bench/** (bench orchestration)
 *  - scripts/bench-* (bench scripts)
 *  - scripts/verify-gate.js (the gate decision logic)
 *  - jest.config.js (test config, coverage thresholds)
 *  - RDO protocol files (the wire format itself)
 *
 * The hook appends a JSON line to ~/.spo-bench/journals/<session-key>.jsonl on every
 * instrumented write, with: session key, branch, timestamp, tool, path. It always exits 0
 * and never blocks.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const ROOT = process.cwd();
const DECISION = path.join(ROOT, ".claude", "hooks", "journal-writes.js");

interface Payload {
  session_id?: string;
  cwd?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/** Run the decision program over one payload and return the output line. */
function verdict(payload: Partial<Payload>): string {
  const body: Payload = {
    cwd: ROOT,
    tool_name: "Edit",
    tool_input: {},
    ...payload,
  } as Payload;
  return execFileSync("node", [DECISION], {
    input: JSON.stringify(body),
    encoding: "utf8",
    env: { ...process.env, SPO_TOP: ROOT },
  }).trim();
}

const edit = (file_path: string, extra: Partial<Payload> = {}): string =>
  verdict({ tool_name: "Edit", tool_input: { file_path }, ...extra });

const write = (file_path: string, extra: Partial<Payload> = {}): string =>
  verdict({ tool_name: "Write", tool_input: { file_path }, ...extra });

const notebookEdit = (notebook_path: string, extra: Partial<Payload> = {}): string =>
  verdict({ tool_name: "NotebookEdit", tool_input: { notebook_path }, ...extra });

const bash = (command: string, extra: Partial<Payload> = {}): string =>
  verdict({ tool_name: "Bash", tool_input: { command }, ...extra });

// A file definitely tracked by the repo
const TRACKED = "package.json";
// A file definitely not tracked
const UNTRACKED = "/tmp/journal-test-untracked.txt";
// Scratchpad file outside the tree
const SCRATCH = "/tmp/claude-1000/journal-test.md";

describe("journal-writes — hooks family", () => {
  it("journals a write to .claude/hooks/**", () => {
    const out = edit(".claude/hooks/test-hook.sh");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":".claude/hooks/test-hook.sh"');
    expect(out).toContain('"tool":"Edit"');
  });

  it("journals a write via sed -i to .claude/hooks/**", () => {
    const out = bash("sed -i s/a/b/ .claude/hooks/test-hook.sh");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":".claude/hooks/test-hook.sh"');
    expect(out).toContain('"tool":"Bash"');
  });

  it("journals a write to .claude/settings.json", () => {
    const out = edit(".claude/settings.json");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":".claude/settings.json"');
  });
});

describe("journal-writes — bench family", () => {
  it("journals a write to src/e2e/bench/**", () => {
    const out = edit("src/e2e/bench/config.ts");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"src/e2e/bench/config.ts"');
  });

  it("journals a write to scripts/bench-*", () => {
    const out = edit("scripts/bench-install.sh");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"scripts/bench-install.sh"');
  });

  it("journals a write to scripts/verify-gate.js", () => {
    const out = write("scripts/verify-gate.js");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"scripts/verify-gate.js"');
  });

  it("journals a bash redirection to scripts/bench-*", () => {
    const out = bash("echo x > scripts/bench-worker.sh");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"scripts/bench-worker.sh"');
  });
});

describe("journal-writes — RDO protocol files", () => {
  it("journals a write to src/shared/rdo-types.ts", () => {
    const out = edit("src/shared/rdo-types.ts");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"src/shared/rdo-types.ts"');
  });

  it("journals a write to src/shared/rdo-frame.ts", () => {
    const out = edit("src/shared/rdo-frame.ts");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"src/shared/rdo-frame.ts"');
  });

  it("journals a write to src/shared/rdo-members.ts", () => {
    const out = edit("src/shared/rdo-members.ts");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"src/shared/rdo-members.ts"');
  });

  it("journals a write to src/server/rdo.ts", () => {
    const out = edit("src/server/rdo.ts");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"src/server/rdo.ts"');
  });

  it("journals a chmod on an RDO file", () => {
    const out = bash("chmod +x src/server/rdo.ts");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"src/server/rdo.ts"');
  });
});

describe("journal-writes — jest.config.js", () => {
  it("journals a write to jest.config.js", () => {
    const out = edit("jest.config.js");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"jest.config.js"');
  });

  it("journals a sed -i on jest.config.js", () => {
    const out = bash("sed -i s/38/39/ jest.config.js");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"jest.config.js"');
  });
});

describe("journal-writes — Bash verbs", () => {
  it("journals a sed -i on an instrumented file", () => {
    const out = bash("sed -i s/hook/updated/ .claude/hooks/test.sh");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":".claude/hooks/test.sh"');
  });

  it("journals an rm of an instrumented file", () => {
    const out = bash("rm scripts/bench-worker.sh");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"scripts/bench-worker.sh"');
  });

  it("journals a chmod on an instrumented file", () => {
    const out = bash("chmod +x .claude/hooks/journal-writes.sh");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":".claude/hooks/journal-writes.sh"');
  });

  it("journals a redirection to an instrumented file", () => {
    const out = bash("echo warning > scripts/verify-gate.js");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"scripts/verify-gate.js"');
  });

  it("journals a >> append to an instrumented file", () => {
    const out = bash("echo data >> src/shared/rdo-types.ts");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"src/shared/rdo-types.ts"');
  });

  it("does not journal cp FROM an instrumented file TO a non-instrumented target", () => {
    const out = bash("cp jest.config.js jest.config.backup.js");
    // cp only writes to the destination (jest.config.backup.js), not the source.
    // Since the destination is not instrumented, no journal entry.
    expect(out).toBe("");
  });

  it("journals when cp copies TO an instrumented file", () => {
    const out = bash("cp /tmp/test jest.config.js");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"jest.config.js"');
  });

  it("journals mv to an instrumented file", () => {
    const out = bash("mv /tmp/old-hook .claude/hooks/new-hook.sh");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":".claude/hooks/new-hook.sh"');
  });
});

describe("journal-writes — NotebookEdit", () => {
  it("journals a notebook edit on an instrumented file", () => {
    const out = notebookEdit("src/e2e/bench/notebook.ipynb");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"src/e2e/bench/notebook.ipynb"');
  });
});

describe("journal-writes — negative cases (not journaled)", () => {
  it("does not journal a write to an untracked file outside the tree", () => {
    const out = edit(SCRATCH);
    expect(out).toBe("");
  });

  it("does not journal a write to a non-instrumented tracked file", () => {
    const out = edit(TRACKED);
    expect(out).toBe("");
  });

  it("does not journal a write to src/ that is not instrumented", () => {
    const out = edit("src/client/index.ts");
    expect(out).toBe("");
  });

  it("does not journal a write to scripts/finish.sh (not bench-*)", () => {
    const out = edit("scripts/finish.sh");
    expect(out).toBe("");
  });

  it("does not journal a bash sed on a non-instrumented file", () => {
    const out = bash("sed -i s/a/b/ src/client/index.ts");
    expect(out).toBe("");
  });

  it("does not journal a redirection to a non-instrumented file", () => {
    const out = bash("echo x > /tmp/test.log");
    expect(out).toBe("");
  });

  it("does not journal a bash command with no file operands", () => {
    const out = bash("npm test");
    expect(out).toBe("");
  });
});

describe("journal-writes — JSON format", () => {
  it("returns valid JSON with tool and path fields", () => {
    const out = edit(".claude/hooks/test.sh");
    expect(out).toBeTruthy();
    const parsed = JSON.parse(out);
    expect(parsed).toHaveProperty("tool");
    expect(parsed).toHaveProperty("path");
    expect(typeof parsed.tool).toBe("string");
    expect(typeof parsed.path).toBe("string");
  });

  it("includes the tool name correctly", () => {
    const editOut = edit(".claude/hooks/test.sh");
    const writeOut = write(".claude/settings.json");
    const bashOut = bash("sed -i x jest.config.js");

    expect(JSON.parse(editOut).tool).toBe("Edit");
    expect(JSON.parse(writeOut).tool).toBe("Write");
    expect(JSON.parse(bashOut).tool).toBe("Bash");
  });

  it("includes the relative path correctly", () => {
    const out = edit("src/shared/rdo-frame.ts");
    const parsed = JSON.parse(out);
    expect(parsed.path).toBe("src/shared/rdo-frame.ts");
  });
});

describe("journal-writes — error handling", () => {
  it("fails open on an unparseable payload", () => {
    const out = execFileSync("node", [DECISION], {
      input: "not json",
      encoding: "utf8",
      env: { ...process.env, SPO_TOP: ROOT },
    }).trim();
    expect(out).toBe("");
  });

  it("returns empty string when tool_name is missing", () => {
    const out = verdict({
      tool_name: "",
      tool_input: { file_path: ".claude/hooks/test.sh" },
    });
    expect(out).toBe("");
  });

  it("returns empty string for an unknown tool", () => {
    const out = verdict({
      tool_name: "UnknownTool",
      tool_input: { file_path: ".claude/hooks/test.sh" },
    });
    expect(out).toBe("");
  });

  it("handles /dev/null gracefully", () => {
    const out = bash("cat > /dev/null");
    expect(out).toBe("");
  });
});

describe("journal-writes — quoted paths in bash", () => {
  it("handles double-quoted paths", () => {
    const out = bash('sed -i s/a/b/ ".claude/hooks/test.sh"');
    expect(out).toBeTruthy();
    expect(out).toContain('"path":".claude/hooks/test.sh"');
  });

  it("handles single-quoted paths", () => {
    const out = bash("sed -i s/a/b/ '.claude/hooks/test.sh'");
    expect(out).toBeTruthy();
    expect(out).toContain('"path":".claude/hooks/test.sh"');
  });
});

describe("journal-writes — heredocs are read as text", () => {
  it("does not journal a heredoc body that mentions an instrumented file", () => {
    const command = `cat > /tmp/msg.txt <<EOF
We should update .claude/hooks/test.sh soon
EOF`;
    const out = bash(command);
    // The /tmp/msg.txt redirection is outside the tree, so no journal
    expect(out).toBe("");
  });

  it("journals a heredoc that writes to an instrumented file", () => {
    const command = `cat > .claude/hooks/test.sh <<EOF
Some hook content
EOF`;
    const out = bash(command);
    expect(out).toBeTruthy();
    expect(out).toContain('"path":".claude/hooks/test.sh"');
  });
});

describe("journal-writes — resolves paths correctly", () => {
  it("resolves relative paths against the worktree root", () => {
    const out = edit("jest.config.js", { cwd: ROOT });
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"jest.config.js"');
  });

  it("resolves relative paths from subdirectories", () => {
    // When cwd is src/, a relative path like ../jest.config.js should resolve to the root jest.config.js
    const out = edit("../jest.config.js", { cwd: path.join(ROOT, "src") });
    expect(out).toBeTruthy();
    expect(out).toContain('"path":"jest.config.js"');
  });

  it("handles absolute paths inside the tree", () => {
    const abs = path.join(ROOT, ".claude", "hooks", "test.sh");
    const out = edit(abs);
    expect(out).toBeTruthy();
    expect(out).toContain('"path":".claude/hooks/test.sh"');
  });

  it("ignores absolute paths outside the tree", () => {
    const out = edit("/tmp/test.txt");
    expect(out).toBe("");
  });
});

describe("journal-writes — always exits 0 (never blocks)", () => {
  it("exits 0 when journaling", () => {
    const result = execFileSync("node", [DECISION], {
      input: JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: ".claude/hooks/test.sh" },
      }),
      encoding: "utf8",
      env: { ...process.env, SPO_TOP: ROOT },
    });
    // No exception means exit code was 0
    expect(result).toBeTruthy();
  });

  it("exits 0 when not journaling", () => {
    const result = execFileSync("node", [DECISION], {
      input: JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: "src/client/index.ts" },
      }),
      encoding: "utf8",
      env: { ...process.env, SPO_TOP: ROOT },
    });
    // No exception means exit code was 0
    expect(result).toBeTruthy();
  });

  it("exits 0 on unparseable input", () => {
    const result = execFileSync("node", [DECISION], {
      input: "garbage",
      encoding: "utf8",
      env: { ...process.env, SPO_TOP: ROOT },
    });
    // No exception means exit code was 0
    expect(result).toBeTruthy();
  });
});
