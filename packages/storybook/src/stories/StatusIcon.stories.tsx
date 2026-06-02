import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusDot, StatusIcon } from "@angee/base";

const meta = {
  title: "Primitives/StatusIcon",
  component: StatusIcon,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    intent: {
      control: "select",
      options: ["info", "success", "warning", "danger", "muted"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
  },
  args: {
    intent: "info",
    size: "sm",
  },
} satisfies Meta<typeof StatusIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Icons: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {(["info", "success", "warning", "danger", "muted"] as const).map((intent) => (
        <StatusIcon key={intent} intent={intent} label={intent} size="md" />
      ))}
    </div>
  ),
};

export const Dots: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {(["default", "brand", "accent", "info", "success", "warning", "danger"] as const).map(
        (tone) => (
          <StatusDot key={tone} tone={tone} label={tone} />
        ),
      )}
    </div>
  ),
};
