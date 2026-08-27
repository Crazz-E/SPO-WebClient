/**
 * The spawn-path-guard hook (.claude/hooks/spawn-path-guard.{sh,js}).
 *
 * WHY THIS FILE EXISTS. An Agent spawn that references paths outside this session's
 * worktree is a red flag: the sub-agent's relative-path resolution is correct (it runs
 * with the worktree as its cwd), but a prompt that explicitly names a path to the wrong
 * tree suggests hand-typed drifted paths or a payload error. This guard catches that at
 * spawn time, before the sub-agent runs.
 *
 * The `.sh` wrapper discovers the worktree and main checkout roots using git; the `.js`
 * side is the decision logic, tested here with crafted payloads and real git worktree
 * fixtures.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ROOT = process.cwd();
const GUARD = path.join(ROOT, ".claude", "hooks", "spawn-path-guard.js");
const WRAPPER = path.join(ROOT, ".claude", "hooks", "spawn-path-guard.sh");

const readScript = (p: string): string => fs.readFileSync(p, "utf8");

// Use scratchpad to avoid /tmp disk space issues
const getTempDir = (): string => {
  const scratchpad = process.env.SCRATCHPAD_DIR || path.join(os.tmpdir(), ".spg-test");
  fs.mkdirSync(scratchpad, { recursive: true });
  return scratchpad;
};

interface Payload {
  cwd?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

interface Roots {
  family: string;
  top: string;
  other: string;
}

/** A throwaway `family` tree holding `top` and a sibling `other` worktree, both real dirs. */
function makeRoots(): Roots {
  const tempDir = getTempDir();
  const family = fs.realpathSync(
    fs.mkdtempSync(path.join(tempDir, "spg-family-"))
  );
  const top = path.join(family, ".claude", "worktrees", "this-session");
  const other = path.join(family, ".claude", "worktrees", "other-session");
  fs.mkdirSync(top, { recursive: true });
  fs.mkdirSync(other, { recursive: true });
  return { family, top, other };
}

/** Run the decision program over one payload and return the verdict line. */
function verdict(
  payload: Partial<Payload>,
  roots: Pick<Roots, "top" | "family">
): string {
  const body: Payload = {
    cwd: roots.top,
    tool_name: "Agent",
    tool_input: { prompt: "" },
    ...payload,
  } as Payload;
  return execFileSync("node", [GUARD], {
    input: JSON.stringify(body),
    encoding: "utf8",
    env: { ...process.env, SPO_TOP: roots.top, SPO_FAMILY: roots.family },
  }).trim();
}

const agent = (
  prompt: string,
  roots: Pick<Roots, "top" | "family">,
  cwd?: string
): string =>
  verdict(
    { tool_name: "Agent", tool_input: { prompt }, cwd: cwd ?? roots.top },
    roots
  );

describe("spawn-path-guard — the core acceptance cases", () => {
  it("allow prompt with no absolute paths", () => {
    const roots = makeRoots();
    expect(
      agent(
        "read relative/path and relative/other/file.ts for context",
        roots
      )
    ).toBe("ALLOW");
  });

  it("allow prompt with paths inside top", () => {
    const roots = makeRoots();
    const prompt = `read ${path.join(roots.top, "src/file.ts")} and ${path.join(
      roots.top,
      "src/other.ts"
    )}`;
    expect(agent(prompt, roots)).toBe("ALLOW");
  });

  it("block prompt with path under family outside top", () => {
    const roots = makeRoots();
    const prompt = `read ${path.join(roots.family, "leaked.txt")}`;
    const out = agent(prompt, roots);
    expect(out).not.toBe("ALLOW");
    expect(out).toContain("outside this session's worktree");
    expect(out).toContain("leaked.txt");
  });

  it("block prompt referencing another worktree", () => {
    const roots = makeRoots();
    const prompt = `modify ${path.join(roots.other, "src/file.ts")}`;
    const out = agent(prompt, roots);
    expect(out).not.toBe("ALLOW");
    expect(out).toContain("outside this session's worktree");
  });

  it("allow prompt with scratchpad path", () => {
    const roots = makeRoots();
    const prompt = `read /tmp/claude-1000/scratchpad/notes.md`;
    expect(agent(prompt, roots)).toBe("ALLOW");
  });

  it("allow prompt with ~/.spo-bench path", () => {
    const roots = makeRoots();
    const home = process.env.HOME || "";
    if (home) {
      const prompt = `check ${path.join(home, ".spo-bench", "sessions", "xyz.alive")}`;
      expect(agent(prompt, roots)).toBe("ALLOW");
    }
  });

  it("allow prompt with SPO-Original path", () => {
    const roots = makeRoots();
    const repoRoot = path.dirname(roots.family);
    const spoPath = path.join(repoRoot, "SPO-Original", "Rdo", "Server", "RDOObjectServer.pas");
    const prompt = `cite ${spoPath} line 123`;
    expect(agent(prompt, roots)).toBe("ALLOW");
  });

  it("allow prompt with SPO-ASP path", () => {
    const roots = makeRoots();
    const repoRoot = path.dirname(roots.family);
    const spoPath = path.join(repoRoot, "SPO-ASP", "Five", "0", "tycoonratings.asp");
    const prompt = `check ${spoPath}`;
    expect(agent(prompt, roots)).toBe("ALLOW");
  });

  it("provides corrected worktree-rooted path for blocked paths", () => {
    const roots = makeRoots();
    const mainCheckout = path.join(roots.family, "leaked.txt");
    const prompt = `edit ${mainCheckout}`;
    const out = agent(prompt, roots);
    expect(out).toContain("\t");
    const [reason, corrected] = out.split("\t");
    expect(reason).toContain("outside");
    expect(corrected).toContain(roots.top);
    expect(corrected).toMatch(/leaked\.txt$/);
  });

  it("handles malformed JSON gracefully", () => {
    const roots = makeRoots();
    const malformed = "{ not valid json }";
    const result = execFileSync("node", [GUARD], {
      input: malformed,
      encoding: "utf8",
      env: { ...process.env, SPO_TOP: roots.top, SPO_FAMILY: roots.family },
    }).trim();
    expect(result).toBe("ALLOW");
  });

  it("allows non-Agent tool payloads", () => {
    const roots = makeRoots();
    const payload: Payload = {
      tool_name: "Edit",
      tool_input: { file_path: path.join(roots.family, "leaked.txt") },
    };
    const result = execFileSync("node", [GUARD], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, SPO_TOP: roots.top, SPO_FAMILY: roots.family },
    }).trim();
    expect(result).toBe("ALLOW");
  });
});

describe("spawn-path-guard — boundary conditions", () => {
  it("ignores /dev/null", () => {
    const roots = makeRoots();
    const prompt = "output to /dev/null";
    expect(agent(prompt, roots)).toBe("ALLOW");
  });

  it("handles missing env gracefully", () => {
    const payload: Payload = {
      tool_name: "Agent",
      tool_input: { prompt: `/some/path` },
    };
    const result = execFileSync("node", [GUARD], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: {},
    }).trim();
    expect(result).toBe("ALLOW");
  });

  it("handles unparseable paths gracefully", () => {
    const roots = makeRoots();
    // A path reference that looks like code, not a real path
    const prompt = "in src/foo.ts call SomeFunction(/regex/pattern)";
    expect(agent(prompt, roots)).toBe("ALLOW");
  });
});
