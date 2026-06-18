import type { CodegenConfig } from "@graphql-codegen/cli";

// Typed documents generated from the operator daemon's SDL. The daemon owns the
// schema; `OperatorDaemon.introspect_sdl()` refreshes `schema/operator.graphql`
// over the addon's existing authenticated daemon connection, and the console
// derives both schema and operation types from it rather than hand-maintaining
// them. Django console operations live in `documents.console.ts` and are typed
// by the composed project's console codegen; this daemon run scans only the
// daemon document file.
const config: CodegenConfig = {
  schema: "schema/operator.graphql",
  documents: "src/data/documents.daemon.ts",
  generates: {
    "src/__generated__/operator.ts": {
      plugins: ["typescript"],
      config: {
        scalars: { JSON: "unknown" },
        enumsAsTypes: true,
        useTypeImports: true,
        skipTypename: true,
        avoidOptionals: false,
      },
    },
    "src/__generated__/operator-gql/": {
      preset: "client",
      presetConfig: { fragmentMasking: false },
      config: {
        scalars: { JSON: "unknown" },
        enumsAsTypes: true,
        useTypeImports: true,
        skipTypename: true,
        avoidOptionals: false,
      },
    },
  },
};

export default config;
