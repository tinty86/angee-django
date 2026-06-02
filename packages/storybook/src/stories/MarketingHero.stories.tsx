import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AnnouncementChip,
  BrandLockup,
  Button,
  Glyph,
  MarketingHero,
} from "@angee/base";

const meta = {
  title: "Fragments/MarketingHero",
  component: MarketingHero,
  parameters: { layout: "fullscreen" },
  args: {
    headline: "Build Django and React products from addon contracts.",
  },
} satisfies Meta<typeof MarketingHero>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PublicHero: Story = {
  render: () => (
    <div className="min-h-[640px] bg-[linear-gradient(135deg,#0f172a,#164e63)]">
      <MarketingHero
        actions={
          <>
            <Button variant="primary">
              <Glyph name="plus" />
              Start a project
            </Button>
            <Button className="border-white/30 bg-white/10 text-white hover:bg-white/15" variant="secondary">
              Read the guide
            </Button>
          </>
        }
        body="Angee binds proven libraries into one rendered product surface while keeping business logic inside addons."
        brand={
          <>
            <BrandLockup
              label="Angee"
              mark={<Glyph name="angee" />}
              tone="inverse"
            />
            <AnnouncementChip detail="Composer preview" pulse tone="inverse">
              Base fragments
            </AnnouncementChip>
          </>
        }
        headline="Build Django and React products from addon contracts."
      />
    </div>
  ),
};

