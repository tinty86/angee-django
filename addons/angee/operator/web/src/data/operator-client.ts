import {
  bearerAuth,
  graphQLWebSocketUrl,
  isFatalGraphQLWsClose,
} from "@angee/refine";
import { createClient as createWSClient } from "graphql-ws";
import {
  cacheExchange,
  createClient,
  fetchExchange,
  subscriptionExchange,
  type Client,
  type ExecutionResult,
  type SubscriptionForwarder,
} from "urql";

import type { OperatorConnectionInfo } from "./types";

export function createOperatorClient(connection: OperatorConnectionInfo): Client {
  // The operator owns this daemon urql quarantine until it is rebuilt on the
  // refine provider. Data owns shared auth/url helpers; operator owns the cache
  // and subscription transport for its daemon GraphQL surface.
  return createClient({
    url: connection.endpoint,
    fetch: bearerAuth(connection.token)(globalThis.fetch),
    preferGetMethod: false,
    exchanges: [
      cacheExchange,
      subscriptionExchange({
        forwardSubscription: subscriptionForwarder(connection),
      }),
      fetchExchange,
    ],
  });
}

function subscriptionForwarder(
  connection: OperatorConnectionInfo,
): SubscriptionForwarder {
  if (typeof WebSocket === "undefined") {
    return () => ({ subscribe: () => ({ unsubscribe() {} }) });
  }
  const wsClient = createWSClient({
    url: graphQLWebSocketUrl(connection.endpoint),
    connectionParams: { authorization: `Bearer ${connection.token}` },
    lazy: true,
    shouldRetry: (event: unknown) => !isFatalGraphQLWsClose(event),
  });
  return (request) => ({
    subscribe(sink: {
      next: (value: ExecutionResult) => void;
      error: (error: unknown) => void;
      complete: () => void;
    }) {
      const unsubscribe = wsClient.subscribe(
        { ...request, query: request.query ?? "" },
        sink,
      );
      return { unsubscribe };
    },
  });
}
