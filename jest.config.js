/** @type {import('jest').Config} */

/** Vite define replacements — must be mirrored here for Jest */
const sharedGlobals = {
  __APP_VERSION__: '"0.1.0"',
  __BUILD_DATE__: '"test"',
};

/** Shared module resolution used by both projects */
const sharedModuleConfig = {
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '\\.module\\.css$': '<rootDir>/src/__mocks__/css-module.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@server/(.*)$': '<rootDir>/src/server/$1',
    '^@client/(.*)$': '<rootDir>/src/client/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        lib: ['ES2021', 'DOM'],
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
        types: ['jest', 'node']
      },
      isolatedModules: false
    }]
  },
};

module.exports = {
  projects: [
    // Project 1: Existing node-env tests (.test.ts)
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/*.test.ts', '**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/src/server/__tests__/setup/jest-setup.ts'],
      globals: sharedGlobals,
      ...sharedModuleConfig,
    },
    // Project 2: Component smoke tests (.test.tsx) — jsdom environment
    {
      displayName: 'component',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/src'],
      testMatch: ['**/*.test.tsx'],
      setupFilesAfterEnv: [
        '<rootDir>/src/server/__tests__/setup/jest-setup.ts',
        '<rootDir>/src/client/__tests__/setup/component-setup.ts',
      ],
      globals: sharedGlobals,
      ...sharedModuleConfig,
    },
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/__fixtures__/**',
    '!src/**/__mocks__/**',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      lines: 35,
      functions: 35,
      branches: 25,
      statements: 35
    },
    // Per-directory thresholds — ratchet up as coverage improves
    './src/shared/': {
      lines: 50,
      functions: 60,
      branches: 35,
      statements: 50
    },
    './src/shared/building-details/': {
      lines: 90,
      functions: 100,
      branches: 80,
      statements: 90
    },
    './src/shared/types/': {
      lines: 90,
      functions: 70,
      branches: 80,
      statements: 90
    },
  },
  testTimeout: 10000,
  verbose: true
};
