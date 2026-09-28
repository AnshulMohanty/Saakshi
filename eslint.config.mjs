import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design exports and their generated outputs (third-party bundles, screenshots).
    "design/unpacked/**",
    "design/extracted/**",
    "design/reference/**",
    "design/actual/**",
    "design/parity/**",
    "video/**",
    "brag-output/**",
  ]),
]);

export default eslintConfig;
