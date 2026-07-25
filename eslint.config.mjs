import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default defineConfig([
  globalIgnores([".next/**", ".local-data/**", "node_modules/**", "coverage/**", "playwright-report/**", "next-env.d.ts"]),
  ...compat.extends("next/core-web-vitals", "next/typescript")
]);
