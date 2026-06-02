import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Glyph, MiniCard, RailPanel, Tag } from "@angee/base";

const meta = {
  title: "Fragments/RailPanel",
  component: RailPanel,
  parameters: { layout: "padded" },
  args: {
    title: "Active sources",
  },
} satisfies Meta<typeof RailPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Section: Story = {
  render: () => (
    <div className="max-w-xs">
      <RailPanel
        actions={
          <Button aria-label="Add source" size="iconSm" variant="icon">
            <Glyph name="plus" />
          </Button>
        }
        count="3"
        title="Active sources"
      >
        <div className="grid gap-2">
          <MiniCard
            meta="Synced 4 minutes ago"
            primaryTag={{ label: "Live", variant: "success" }}
            title="Production API"
          />
          <MiniCard
            meta="Manual import"
            tags={<Tag variant="info">CSV</Tag>}
            title="Partner export"
          />
        </div>
      </RailPanel>
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <div className="max-w-xs">
      <RailPanel empty="No sources match the active filter." title="Active sources" />
    </div>
  ),
};

