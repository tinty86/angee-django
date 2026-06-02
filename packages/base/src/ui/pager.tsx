import type { ReactElement } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../lib/cn";
import { Button } from "./button";

export interface PagerState {
  page: number;
  pageSize: number;
  total: number | undefined;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export interface PagerProps extends PagerState {
  onPageChange?: (page: number) => void;
  subject?: string;
  unit?: string;
  labelElement?: "button" | "span";
  labelClassName?: string;
  previousLabel?: string;
  nextLabel?: string;
  formatNumber?: (value: number) => string;
}

const BUTTON_LABEL_CLASS =
  "h-6 rounded px-1.5 text-13 tabular-nums text-fg outline-none hover:bg-inset focus-visible:focus-ring";
const TEXT_LABEL_CLASS = "tabular-nums";

function defaultFormatNumber(value: number): string {
  return String(value);
}

function pagerRangeLabel({
  page,
  pageSize,
  total,
  unit,
  formatNumber,
}: {
  page: number;
  pageSize: number;
  total: number | undefined;
  unit: string | undefined;
  formatNumber: (value: number) => string;
}): string {
  const start = total === undefined || total === 0
    ? 0
    : (page - 1) * pageSize + 1;
  const end = total === undefined
    ? page * pageSize
    : Math.min(total, page * pageSize);
  return `${formatNumber(start)}-${formatNumber(end)}${
    total !== undefined
      ? ` / ${formatNumber(total)}${unit ? ` ${unit}` : ""}`
      : ""
  }`;
}

export function Pager({
  page,
  pageSize,
  total,
  hasPrev,
  hasNext,
  onPageChange,
  subject = "Records",
  unit,
  labelElement = "button",
  labelClassName,
  previousLabel = "Previous page",
  nextLabel = "Next page",
  formatNumber = defaultFormatNumber,
}: PagerProps): ReactElement {
  const pageLabel = pagerRangeLabel({
    page,
    pageSize,
    total,
    unit,
    formatNumber,
  });
  const canPrev = hasPrev ?? page > 1;
  const canNext = hasNext ?? (total !== undefined && page * pageSize < total);
  const label = labelElement === "button"
    ? (
      <button
        type="button"
        className={cn(BUTTON_LABEL_CLASS, labelClassName)}
        aria-label={`${subject} ${pageLabel}`}
      >
        {pageLabel}
      </button>
    )
    : (
      <span className={cn(TEXT_LABEL_CLASS, labelClassName)}>
        {pageLabel}
      </span>
    );

  return (
    <>
      {label}
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        aria-label={previousLabel}
        disabled={!canPrev}
        onClick={() => onPageChange?.(Math.max(1, page - 1))}
      >
        <ChevronLeft className="glyph" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        aria-label={nextLabel}
        disabled={!canNext}
        onClick={() => onPageChange?.(page + 1)}
      >
        <ChevronRight className="glyph" aria-hidden />
      </Button>
    </>
  );
}
