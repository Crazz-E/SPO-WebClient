/**
 * NobilityBadge component tests.
 *
 * Verifies rendering of tier icons, modifier dots, and tooltip content.
 */

import { describe, it, expect } from '@jest/globals';
import { renderWithProviders } from '../../../__tests__/setup/render-helpers';
import { NobilityBadge } from '../NobilityBadge';
import { CHAT_MODIFIER_FLAGS } from '../../../../shared/types/domain-types';

describe('NobilityBadge', () => {
  // ── Null rendering ──────────────────────────────────────────────────────

  it('renders nothing for Commoner with no modifiers', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Commoner" modifiers={0} />
    );
    expect(container.innerHTML).toBe('');
  });

  // ── Tier icons ──────────────────────────────────────────────────────────

  it('renders Crown icon for Duke', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Duke" modifiers={0} />
    );
    const badge = container.querySelector('[class*="badge"]');
    expect(badge).toBeTruthy();
    // lucide-react Crown renders an SVG
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders Crown icon for Sr. Duke', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Sr. Duke" modifiers={0} />
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders Shield icon for Marquess', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Marquess" modifiers={0} />
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('[class*="tierSilver"]')).toBeTruthy();
  });

  it('renders Shield icon for Earl', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Earl" modifiers={0} />
    );
    expect(container.querySelector('[class*="tierSilver"]')).toBeTruthy();
  });

  it('renders Award icon for Baron', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Baron" modifiers={0} />
    );
    expect(container.querySelector('[class*="tierBronze"]')).toBeTruthy();
  });

  it('renders Award icon for Viscount', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Viscount" modifiers={0} />
    );
    expect(container.querySelector('[class*="tierBronze"]')).toBeTruthy();
  });

  // ── Tier icon colors ────────────────────────────────────────────────────

  it('applies gold color class for Duke tiers', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Duke" modifiers={0} />
    );
    expect(container.querySelector('[class*="tierGold"]')).toBeTruthy();
  });

  // ── Modifier dots ─────────────────────────────────────────────────────

  it('renders Veteran dot for VETERAN modifier', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Commoner" modifiers={CHAT_MODIFIER_FLAGS.VETERAN} />
    );
    const badge = container.querySelector('[class*="badge"]');
    expect(badge).toBeTruthy();
    expect(container.querySelector('[class*="modVeteran"]')).toBeTruthy();
  });

  it('renders GameMaster dot for GM modifier', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Commoner" modifiers={CHAT_MODIFIER_FLAGS.GAME_MASTER} />
    );
    expect(container.querySelector('[class*="modGameMaster"]')).toBeTruthy();
  });

  it('renders Developer dot for DEV modifier', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Commoner" modifiers={CHAT_MODIFIER_FLAGS.DEVELOPER} />
    );
    expect(container.querySelector('[class*="modDeveloper"]')).toBeTruthy();
  });

  it('renders multiple modifier dots', () => {
    const mods = CHAT_MODIFIER_FLAGS.DEVELOPER | CHAT_MODIFIER_FLAGS.VETERAN;
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Commoner" modifiers={mods} />
    );
    expect(container.querySelector('[class*="modDeveloper"]')).toBeTruthy();
    expect(container.querySelector('[class*="modVeteran"]')).toBeTruthy();
  });

  // ── Combined tier + modifiers ─────────────────────────────────────────

  it('renders tier icon and modifier dots together', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Duke" modifiers={CHAT_MODIFIER_FLAGS.VETERAN} />
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('[class*="modVeteran"]')).toBeTruthy();
  });

  // ── Tooltip ───────────────────────────────────────────────────────────

  it('shows tier name in tooltip', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Duke" modifiers={0} />
    );
    const badge = container.querySelector('[class*="badge"]');
    expect(badge?.getAttribute('title')).toBe('Duke');
  });

  it('shows tier + modifier names in tooltip', () => {
    const mods = CHAT_MODIFIER_FLAGS.VETERAN | CHAT_MODIFIER_FLAGS.GAME_MASTER;
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Earl" modifiers={mods} />
    );
    const title = container.querySelector('[class*="badge"]')?.getAttribute('title') ?? '';
    expect(title).toContain('Earl');
    expect(title).toContain('GM');
    expect(title).toContain('Veteran');
  });

  it('shows only modifier names for Commoner tooltip', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Commoner" modifiers={CHAT_MODIFIER_FLAGS.DEVELOPER} />
    );
    const title = container.querySelector('[class*="badge"]')?.getAttribute('title') ?? '';
    expect(title).toBe('Dev');
    expect(title).not.toContain('Commoner');
  });

  // ── Size prop ─────────────────────────────────────────────────────────

  it('renders smaller icons with sm size', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Duke" modifiers={0} size="sm" />
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('9');
  });

  it('renders larger icons with md size', () => {
    const { container } = renderWithProviders(
      <NobilityBadge nobilityTier="Duke" modifiers={0} size="md" />
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('12');
  });
});
