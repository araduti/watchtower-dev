"use client";

/**
 * Lucide Animated — Status indicator icons with animated states.
 * Registry: lucide-animated.com
 *
 * Replaces static icons with animated equivalents for scan status,
 * compliance check results, and loading states.
 */

import * as React from "react";
import {
  Check,
  X,
  Loader2,
  Circle,
  Minus,
  AlertTriangle,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ScanStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
type ComplianceStatus = "compliant" | "non-compliant" | "in-progress" | "muted" | "unknown";
type FindingState = "open" | "acknowledged" | "muted" | "accepted_risk" | "resolved";

interface StatusIconProps {
  className?: string;
  size?: number;
}

interface ScanStatusIconProps extends StatusIconProps {
  status: ScanStatus;
}

/** Lucide Animated scan status indicators */
export function ScanStatusIcon({ status, className, size = 16 }: ScanStatusIconProps) {
  switch (status) {
    case "PENDING":
      return (
        <Circle
          className={cn("text-muted-foreground animate-pulse-dot", className)}
          size={size}
        />
      );
    case "RUNNING":
      return (
        <Loader2
          className={cn("text-electric-blue animate-spin-ring", className)}
          size={size}
        />
      );
    case "COMPLETED":
      return (
        <Check
          className={cn("text-status-compliant", className)}
          size={size}
        />
      );
    case "FAILED":
      return (
        <X
          className={cn("text-severity-critical", className)}
          size={size}
        />
      );
    case "CANCELLED":
      return (
        <Minus
          className={cn("text-muted-foreground", className)}
          size={size}
        />
      );
  }
}

interface ComplianceStatusIconProps extends StatusIconProps {
  status: ComplianceStatus;
}

/** Lucide Animated compliance status indicators */
export function ComplianceStatusIcon({
  status,
  className,
  size = 16,
}: ComplianceStatusIconProps) {
  switch (status) {
    case "compliant":
      return (
        <ShieldCheck
          className={cn("text-status-compliant", className)}
          size={size}
        />
      );
    case "non-compliant":
      return (
        <ShieldAlert
          className={cn("text-status-non-compliant animate-pulse-dot", className)}
          size={size}
        />
      );
    case "in-progress":
      return (
        <Loader2
          className={cn("text-status-in-progress animate-spin-ring", className)}
          size={size}
        />
      );
    case "muted":
      return (
        <Shield
          className={cn("text-status-muted", className)}
          size={size}
        />
      );
    case "unknown":
      return (
        <AlertTriangle
          className={cn("text-severity-medium", className)}
          size={size}
        />
      );
  }
}

interface FindingStateIconProps extends StatusIconProps {
  state: FindingState;
}

/** Lucide Animated finding lifecycle state indicators */
export function FindingStateIcon({
  state,
  className,
  size = 16,
}: FindingStateIconProps) {
  switch (state) {
    case "open":
      return (
        <AlertTriangle
          className={cn("text-severity-critical animate-pulse-dot", className)}
          size={size}
        />
      );
    case "acknowledged":
      return (
        <Clock
          className={cn("text-severity-high", className)}
          size={size}
        />
      );
    case "muted":
      return (
        <Shield
          className={cn("text-status-muted", className)}
          size={size}
        />
      );
    case "accepted_risk":
      return (
        <ShieldAlert
          className={cn("text-severity-medium", className)}
          size={size}
        />
      );
    case "resolved":
      return (
        <ShieldCheck
          className={cn("text-status-compliant", className)}
          size={size}
        />
      );
  }
}
