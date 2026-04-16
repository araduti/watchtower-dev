"use client";

import { useState, useCallback } from "react";

/**
 * Manages cursor-based pagination state for tRPC list endpoints.
 *
 * All list endpoints return `{ items, nextCursor }`. This hook tracks:
 * - The current cursor sent in the query
 * - A stack of previous cursors for backwards navigation
 *
 * Call `reset()` when filters change to return to page 1.
 */
export function useCursorPagination() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const hasPrevPage = cursorStack.length > 0;

  /** Advance to the next page. Pushes the current cursor onto the stack. */
  const goToNextPage = useCallback(
    (nextCursor: string) => {
      setCursorStack((prev) => [...prev, cursor ?? ""]);
      setCursor(nextCursor);
    },
    [cursor],
  );

  /** Return to the previous page. Pops from the cursor stack. */
  const goToPrevPage = useCallback(() => {
    setCursorStack((prev) => {
      const next = [...prev];
      const prevCursor = next.pop();
      setCursor(prevCursor === "" ? undefined : prevCursor);
      return next;
    });
  }, []);

  /** Reset to the first page (e.g. when filters change). */
  const reset = useCallback(() => {
    setCursor(undefined);
    setCursorStack([]);
  }, []);

  return { cursor, hasPrevPage, goToNextPage, goToPrevPage, reset } as const;
}
