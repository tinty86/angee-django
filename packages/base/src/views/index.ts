// Data-bound views over the @angee/sdk resource hooks: a paginated list, a
// record form, the collection⇄record page that pairs them, and an aggregate
// panel. Each is generic and prop-driven — the host configures the model,
// fields, and columns.

export {
  ListView,
  type ListViewProps,
  type ListColumn,
  type ColumnAlign,
} from "./ListView";
export {
  FormView,
  type FormViewProps,
  type FormField,
  type FieldKind,
} from "./FormView";
export {
  DataPage,
  type DataPageProps,
  type RecordPlacement,
} from "./DataPage";
export {
  AggregatePanel,
  type AggregatePanelProps,
  type AggregateDimension,
} from "./AggregatePanel";
