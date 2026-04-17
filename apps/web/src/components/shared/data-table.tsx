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
  /** Enable checkbox selection column */
  selectable?: boolean;
  /** Set of selected row keys (controlled) */
  selectedKeys?: Set<string>;
  /** Callback when selection changes */
  onSelectionChange?: (selectedKeys: Set<string>) => void;
}

/** Clean data table with tight padding, no vertical borders, sortable-ready */
export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  getKey,
  onRowClick,
  className,
  emptyMessage = "No data available",
  selectable = false,
  selectedKeys,
  onSelectionChange,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-md p-12 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const allKeys = data.map(getKey);
  const allSelected = selectable && selectedKeys ? allKeys.every((k) => selectedKeys.has(k)) : false;
  const someSelected = selectable && selectedKeys ? allKeys.some((k) => selectedKeys.has(k)) && !allSelected : false;

  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      // Deselect all on current page
      const next = new Set(selectedKeys);
      for (const k of allKeys) next.delete(k);
      onSelectionChange(next);
    } else {
      // Select all on current page
      const next = new Set(selectedKeys);
      for (const k of allKeys) next.add(k);
      onSelectionChange(next);
    }
  };

  const handleSelectRow = (key: string) => {
    if (!onSelectionChange || !selectedKeys) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  };

  return (
    <div className={cn("rounded-2xl border border-border/40 bg-card/80 backdrop-blur-md overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40">
              {selectable && (
                <th
                  className="px-4 py-3 text-center"
                  style={{ minWidth: "40px" }}
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded"
                    style={{ accentColor: "hsl(var(--primary))" }}
                  />
                </th>
              )}
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
            {data.map((item) => {
              const key = getKey(item);
              const isSelected = selectable && selectedKeys ? selectedKeys.has(key) : false;

              return (
                <tr
                  key={key}
                  className={cn(
                    "transition-colors hover:bg-accent/50",
                    onRowClick && "cursor-pointer",
                    isSelected && "bg-accent/30",
                  )}
                  onClick={() => onRowClick?.(item)}
                >
                  {selectable && (
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectRow(key)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded"
                        style={{ accentColor: "hsl(var(--primary))" }}
                      />
                    </td>
                  )}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
