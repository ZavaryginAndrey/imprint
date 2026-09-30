import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * Copied domain files already over the limit. They are split in W3, not in the W1 copy step —
 * the copy must stay byte-identical to web/. Add a path here only with that justification.
 */
const LEGACY_LARGE = [];

export default defineConfig([
  { ignores: ["**/dist/**", "**/.wrangler/**", "**/node_modules/**"] },
  { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tseslint.parser } },
  { files: ["apps/**/*.{ts,tsx}"], extends: [tseslint.configs.recommended] },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/fixtures.ts", ...LEGACY_LARGE],
    rules: { "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }] },
  },
  {
    // P1: screens and components render the store's view; rules, dates and time live in the domain via store/.
    files: ["apps/web/src/screens/**/*.{ts,tsx}", "apps/web/src/components/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@imprint/domain", allowTypeImports: true, message: "P1: rules live in the domain — go through store/." }],
          patterns: [{ group: ["date-fns*", "dayjs*", "moment*", "luxon*"], message: "P1: no date libraries in the UI." }],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "Date", message: "P1: time comes from store/ (domain time/)." },
        { name: "Intl", message: "P1: formatting lives in store/ and i18n/." },
      ],
    },
  },
]);
