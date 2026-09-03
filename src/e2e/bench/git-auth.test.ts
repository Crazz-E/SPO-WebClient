/**
 * src/e2e/bench/git-auth.ts — making the bench's fetches authenticated.
 *
 * The defect this covers was not a wrong line of code. It was a control that was
 * configured, correct, and never on the path: `credential.https://github.com.helper` is
 * set and works, and git never consults it for this repo because the repo is public and
 * git only asks after a `401`. Every bench fetch was therefore anonymous, and on
 * 2026-09-03 GitHub's anonymous-traffic throttle refused seven merge-queue fetches and
 * the nightly in a five-minute window.
 *
 * So what is pinned here is not "the header is built correctly" but the three properties
 * that make the fix trustworthy: the token reaches the child, it reaches it through the
 * environment rather than argv or a file, and a missing token degrades to today's
 * behaviour instead of failing the job.
 */

import { GITHUB_ORIGIN, gitAuthEnv, githubAuthEnv, readGhToken } from './git-auth';

const TOKEN = 'gho_TESTTOKEN';

describe('gitAuthEnv', () => {
  it('sets an Authorization header for github.com', () => {
    const env = gitAuthEnv(TOKEN, {});
    expect(env.GIT_CONFIG_KEY_0).toBe(`http.${GITHUB_ORIGIN}.extraheader`);
    expect(env.GIT_CONFIG_VALUE_0).toMatch(/^Authorization: Basic /);
    expect(env.GIT_CONFIG_COUNT).toBe('1');
  });

  it('carries the token, so the header actually authenticates', () => {
    const value = gitAuthEnv(TOKEN, {}).GIT_CONFIG_VALUE_0;
    const decoded = Buffer.from(value.replace('Authorization: Basic ', ''), 'base64').toString();
    expect(decoded).toBe(`x-access-token:${TOKEN}`);
  });

  it('puts the token in no key but the header value — nothing that could be logged as a name', () => {
    const env = gitAuthEnv(TOKEN, {});
    expect(Object.keys(env).join(' ')).not.toContain(TOKEN);
    expect(env.GIT_CONFIG_KEY_0).not.toContain(TOKEN);
  });

  it('returns nothing at all without a token, so the fetch stays exactly as it is today', () => {
    expect(gitAuthEnv(null, {})).toEqual({});
    expect(gitAuthEnv('', {})).toEqual({});
  });

  it('appends to git config already in the environment instead of clobbering it', () => {
    const env = gitAuthEnv(TOKEN, {
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'user.name',
      GIT_CONFIG_KEY_1: 'user.email',
    });
    expect(env.GIT_CONFIG_KEY_2).toBe(`http.${GITHUB_ORIGIN}.extraheader`);
    expect(env.GIT_CONFIG_COUNT).toBe('3');
    expect(env.GIT_CONFIG_KEY_0).toBeUndefined();
    expect(env.GIT_CONFIG_KEY_1).toBeUndefined();
  });

  it.each([['nonsense'], ['-1'], ['1.5'], ['']])(
    'treats an unusable GIT_CONFIG_COUNT of %p as none, rather than writing past it',
    count => {
      expect(gitAuthEnv(TOKEN, { GIT_CONFIG_COUNT: count }).GIT_CONFIG_COUNT).toBe('1');
    },
  );
});

describe('readGhToken', () => {
  it('reads the token gh holds', () => {
    const exec = jest.fn().mockReturnValue(`${TOKEN}\n`);
    expect(readGhToken(exec as never)).toBe(TOKEN);
    expect(exec).toHaveBeenCalledWith('gh', ['auth', 'token'], expect.anything());
  });

  it('is null when gh is absent, logged out, or throws', () => {
    const exec = jest.fn(() => {
      throw new Error('gh: not found');
    });
    expect(readGhToken(exec as never)).toBeNull();
  });

  it('is null on empty output rather than an empty-string token', () => {
    expect(readGhToken(jest.fn().mockReturnValue('  \n') as never)).toBeNull();
  });

  it('bounds the call, so a wedged gh cannot hang the worker', () => {
    const exec = jest.fn().mockReturnValue(TOKEN);
    readGhToken(exec as never);
    expect(exec.mock.calls[0][2]).toMatchObject({ timeout: expect.any(Number) });
  });
});

describe('githubAuthEnv', () => {
  it('produces the environment when there is a token', () => {
    const logs: string[] = [];
    const env = githubAuthEnv(l => logs.push(l), () => TOKEN, {});
    expect(env.GIT_CONFIG_COUNT).toBe('1');
    expect(logs).toEqual([]);
  });

  it('warns when there is none — the anonymous fetch is the failure, it must not be silent', () => {
    const logs: string[] = [];
    const env = githubAuthEnv(l => logs.push(l), () => null, {});
    expect(env).toEqual({});
    expect(logs.join('\n')).toMatch(/unauthenticated/);
  });

  it('never puts the token in the log', () => {
    const logs: string[] = [];
    githubAuthEnv(l => logs.push(l), () => TOKEN, {});
    expect(logs.join('\n')).not.toContain(TOKEN);
  });
});
