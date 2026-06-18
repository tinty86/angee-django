import { defineConfig } from "vitest/config";

import { gqlAlias } from "../../../../vitest.shared";

export default defineConfig({
  // `@angee/gql/*` resolves via tsconfig `paths` for tsc; vitest needs it as an
  // explicit alias (shared with the other addon test configs).
  resolve: { alias: gqlAlias },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    server: {
      deps: { inline: ["@angee/logo-react"] },
    },
  },
});
