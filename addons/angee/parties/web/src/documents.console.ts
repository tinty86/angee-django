// Bespoke console operation for connecting a CardDAV directory — a single action
// that creates the Basic-auth credential + the Directory (two models), the
// sanctioned multi-model-create shape. The directories list/detail are model-driven
// (DataPage reads the SDL) and sync is the single-id `syncIntegration` action, so
// neither needs a document here.

import { graphql } from "@angee/gql/console";

export const ConnectCardDavDirectory = graphql(`
  mutation ConnectCardDavDirectory(
    $name: String!
    $serverUrl: String!
    $username: String!
    $password: String!
  ) {
    connectCardDavDirectory(name: $name, serverUrl: $serverUrl, username: $username, password: $password) {
      id
      status
    }
  }
`);
