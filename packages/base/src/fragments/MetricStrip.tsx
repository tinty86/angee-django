import * as React from "react";

import { Glyph } from "../chrome/Glyph";
import { cn } from "../lib/cn";
import { tv } from "../lib/variants";
import { Card } from "../ui/card";
import { SectionEyebrow } from "../ui/section-eyebrow";

export interface MetricTileValue {
  detail?: React.ReactNode;
  icon?: React.ReactNode | string;
  label: React.ReactNode;
  value: React.ReactNode;
}

export type MetricTileProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "className"
> &
  MetricTileValue & {
    className?: string;
  };

export type MetricStripProps = Omit<
  React.HTMLAttributes<HTMLDListElement>,
  "className"
> & {
  className?: string;
  items?: readonly (readonly [React.ReactNode, React.ReactNode])[];
  metrics?: readonly MetricTileValue[];
};

export const metricStripVariants = tv({
  slots: {
    root: "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
    tile: "min-w-0 px-3 py-2.5 shadow-none",
    header: "flex min-w-0 items-center justify-between gap-2",
    icon:
      "grid size-7 shrink-0 place-content-center rounded-md bg-inset text-fg-2 [&_.glyph]:size-3.5 [&>svg]:size-3.5",
    value: "m-0 mt-1 truncate text-13 font-medium text-fg",
    detail: "m-0 mt-1 truncate text-2xs text-fg-muted",
  },
});

export const MetricTile = React.forwardRef<HTMLDivElement, MetricTileProps>(
  function MetricTile(
    { className, detail, icon, label, value, ...props },
    ref,
  ) {
    const styles = metricStripVariants();

    return (
      <Card asChild className={styles.tile({ className })} density="sm">
        <div ref={ref} {...props}>
          <div className={styles.header()}>
            <SectionEyebrow as="dt">{label}</SectionEyebrow>
            {icon ? (
              <span className={styles.icon()}>{renderMetricIcon(icon)}</span>
            ) : null}
          </div>
          <dd className={styles.value()}>{value}</dd>
          {detail ? <p className={styles.detail()}>{detail}</p> : null}
        </div>
      </Card>
    );
  },
);
MetricTile.displayName = "MetricTile";

export const MetricStrip = React.forwardRef<HTMLDListElement, MetricStripProps>(
  function MetricStrip({ className, items, metrics, ...props }, ref) {
    const styles = metricStripVariants();
    const resolved = resolveMetrics(metrics, items);

    return (
      <dl ref={ref} className={cn(styles.root(), className)} {...props}>
        {resolved.map((metric, index) => (
          <MetricTile key={metricKey(metric, index)} {...metric} />
        ))}
      </dl>
    );
  },
);
MetricStrip.displayName = "MetricStrip";

function resolveMetrics(
  metrics: readonly MetricTileValue[] | undefined,
  items: readonly (readonly [React.ReactNode, React.ReactNode])[] | undefined,
): readonly MetricTileValue[] {
  if (metrics) return metrics;
  return (
    items?.map(([label, value]) => ({
      label,
      value,
    })) ?? []
  );
}

function metricKey(metric: MetricTileValue, index: number): string {
  return `${String(metric.label)}:${String(metric.value)}:${index}`;
}

function renderMetricIcon(icon: React.ReactNode | string): React.ReactNode {
  return typeof icon === "string" ? <Glyph decorative name={icon} /> : icon;
}
