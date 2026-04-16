"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@watchtower/ui";
import { cn } from "@/lib/utils";

interface CursorPaginationProps {
  /** Whether a next page exists (derived from `nextCursor !== null`) */
  hasNextPage: boolean;
  /** Whether a previous page exists */
  hasPrevPage: boolean;
  /** Callback fired when the user requests the next page */
  onNextPage: () => void;
  /** Callback fired when the user requests the previous page */
  onPrevPage: () => void;
  /** Disable both buttons during data fetches */
  isLoading?: boolean;
  className?: string;
}

/**
 * Cursor-based pagination controls for tRPC list endpoints.
 *
 * Renders Previous / Next buttons styled to sit directly beneath a DataTable.
 * All list endpoints return `{ items, nextCursor }` — derive `hasNextPage`
 * from `nextCursor !== null` and track page history for `hasPrevPage`.
 */
export function CursorPagination({
  hasNextPage,
  hasPrevPage,
  onNextPage,
  onPrevPage,
  isLoading = false,
  className,
}: CursorPaginationProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-2xl border border-border/40 bg-card/80 backdrop-blur-md px-4 py-3",
        className,
      )}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={onPrevPage}
        disabled={!hasPrevPage || isLoading}
        aria-label="Go to previous page"
        className="gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onNextPage}
        disabled={!hasNextPage || isLoading}
        aria-label="Go to next page"
        className="gap-1"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
