#!/usr/bin/env node

/**
 * The orphan watch — it makes a stuck card visible, and frees nothing.
 *
 * The ownership law (doc/kanban-workflow.md) has no staleness timeout on purpose: a card
 * whose `Session` field is filled belongs to that session, and only the human may free it.
 * That is the right rule, and this script does not touch it. What it fixes is the other
 * half: nothing told the human a card *needed* freeing. A session that dies mid-flight
 * leaves its card in In progress / Gate / PR, owned by nobody alive, and invisible until
 * somebody happens to re-read the board.
 *
 * ## What counts as a suspect
 *
 * Claimed (`Session` non-empty) + in a working column (In progress / Gate / PR) + the card
 * has not moved for `ORPHAN_STALE_HOURS` (default 24).
 *
 * The quiet signal is the project item's own `updatedAt`. It is the one clock that ticks on
 * every milestone a live session is required to write — claim, gate deposited, PR opened —
 * so a session that is working moves it, and a session that has stopped cannot. The branch
 * and the pull request are read too, but only as *evidence printed next to the card*, never
 * as the trigger: a card in In progress legitimately has no pushed branch and no PR, so
 * firing on their absence would report every healthy claim in the pool.
 *
 * 24 h rather than 12: the bench worker serialises every session's gate on one machine, so
 * an L-sized task behind a queue can honestly sit quiet for most of a working day. 24 h is
 * past any plausible single-session lifetime here — every card that has landed so far was
 * claimed and finished the same day — and it never fires on a card claimed in the evening
 * and worked the next morning.
 *
 * ## The shape of the reminder
 *
 * **One comment on the quiet card itself, once per ownership episode** — plus a table in the
 * run's job summary, which costs nothing and notifies nobody.
 *
 * A daily digest issue was the other candidate and is the worse one here: the project has
 * "Auto-add to project" enabled, so every issue this job opened would land in the Todo pool
 * as a card, and a session running `/next-task` would eventually claim the machine's own
 * bookkeeping as work. A comment creates no card, and it lands on the exact issue whose
 * `Session` the human has to decide about.
 *
 * It cannot repeat, either. Each comment carries a hidden marker naming the `Session` value
 * it fired on; a card that already has a marker for its current owner is never commented on
 * again, however many days it stays quiet. The marker keys on the `Session` string and not
 * on a timestamp on purpose — posting a comment can itself bump the card's `updatedAt`, and
 * a timestamp key would make the job re-fire on the trace of its own last run, every day,
 * forever. A freed and re-claimed card gets a new `Session` and so re-arms naturally.
 *
 *   GITHUB_TOKEN=… PROJECTS_TOKEN=… node scripts/orphan-cards.js
 *   node scripts/orphan-cards.js --dry-run     # print the digest, write nothing
 *
 * Exit 0 whether or not orphans were found — a stuck card is news for a human, not a build
 * failure. Exit 1 only when the run itself could not complete.
 */

const fs = require('fs');

// One owner again. The board and the repository were briefly on two different accounts —
// the repository moved to `Crazz-Org` before the board did — and this file carried a
// `PROJECT_OWNER` / `REPO_OWNER` pair for exactly that window. The board has since moved to
// the organization too, so both halves address the same login and the pair is gone.
const OWNER = process.env.ORPHAN_OWNER || 'Crazz-Org';
const REPO = process.env.ORPHAN_REPO || 'SPO-WebClient';
const PROJECT_NUMBER = Number(process.env.ORPHAN_PROJECT || 1);

/** Columns where a card is owned and expected to be moving. Todo is unowned, Done and Needs triage are terminal. */
const WORKING_STATUSES = ['In progress', 'Gate', 'Validation', 'PR'];

const DEFAULT_STALE_HOURS = 24;

/** Hidden in each comment so a later run can tell "already told them" from "new owner". */
const MARKER_PREFIX = '<!-- orphan-watch:';
const MARKER_SUFFIX = ' -->';

const GRAPHQL = `
query($login: String!, $number: Int!, $cursor: String) {
  organization(login: $login) {
    projectV2(number: $number) {
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          updatedAt
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldTextValue {
                text
                field { ... on ProjectV2FieldCommon { name } }
              }
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2FieldCommon { name } }
              }
            }
          }
          content {
            ... on Issue { number title url state }
          }
        }
      }
    }
  }
}`;

/**
 * `Session` is free text written by hand, in the form `<branch> @ <YYYY-MM-DD>`. Anything
 * before the ` @ ` is the branch; a value with no separator is still an ownership marker,
 * so it yields a branch and no date rather than nothing.
 */
function parseSession(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const at = text.lastIndexOf(' @ ');
  if (at === -1) return { branch: text, date: null };
  const branch = text.slice(0, at).trim();
  const date = text.slice(at + 3).trim();
  return { branch, date: date || null };
}

/** One project item, flattened out of the GraphQL field-value soup. */
function readItem(node) {
  const values = (node?.fieldValues?.nodes ?? []).filter(v => v && v.field && v.field.name);
  const byName = name => {
    const hit = values.find(v => v.field.name === name);
    if (!hit) return '';
    return String(hit.text ?? hit.name ?? '');
  };
  const content = node?.content ?? {};
  return {
    number: content.number ?? null,
    title: content.title ?? '',
    url: content.url ?? '',
    state: content.state ?? '',
    status: byName('Status'),
    session: byName('Session'),
    updatedAt: node?.updatedAt ?? null,
  };
}

function hoursBetween(iso, now) {
  const then = Date.parse(iso ?? '');
  if (Number.isNaN(then)) return Infinity;
  return (now - then) / 3_600_000;
}

/**
 * Claimed, in a working column, and quiet for long enough. A card with no issue behind it
 * (a draft item) has nothing to comment on and is skipped.
 */
function isSuspect(item, now, staleHours) {
  if (!item || !item.number) return false;
  if (!parseSession(item.session)) return false;
  if (!WORKING_STATUSES.includes(item.status)) return false;
  return hoursBetween(item.updatedAt, now) >= staleHours;
}

/** The suspects, quietest first — the one most likely to be dead reads first. */
function selectOrphans(items, { now, staleHours }) {
  return items
    .filter(item => isSuspect(item, now, staleHours))
    .map(item => ({ ...item, quietHours: hoursBetween(item.updatedAt, now) }))
    .sort((a, b) => b.quietHours - a.quietHours);
}

function formatQuiet(hours) {
  if (!Number.isFinite(hours)) return 'never moved';
  if (hours < 48) return `${Math.floor(hours)} h`;
  return `${Math.floor(hours / 24)} days`;
}

/** Whatever the run could learn about the branch and the pull request, as one short line. */
function formatEvidence(evidence) {
  if (!evidence) return 'branch and PR not checked';
  const parts = [];
  if (evidence.branchExists === true) parts.push('branch alive on origin');
  else if (evidence.branchExists === false) parts.push('branch gone from origin');
  if (evidence.pr) parts.push(`PR #${evidence.pr.number} ${evidence.pr.state}`);
  else parts.push('no PR');
  return parts.join(' · ');
}

/** The hidden key of a reminder: which owner it was posted about. */
function marker(session) {
  return `${MARKER_PREFIX}${String(session ?? '').trim()}${MARKER_SUFFIX}`;
}

/** Every owner this card has already been reported for, read out of its comments. */
function firedOwners(comments) {
  const owners = new Set();
  for (const comment of comments ?? []) {
    const text = String(comment?.body ?? '');
    let at = text.indexOf(MARKER_PREFIX);
    while (at !== -1) {
      const end = text.indexOf(MARKER_SUFFIX, at);
      if (end === -1) break;
      owners.add(text.slice(at + MARKER_PREFIX.length, end));
      at = text.indexOf(MARKER_PREFIX, end);
    }
  }
  return owners;
}

/**
 * Whether this run owes this card a reminder. Once told about an owner, never again — a card
 * the human has decided to leave alone must not cost a notification every morning.
 */
function needsReminder(orphan, comments) {
  return !firedOwners(comments).has(String(orphan.session ?? '').trim());
}

/** The reminder itself, written for the human who has to make the call. */
function renderReminder(orphan, { staleHours }) {
  const session = parseSession(orphan.session);
  return [
    marker(orphan.session),
    `**This card has not moved for ${formatQuiet(orphan.quietHours)}**, and it is claimed.`,
    '',
    `- column: **${orphan.status}**`,
    `- \`Session\`: \`${orphan.session}\``,
    `- branch \`${session ? session.branch : ''}\`: ${formatEvidence(orphan.evidence)}`,
    '',
    'If that session is still alive, ignore this — nothing here changes the card. If it is not,',
    'the card is stuck: only you can free it, by clearing `Session` and moving the card back to',
    'Todo. This watch never does that itself, and it will not repeat this reminder for this owner.',
    '',
    `_Posted by \`.github/workflows/orphan-cards.yml\` after ${staleHours} h of silence._`,
  ].join('\n');
}

/**
 * A value that has to survive a Markdown table cell. The backslash goes first — escaping the
 * pipe alone turns a title already containing `\|` into `\\|`, which renders as a literal
 * backslash and then breaks the row exactly where the escape was meant to hold it together.
 */
function escapeCell(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|');
}

/** The same suspects as a table, for the run's job summary — a view, notifying nobody. */
function renderDigest(orphans, { now, staleHours }) {
  const stamp = new Date(now).toISOString().replace('T', ' ').slice(0, 16);
  const lines = [
    `### Orphan watch — ${stamp} UTC`,
    '',
    `${orphans.length} card${orphans.length === 1 ? '' : 's'} claimed and quiet for ${staleHours} h or more.`,
    '',
  ];
  if (orphans.length === 0) {
    lines.push('Every claimed card is moving.');
    return lines.join('\n');
  }
  lines.push('| Card | Column | Session | Quiet for | Evidence | Reminder |', '|---|---|---|---|---|---|');
  for (const o of orphans) {
    const session = parseSession(o.session);
    lines.push(
      `| [#${o.number}](${o.url}) ${escapeCell(o.title)} | ${escapeCell(o.status)} | \`${escapeCell(session ? session.branch : '')}\` | ${formatQuiet(o.quietHours)} | ${formatEvidence(o.evidence)} | ${o.reminded ? 'posted' : 'already sent'} |`
    );
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ the API side */

async function graphql(token, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: GRAPHQL, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${json.errors.map(e => e.message).join('; ')}`);
  return json.data;
}

async function rest(token, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function fetchItems(token) {
  const items = [];
  let cursor = null;
  for (;;) {
    const data = await graphql(token, { login: OWNER, number: PROJECT_NUMBER, cursor });
    const page = data?.organization?.projectV2?.items;
    if (!page) throw new Error(`project ${OWNER}/#${PROJECT_NUMBER} not readable with this token`);
    for (const node of page.nodes ?? []) items.push(readItem(node));
    if (!page.pageInfo?.hasNextPage) return items;
    cursor = page.pageInfo.endCursor;
  }
}

/** Branch and PR state for one suspect — printed as evidence, never used as the trigger. */
async function gatherEvidence(token, branch) {
  const encoded = encodeURIComponent(branch);
  const [ref, pulls] = await Promise.all([
    rest(token, 'GET', `/repos/${OWNER}/${REPO}/branches/${encoded}`),
    rest(token, 'GET', `/repos/${OWNER}/${REPO}/pulls?state=all&head=${OWNER}:${encoded}`),
  ]);
  const pr = Array.isArray(pulls) && pulls.length ? pulls[pulls.length - 1] : null;
  return {
    branchExists: ref !== null,
    pr: pr ? { number: pr.number, state: pr.merged_at ? 'merged' : pr.state } : null,
  };
}

async function fetchComments(token, number) {
  const comments = await rest(token, 'GET', `/repos/${OWNER}/${REPO}/issues/${number}/comments?per_page=100`);
  return Array.isArray(comments) ? comments : [];
}

async function postReminder(token, number, body) {
  await rest(token, 'POST', `/repos/${OWNER}/${REPO}/issues/${number}/comments`, { body });
}

function resolveStaleHours(env) {
  const raw = Number(env.ORPHAN_STALE_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STALE_HOURS;
}

async function main({ env = process.env, argv = process.argv.slice(2), out = process.stdout } = {}) {
  const dryRun = argv.includes('--dry-run');
  const projectToken = env.PROJECTS_TOKEN;
  const issueToken = env.GITHUB_TOKEN || projectToken;
  if (!projectToken) {
    out.write('PROJECTS_TOKEN is not set — a Projects v2 board is unreadable without it.\n');
    return 1;
  }
  const now = Date.now();
  const staleHours = resolveStaleHours(env);

  const items = await fetchItems(projectToken);
  const orphans = selectOrphans(items, { now, staleHours });

  for (const orphan of orphans) {
    const session = parseSession(orphan.session);
    orphan.evidence = session ? await gatherEvidence(issueToken, session.branch) : null;
    const comments = await fetchComments(issueToken, orphan.number);
    orphan.reminded = needsReminder(orphan, comments);
    if (orphan.reminded && !dryRun) {
      await postReminder(issueToken, orphan.number, renderReminder(orphan, { staleHours }));
    }
  }

  const posted = orphans.filter(o => o.reminded).length;
  out.write(
    `${items.length} cards on the board, ${orphans.length} quiet for ${staleHours} h+, ` +
      `${posted} reminder(s)${dryRun ? ' withheld (--dry-run)' : ' posted'}\n`
  );
  const digest = renderDigest(orphans, { now, staleHours });
  out.write(`${digest}\n`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${digest}\n`);
  return 0;
}

module.exports = {
  WORKING_STATUSES,
  DEFAULT_STALE_HOURS,
  parseSession,
  readItem,
  hoursBetween,
  isSuspect,
  selectOrphans,
  formatQuiet,
  formatEvidence,
  escapeCell,
  marker,
  firedOwners,
  needsReminder,
  renderReminder,
  renderDigest,
  resolveStaleHours,
  main,
};

if (require.main === module) {
  main().then(
    code => process.exit(code),
    err => {
      console.error(err.message);
      process.exit(1);
    }
  );
}
