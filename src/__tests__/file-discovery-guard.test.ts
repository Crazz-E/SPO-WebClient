// Test suite for file-discovery-guard.js — routes find and grep commands to Glob and Grep tools.
// Card #398, related #395.

import { execSync } from "child_process";
import * as path from "path";

// Helper to call the guard with a Bash command payload
function testGuard(command: string, cwd?: string): { stdout: string; stderr: string; exitCode: number } {
  const payload = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command },
    cwd: cwd || process.cwd(),
  });

  try {
    const stdout = execSync(
      `node "${path.join(__dirname, "../..", ".claude/hooks/file-discovery-guard.js")}"`,
      {
        input: payload,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    if (err instanceof Error && "stdout" in err && "stderr" in err && "status" in err) {
      return {
        stdout: (err as any).stdout || "",
        stderr: (err as any).stderr || "",
        exitCode: (err as any).status || 1,
      };
    }
    return { stdout: "", stderr: String(err), exitCode: 1 };
  }
}

describe("file-discovery-guard.js", () => {
  describe("find glob patterns (should BLOCK)", () => {
    it("blocks find with -name glob pattern", () => {
      const result = testGuard("find . -name '*.ts' -type f");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Glob(pattern=");
    });

    it("blocks find with -name wildcards", () => {
      const result = testGuard("find /src -name 'test-*.js'");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Glob(");
    });

    it("blocks find with -path glob pattern", () => {
      const result = testGuard("find . -path '*/src/**' -type f");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Glob(pattern=");
    });

    it("blocks find with -iname (case-insensitive name)", () => {
      const result = testGuard("find . -iname '*.PAS' -o -iname '*.pas'");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Glob(");
    });

    it("blocks find with -ipath (case-insensitive path)", () => {
      const result = testGuard("find . -ipath '*DELPHI*' -type f");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Glob(");
    });

    it("blocks find with negated glob pattern (! -name)", () => {
      const result = testGuard("find . ! -name '*.bak' -type f");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Glob(");
    });

    it("blocks fd with glob pattern", () => {
      const result = testGuard("fd '*.test.ts'");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Glob(");
    });

    it("blocks find with character class [abc]", () => {
      const result = testGuard("find . -name '[abc]*.txt'");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Glob(");
    });

    it("blocks find with ? wildcard", () => {
      const result = testGuard("find . -name 'test?.ts'");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Glob(");
    });
  });

  describe("find without glob patterns (should ALLOW)", () => {
    it("allows find with literal name (no wildcards)", () => {
      const result = testGuard("find . -name 'tsconfig.json' -type f");
      expect(result.stdout).toBe("ALLOW");
    });

    it("allows find with -type only", () => {
      const result = testGuard("find . -type f -mtime -1");
      expect(result.stdout).toBe("ALLOW");
    });

    it("allows find with no patterns", () => {
      const result = testGuard("find . -type d");
      expect(result.stdout).toBe("ALLOW");
    });
  });

  describe("grep file searches (should BLOCK)", () => {
    it("blocks grep searching a single file", () => {
      const result = testGuard("grep -n 'pattern' file.txt");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Grep(pattern=");
    });

    it("blocks grep -r recursive search", () => {
      const result = testGuard("grep -r 'TODO' src/");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Grep(pattern=");
    });

    it("blocks grep --recursive", () => {
      const result = testGuard("grep --recursive 'function' .");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Grep(pattern=");
    });

    it("blocks grep -e pattern with file", () => {
      const result = testGuard("grep -ne '^class' src/main.ts");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Grep(");
    });

    it("blocks grep with quoted pattern", () => {
      const result = testGuard('grep -n "import { " src/index.ts');
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Grep(");
    });

    it("blocks grep -r with path", () => {
      const result = testGuard("grep -rn 'export const' src/");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Grep(pattern=");
      expect(result.stdout).toContain("Grep(pattern");
    });

    it("blocks grep with short flags including r", () => {
      const result = testGuard("grep -rni 'constructor' .");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Grep(");
    });
  });

  describe("grep pass-through (should ALLOW)", () => {
    it("allows git grep", () => {
      const result = testGuard("git grep -n 'pattern'");
      expect(result.stdout).toBe("ALLOW");
    });

    it("allows grep from stdin (no file argument)", () => {
      const result = testGuard("cat file.txt | grep 'pattern'");
      expect(result.stdout).toBe("ALLOW");
    });

    it("allows grep without recursive flag and no file", () => {
      const result = testGuard("echo 'test' | grep 'pattern'");
      expect(result.stdout).toBe("ALLOW");
    });

    it("blocks grep -l with file glob pattern", () => {
      const result = testGuard("grep -l 'test' *.txt");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
    });
  });

  describe("other commands (should ALLOW)", () => {
    it("allows npm test", () => {
      const result = testGuard("npm test");
      expect(result.stdout).toBe("ALLOW");
    });

    it("allows git commands", () => {
      const result = testGuard("git status");
      expect(result.stdout).toBe("ALLOW");
    });

    it("allows ls commands", () => {
      const result = testGuard("ls -la src/");
      expect(result.stdout).toBe("ALLOW");
    });

    it("allows cat commands without find/grep", () => {
      const result = testGuard("cat README.md");
      expect(result.stdout).toBe("ALLOW");
    });

    it("allows piped commands without find/grep", () => {
      const result = testGuard("cat file.txt | head -20");
      expect(result.stdout).toBe("ALLOW");
    });
  });

  describe("complex commands", () => {
    it("blocks find in a compound command", () => {
      const result = testGuard("find . -name '*.ts' && npm test");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Glob(");
    });

    it("blocks grep in a semicolon-separated command", () => {
      const result = testGuard("cd src; grep -r 'import' .");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Grep(");
    });

    it("blocks find piped to grep (first violation wins)", () => {
      const result = testGuard("find . -name '*.js' | grep -v node_modules");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      // Should block on find, not grep
      expect(result.stdout).toContain("Glob(");
    });

    it("allows find followed by unrelated command", () => {
      const result = testGuard("ls -la; cd src/");
      expect(result.stdout).toBe("ALLOW");
    });
  });

  describe("false positive avoidance", () => {
    it("ignores find/grep in quoted strings", () => {
      const result = testGuard("echo 'find . -name *.ts'");
      expect(result.stdout).toBe("ALLOW");
    });

    it("ignores find/grep in heredoc content", () => {
      const result = testGuard(`cat <<EOF
find . -name "*.ts"
grep -r "pattern" .
EOF`);
      expect(result.stdout).toBe("ALLOW");
    });

    it("ignores find/grep in comments", () => {
      const result = testGuard("# find . -name '*.ts'");
      expect(result.stdout).toBe("ALLOW");
    });

    it("allows find with multiple non-glob patterns", () => {
      const result = testGuard("find . -name file.txt -o -name other.js");
      expect(result.stdout).toBe("ALLOW");
    });
  });

  describe("override token", () => {
    it("allows command when override token is present", () => {
      const result = testGuard("SPO_FILE_DISCOVERY_GUARD_OVERRIDE=i-mean-it find . -name '*.ts'");
      expect(result.stdout).toBe("ALLOW");
    });

    it("allows override token anywhere in command", () => {
      const result = testGuard("find . SPO_FILE_DISCOVERY_GUARD_OVERRIDE=i-mean-it -name '*.ts'");
      expect(result.stdout).toBe("ALLOW");
    });
  });

  describe("non-Bash payloads", () => {
    it("allows non-Bash tool use", () => {
      const payload = JSON.stringify({
        tool_name: "Read",
        tool_input: { file_path: "/path/to/file" },
      });

      let stdout = "";
      try {
        stdout = execSync(
          `node "${path.join(__dirname, "../..", ".claude/hooks/file-discovery-guard.js")}"`,
          {
            input: payload,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
          }
        );
      } catch {
        // guard may exit non-zero
      }

      expect(stdout.trim()).toBe("ALLOW");
    });

    it("allows unparseable JSON", () => {
      const payload = "{ invalid json }";

      let stdout = "";
      try {
        stdout = execSync(
          `node "${path.join(__dirname, "../..", ".claude/hooks/file-discovery-guard.js")}"`,
          {
            input: payload,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
          }
        );
      } catch {
        // guard may exit non-zero
      }

      expect(stdout.trim()).toBe("ALLOW");
    });
  });

  describe("corrected command format", () => {
    it("generates correct Glob() call for find -name", () => {
      const result = testGuard("find . -name '*.test.ts'");
      expect(result.stdout).toContain('Glob(pattern="*.test.ts"');
    });

    it("generates correct Glob() call for find -path", () => {
      // find's `*` crosses `/` boundaries already, so `*/src/**` matches at any depth; a glob's
      // `*` does not, so the leading `*/` must be promoted to `**/` to keep the same match.
      const result = testGuard("find . -path '*/src/**'");
      expect(result.stdout).toContain('Glob(pattern="**/src/**"');
    });

    it("generates correct Grep() call for grep single file", () => {
      const result = testGuard("grep -n 'TODO' src/main.ts");
      expect(result.stdout).toContain('Grep(pattern="TODO"');
      expect(result.stdout).toContain('path="src/main.ts"');
    });

    it("generates correct Grep() call for grep -r", () => {
      const result = testGuard("grep -rn 'export' .");
      expect(result.stdout).toContain('Grep(pattern="export"');
      expect(result.stdout).toContain('path="."');
      // grep -r with a path argument is treated as recursive search from that path
      expect(result.stdout).toContain('glob');
    });

    it("escapes double quotes in patterns", () => {
      const result = testGuard('grep -n "import { " src/index.ts');
      expect(result.stdout).toContain("import {");
    });
  });

  describe("environment and cwd", () => {
    it("processes with cwd in payload", () => {
      const result = testGuard("find . -name '*.ts'", "/home/user/project");
      expect(result.stdout).not.toBe("ALLOW");
      expect(result.stdout).toContain("BLOCKED");
      expect(result.stdout).toContain("Glob(");
    });
  });
});
