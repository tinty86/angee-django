import { defineConfig } from "vitest/config";
import { gqlAlias } from "../../../vitest.shared";

export default defineConfig({
  resolve: { alias: gqlAlias },
  test: {
    environment: "node",
    include: ["*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    server: {
      deps: { inline: ["@angee/logo-react"] },
    },
  },
});
