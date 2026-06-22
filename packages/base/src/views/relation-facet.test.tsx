// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import {
  ModelMetadataProvider,
  type ResourceFacetOption,
  type SchemaFieldMetadata,
} from "@angee/sdk";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useRelationFacets } from "./relation-facet";

const sdkMocks = vi.hoisted(() => ({
  facets: vi.fn(),
}));

vi.mock("@angee/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@angee/sdk")>();
  return {
    ...actual,
    useGraphQLProviderAvailable: () => true,
    useResourceFacets: sdkMocks.facets,
  };
});

beforeEach(() => {
  sdkMocks.facets.mockReturnValue(resourceFacets({
    provider: facetOptions(),
    publisher: facetOptions("publisher"),
  }));
});

describe("useRelationFacets", () => {
  test("builds declared list facets in one model query", () => {
    const { result } = renderHook(
      () =>
        useRelationFacets("agents.InferenceModel", [
          { field: "provider", label: "Provider" },
        ]),
      { wrapper: Metadata },
    );

    expect(sdkMocks.facets).toHaveBeenCalledWith("agents.InferenceModel", {
      facets: [{
        id: "provider",
        groups: [
          { field: "PROVIDER", key: "providerId" },
          { field: "PROVIDER__NAME", key: "provider_Name" },
        ],
        valueKey: "providerId",
        labelKey: "provider_Name",
        groupOrder: [{ field: "provider__name", direction: "ASC" }],
        neutralizeFilterFields: ["provider"],
        pageSize: 200,
      }],
      enabled: true,
    });
    expect(result.current.filters).toEqual([
      {
        id: "provider:provider-anthropic",
        label: "Anthropic",
        chipLabel: "Anthropic",
        filter: { provider: { sqid: "provider-anthropic" } },
      },
      {
        id: "provider:provider-openai",
        label: "OpenAI",
        chipLabel: "OpenAI",
        filter: { provider: { sqid: "provider-openai" } },
      },
    ]);
    expect(result.current.filterFields).toEqual([]);
    expect(result.current.groupOptions).toEqual([{
      id: "provider.name",
      label: "Provider",
      group: {
        field: "provider.name",
        aggregateField: "provider",
        aggregateKey: "providerId",
      },
    }]);
  });

  test("passes active filters to declared facets for neutralized counts", () => {
    renderHook(
      () =>
        useRelationFacets(
          "agents.InferenceModel",
          [{ field: "provider", label: "Provider" }],
          {
            provider: { sqid: "provider-openai" },
            name: { iContains: "launch" },
          },
        ),
      { wrapper: Metadata },
    );

    expect(sdkMocks.facets).toHaveBeenCalledWith("agents.InferenceModel", {
      facets: [{
        id: "provider",
        groups: [
          { field: "PROVIDER", key: "providerId" },
          { field: "PROVIDER__NAME", key: "provider_Name" },
        ],
        valueKey: "providerId",
        labelKey: "provider_Name",
        groupOrder: [{ field: "provider__name", direction: "ASC" }],
        neutralizeFilterFields: ["provider"],
        pageSize: 200,
      }],
      filter: {
        provider: { sqid: "provider-openai" },
        name: { iContains: "launch" },
      },
      enabled: true,
    });
  });

  test("builds relation preset filters without exposing custom filter fields", () => {
    const { result } = renderHook(
      () =>
        useRelationFacets("agents.InferenceModel", [
          { field: "publisher" },
        ]),
      { wrapper: Metadata },
    );

    expect(result.current.filters[0]).toMatchObject({
      id: "publisher:provider-anthropic",
      filter: { publisher: { sqid: "provider-anthropic" } },
    });
    expect(result.current.filterFields).toEqual([]);
    expect(result.current.groupOptions).toEqual([{
      id: "publisher.name",
      label: "Publisher",
      group: {
        field: "publisher.name",
        aggregateField: "publisher",
        aggregateKey: "publisher",
      },
    }]);
  });

  test("stays inert when the field is not a listable relation", () => {
    const { result } = renderHook(
      () =>
        useRelationFacets("agents.InferenceModel", [
          { field: "name", filterField: "name" },
        ]),
      { wrapper: Metadata },
    );

    expect(sdkMocks.facets).toHaveBeenLastCalledWith("agents.InferenceModel", {
      facets: [],
      enabled: false,
    });
    expect(result.current).toEqual({
      filters: [],
      filterFields: [],
      groupOptions: [],
    });
  });
});

const METADATA: SchemaFieldMetadata = {
  types: {
    InferenceModelType: {
      typeName: "InferenceModelType",
      fields: {
        provider: {
          name: "provider",
          kind: "relation",
          relationTarget: "InferenceProviderType",
          relationFilter: {
            field: "provider",
            mode: "lookup",
            lookup: "sqid",
            aggregateKey: "providerId",
            labelKey: "provider_Name",
          },
        },
        publisher: {
          name: "publisher",
          kind: "relation",
          relationTarget: "InferenceProviderType",
          relationFilter: {
            field: "publisher",
            mode: "lookup",
            lookup: "sqid",
            aggregateKey: "publisher",
          },
        },
        name: { name: "name", kind: "scalar", scalar: "String" },
      },
    },
    InferenceProviderType: {
      typeName: "InferenceProviderType",
      recordRepresentation: "name",
      rootFields: { list: "inferenceProviders" },
      fields: {
        name: { name: "name", kind: "scalar", scalar: "String" },
      },
    },
  },
};

function Metadata({ children }: { children: ReactNode }): ReactNode {
  return (
    <ModelMetadataProvider metadata={METADATA}>
      {children}
    </ModelMetadataProvider>
  );
}

function facetOptions(filterField = "provider"): readonly ResourceFacetOption[] {
  return [
    {
      value: "provider-anthropic",
      label: "Anthropic",
      count: 1,
      key: { providerId: "provider-anthropic" },
      filter: { [filterField]: { sqid: "provider-anthropic" } },
    },
    {
      value: "provider-openai",
      label: "OpenAI",
      count: 1,
      key: { providerId: "provider-openai" },
      filter: { [filterField]: { sqid: "provider-openai" } },
    },
  ];
}

function resourceFacets(
  facets: Record<string, readonly ResourceFacetOption[]>,
) {
  return {
    facets: Object.fromEntries(
      Object.entries(facets).map(([id, options]) => [
        id,
        {
          count: options.reduce((total, option) => total + option.count, 0),
          totalCount: options.length,
          options,
        },
      ]),
    ),
    fetching: false,
    error: null,
    refetch: vi.fn(),
  };
}
