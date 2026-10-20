import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

// Ports and adapters (docs/adr/0001-architecture.md): src/core holds the logic
// and must not reach the outside world directly. It talks to it only through
// the interfaces in src/core/ports.ts, which src/adapters implements.
const coreBoundary = {
  files: ["src/core/**/*.ts"],
  ignores: ["src/core/**/*.test.ts"], // tests may wire in fakes from src/adapters/memory
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@azure/*", "openai", "openai/*", "@anthropic-ai/*"],
            message:
              "src/core must not use cloud SDKs. Define a port in src/core/ports.ts and implement it in src/adapters.",
          },
          {
            group: ["**/adapters/**", "**/adapters"],
            message:
              "src/core must not import adapters. Depend on a port; src/composition.ts wires in the adapter.",
          },
          {
            group: ["node:fs", "node:fs/*", "fs", "fs/*", "node:child_process"],
            message:
              "src/core must not touch the file system or processes. Do I/O in an adapter.",
          },
        ],
      },
    ],
    "no-restricted-globals": [
      "error",
      {
        name: "fetch",
        message: "src/core must not make network calls. Use a port.",
      },
      {
        name: "process",
        message:
          "src/core must not read the environment. Pass settings in from src/config.ts.",
      },
    ],
  },
};

export default [
  { ignores: ["node_modules/", "data/", "dist/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  coreBoundary,
  prettier,
];
