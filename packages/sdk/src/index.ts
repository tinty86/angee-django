// @angee/sdk — headless runtime/addon composition contracts. Generic
// data/query/action/metadata surfaces live in @angee/data.

// Cross-cutting context: runtime registry and the context factory.
export { makeContext, type ContextBinding } from "./make-context";
export {
  AppRuntimeProvider,
  useAppRuntime,
  useWidget,
  useFormOverride,
  useResourceRoute,
  useSlot,
  usePreviews,
  useT,
  useNamespaceT,
  type AppRuntime,
} from "./runtime";

// i18n helpers.
export {
  interpolateMessage,
  translateWithFallback,
  type I18nResources,
  type MessageResources,
  type MessageVars,
} from "./i18n";

// Addon composition.
export {
  defineAddon,
  composeAddons,
  mergeChatterContributions,
  mergeSlotContributions,
  type AddonManifest,
  type AddonRoute,
  type ComposedAddons,
  type ComposedMenuItem,
  type ChatterContribution,
  type SlotContribution,
  type PreviewContribution,
  type MenuItem,
  type WidgetMap,
  type FormOverrideMap,
} from "./define-addon";
