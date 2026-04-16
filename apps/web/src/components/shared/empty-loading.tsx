import * as React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@watchtower/ui";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Empty state placeholder with icon, title, description, and optional action */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-border/40 bg-card/80 backdrop-blur-md p-12 text-center animate-fade-in",
        className,
      )}
    >
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface LoadingStateProps {
  /** Number of skeleton rows */
  rows?: number;
  className?: string;
}

/** Loading skeleton for data tables and lists */
export function LoadingState({ rows = 5, className }: LoadingStateProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Loading skeleton for metric cards */
export function MetricCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl glass-card p-6 space-y-2", className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}
