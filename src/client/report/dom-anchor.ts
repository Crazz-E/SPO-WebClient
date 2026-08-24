/**
 * Turning a flagged DOM element into something a triage session can `grep` for.
 *
 * The component chain — `["GameScreen","PoliticsPanel","TaxRow","button"]` — is what makes
 * autonomous triage possible: the names plus one `grep` locate the file. It comes from React's
 * fiber tree, which is an internal: `_debugSource` was removed in React 19, so there is no
 * supported alternative, and the key or the shape may change on any upgrade.
 *
 * Hence the contract: the entire walk sits in one `try/catch`, and a failure degrades to an
 * empty chain over the always-computed CSS chain. A failed walk still yields a valid anchor.
 */

import { computeAnchorKey, type DomAnchor } from '../../shared/bug-report-schema';

/** Levels of CSS chain kept — enough to locate, short enough to read. */
const CSS_CHAIN_DEPTH = 8;
/** Component names kept, innermost-biased: a deeper chain is noise. */
const COMPONENT_CHAIN_DEPTH = 8;
/** `element.textContent`, trimmed, capped — the schema's own documented target. */
const ANCHOR_TEXT_MAX = 500;

/** `div#root.app > section.panel > button.tax` — always available, never throws. */
export function cssChainOf(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  for (let depth = 0; current && depth < CSS_CHAIN_DEPTH; depth++) {
    let part = current.tagName.toLowerCase();
    if (current.id) part += `#${current.id}`;
    const className = typeof current.className === 'string' ? current.className.trim() : '';
    if (className) part += `.${className.split(/\s+/).slice(0, 3).join('.')}`;
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

/** A fiber node, reduced to the two fields the walk reads. */
interface FiberLike {
  type?: unknown;
  return?: FiberLike | null;
}

function componentNameOf(type: unknown): string | null {
  if (typeof type === 'function') {
    const fn = type as { name?: string; displayName?: string };
    return fn.displayName || fn.name || null;
  }
  if (typeof type === 'object' && type !== null) {
    // memo() / forwardRef() wrappers carry the name on the object itself.
    const wrapper = type as { displayName?: string };
    return wrapper.displayName || null;
  }
  return null;
}

/**
 * Walk the fiber `.return` chain, outermost first.
 *
 * Host fibers (`type` is a string like `'button'`) contribute only the leaf tag — the chain is
 * about components, and every intervening `div` would drown them.
 */
function componentChainOf(element: Element): string[] {
  const fiberKey = Object.keys(element).find(k => k.startsWith('__reactFiber$'));
  if (!fiberKey) return [];

  const chain: string[] = [];
  let fiber: FiberLike | null | undefined = (element as unknown as Record<string, FiberLike>)[fiberKey];
  let leafTag: string | null = null;

  for (let depth = 0; fiber && depth < COMPONENT_CHAIN_DEPTH * 4; depth++) {
    if (typeof fiber.type === 'string') {
      if (leafTag === null) leafTag = fiber.type;
    } else {
      const name = componentNameOf(fiber.type);
      if (name) chain.unshift(name);
    }
    fiber = fiber.return;
  }

  const trimmed = chain.slice(-COMPONENT_CHAIN_DEPTH);
  if (leafTag) trimmed.push(leafTag);
  return trimmed;
}

/**
 * The anchor for a DOM element. Never throws: the fiber walk is best-effort, the CSS chain
 * and the text are not.
 */
export function resolveDomAnchor(element: Element): DomAnchor {
  let componentChain: string[];
  try {
    componentChain = componentChainOf(element);
  } catch {
    // A React internal moved, or a getter threw. The CSS chain below still locates the element.
    componentChain = [];
  }

  const text = (element.textContent ?? '').trim().slice(0, ANCHOR_TEXT_MAX);
  return { kind: 'dom', componentChain, cssChain: cssChainOf(element), text };
}

/** The anchor plus its dedup key, which is what a report actually carries. */
export function resolveDomAnchorWithKey(element: Element): { anchor: DomAnchor; anchorKey: string } {
  const anchor = resolveDomAnchor(element);
  return { anchor, anchorKey: computeAnchorKey(anchor) };
}
