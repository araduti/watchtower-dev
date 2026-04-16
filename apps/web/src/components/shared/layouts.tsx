/**
 * UseLayouts — Dashboard grid layout components.
 * Registry: uselayouts.com
 *
 * Complex grid scaffolding for dashboard layouts, split views,
 * and responsive panels. Desktop-first with tablet fallback.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface DashboardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns (1-4) */
  cols?: 1 | 2 | 3 | 4;
}

/** UseLayouts responsive dashboard grid */
export function DashboardGrid({
  cols = 3,
  className,
  children,
  ...props
}: DashboardGridProps) {
  const colClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  }[cols];

  return (
    <div
      className={cn("grid gap-4", colClass, className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface SplitViewProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Width ratio: "1:2", "1:3", "2:1", "1:1" */
  ratio?: "1:2" | "1:3" | "2:1" | "1:1";
}

/** UseLayouts split view with configurable ratio */
export function SplitView({
  ratio = "1:2",
  className,
  children,
  ...props
}: SplitViewProps) {
  const ratioClass = {
    "1:2": "lg:grid-cols-[1fr_2fr]",
    "1:3": "lg:grid-cols-[1fr_3fr]",
    "2:1": "lg:grid-cols-[2fr_1fr]",
    "1:1": "lg:grid-cols-2",
  }[ratio];

  return (
    <div
      className={cn("grid grid-cols-1 gap-6", ratioClass, className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Page title */
  title: string;
  /** Optional description */
  description?: string;
  /** Optional action buttons (right-aligned) */
  actions?: React.ReactNode;
}

/** UseLayouts centered page container with header */
export function PageContainer({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div className={cn("mx-auto max-w-7xl px-6 py-6", className)} {...props}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-fluid-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-fluid-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
