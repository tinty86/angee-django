import * as React from "react";
import { useAuthoredMutation } from "@angee/refine";
import {
  Button,
  Glyph,
  ListView,
  Page,
  PageBody,
  PageHeader,
  type ListColumn,
  type StringIdRow,
} from "@angee/ui";
import { NexusAcceptSuggestion, NexusDismissSuggestion } from "./documents";
import { useNexusT } from "./i18n";

const INVALIDATES = ["parties.PartyHandle", "parties.Handle", "parties.Party", "parties.Person"];

type SuggestionRow = StringIdRow;

/**
 * The review queue: every low-confidence, undecided party↔handle claim across
 * the directory. Nothing merges silently — accepting confirms at full
 * confidence, dismissing writes the durable anti-link.
 */
export function ReviewPage(): React.ReactElement {
  const t = useNexusT();
  const [accept, { fetching: accepting }] = useAuthoredMutation(NexusAcceptSuggestion, {
    invalidateModels: INVALIDATES,
  });
  const [dismiss, { fetching: dismissing }] = useAuthoredMutation(NexusDismissSuggestion, {
    invalidateModels: INVALIDATES,
  });
  const busy = accepting || dismissing;

  const columns = React.useMemo<readonly ListColumn<SuggestionRow>[]>(
    () => [
      { field: "handle.value", header: t("review.handle") },
      { field: "handle.platform", header: t("review.platform") },
      { field: "party.display_name", header: t("review.party") },
      { field: "confidence" },
      { field: "source" },
      {
        field: "id",
        header: "",
        align: "right",
        render: (row) => (
          <span className="inline-flex gap-1">
            <Button
              variant="ghost"
              size="iconSm"
              aria-label={t("review.accept")}
              title={t("review.accept")}
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                void accept({ id: row.id });
              }}
            >
              <Glyph name="check" />
            </Button>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label={t("review.dismiss")}
              title={t("review.dismiss")}
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                void dismiss({ id: row.id });
              }}
            >
              <Glyph name="x" />
            </Button>
          </span>
        ),
      },
    ],
    [accept, busy, dismiss, t],
  );

  return (
    <Page>
      <PageHeader title={t("review.title")} description={t("review.description")} />
      <PageBody>
        <ListView<SuggestionRow>
          resource="parties.PartyHandle"
          scope="local"
          fields={[
            "id",
            "handle.value",
            "handle.platform",
            "party.display_name",
            "confidence",
            "source",
          ]}
          baseFilter={{
            is_confirmed: { exact: false },
            is_dismissed: { exact: false },
            confidence: { lt: 0.5 },
          }}
          columns={columns}
          emptyContent={t("review.empty")}
        />
      </PageBody>
    </Page>
  );
}
