import { defineAngeeWebVitestConfig } from "../../../vitest.shared";

export default defineAngeeWebVitestConfig({
  test: {
    extraInclude: ["*.test.ts"],
  },
});
