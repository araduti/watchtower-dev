"use client";

/**
 * ReUI — Enhanced button with micro-interactions.
 * Registry: reui.io
 *
 * Extends the base shadcn/ui Button with loading states,
 * polished hover/press transitions, and accessibility.
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@watchtower/ui";
import { cn } from "@/lib/utils";

interface InteractiveButtonProps extends ButtonProps {
  /** Show loading spinner and disable */
  loading?: boolean;
  /** Optional loading text */
  loadingText?: string;
  /** Leading icon */
  icon?: React.ReactNode;
}

/** ReUI polished button with loading state and micro-interactions */
export const InteractiveButton = React.forwardRef<
  HTMLButtonElement,
  InteractiveButtonProps
>(({ loading, loadingText, icon, children, className, disabled, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "transition-all duration-200 active:scale-[0.97]",
        loading && "cursor-wait",
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin-ring" />
          {loadingText ?? children}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </Button>
  );
});
InteractiveButton.displayName = "InteractiveButton";
