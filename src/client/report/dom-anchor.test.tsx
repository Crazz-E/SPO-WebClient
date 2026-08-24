import { describe, it, expect } from '@jest/globals';
import { computeAnchorKey } from '../../shared/bug-report-schema';
import { cssChainOf, resolveDomAnchor, resolveDomAnchorWithKey } from './dom-anchor';

/**
 * A fiber chain, given innermost first, hung off the DOM node the way React does it: the
 * element carries its own host fiber, and `.return` walks *outward* to the parents.
 */
function attachFiber(element: Element, chain: Array<string | { host: string }>): void {
  let fiber: unknown = null;
  for (const step of [...chain].reverse()) {
    const type = typeof step === 'string'
      ? { [step]: function () { /* a component */ } }[step]
      : step.host;
    fiber = { type, return: fiber };
  }
  // React 19 hangs the fiber off a key suffixed with a random id.
  (element as unknown as Record<string, unknown>).__reactFiber$abc123 = fiber;
}

function makeTree(): { button: HTMLButtonElement } {
  document.body.innerHTML = '';
  const section = document.createElement('section');
  section.id = 'panel';
  section.className = 'panel wide';
  const button = document.createElement('button');
  button.className = 'tax';
  button.textContent = '  Set tax  ';
  section.appendChild(button);
  document.body.appendChild(section);
  return { button };
}

describe('cssChainOf', () => {
  it('renders tag, id and classes, outermost first', () => {
    const { button } = makeTree();
    expect(cssChainOf(button)).toBe('html > body > section#panel.panel.wide > button.tax');
  });

  it('keeps at most three classes per level, and eight levels', () => {
    document.body.innerHTML = '';
    let node: HTMLElement = document.body;
    for (let i = 0; i < 12; i++) {
      const child = document.createElement('div');
      child.className = 'a b c d e';
      node.appendChild(child);
      node = child;
    }
    const chain = cssChainOf(node);
    expect(chain.split(' > ')).toHaveLength(8);
    expect(chain).toContain('div.a.b.c >');
    expect(chain).not.toContain('.d');
  });

  it('survives an element with no class and no id', () => {
    document.body.innerHTML = '<span></span>';
    expect(cssChainOf(document.querySelector('span') as Element)).toBe('html > body > span');
  });
});

describe('resolveDomAnchor — the fiber walk', () => {
  it('collects the component chain outermost first, with the leaf tag last', () => {
    const { button } = makeTree();
    attachFiber(button, [{ host: 'button' }, 'TaxRow', 'PoliticsPanel', 'GameScreen']);

    expect(resolveDomAnchor(button).componentChain).toEqual([
      'GameScreen', 'PoliticsPanel', 'TaxRow', 'button',
    ]);
  });

  it('prefers displayName, and reads it off memo/forwardRef wrappers too', () => {
    const { button } = makeTree();
    const named = function Inner() { /* component */ };
    (named as unknown as { displayName: string }).displayName = 'TaxRow';
    (button as unknown as Record<string, unknown>).__reactFiber$abc123 = {
      type: 'button',
      return: { type: named, return: { type: { displayName: 'MemoPanel' }, return: null } },
    };

    expect(resolveDomAnchor(button).componentChain).toEqual(['MemoPanel', 'TaxRow', 'button']);
  });

  it('skips a wrapper object that carries no displayName, rather than naming it', () => {
    const { button } = makeTree();
    (button as unknown as Record<string, unknown>).__reactFiber$abc123 = {
      type: 'button',
      // An anonymous memo()/forwardRef() result, and a context provider: neither has a name
      // worth putting in the chain.
      return: { type: {}, return: { type: null, return: { type: function Named() {}, return: null } } },
    };

    expect(resolveDomAnchor(button).componentChain).toEqual(['Named', 'button']);
  });

  it('trims the outermost names when the tree is deeper than eight components', () => {
    const { button } = makeTree();
    const deep: string[] = [{ host: 'button' } as unknown as string];
    for (let i = 0; i < 12; i++) deep.push(`Level${i}`);
    attachFiber(button, deep as Array<string | { host: string }>);

    const chain = resolveDomAnchor(button).componentChain;
    expect(chain).toHaveLength(9);            // 8 components + the leaf tag
    expect(chain[chain.length - 1]).toBe('button');
    expect(chain[0]).toBe('Level7');          // Level11..Level8 dropped, innermost kept
  });

  it('degrades to an empty chain when the node carries no fiber at all', () => {
    const { button } = makeTree();
    const anchor = resolveDomAnchor(button);

    expect(anchor.componentChain).toEqual([]);
    expect(anchor.cssChain).toBe('html > body > section#panel.panel.wide > button.tax');
    expect(anchor.kind).toBe('dom');
  });

  it('degrades to an empty chain when a fiber getter throws — a React internal moved', () => {
    const { button } = makeTree();
    (button as unknown as Record<string, unknown>).__reactFiber$abc123 = {
      type: 'button',
      get return(): never { throw new Error('internal shape changed'); },
    };

    const anchor = resolveDomAnchor(button);
    expect(anchor.componentChain).toEqual([]);
    expect(anchor.cssChain).toContain('button.tax');
    expect(anchor.text).toBe('Set tax');
  });
});

describe('resolveDomAnchor — the text', () => {
  it('trims the element text', () => {
    const { button } = makeTree();
    expect(resolveDomAnchor(button).text).toBe('Set tax');
  });

  it('caps the text at 500 chars', () => {
    const { button } = makeTree();
    button.textContent = 'x'.repeat(900);
    expect(resolveDomAnchor(button).text).toHaveLength(500);
  });

  it('accepts an element with no text', () => {
    document.body.innerHTML = '<i></i>';
    expect(resolveDomAnchor(document.querySelector('i') as Element).text).toBe('');
  });
});

describe('resolveDomAnchorWithKey', () => {
  it('returns the anchor with the key the schema would compute', () => {
    const { button } = makeTree();
    attachFiber(button, [{ host: 'button' }, 'TaxRow']);

    const { anchor, anchorKey } = resolveDomAnchorWithKey(button);
    expect(anchorKey).toBe(computeAnchorKey(anchor));
    expect(anchorKey).toMatch(/^[0-9a-f]+$/);
  });
});
