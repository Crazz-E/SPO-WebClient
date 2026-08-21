import {
  GOVERNED_TOWN,
  LIMITS,
  PRESIDENT_MEMBERS,
  PRIMARY_ACCOUNT,
  SECONDARY_ACCOUNT,
  WORLD_NAME,
  ZONE_PATH,
} from './config';

describe('locked configuration', () => {
  it('keeps the accounts as approved — changing one needs developer sign-off', () => {
    expect(PRIMARY_ACCOUNT).toMatchObject({ username: 'SPO_test3', password: 'test3' });
    expect(SECONDARY_ACCOUNT).toMatchObject({ username: 'SPO_test4', password: 'test4' });
  });

  it('targets planitia under Free Space, not BETA', () => {
    expect(WORLD_NAME).toBe('planitia');
    expect(ZONE_PATH).toBe('Root/Areas/America/Worlds');
  });

  it('names the town inside the blast radius', () => {
    expect(GOVERNED_TOWN).toBe('Helartia');
  });

  it('lists the six TPresidentialHall members the gate blocks on', () => {
    expect([...PRESIDENT_MEMBERS].sort()).toEqual([
      'RDOBanMinister',
      'RDOSetMinSalaryValue',
      'RDOSetMinistryBudget',
      'RDOSetTownTaxes',
      'RDOSitMayor',
      'RDOSitMinister',
    ]);
  });

  it('caps the retry loop at three attempts', () => {
    expect(LIMITS.maxAttempts).toBe(3);
  });

  it('keeps the live-run limits positive so the limiter can never be disabled by accident', () => {
    expect(LIMITS.minIntervalMinutes).toBeGreaterThan(0);
    expect(LIMITS.maxRunsPerDay).toBeGreaterThan(0);
    expect(LIMITS.gateMaxAgeMinutes).toBeGreaterThan(0);
  });
});
