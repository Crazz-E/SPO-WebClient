/**
 * The journal's DOM taps.
 *
 * They live in a `.tsx` file so Jest runs them under jsdom: `journal.test.ts` is a node
 * suite, where `window` and `document` do not exist and these branches return early.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { reportJournal } from './journal';

beforeEach(() => {
  reportJournal.disarm();
  reportJournal.reset();
  document.body.innerHTML = '';
});

afterEach(() => {
  reportJournal.disarm();
  reportJournal.reset();
});

describe('the click tap', () => {
  it('records the CSS chain and the trimmed text of what was pressed', () => {
    const button = document.createElement('button');
    button.className = 'tax';
    button.textContent = '  Set tax  ';
    document.body.appendChild(button);

    reportJournal.arm();
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(reportJournal.snapshot()).toEqual([
      expect.objectContaining({ t: 'click', target: 'html > body > button.tax', text: 'Set tax' }),
    ]);
  });

  it('omits the text key entirely for an element with none', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    reportJournal.arm();
    div.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    const entry = reportJournal.snapshot()[0];
    expect(entry.t).toBe('click');
    expect(entry).not.toHaveProperty('text');
  });

  it('caps a very long label', () => {
    const button = document.createElement('button');
    button.textContent = 'x'.repeat(600);
    document.body.appendChild(button);

    reportJournal.arm();
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect((reportJournal.snapshot()[0] as { text: string }).text).toHaveLength(200);
  });

  it('ignores a pointerdown whose target is not an element', () => {
    reportJournal.arm();
    document.dispatchEvent(new Event('pointerdown'));
    expect(reportJournal.snapshot()).toEqual([]);
  });

  it('stops recording clicks after disarm', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);

    reportJournal.arm();
    reportJournal.disarm();
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(reportJournal.snapshot()).toEqual([]);
  });
});

describe('the window error taps', () => {
  it('records an uncaught error', () => {
    reportJournal.arm();
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));

    expect(reportJournal.snapshot()).toEqual([
      expect.objectContaining({ t: 'console', level: 'error', message: 'uncaught: boom' }),
    ]);
  });

  it('records an unhandled rejection, whatever the reason is', () => {
    reportJournal.arm();
    const event = new Event('unhandledrejection') as Event & { reason?: unknown };
    event.reason = new Error('nope');
    window.dispatchEvent(event);

    expect(reportJournal.snapshot()).toEqual([
      expect.objectContaining({ t: 'console', level: 'error', message: 'unhandled rejection: Error: nope' }),
    ]);
  });

  it('removes both window listeners on disarm', () => {
    reportJournal.arm();
    reportJournal.disarm();
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));
    window.dispatchEvent(new Event('unhandledrejection'));

    expect(reportJournal.snapshot()).toEqual([]);
  });
});
