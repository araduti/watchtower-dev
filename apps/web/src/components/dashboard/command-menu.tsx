"use client";

/**
 * Global command menu (⌘K) — powered by cmdk (shadcn/ui Command).
 * Provides quick navigation across the Watchtower dashboard.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Search as SearchIcon,
  LayoutDashboard,
  AlertTriangle,
  Scan,
  Building2,
  Users,
  Lock,
  ScrollText,
  Settings,
  Layers,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@watchtower/ui";

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const navigate = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search Watchtower..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => navigate("/dashboard")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
            <CommandShortcut>⌘D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/dashboard/findings")}>
            <AlertTriangle className="mr-2 h-4 w-4" />
            Findings
            <CommandShortcut>⌘F</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/dashboard/scans")}>
            <Scan className="mr-2 h-4 w-4" />
            Scans
          </CommandItem>
          <CommandItem onSelect={() => navigate("/dashboard/tenants")}>
            <Building2 className="mr-2 h-4 w-4" />
            Tenants
          </CommandItem>
          <CommandItem onSelect={() => navigate("/dashboard/frameworks")}>
            <Layers className="mr-2 h-4 w-4" />
            Frameworks
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Management">
          <CommandItem onSelect={() => navigate("/dashboard/members")}>
            <Users className="mr-2 h-4 w-4" />
            Members
          </CommandItem>
          <CommandItem onSelect={() => navigate("/dashboard/roles")}>
            <Lock className="mr-2 h-4 w-4" />
            Roles
          </CommandItem>
          <CommandItem onSelect={() => navigate("/dashboard/audit")}>
            <ScrollText className="mr-2 h-4 w-4" />
            Audit Log
          </CommandItem>
          <CommandItem onSelect={() => navigate("/dashboard/settings")}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => navigate("/dashboard/scans")}>
            <Shield className="mr-2 h-4 w-4" />
            Trigger Scan
          </CommandItem>
          <CommandItem onSelect={() => navigate("/dashboard/findings")}>
            <SearchIcon className="mr-2 h-4 w-4" />
            Search Findings...
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
