import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig(
  globalIgnores([
    'dist/**',
    'test-results/**',
    'source-assets/**',
    'dist-production/**',
    'cdk.out/**',
  ]),
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'build/**/*.ts', 'infra/**/*.ts', 'vite.config.ts'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['src/**/*.ts', 'tests/fixtures/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.mjs', 'build/**/*.ts', 'infra/**/*.ts', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // This fixture is compiled inside the drawing game's closure, not standalone.
    files: ['tests/fixtures/hikari-hook.js'],
    languageOptions: {
      globals: Object.fromEntries(
        ['sound', 'playSample']
          .map((name) => [name, 'writable'])
          .concat(
            [
              'lastSound',
              'sparkleGain',
              'nextSampleAt',
              'points',
              'particles',
              'flowers',
              'fingers',
              'voices',
              'sampleBuffer',
              'sampleStatus',
              'raf',
              'muted',
              'audio',
              'width',
              'height',
              'chargeAt',
              'master',
              'compressor',
              'canvas',
              'reset',
              'flowerRadius',
              'sceneScale',
              'wake',
              'push',
              'LIMIT',
              'FLOWERS',
              'draw',
              'ctx',
            ].map((name) => [name, 'readonly']),
          ),
      ),
    },
  },
  { rules: { 'no-empty': ['error', { allowEmptyCatch: true }] } },
  prettier,
);
