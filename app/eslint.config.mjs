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
  ]),
  {
    // The React Compiler lint plugin (newly pulled in by eslint-config-next
    // ≥16) flags well-formed code that predates the compiler: in-render
    // Date.now() reads and effect bodies that synchronously kick off async
    // work that internally calls setState. The compiler itself is opt-in,
    // so until we adopt it project-wide its lint rule is not the gate we
    // want to enforce.
    rules: {
      "react-compiler/react-compiler": "off",
    },
  },
]);

export default eslintConfig;
