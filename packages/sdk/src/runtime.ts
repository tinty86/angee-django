// Relocated to @angee/ui (the binding owns the app-runtime registry it consumes).
// This shim keeps `@angee/sdk` importers resolving unchanged while the package is
// dissolved.
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
} from "@angee/ui/runtime";
