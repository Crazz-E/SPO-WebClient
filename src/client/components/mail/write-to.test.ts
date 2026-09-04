import { describe, it, expect, beforeEach } from '@jest/globals';
import { useMailStore } from '../../store/mail-store';
import { useUiStore } from '../../store/ui-store';
import { tycoonAddress, mayorAddress, writeTo } from './write-to';

describe('write-to', () => {
  beforeEach(() => {
    useMailStore.setState({
      currentView: 'list',
      composeTo: '',
      composeSubject: 'x',
      composeBody: 'y',
      composeDraftId: 'd',
    });
    useUiStore.getState().clearSurfaces();
  });

  it('leaves composeTo set and the mail panel open in compose', () => {
    writeTo('SPO_test3@Shamba.net');

    expect(useMailStore.getState().composeTo).toBe('SPO_test3@Shamba.net');
    expect(useMailStore.getState().currentView).toBe('compose');
    expect(useMailStore.getState().composeSubject).toBe('');
    expect(useMailStore.getState().composeDraftId).toBeNull();
    expect(useUiStore.getState().rightPanel).toBe('mail');
    const stack = useUiStore.getState().stack;
    expect(stack[stack.length - 1].kind).toBe('mail');
  });

  it('pushes the mail surface rather than replacing what is underneath', () => {
    useUiStore.getState().setRootSurface({ kind: 'search' });
    writeTo('SPO_test3@Shamba.net');

    expect(useUiStore.getState().stack.map((s) => s.kind)).toEqual(['search', 'mail']);
  });

  it('builds a tycoon address as <Name>@<World>.net', () => {
    expect(tycoonAddress('SPO_test3', 'Shamba')).toBe('SPO_test3@Shamba.net');
  });

  it('builds a mayor address as mayor@<Town>.gov', () => {
    expect(mayorAddress('Helartia')).toBe('mayor@Helartia.gov');
  });

  it('never produces a company/CEO .com address', () => {
    expect(tycoonAddress('SPO_test3', 'Shamba')).not.toContain('.com');
    expect(mayorAddress('Helartia')).not.toContain('.com');
  });
});
