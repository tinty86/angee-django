import { describe, expect, test } from "vitest";

import type { PlatformAddonData, PlatformModelData } from "../documents";
import { addonRows, fieldRows, modelRows } from "./rows";

const iamModel: PlatformModelData = {
  label: "iam.user",
  appLabel: "iam",
  modelName: "User",
  verboseName: "user",
  dbTable: "iam_user",
  addonId: "angee.iam",
  addonLabel: "iam",
  resourceType: "auth/user",
  fieldCount: 2,
  relationCount: 1,
  dependsOn: ["iam.user"],
  fields: [
    { name: "id", attname: "id", kind: "BigAutoField", isRelation: false, relationTarget: null, addon: "iam" },
    { name: "created_by", attname: "created_by_id", kind: "ForeignKey", isRelation: true, relationTarget: "iam.user", addon: "iam" },
  ],
};

describe("platform row projectors", () => {
  test("addonRows keeps known-addon deps and indexes reverse deps", () => {
    const addon = (id: string, deps: readonly string[]): PlatformAddonData => ({
      id,
      label: id.split(".").pop() ?? id,
      namespace: "angee",
      kind: "required",
      modelCount: 0,
      fieldCount: 0,
      resourceCount: 0,
      dependsOn: deps,
      modelLabels: [],
    });
    const rows = addonRows([
      addon("angee.iam", ["angee.resources", "angee.graphql", "django.contrib.auth"]),
      addon("angee.graphql", []),
      addon("angee.resources", []),
    ]);
    const iam = rows.find((row) => row.id === "angee.iam");
    // Only addon-to-addon deps survive (the django app has no detail page); sorted.
    expect(iam?.dependsOnList).toEqual(["angee.graphql", "angee.resources"]);
    expect(iam?.dependsOn).toBe("angee.graphql, angee.resources");
    // resources is depended on by iam (the reverse index).
    expect(rows.find((row) => row.id === "angee.resources")?.dependedByList).toEqual(["angee.iam"]);
  });

  test("modelRows blanks a missing resource type", () => {
    const [row] = modelRows([{ ...iamModel, resourceType: null }]);
    expect(row?.id).toBe("iam.user");
    expect(row?.resourceType).toBe("");
  });

  test("fieldRows flattens fields with composite ids", () => {
    const rows = fieldRows([iamModel]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("iam.user.id");
    expect(rows[1]?.relationTarget).toBe("iam.user");
  });
});
