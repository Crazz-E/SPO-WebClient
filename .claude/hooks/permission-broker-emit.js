// The single exit of the permission broker: one verdict in, one hook response out.
//
// Both paths of permission-broker.sh end here — the one decided from the catalogue in ten
// milliseconds and the one decided by the arbiter in seven seconds — so a decision reads the
// same to the caller whatever produced it. That is the whole point of the design: an agent
// meeting a refusal cannot tell, and must not need to tell, which layer refused.
//
// It also owns the audit line, for the same reason: written in one place, it covers every
// layer, which is what makes "how many calls were answered without a model" a number rather
// than a hope (doc/permission-policy.md §4ter).
//
// stdin  a verdict object: { outcome|decision, reason, corrected_form, guidance,
//                            signature, domain, tool, source }
// stdout the PreToolUse hookSpecificOutput JSON, for allow and ask
// stderr the refusal text, for deny
// exit   0 for allow/ask/silent, 2 for deny

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function audit(v) {
  const dir = process.env.SPO_PERM_DIR || path.join(os.homedir(), ".spo-perm");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, "audit.jsonl"),
      JSON.stringify({
        at: new Date().toISOString(),
        tool: v.tool || "",
        signature: v.signature || "",
        domain: v.domain || "",
        decision: v.decision || v.outcome || "",
        source: v.source || "",
        session: process.env.SPO_PERM_SESSION || "",
      }) + "\n"
    );
  } catch {
    // Bookkeeping never costs a decision.
  }
}

function main() {
  let raw = "";
  process.stdin.on("data", c => (raw += c));
  process.stdin.on("end", () => {
    let v;
    try {
      v = JSON.parse(raw) || {};
    } catch {
      process.exit(0); // unreadable verdict = no opinion, today's behaviour
    }
    const decision = v.decision || v.outcome || "silent";
    if (decision !== "silent") audit(v);

    if (decision === "deny") {
      const lines = [
        "BLOCKED by the permission broker (doc/permission-policy.md).",
        "",
        String(v.reason || "This shape is refused by the permission policy."),
      ];
      // Measured, not stylistic: refusals that hand back the corrected form produced zero
      // identical retries; refusals that did not produced eleven
      // (doc/haiku-permission-analysis.md § RC3). Legitimate or not, the caller must be able
      // to adapt — that is the same requirement in both cases.
      if (v.corrected_form) {
        lines.push("", "Do this instead:", "", "  " + String(v.corrected_form).split("\n").join("\n  "));
      }
      if (v.source) lines.push("", `(decided by: ${v.source})`);
      process.stderr.write(lines.join("\n") + "\n");
      process.exit(2);
    }

    if (decision === "allow" || decision === "ask") {
      const out = {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: String(v.reason || "permission broker"),
      };
      // additionalContext is the only channel that reaches the CALLER on an allow
      // (permissionDecisionReason goes to the user), so it is where the lesson rides —
      // policy §4bis, the read-only call that runs but whose form is wrong.
      if (v.guidance) out.additionalContext = String(v.guidance);
      process.stdout.write(JSON.stringify({ hookSpecificOutput: out }));
      process.exit(0);
    }

    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { audit };
