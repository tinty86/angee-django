import type { Meta, StoryObj } from "@storybook/react-vite";
import { Code, CodeBlock } from "@angee/base";

const meta = {
  title: "Primitives/Code",
  component: Code,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md"],
    },
    surface: {
      control: "select",
      options: ["none", "inset", "sheet"],
    },
    variant: {
      control: "select",
      options: ["default", "muted", "success", "warning", "danger", "info"],
    },
  },
  args: {
    children: "record.externalId",
    size: "sm",
    surface: "inset",
    variant: "default",
  },
} satisfies Meta<typeof Code>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const InlineVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2 text-13">
      <Code surface="inset">default</Code>
      <Code surface="inset" variant="muted">muted</Code>
      <Code surface="inset" variant="success">success</Code>
      <Code surface="inset" variant="warning">warning</Code>
      <Code surface="inset" variant="danger">danger</Code>
      <Code surface="inset" variant="info">info</Code>
    </div>
  ),
};

export const Block: Story = {
  render: () => (
    <CodeBlock>{`const status = record.state ?? "draft";\nreturn status.toUpperCase();`}</CodeBlock>
  ),
};
