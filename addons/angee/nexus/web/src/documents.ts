// The person timeline is an authored read: one keyset page of the cross-channel
// feed exchanged with a party (newest-first pages; `before` is the oldest loaded
// message's id). The review/ties surfaces are model-driven and need no document.

import { graphql } from "@angee/gql/console";

// The two review verbs are parties mutations; nexus only composes the queue
// view over them (the suggestion shape IS "low-confidence undecided link").
export const NexusAcceptSuggestion = graphql(`
  mutation NexusAcceptSuggestion($id: ID!) {
    confirm_party_handle(id: $id) {
      id
      is_confirmed
      is_dismissed
      confidence
    }
  }
`);

export const NexusDismissSuggestion = graphql(`
  mutation NexusDismissSuggestion($id: ID!) {
    dismiss_party_handle(id: $id) {
      id
      is_confirmed
      is_dismissed
    }
  }
`);

export const PartyTimeline = graphql(`
  query PartyTimeline($partyId: ID!, $before: ID, $limit: Int!, $search: String!) {
    party_timeline(party_id: $partyId, before: $before, limit: $limit, search: $search) {
      count
      messages {
        id
        preview
        platform
        direction
        sent_at
        created_at
        sender {
          id
          display_name
          value
        }
        thread {
          id
          title {
            text
          }
        }
      }
    }
  }
`);
