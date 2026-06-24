import { useEffect, useMemo, useRef } from "react";
import type { DocumentNode } from "graphql";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { useSubscription as useUrqlSubscription } from "urql";

type DocumentInput<TData, TVariables> =
  | string
  | DocumentNode
  | TypedDocumentNode<TData, TVariables>;

export interface DocumentSubscriptionOptions<TData> {
  enabled?: boolean;
  onData?: (data: TData) => void;
}

export interface DocumentSubscriptionRun<TData> {
  data: TData | undefined;
  fetching: boolean;
  error: Error | null;
}

interface SubscriptionEvent<TData> {
  data: TData;
  version: number;
}

const DISABLED_SUBSCRIPTION = "subscription angeeDisabled { __typename }";

/**
 * Daemon subscription seam for generated `TypedDocumentNode`s and runtime-built
 * subscription strings. `onData` fires from an effect once per push, never from
 * urql's reducer, so callers can safely set React state in it.
 */
export function useDocumentSubscription<
  TData = unknown,
  TVariables extends Record<string, unknown> = Record<string, unknown>,
>(
  document: DocumentInput<TData, TVariables>,
  variables?: TVariables,
  options: DocumentSubscriptionOptions<TData> = {},
): DocumentSubscriptionRun<TData> {
  const enabled = options.enabled ?? true;
  const stable = useStableVariables(variables);
  const { onData } = options;
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const [state] = useUrqlSubscription<TData, SubscriptionEvent<TData>, TVariables>(
    {
      query: enabled ? document : DISABLED_SUBSCRIPTION,
      variables: stable,
      pause: !enabled,
    },
    (_previous, value) => ({
      data: value,
      version: (_previous?.version ?? 0) + 1,
    }),
  );
  const event = state.data;
  useEffect(() => {
    if (event) onDataRef.current?.(event.data);
  }, [event]);
  return {
    data: event?.data,
    fetching: state.fetching,
    error: state.error ?? null,
  };
}

function useStableVariables<T extends Record<string, unknown>>(
  variables: T | undefined,
): T {
  return useStableValue(variables, {} as T);
}

function useStableValue<T>(value: T | undefined, fallback: T): T {
  const resolved = value ?? fallback;
  const key = JSON.stringify(resolved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => resolved, [key]);
}
