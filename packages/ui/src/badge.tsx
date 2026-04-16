import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const badgeVariants = cva(
  "inline-flex items-center rounded-2xl border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow",
        outline: "text-foreground",
        // Severity variants — functional compliance colors
        critical:
          "border-transparent bg-red-500 text-white shadow font-bold",
        high: "border-transparent bg-amber-500 text-white shadow",
        medium: "border-transparent bg-yellow-400 text-black shadow",
        low: "border-transparent bg-cyan-500 text-white shadow",
        informational:
          "border-slate-500 text-slate-400 bg-transparent",
        // Status variants — compliance state colors
        compliant:
          "border-transparent bg-green-500 text-white shadow",
        "non-compliant":
          "border-transparent bg-red-500 text-white shadow",
        "in-progress":
          "border-transparent bg-blue-500 text-white shadow",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div
        className={cn(badgeVariants({ variant }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
