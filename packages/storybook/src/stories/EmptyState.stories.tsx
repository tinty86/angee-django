import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, EmptyState, Glyph } from "@angee/base";

const meta = {
  title: "Fragments/EmptyState",
  component: EmptyState,
  parameters: { layout: "padded" },
  args: {
    title: "No records",
  },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  render: () => (
    <div className="max-w-3xl">
      <EmptyState
        icon="archive"
        title="No records"
        description="Create the first record or adjust the active filters."
        actions={
          <>
            <Button size="sm" variant="secondary">
              Clear filters
            </Button>
            <Button size="sm" variant="primary">
              <Glyph name="plus" />
              New record
            </Button>
          </>
        }
      />
    </div>
  ),
};
