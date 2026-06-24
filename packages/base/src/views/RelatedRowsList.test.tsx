// @vitest-environment happy-dom

import {
  cleanup,
  render,
  screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi } from "vitest";
import {
  ModelMetadataProvider,
} from "@angee/resources";
import type {
  SchemaFieldMetadata,
} from "@angee/resources";

import { RelatedRowsList } from "./RelatedRowsList";
import { ResourceViewProvider } from "./resource-view-context";
import type { ListColumn } from "./ListInternals";
import type { StringIdRow } from "./resource-view-surface";

const sdkMocks = vi.hoisted(() => ({
  resourceLists: [] as RelatedRowsListCall[],
}));

interface RefineListOptions {
  resource?: string;
  dataProviderName?: string;
  pagination?: { currentPage?: number; pageSize?: number };
  filters?: unknown;
  sorters?: unknown;
  meta?: { fields?: unknown };
  queryOptions?: { enabled?: boolean };
}

interface RelatedRowsListCall {
  resource?: string;
  dataProviderName?: string;
  pageSize?: number;
  filters?: unknown;
  sorters?: unknown;
  fields?: unknown;
  enabled?: boolean;
}

vi.mock("@refinedev/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@refinedev/core")>();
  return {
    ...actual,
    useList: (options?: RefineListOptions) => {
      sdkMocks.resourceLists.push({
        resource: options?.resource,
        dataProviderName: options?.dataProviderName,
        pageSize: options?.pagination?.pageSize,
        filters: options?.filters,
        sorters: options?.sorters,
        fields: options?.meta?.fields,
        enabled: options?.queryOptions?.enabled !== false,
      });
      return {
        result: {
          data: [{
            id: "message-1",
            subject: "Hello",
            provider: { id: "provider-child", name: "Child" },
          }],
          total: 1,
        },
        query: {
          isFetching: false,
          error: null,
          refetch: () => undefined,
        },
      };
    },
  };
});

afterEach(() => cleanup());

beforeEach(() => {
  sdkMocks.resourceLists = [];
});

interface RelatedRow extends StringIdRow {
  subject?: string;
}

const columns: readonly ListColumn<RelatedRow>[] = [{ field: "subject" }];

describe("RelatedRowsList", () => {
  test("queries a related collection and renders it with local resource-view state", async () => {
    renderWithMetadata(
      <RelatedRowsList<RelatedRow>
        resource="messaging.Message"
        recordId="thread-1"
        fields={["subject"]}
        filterFor={(id) => ({ thread: { sqid: id } })}
        order={{ sentAt: "ASC" }}
        pageSize={25}
        columns={columns}
      />,
    );

    expect(await screen.findByText("Hello")).toBeTruthy();
    expect(sdkMocks.resourceLists).toEqual([
      {
        resource: "messages",
        dataProviderName: "console",
        filters: [{ field: "thread", operator: "eq", value: "thread-1" }],
        sorters: [{ field: "sentAt", order: "asc" }],
        fields: ["id", "subject"],
        pageSize: 25,
        enabled: true,
      },
    ]);
  });

  test("ignores ambient resource-view filters in record panels", async () => {
    renderWithMetadata(
      <ResourceViewProvider
        scope="local"
        initialState={{ filter: { provider: { sqid: "provider-parent" } } }}
      >
        <RelatedRowsList<RelatedRow>
          resource="messaging.Message"
          recordId="thread-1"
          fields={["id", "subject"]}
          filterFor={(id) => ({ thread: { sqid: id } })}
          columns={columns}
        />
      </ResourceViewProvider>,
    );

    expect(await screen.findByText("Hello")).toBeTruthy();
  });
});

const TEST_METADATA: SchemaFieldMetadata = {
  types: {
    MessageType: {
      typeName: "MessageType",
      fields: {},
      rootFields: {
        list: "messages",
        aggregate: "messageAggregate",
      },
      resource: {
        schemaName: "console",
        modelLabel: "messaging.Message",
        appLabel: "messaging",
        modelName: "Message",
        publicIdField: "id",
        roots: { list: "messages", aggregate: "messageAggregate" },
        typeNames: {
          node: "MessageType",
          filter: "MessageFilter",
          order: "MessageOrder",
          aggregate: "MessageAggregate",
        },
        capabilities: ["list", "aggregate"],
        filterFields: ["thread"],
        orderFields: ["sentAt"],
        aggregateFields: ["id"],
        groupByFields: [],
        relationAxes: [],
      },
    },
  },
};

function renderWithMetadata(children: ReactElement): ReturnType<typeof render> {
  return render(
    <ModelMetadataProvider metadata={TEST_METADATA}>
      {children}
    </ModelMetadataProvider>,
  );
}
