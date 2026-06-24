import * as React from "react";
import {
  crudFiltersFromFilterRecord,
  hasuraWhereFromCrudFilters,
} from "@angee/refine";
import {
  useAngeeAggregate,
} from "@angee/data";
import {
  useModelMetadata,
} from "@angee/resources";
import type {
  Row,
} from "@angee/resources";

import type { PagerState } from "../ui/pager";
import { BoardView } from "./BoardView";
import {
  ResourceViewProvider,
  useResourceView,
  useResourceViewMaybe,
  type ResourceViewContextValue,
} from "./resource-view-context";
import {
  RESOURCE_VIEW_KINDS,
  Filter,
  resourceViewGroupsEqual,
  type ResourceViewDefaultGroups,
  type ResourceViewGroup,
  type ResourceViewKind,
} from "./resource-view-model";
import { DeletePreviewDialog } from "./DeletePreviewDialog";
import { useResourceViewSurface } from "./resource-view-surface";
import {
  GroupedListBody,
} from "./GroupedList";
import {
  groupPagerStatesEqual,
  type GroupPagerState,
} from "./grouped-list-utils";
import {
  FlatListBody,
  resourceViewGroupToAggregateDimension,
  groupMeasuresFromColumns,
  hasuraMeasuresFromGroupMeasures,
  type FlatListBodyProps,
  type GroupMeasure,
} from "./ListInternals";
import { ResourceListFrame } from "./ResourceListFrame";
import type { ListViewProps } from "./list-view-types";
import {
  activeFilterIdsFor,
  addCustomFilter as addCustomFilterToFilter,
  buildFilterFields,
  buildFilterOptions,
  buildGroupOptions,
  createLabelForResource,
  customFilterChipsFor,
  mergeFilterFields,
  mergeFilterOptions,
  mergeGroupOptions,
  nextFacetFilter,
  nextTextFilter,
  resolveResourceViewGroup,
  removeCustomFilter,
  resolveTextFilterField,
  textFilterValue,
  validResourceViewGroupStack,
} from "./list-view-utils";
import { columnsWithMetadataDefaults } from "./model-metadata-defaults";
import type { ColumnDescriptor } from "./page";
import { useRelationFacets } from "./relation-facet";
import { useScalarFacets } from "./scalar-facet";
import { useBulkDelete } from "./useBulkDelete";

export type { ResourceListSnapshot } from "./resource-view-surface";
export type {
  ColumnAlign,
  ListColumn,
} from "./ListInternals";
export type {
  ListEmptyAction,
  ListEmptyContent,
  ListEmptyState,
  ListViewProps,
} from "./list-view-types";

const EMPTY_GROUP_STACK = [] as const;

export function ListView<TRow extends Row = Row>(
  props: ListViewProps<TRow>,
): React.ReactElement {
  return <ListViewFrame {...props} />;
}

function ListViewFrame<TRow extends Row = Row>(
  props: ListViewProps<TRow>,
): React.ReactElement {
  const resourceView = useResourceViewMaybe();
  const initialState = React.useMemo(
    () => ({
      pageSize: props.pageSize,
      view: props.defaultView,
    }),
    [props.defaultView, props.pageSize],
  );
  if (resourceView) return <ListViewBody {...props} resourceView={resourceView} />;
  return (
    <ResourceViewProvider initialState={initialState} resource={props.resource}>
      <ListViewBound {...props} />
    </ResourceViewProvider>
  );
}

function ListViewBound<TRow extends Row = Row>(
  props: ListViewProps<TRow>,
): React.ReactElement {
  return <ListViewBody {...props} resourceView={useResourceView()} />;
}

function ListViewBody<TRow extends Row = Row>({
  resource,
  columns,
  fields,
  filter,
  filters: explicitFilters,
  facets,
  filterFields: explicitFilterFields,
  groupOptions: explicitGroupOptions,
  order,
  pageSize,
  defaultGroup,
  defaultGroups,
  onCreate,
  createLabel,
  onRowClick,
  onListStateChange,
  rowHref,
  toolbarActions,
  cardActions,
  emptyMessage = "No records.",
  emptyState,
  className,
  resourceView,
}: ListViewProps<TRow> & {
  resourceView: ResourceViewContextValue;
}): React.ReactElement {
  const emptyContent = emptyState ?? emptyMessage;
  const modelMetadata = useModelMetadata(resource);
  const resolvedColumns = React.useMemo(
    () => columnsWithMetadataDefaults(columns, modelMetadata),
    [columns, modelMetadata],
  );
  const mergedFilter = React.useMemo(
    () => Filter.combineOptional(filter, resourceView.state.filter),
    [resourceView.state.filter, filter],
  );
  const declaredFacets = useRelationFacets(resource, facets, mergedFilter);
  const scalarFacets = useScalarFacets(
    resource,
    resolvedColumns,
    modelMetadata,
    mergedFilter,
  );
  const rawActiveDefaultGroup = defaultGroupForView(
    defaultGroup,
    defaultGroups,
    resourceView.state.view,
  );
  const activeDefaultGroup = React.useMemo(
    () =>
      rawActiveDefaultGroup
        ? resolveResourceViewGroup(rawActiveDefaultGroup, modelMetadata)
        : null,
    [modelMetadata, rawActiveDefaultGroup],
  );
  const validDefaultGroupStack = React.useMemo(
    () =>
      activeDefaultGroup
        ? validResourceViewGroupStack([activeDefaultGroup], modelMetadata)
        : EMPTY_GROUP_STACK,
    [activeDefaultGroup, modelMetadata],
  );
  const validCurrentGroupStack = React.useMemo(
    () => validResourceViewGroupStack(resourceView.state.groupStack, modelMetadata),
    [resourceView.state.groupStack, modelMetadata],
  );
  const hasInvalidGroupStack =
    !resourceViewGroupStacksEqual(resourceView.state.groupStack, validCurrentGroupStack);
  const effectiveGroupStack = React.useMemo(() => {
    if (validCurrentGroupStack.length > 0) return validCurrentGroupStack;
    return hasInvalidGroupStack ? validDefaultGroupStack : resourceView.state.groupStack;
  }, [
    resourceView.state.groupStack,
    hasInvalidGroupStack,
    validCurrentGroupStack,
    validDefaultGroupStack,
  ]);
  const handledDefaultGroupRef = React.useRef<ResourceViewGroup | null>(null);
  React.useEffect(() => {
    if (!activeDefaultGroup) {
      handledDefaultGroupRef.current = null;
      return;
    }
    if (
      handledDefaultGroupRef.current
      && resourceViewGroupsEqual(handledDefaultGroupRef.current, activeDefaultGroup)
    ) {
      return;
    }
    const previousDefault = handledDefaultGroupRef.current;
    if (
      resourceView.state.group === null
      || (
        previousDefault
        && resourceViewGroupsEqual(resourceView.state.group, previousDefault)
      )
    ) {
      handledDefaultGroupRef.current = activeDefaultGroup;
      resourceView.setGroup(activeDefaultGroup);
    }
  }, [
    activeDefaultGroup,
    resourceView.setGroup,
    resourceView.state.group,
  ]);
  React.useEffect(() => {
    if (!hasInvalidGroupStack) return;
    if (resourceViewGroupStacksEqual(resourceView.state.groupStack, effectiveGroupStack)) {
      return;
    }
    resourceView.setGroupStack(effectiveGroupStack);
  }, [
    resourceView.setGroupStack,
    resourceView.state.groupStack,
    effectiveGroupStack,
    hasInvalidGroupStack,
  ]);

  const groupDimensions = React.useMemo(
    () =>
      effectiveGroupStack.map((group) =>
        resourceViewGroupToAggregateDimension(group, modelMetadata)
      ),
    [effectiveGroupStack, modelMetadata],
  );
  const groupedListMode =
    resourceView.state.view === "list" && groupDimensions.length > 0;
  const surface = useResourceViewSurface({
    resource,
    columns: resolvedColumns,
    fields,
    filter,
    order,
    pageSize,
    resourceView,
    modelMetadata,
    groupStack: effectiveGroupStack,
    enabled: !groupedListMode,
    onListStateChange,
  });
  const flatMeasures = React.useMemo(
    () => groupMeasuresFromColumns(resolvedColumns),
    [resolvedColumns],
  );
  const [groupPagerState, setGroupPagerState] =
    React.useState<GroupPagerState | null>(null);
  const handleGroupPagerStateChange = React.useCallback(
    (next: GroupPagerState) => {
      setGroupPagerState((current) =>
        groupPagerStatesEqual(current, next) ? current : next,
      );
    },
    [],
  );
  const toolbarPager = React.useMemo<PagerState>(() => {
    if (!groupedListMode) {
      return {
        total: surface.list.total,
        page: surface.list.page,
        pageSize: surface.list.pageSize,
        hasPrev: surface.list.hasPrev,
        hasNext: surface.list.hasNext,
      };
    }
    // Group-level pager: Pager derives hasPrev/hasNext from page/total.
    return {
      total: groupPagerState?.total ?? 0,
      page: resourceView.state.page,
      pageSize: resourceView.state.pageSize,
    };
  }, [
    resourceView.state.page,
    resourceView.state.pageSize,
    groupPagerState?.total,
    groupedListMode,
    surface.list.hasNext,
    surface.list.hasPrev,
    surface.list.page,
    surface.list.pageSize,
    surface.list.total,
  ]);
  const explicitAndFacetGroupOptions = React.useMemo(
    () => mergeGroupOptions(explicitGroupOptions, declaredFacets.groupOptions),
    [declaredFacets.groupOptions, explicitGroupOptions],
  );
  const toolbarGroupOptions = React.useMemo(
    () =>
      mergeGroupOptions(
        explicitAndFacetGroupOptions,
        buildGroupOptions(
          resolvedColumns,
          modelMetadata,
          defaultGroupsForToolbar(defaultGroup, defaultGroups),
        ),
      ),
    [
      defaultGroup,
      defaultGroups,
      explicitAndFacetGroupOptions,
      modelMetadata,
      resolvedColumns,
    ],
  );
  const inferredFilterFields = React.useMemo(
    () => buildFilterFields(resolvedColumns, surface.rows, modelMetadata),
    [modelMetadata, resolvedColumns, surface.rows],
  );
  const inferredFilterOptions = React.useMemo(
    () => buildFilterOptions(resolvedColumns, surface.rows, inferredFilterFields),
    [inferredFilterFields, resolvedColumns, surface.rows],
  );
  const facetFilters = React.useMemo(
    () => mergeFilterOptions(declaredFacets.filters, scalarFacets.filters),
    [declaredFacets.filters, scalarFacets.filters],
  );
  const explicitAndFacetFilters = React.useMemo(
    () => mergeFilterOptions(explicitFilters, facetFilters),
    [explicitFilters, facetFilters],
  );
  const filterOptions = React.useMemo(
    () => mergeFilterOptions(explicitAndFacetFilters, inferredFilterOptions),
    [explicitAndFacetFilters, inferredFilterOptions],
  );
  const facetFilterFields = React.useMemo(
    () => mergeFilterFields(declaredFacets.filterFields, scalarFacets.filterFields),
    [declaredFacets.filterFields, scalarFacets.filterFields],
  );
  const explicitAndFacetFilterFields = React.useMemo(
    () => mergeFilterFields(explicitFilterFields, facetFilterFields),
    [explicitFilterFields, facetFilterFields],
  );
  const filterFields = React.useMemo(
    () => mergeFilterFields(explicitAndFacetFilterFields, inferredFilterFields),
    [explicitAndFacetFilterFields, inferredFilterFields],
  );
  const activeFilterIds = activeFilterIdsFor(
    resourceView.state.filter,
    filterOptions,
  );
  // Search the model's real title field (recordRepresentation → e.g. displayName
  // for Person), not the hardcoded "title" that non-title models lack.
  const textFilterField = resolveTextFilterField(modelMetadata);
  const customFilterChips = customFilterChipsFor(
    resourceView.state.filter,
    filterOptions,
    filterFields,
    textFilterField,
  );

  const setPage = React.useCallback(
    (page: number) => {
      resourceView.setPage(page);
    },
    [resourceView.setPage],
  );

  const filterText = textFilterValue(resourceView.state.filter, textFilterField);
  const interactive = Boolean(onRowClick || rowHref);
  const bulkDelete = useBulkDelete(
    resource,
    surface.selectedIds,
    resourceView.clearSelectedIds,
  );
  const cardActionContext = React.useMemo(
    () => ({ refresh: surface.list.refetch }),
    [surface.list.refetch],
  );

  return (
    <ResourceListFrame
      className={className}
      toolbar={{
        actions: toolbarActions,
        pager: toolbarPager,
        view: resourceView.state.view,
        group: effectiveGroupStack[0] ?? null,
        groupStack: effectiveGroupStack,
        groupOptions: toolbarGroupOptions,
        filterOptions,
        filterFields,
        customFilterChips,
        favorites: resourceView.savedFavorites,
        activeFilterIds,
        filterText,
        createLabel: createLabel ?? createLabelForResource(resource),
        onCreate,
        onClearGroup: () => resourceView.setGroupStack([]),
        onGroupStackChange: resourceView.setGroupStack,
        onViewChange: resourceView.setView,
        onPageChange: setPage,
        onPageSizeChange: resourceView.setPageSize,
        onCustomFilterAdd: (customFilter) =>
          resourceView.setFilter(
            addCustomFilterToFilter(resourceView.state.filter, customFilter),
          ),
        onCustomFilterRemove: (id) =>
          resourceView.setFilter(removeCustomFilter(resourceView.state.filter, id)),
        onFavoriteSave: resourceView.saveFavorite,
        onFavoriteSelect: resourceView.applyFavorite,
        pagerSubject: groupedListMode ? "Groups" : undefined,
        pagerTotalUnit: groupedListMode ? "groups" : undefined,
        onFilterToggle: (id) =>
          resourceView.setFilter(
            nextFacetFilter(resourceView.state.filter, filterOptions, id),
          ),
        onFilterTextChange: (value) =>
          resourceView.setFilter(
            nextTextFilter(resourceView.state.filter, value, textFilterField),
          ),
      }}
      selection={{
        count: surface.selectedIds.size,
        onClear: resourceView.clearSelectedIds,
        onDelete: bulkDelete.canDelete ? bulkDelete.deleteInitiate : undefined,
        deletePending: bulkDelete.isPending,
      }}
      error={groupedListMode ? null : surface.list.error}
      loadingFooter={
        !groupedListMode
        && surface.list.fetching
        && surface.rowModels.length > 0
      }
      overlays={
        bulkDelete.isPreviewOpen && bulkDelete.previewState ? (
          <DeletePreviewDialog
            preview={bulkDelete.previewState}
            recordCount={bulkDelete.previewRecordCount}
            blockedRecordCount={bulkDelete.previewBlockedRecordCount}
            overflowCount={bulkDelete.previewOverflowCount}
            isPending={bulkDelete.isPending}
            onConfirm={bulkDelete.onConfirm}
            onCancel={bulkDelete.onCancel}
          />
        ) : null
      }
    >
      {groupedListMode ? (
        <GroupedListBody
          resource={resource}
          columns={resolvedColumns}
          table={surface.table}
          tableColumns={surface.tableColumns}
          columnVisibility={surface.columnVisibility}
          visibleColumnCount={surface.visibleColumnCount}
          visibleFields={surface.visibleFields}
          onVisibleFieldToggle={surface.toggleVisibleField}
          resourceView={resourceView}
          groupStack={effectiveGroupStack}
          groupDimensions={groupDimensions}
          modelMetadata={modelMetadata}
          requestedFields={surface.requestedFields}
          mergedFilter={surface.mergedFilter}
          sortOrder={surface.sortOrder}
          order={order}
          interactive={interactive}
          rowHref={rowHref}
          onRowClick={onRowClick}
          emptyMessage={emptyContent}
          onPagerStateChange={handleGroupPagerStateChange}
          onListStateChange={onListStateChange}
        />
      ) : resourceView.state.view === "board" ? (
        <BoardView
          columns={resolvedColumns}
          groups={surface.groupedRows}
          resourceView={resourceView}
          selectedIds={surface.selectedIds}
          interactive={interactive}
          fetching={surface.list.fetching}
          emptyMessage={emptyContent}
          rowHref={rowHref}
          onRowClick={onRowClick}
          cardActions={cardActions}
          cardActionContext={cardActionContext}
        />
      ) : flatMeasures.length > 0 ? (
        <FlatListBodyWithAggregate
          resource={resource}
          filter={surface.mergedFilter}
          modelMetadata={modelMetadata}
          measures={flatMeasures}
          columns={resolvedColumns}
          table={surface.table}
          rowModels={surface.rowModels}
          listItems={surface.listItems}
          tableScrollRef={surface.tableScrollRef}
          rowVirtualizer={surface.rowVirtualizer}
          visibleColumnCount={surface.visibleColumnCount}
          allPageSelected={surface.allPageSelected}
          somePageSelected={surface.somePageSelected}
          onPageSelectionChange={surface.setPageSelection}
          visibleFields={surface.visibleFields}
          onVisibleFieldToggle={surface.toggleVisibleField}
          resourceView={resourceView}
          interactive={interactive}
          rowHref={rowHref}
          onRowClick={onRowClick}
          emptyMessage={emptyContent}
          fetching={surface.list.fetching}
        />
      ) : (
        <FlatListBody
          columns={resolvedColumns}
          table={surface.table}
          rowModels={surface.rowModels}
          listItems={surface.listItems}
          tableScrollRef={surface.tableScrollRef}
          rowVirtualizer={surface.rowVirtualizer}
          visibleColumnCount={surface.visibleColumnCount}
          allPageSelected={surface.allPageSelected}
          somePageSelected={surface.somePageSelected}
          onPageSelectionChange={surface.setPageSelection}
          visibleFields={surface.visibleFields}
          onVisibleFieldToggle={surface.toggleVisibleField}
          resourceView={resourceView}
          interactive={interactive}
          rowHref={rowHref}
          onRowClick={onRowClick}
          emptyMessage={emptyContent}
          fetching={surface.list.fetching}
        />
      )}
    </ResourceListFrame>
  );
}

function FlatListBodyWithAggregate<TRow extends Row>({
  resource,
  filter,
  modelMetadata,
  measures,
  ...props
}: FlatListBodyProps<TRow> & {
  resource: string;
  filter: Record<string, unknown> | undefined;
  modelMetadata: ReturnType<typeof useModelMetadata>;
  measures: readonly GroupMeasure[];
}): React.ReactElement {
  const dataResource = requireDataResource(resource, modelMetadata);
  const where = React.useMemo(
    () => hasuraWhereFromCrudFilters(crudFiltersFromFilterRecord(filter)),
    [filter],
  );
  const queryMeasures = React.useMemo(
    () => hasuraMeasuresFromGroupMeasures(measures, modelMetadata),
    [measures, modelMetadata],
  );
  const aggregate = useAngeeAggregate(dataResource, {
    where,
    measures: queryMeasures,
    enabled: queryMeasures.length > 0,
  });
  return <FlatListBody {...props} footerAggregate={aggregate.aggregate} />;
}

function requireDataResource(
  resourceId: string,
  metadata: ReturnType<typeof useModelMetadata>,
): NonNullable<NonNullable<ReturnType<typeof useModelMetadata>>["resource"]> {
  const dataResource = metadata?.resource;
  if (!dataResource) {
    throw new Error(`Resource "${resourceId}" has no data resource metadata.`);
  }
  return dataResource;
}

function defaultGroupForView(
  defaultGroup: ResourceViewGroup | null | undefined,
  defaultGroups: ResourceViewDefaultGroups | undefined,
  view: ResourceViewKind,
): ResourceViewGroup | null {
  if (
    defaultGroups
    && Object.prototype.hasOwnProperty.call(defaultGroups, view)
  ) {
    return defaultGroups[view] ?? null;
  }
  return defaultGroup ?? null;
}

function defaultGroupsForToolbar(
  defaultGroup: ResourceViewGroup | null | undefined,
  defaultGroups: ResourceViewDefaultGroups | undefined,
): readonly ResourceViewGroup[] {
  const groups: ResourceViewGroup[] = [];
  if (defaultGroup) groups.push(defaultGroup);
  for (const view of RESOURCE_VIEW_KINDS) {
    const group = defaultGroups?.[view];
    if (group) groups.push(group);
  }
  return groups;
}

function resourceViewGroupStacksEqual(
  left: readonly ResourceViewGroup[],
  right: readonly ResourceViewGroup[],
): boolean {
  return (
    left.length === right.length
    && left.every((group, index) => {
      const other = right[index];
      return other !== undefined && resourceViewGroupsEqual(group, other);
    })
  );
}
