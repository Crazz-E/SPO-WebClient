/**
 * The rolling action journal — the 60 seconds that preceded a bug report.
 *
 * A module singleton, armed once by `BugReportRoot` when `SPO_BUG_REPORT` is on, and then
 * **running continuously** — not only while report mode is armed. That is deliberate: nobody
 * can arm a mode *before* noticing a problem, and shipping the seconds that led up to the
 * flag is the whole point.
 *
 * Unarmed, every entry point is a no-op, so the taps in `client.ts` cost nothing in a
 * production build beyond the call itself.
 */

import {
  MAX_JOURNAL_ENTRIES,
  MAX_WS_PAYLOAD_BYTES,
  MAX_TEXT_LENGTH,
  type JournalEntry,
} from '../../shared/bug-report-schema';
import { cssChainOf } from './dom-anchor';

/** How far back a snapshot reaches. */
export const JOURNAL_WINDOW_MS = 60_000;

/**
 * The journal records verbatim and never interprets, so the tap takes `unknown` rather than
 * `WsMessage`: tying it to the wire union would make every new message type a change here too,
 * and the only field it reads is `type`.
 */
function typeOf(msg: unknown): string {
  return typeof msg === 'object' && msg !== null && typeof (msg as { type?: unknown }).type === 'string'
    ? (msg as { type: string }).type
    : '?';
}

/** Minimal shape of the surface stack the journal watches, so it need not import the store's types. */
interface StackSurface {
  kind: string;
}

function truncate(text: string, max = MAX_TEXT_LENGTH): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Serialize a payload, cutting it if it is too big to carry.
 *
 * A payload that cannot be serialized at all (a cycle, a DOM node) is not a reason to lose
 * the entry — the message type alone still tells the triage session what crossed the wire.
 */
function boundPayload(payload: unknown): { payload: unknown; truncated?: true } {
  let serialized: string;
  try {
    serialized = JSON.stringify(payload ?? null);
  } catch {
    return { payload: '[unserializable]', truncated: true };
  }
  if (serialized === undefined) return { payload: null };
  if (serialized.length <= MAX_WS_PAYLOAD_BYTES) return { payload };
  return { payload: `${serialized.slice(0, MAX_WS_PAYLOAD_BYTES - 32)}…[cut]`, truncated: true };
}

/** Which way a stack changed between two renders. */
function surfaceAction(before: StackSurface[], after: StackSurface[]): JournalEntry | null {
  if (after.length === 0) {
    return before.length === 0 ? null : { t: 'surface', ts: Date.now(), action: 'clear', surface: '' };
  }
  const surface = after[after.length - 1].kind;
  if (after.length > before.length) return { t: 'surface', ts: Date.now(), action: 'push', surface };
  if (after.length < before.length) return { t: 'surface', ts: Date.now(), action: 'pop', surface };
  return before[before.length - 1].kind === surface
    ? null
    : { t: 'surface', ts: Date.now(), action: 'root', surface };
}

class ReportJournal {
  private entries: JournalEntry[] = [];
  private armed = false;
  private disposers: Array<() => void> = [];

  /** Whether the taps are live. Cheap enough for `client.ts` to consult on every message. */
  public get isArmed(): boolean {
    return this.armed;
  }

  /**
   * Start recording. Idempotent — a second call does nothing rather than double every tap.
   *
   * `subscribeStack` is passed in rather than imported so the journal stays free of the UI
   * store: `BugReportRoot` owns that wiring.
   */
  public arm(subscribeStack?: (listener: () => void) => () => void, readStack?: () => StackSurface[]): void {
    if (this.armed) return;
    this.armed = true;

    this.wrapConsole();
    this.listenToWindow();
    this.listenToClicks();
    if (subscribeStack && readStack) this.watchSurfaces(subscribeStack, readStack);
  }

  /** Undo everything `arm` installed, in reverse. Mostly for tests and hot reload. */
  public disarm(): void {
    if (!this.armed) return;
    this.armed = false;
    for (const dispose of this.disposers.reverse()) dispose();
    this.disposers = [];
  }

  /** Drop every entry, keeping the taps in place. */
  public reset(): void {
    this.entries = [];
  }

  /** The `client.ts` tap. Verbatim message in, bounded entry out. */
  public record(t: 'ws-in' | 'ws-out', msg: unknown): void {
    if (!this.armed) return;
    const bounded = boundPayload(msg);
    this.push({
      t,
      ts: Date.now(),
      msgType: truncate(typeOf(msg)),
      payload: bounded.payload,
      ...(bounded.truncated ? { truncated: true as const } : {}),
    });
  }

  /**
   * The last 60 seconds, oldest first, as a copy.
   *
   * A copy because the report is serialized after this returns, and the taps keep firing in
   * between — a caller must never watch its own evidence change under it.
   */
  public snapshot(now: number = Date.now()): JournalEntry[] {
    const floor = now - JOURNAL_WINDOW_MS;
    return this.entries.filter(e => e.ts >= floor).map(e => ({ ...e }));
  }

  private push(entry: JournalEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_JOURNAL_ENTRIES) this.entries.shift();
  }

  /**
   * Wrap `console.error` / `console.warn`, calling through.
   *
   * On mobile this is the only console anyone will ever see, so swallowing a message here
   * would be worse than not recording it at all.
   */
  private wrapConsole(): void {
    for (const level of ['error', 'warn'] as const) {
      const original = console[level];
      console[level] = (...args: unknown[]): void => {
        this.push({
          t: 'console',
          ts: Date.now(),
          level,
          message: truncate(args.map(a => (typeof a === 'string' ? a : String(a))).join(' ')),
        });
        original.apply(console, args);
      };
      this.disposers.push(() => { console[level] = original; });
    }
  }

  private listenToWindow(): void {
    if (typeof window === 'undefined') return;
    const onError = (event: ErrorEvent): void => {
      this.push({ t: 'console', ts: Date.now(), level: 'error', message: truncate(`uncaught: ${event.message}`) });
    };
    const onRejection = (event: PromiseRejectionEvent): void => {
      this.push({ t: 'console', ts: Date.now(), level: 'error', message: truncate(`unhandled rejection: ${String(event.reason)}`) });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    this.disposers.push(() => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    });
  }

  private listenToClicks(): void {
    if (typeof document === 'undefined') return;
    const onPointerDown = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const text = (target.textContent ?? '').trim();
      this.push({
        t: 'click',
        ts: Date.now(),
        target: cssChainOf(target),
        ...(text ? { text: truncate(text, 200) } : {}),
      });
    };
    document.addEventListener('pointerdown', onPointerDown, { capture: true });
    this.disposers.push(() => document.removeEventListener('pointerdown', onPointerDown, { capture: true }));
  }

  /**
   * Watch the surface stack by diffing the array reference ourselves.
   *
   * The UI store carries no `subscribeWithSelector` middleware, so zustand 5's vanilla
   * `subscribe` takes one listener and `subscribe(selector, cb)` would not compile (#169).
   */
  private watchSurfaces(subscribe: (listener: () => void) => () => void, readStack: () => StackSurface[]): void {
    let previous = readStack();
    const unsubscribe = subscribe(() => {
      const current = readStack();
      if (current === previous) return;
      const entry = surfaceAction(previous, current);
      previous = current;
      if (entry) this.push(entry);
    });
    this.disposers.push(unsubscribe);
  }
}

export const reportJournal = new ReportJournal();
