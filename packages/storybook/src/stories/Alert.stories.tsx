import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert, Banner, Button } from "@angee/base";

const meta = {
  title: "Primitives/Alert",
  component: Alert,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    intent: {
      control: "select",
      options: ["info", "success", "warning", "danger"],
    },
    surface: {
      control: "select",
      options: ["alert", "banner"],
    },
  },
  args: {
    children: "Changes are saved automatically after validation completes.",
    intent: "info",
    surface: "alert",
    title: "Autosave enabled",
  },
} satisfies Meta<typeof Alert>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  render: () => (
    <div className="grid max-w-2xl gap-3">
      <Alert intent="info" title="Information">This record has pending updates.</Alert>
      <Alert intent="success" title="Synced">The latest changes are available.</Alert>
      <Alert intent="warning" title="Review needed">Some fields need confirmation.</Alert>
      <Alert intent="danger" title="Failed">The import could not be completed.</Alert>
    </div>
  ),
};

export const WithActions: Story = {
  render: () => (
    <Alert
      intent="warning"
      title="Draft changes"
      actions={<Button size="sm">Review</Button>}
    >
      Review the draft before publishing.
    </Alert>
  ),
};

export const BannerSurface: Story = {
  render: () => (
    <div className="max-w-3xl overflow-hidden rounded-md border border-border-subtle bg-sheet">
      <Banner intent="success" title="Workspace synced" onDismiss={() => undefined}>
        All records are current.
      </Banner>
      <div className="p-6 text-13 text-fg-muted">Record content</div>
    </div>
  ),
};
