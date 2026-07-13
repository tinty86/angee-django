import * as React from "react";
import { Column, Field, Form, Group, List, ResourceList } from "@angee/ui";
import { useNexusT } from "./i18n";

const MODEL = "nexus.Tie";

/**
 * Ties: the derived interaction rollup per contact — gravity-ranked, with the
 * fading signal and the stay-in-touch cadence (the one editable column; every
 * other value is recomputed from messaging).
 */
export function TiesPage(): React.ReactElement {
  const t = useNexusT();
  return (
    <ResourceList resource={MODEL} placement="inline" routed hideCreate>
      <List resource={MODEL}>
        <Column field="party.display_name" header={t("ties.party")} />
        <Column field="gravity" header={t("ties.gravity")} />
        <Column field="message_count" header={t("ties.messages")} />
        <Column field="last_interaction_at" header={t("ties.lastContact")} />
        <Column field="is_fading" header={t("ties.fading")} widget="booleanBadge" />
        <Column field="touch_due_at" header={t("ties.touchDue")} />
      </List>
      <Form resource={MODEL}>
        <Group label={t("ties.group.cadence")} columns={2}>
          <Field name="cadence_days" label={t("ties.cadence")} />
        </Group>
      </Form>
    </ResourceList>
  );
}
