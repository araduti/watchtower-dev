"use client";

/**
 * Top navigation bar for the Watchtower dashboard.
 * Top-nav bias — no heavy left sidebars. Sleek horizontal navigation
 * with breadcrumbs, scope switcher, and ⌘K command menu trigger.
 */

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  AlertTriangle,
  Scan,
  Building2,
  Users,
  ScrollText,
  Settings,
  Search,
  Layers,
  LogOut,
} from "lucide-react";
import {
  Button,
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  Separator,
} from "@watchtower/ui";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/findings", label: "Findings", icon: AlertTriangle },
  { href: "/dashboard/scans", label: "Scans", icon: Scan },
  { href: "/dashboard/tenants", label: "Tenants", icon: Building2 },
  { href: "/dashboard/frameworks", label: "Frameworks", icon: Layers },
  { href: "/dashboard/audit", label: "Audit Log", icon: ScrollText },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const session = authClient.useSession();

  const user = session.data?.user;
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email
      ? user.email[0].toUpperCase()
      : "W";

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 glass">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex items-center shrink-0 hover:opacity-80 transition-opacity"
        >
          <Image
            src="/logo.png"
            alt="Watchtower"
            width={28}
            height={28}
            priority
          />
        </Link>

        <Separator orientation="vertical" className="h-6" />

        {/* Navigation links */}
        <nav className="flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right side: command menu trigger + user */}
        <div className="ml-auto flex items-center gap-2">
          {/* ⌘K trigger */}
          <Button
            variant="outline"
            size="sm"
            className="hidden md:flex items-center gap-2 text-muted-foreground border-border/40"
            onClick={() => {
              document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true }),
              );
            }}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="text-xs">Search</span>
            <kbd className="pointer-events-none ml-2 inline-flex h-5 select-none items-center gap-0.5 rounded border border-border/40 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </Button>

          {/* Settings */}
          <Link href="/dashboard/settings">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>

          {/* User avatar dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-2xl">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {user?.email ?? "My Account"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/members">
                  <Users className="mr-2 h-4 w-4" />
                  Members
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
