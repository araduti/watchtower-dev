import * as React from "react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Custom cell renderer */
  render?: (item: T) => React.ReactNode;
  /** Apply monospace font (for IDs, codes, metrics) */
  mono?: boolean;
  /** Column alignment */
  align?: "left" | "center" | "right";
  /** Min width */
  minWidth?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Unique key extractor */
  getKey: (item: T) => string;
  /** Row click handler */
  onRowClick?: (item: T) => void;
  className?: string;
  /** Empty state content */
  emptyMessage?: string;
}

/** Clean data table with tight padding, no vertical borders, sortable-ready */
export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  getKey,
  onRowClick,
  className,
  emptyMessage = "No data available",
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-md p-12 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-border/40 bg-card/80 backdrop-blur-md overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground",
                    col.align === "center" && "text-center",
                    col.align === "right" && "text-right",
                  )}
                  style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {data.map((item) => (
              <tr
                key={getKey(item)}
                className={cn(
                  "transition-colors hover:bg-accent/50",
                  onRowClick && "cursor-pointer",
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-4 py-3",
                      col.mono && "font-mono text-xs",
                      col.align === "center" && "text-center",
                      col.align === "right" && "text-right",
                    )}
                  >
                    {col.render
                      ? col.render(item)
                      : String(item[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
