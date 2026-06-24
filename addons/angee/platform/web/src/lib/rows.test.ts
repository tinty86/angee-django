import { describe, expect, test } from "vitest";

import type { PlatformAddonData, PlatformModelData } from "../documents";
import { addonRows, fieldRows, modelRows } from "./rows";

const iamModel: PlatformModelData = {
  label: "iam.user",
  app_label: "iam",
  model_name: "User",
  verbose_name: "user",
  db_table: "iam_user",
  addon_id: "angee.iam",
  addon_label: "iam",
  resource_type: "auth/user",
  field_count: 2,
  relation_count: 1,
  depends_on: ["iam.user"],
  fields: [
    { name: "id", attname: "id", kind: "BigAutoField", is_relation: false, relation_target: null, addon: "iam" },
    { name: "created_by", attname: "created_by_id", kind: "ForeignKey", is_relation: true, relation_target: "iam.user", addon: "iam" },
  ],
};

describe("platform row projectors", () => {
  test("addonRows keeps known-addon deps and indexes reverse deps", () => {
    const addon = (id: string, deps: string[]): PlatformAddonData => ({
      id,
      label: id.split(".").pop() ?? id,
      namespace: "angee",
      kind: "required",
      model_count: 0,
      field_count: 0,
      resource_count: 0,
      depends_on: deps,
      model_labels: [],
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
    const [row] = modelRows([{ ...iamModel, resource_type: null }]);
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
