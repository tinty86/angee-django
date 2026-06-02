import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataLens, type DataLensProjection } from "@angee/base";

const rows = [
  { id: "api", name: "Production API", value: 42, tone: "success" },
  { id: "csv", name: "CSV import", value: 18, tone: "info" },
  { id: "mail", name: "Mailbox sync", value: 9, tone: "warning" },
  { id: "files", name: "File drop", value: 27, tone: "default" },
] as const;

const meta = {
  title: "Fragments/DataLens",
  component: DataLens,
  parameters: { layout: "padded" },
  args: {
    visual: "graph",
  },
} satisfies Meta<typeof DataLens>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Lens: Story = {
  render: () => (
    <div className="max-w-sm">
      <DataLens
        project={(items): DataLensProjection => ({
          metrics: [
            { label: "Rows", value: items.length.toLocaleString() },
            {
              label: "Total",
              value: items.reduce((sum, item) => sum + item.value, 0).toLocaleString(),
            },
          ],
          nodes: items.map((item) => ({
            id: item.id,
            label: item.name,
            value: item.value,
            tone: item.tone,
          })),
          summary: items.length,
          title: "Source lens",
        })}
        rows={rows}
        visual="graph"
      />
    </div>
  ),
};

