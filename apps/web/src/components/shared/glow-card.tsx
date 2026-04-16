/**
 * Spell UI — GlowCard with gradient border animation and glassmorphism.
 * Registry: github.com/xxtomm/spell-ui
 *
 * Premium card variants with glowing borders, gradient animations,
 * and glassmorphism surfaces for the security dashboard.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface GlowCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Glow color accent */
  glow?: "green" | "blue" | "red" | "amber" | "none";
  /** Enable animated gradient border */
  gradientBorder?: boolean;
}

/** Spell UI glassmorphism card with optional glow and gradient border */
const GlowCard = React.forwardRef<HTMLDivElement, GlowCardProps>(
  ({ className, glow = "none", gradientBorder = false, children, ...props }, ref) => {
    const glowClass = {
      green: "glow-green",
      blue: "glow-blue",
      red: "glow-red",
      amber: "glow-amber",
      none: "",
    }[glow];

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl glass-card text-card-foreground",
          glowClass,
          gradientBorder && "gradient-border",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
GlowCard.displayName = "GlowCard";

interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  /** Optional sub-label or trend */
  sublabel?: string;
  glow?: "green" | "blue" | "red" | "amber" | "none";
}

/** Spell UI metric display card for dashboard KPIs */
const MetricCard = React.forwardRef<HTMLDivElement, MetricCardProps>(
  ({ label, value, sublabel, glow = "none", className, ...props }, ref) => {
    return (
      <GlowCard ref={ref} glow={glow} className={cn("p-6", className)} {...props}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-bold tracking-tight font-mono">{value}</p>
        {sublabel && (
          <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
        )}
      </GlowCard>
    );
  },
);
MetricCard.displayName = "MetricCard";

export { GlowCard, MetricCard };
