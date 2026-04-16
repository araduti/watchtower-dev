"use client";

/**
 * OpenPolicy — Compliance-appropriate consent banner.
 * Registry: openpolicy.sh
 *
 * GDPR/CCPA-ready consent banner for compliance platforms.
 * Cookie consent with granular controls and privacy policy link.
 */

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@watchtower/ui";
import { cn } from "@/lib/utils";

interface ConsentBannerProps {
  /** Privacy policy URL */
  privacyPolicyUrl?: string;
  /** Called when user accepts all */
  onAcceptAll?: () => void;
  /** Called when user rejects non-essential */
  onRejectNonEssential?: () => void;
  /** Called when banner is dismissed */
  onDismiss?: () => void;
  className?: string;
}

const CONSENT_KEY = "watchtower-consent";

/** OpenPolicy consent banner for compliance platforms */
export function ConsentBanner({
  privacyPolicyUrl = "/privacy",
  onAcceptAll,
  onRejectNonEssential,
  onDismiss,
  className,
}: ConsentBannerProps) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      setVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ essential: true, analytics: true, timestamp: Date.now() }));
    setVisible(false);
    onAcceptAll?.();
  };

  const handleRejectNonEssential = () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ essential: true, analytics: false, timestamp: Date.now() }));
    setVisible(false);
    onRejectNonEssential?.();
  };

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 glass-card p-4 animate-fade-in-up",
        className,
      )}
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm text-foreground">
            Watchtower uses essential cookies for authentication and session management.
            Optional analytics cookies help us improve the platform.{" "}
            <a
              href={privacyPolicyUrl}
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Privacy Policy
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={handleRejectNonEssential}>
            Essential Only
          </Button>
          <Button size="sm" onClick={handleAcceptAll}>
            Accept All
          </Button>
          <button
            onClick={handleDismiss}
            className="ml-1 rounded-xl p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface TermsAcceptanceProps {
  /** Terms text or URL */
  termsUrl?: string;
  /** Privacy policy URL */
  privacyUrl?: string;
  /** Whether terms have been accepted */
  accepted: boolean;
  /** Called when acceptance changes */
  onAcceptedChange: (accepted: boolean) => void;
  className?: string;
}

/** OpenPolicy terms acceptance checkbox for forms */
export function TermsAcceptance({
  termsUrl = "/terms",
  privacyUrl = "/privacy",
  accepted,
  onAcceptedChange,
  className,
}: TermsAcceptanceProps) {
  return (
    <label
      className={cn("flex items-start gap-3 cursor-pointer group", className)}
    >
      <input
        type="checkbox"
        checked={accepted}
        onChange={(e) => onAcceptedChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border bg-transparent text-primary focus:ring-ring focus:ring-offset-0"
      />
      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
        I agree to the{" "}
        <a
          href={termsUrl}
          className="text-primary underline underline-offset-4 hover:text-primary/80"
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms of Service
        </a>{" "}
        and{" "}
        <a
          href={privacyUrl}
          className="text-primary underline underline-offset-4 hover:text-primary/80"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>
      </span>
    </label>
  );
}
