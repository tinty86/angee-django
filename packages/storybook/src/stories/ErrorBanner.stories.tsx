import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, ErrorBanner } from "@angee/base";

const meta = {
  title: "Fragments/ErrorBanner",
  component: ErrorBanner,
  parameters: { layout: "padded" },
  args: {
    message: "The import could not be completed.",
  },
} satisfies Meta<typeof ErrorBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Banner: Story = {
  render: () => (
    <div className="max-w-3xl overflow-hidden rounded-md border border-border-subtle bg-sheet">
      <ErrorBanner
        message="The import could not be completed because one row failed validation."
        onDismiss={() => undefined}
        title="Import failed"
        actions={
          <Button size="sm" variant="secondary">
            Review
          </Button>
        }
      />
      <div className="p-6 text-13 text-fg-muted">Record content</div>
    </div>
  ),
};
