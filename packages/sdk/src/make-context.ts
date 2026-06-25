// Relocated to @angee/ui (the binding owns the runtime context factory). This
// shim keeps `@angee/sdk` importers resolving unchanged while the package is
// dissolved.
export { makeContext, type ContextBinding } from "@angee/ui/runtime";
