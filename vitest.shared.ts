import { fileURLToPath } from "node:url";

// The `@angee/gql/<schema>` alias for test runs. Vitest does not read tsconfig
// `paths`, so addon test suites that load a module importing `@angee/gql/<schema>`
// need this alias explicitly.
//
// DEV WIRING (framework repo only): points at the example project's generated
// typed-document modules — the canonical gql the repo's own tests run against.
// One fact mirrored across three resolvers (the `paths` in `tsconfig.base.json`
// and the Vite `resolve.alias` in the example app) until the composer emits the
// per-project alias for rendered downstream projects. Absolute (resolved from
// this file) so every consumer, at any depth, resolves the same target.
export const gqlAlias = [
  {
    find: /^@angee\/gql\//,
    replacement: fileURLToPath(
      new URL("./examples/notes-angee/runtime/gql/", import.meta.url),
    ),
  },
];
