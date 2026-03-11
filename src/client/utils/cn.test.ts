import { cn } from './cn';

describe('cn', () => {
  it('joins multiple class names', () => {
    expect(cn('foo', 'bar', 'baz')).toBe('foo bar baz');
  });

  it('filters out false values', () => {
    expect(cn('base', false && 'active', 'other')).toBe('base other');
  });

  it('filters out null and undefined', () => {
    expect(cn('base', null, undefined, 'end')).toBe('base end');
  });

  it('filters out 0', () => {
    expect(cn('base', 0 && 'zero', 'end')).toBe('base end');
  });

  it('returns empty string when all falsy', () => {
    expect(cn(false, null, undefined)).toBe('');
  });

  it('handles single class', () => {
    expect(cn('only')).toBe('only');
  });

  it('handles no arguments', () => {
    expect(cn()).toBe('');
  });
});
