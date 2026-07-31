// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import tseslint from 'typescript-eslint';

/**
 * Quy tắc kiến trúc được ép bằng lint, không phải bằng niềm tin:
 *
 *   http  ->  domain  ->  data
 *
 * Mũi tên chỉ đi vào trong. `pnpm lint` sẽ fail nếu ai đó vẽ ngược.
 */
const inwardOnly = (layer, forbidden) => ({
  files: [`src/${layer}/**/*.ts`],
  ignores: ['**/*.spec.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: forbidden.map(({ from, why }) => ({
          group: [`@/${from}/*`, `**/${from}/*`],
          message: why,
        })),
      },
    ],
  },
});

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  inwardOnly('data', [
    { from: 'domain', why: 'data là tầng trong cùng — không được biết tới domain.' },
    { from: 'http', why: 'data không được biết tới HTTP.' },
  ]),
  inwardOnly('domain', [
    { from: 'http', why: 'domain không được biết tới HTTP — trả về kiểu nghiệp vụ, không phải response.' },
  ]),
  inwardOnly('http', [
    { from: 'data', why: 'http phải đi qua domain, không được gọi thẳng repository.' },
  ]),
);
