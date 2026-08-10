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
// `src/server/**/<layer>/**` — khớp tầng đó trong MỌI feature module
// (src/server/modules/health/http, .../products/http, ...), không chỉ ở cấp gốc.
const inwardOnly = (layer, forbidden) => ({
  files: [`src/server/**/${layer}/**/*.ts`],
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

  // Tầng data nằm ở `src/server/database/` (hạ tầng dùng chung) và
  // `src/server/*/data/` (repository riêng của từng feature).
  {
    files: ['src/server/database/**/*.ts', 'src/server/**/data/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/domain/*', '**/http/*'],
              message: 'data là tầng trong cùng — không được biết tới domain hay HTTP.',
            },
          ],
        },
      ],
    },
  },
  inwardOnly('domain', [
    { from: 'http', why: 'domain không được biết tới HTTP — trả về kiểu nghiệp vụ, không phải response.' },
  ]),
  // `database` phải có mặt ở đây cùng với `data`: repository dùng chung nằm ở
  // `src/server/database/`, không khớp glob `**/data/*` — thiếu nó thì controller gọi
  // thẳng DbRepository mà lint vẫn im.
  inwardOnly('http', [
    { from: 'data', why: 'http phải đi qua domain, không được gọi thẳng repository.' },
    { from: 'database', why: 'http phải đi qua domain, không được gọi thẳng DbRepository.' },
  ]),
);
