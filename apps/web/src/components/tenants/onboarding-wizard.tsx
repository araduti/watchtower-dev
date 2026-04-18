"use client";

/**
 * Tenant Onboarding Wizard — Multi-step guided setup flow.
 *
 * Step 1: Create Tenant (register in workspace)
 * Step 2: Authorize & Configure (set credentials or admin consent)
 * Step 3: Verify Connection (health check + next actions)
 *
 * All data access goes through tRPC. Every mutation includes an idempotencyKey.
 * Error handling uses Layer 2 error codes per API-Conventions.
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  KeyRound,
  ShieldCheck,
  AlertTriangle,
  Check,
  X,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Lock,
  Globe,
} from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { InteractiveButton } from "@/components/shared/interactive-button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type WizardStep = 1 | 2 | 3;
type AuthMethod = "CLIENT_SECRET" | "WORKLOAD_IDENTITY";

/**
 * Delay (ms) before resetting wizard state after the dialog close animation.
 * Matches the default Radix Dialog exit animation duration (200ms) so the user
 * doesn't see a flash of the reset Step 1 form while the dialog is fading out.
 */
const DIALOG_CLOSE_RESET_DELAY_MS = 200;

interface OnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Step metadata                                                      */
/* ------------------------------------------------------------------ */

const STEPS = [
  { number: 1 as const, title: "Create Tenant", description: "Register your M365 environment" },
  { number: 2 as const, title: "Authorize & Configure", description: "Set up Azure credentials" },
  { number: 3 as const, title: "Verify Connection", description: "Confirm everything works" },
] as const;

/* ------------------------------------------------------------------ */
/*  Stepper indicator                                                  */
/* ------------------------------------------------------------------ */

function StepperIndicator({ currentStep }: { currentStep: WizardStep }) {
  return (
    <div className="flex items-center justify-center gap-0 px-4 py-2">
      {STEPS.map((step, idx) => {
        const isActive = step.number === currentStep;
        const isCompleted = step.number < currentStep;
        const isPending = step.number > currentStep;

        return (
          <div key={step.number} className="flex items-center">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300",
                  isCompleted &&
                    "bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/40",
                  isActive &&
                    "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]",
                  isPending &&
                    "bg-muted/30 text-muted-foreground/50 ring-1 ring-border/30",
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  step.number
                )}
              </div>
              <div className="text-center">
                <p
                  className={cn(
                    "text-xs font-medium transition-colors duration-300",
                    isActive && "text-emerald-300",
                    isCompleted && "text-muted-foreground",
                    isPending && "text-muted-foreground/50",
                  )}
                >
                  {step.title}
                </p>
                <p
                  className={cn(
                    "text-[10px] transition-colors duration-300 hidden sm:block",
                    isActive && "text-muted-foreground",
                    (isCompleted || isPending) && "text-muted-foreground/40",
                  )}
                >
                  {step.description}
                </p>
              </div>
            </div>

            {/* Connector line (not after last step) */}
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-3 mt-[-24px] h-[2px] w-12 rounded-full transition-colors duration-500 sm:w-16",
                  step.number < currentStep
                    ? "bg-emerald-500/60"
                    : "bg-border/20",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1: Create Tenant                                              */
/* ------------------------------------------------------------------ */

function StepCreateTenant({
  onCreated,
}: {
  onCreated: (tenantId: string) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [msTenantId, setMsTenantId] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("CLIENT_SECRET");
  const [selectedScopeId, setSelectedScopeId] = useState("");

  const { data: scopeData } = trpc.scope.list.useQuery({ limit: 100 });
  const scopes = (scopeData?.items ?? []) as Array<{ id: string; name: string }>;

  const createMutation = trpc.tenant.create.useMutation({
    onSuccess: (tenant) => {
      onCreated(tenant.id);
    },
    onError: () => {
      // Errors are displayed inline via createMutation.error — no additional handling needed.
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      createMutation.mutate({
        idempotencyKey: crypto.randomUUID(),
        displayName: displayName.trim(),
        msTenantId: msTenantId.trim(),
        authMethod,
        scopeId: selectedScopeId,
      });
    },
    [createMutation, displayName, msTenantId, authMethod, selectedScopeId],
  );

  const isValid = displayName.trim() && msTenantId.trim() && selectedScopeId;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 px-1">
      {/* Display Name */}
      <div className="space-y-2">
        <label
          htmlFor="wiz-tenant-name"
          className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
        >
          Display Name
        </label>
        <Input
          id="wiz-tenant-name"
          placeholder="e.g. Contoso Production"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoFocus
        />
      </div>

      {/* M365 Tenant ID */}
      <div className="space-y-2">
        <label
          htmlFor="wiz-ms-tenant-id"
          className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
        >
          M365 Tenant ID
        </label>
        <Input
          id="wiz-ms-tenant-id"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          value={msTenantId}
          onChange={(e) => setMsTenantId(e.target.value)}
          className="font-mono text-sm"
        />
      </div>

      {/* Auth Method */}
      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          Auth Method
        </label>
        <Select
          value={authMethod}
          onValueChange={(v) => setAuthMethod(v as AuthMethod)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CLIENT_SECRET">Client Secret</SelectItem>
            <SelectItem value="WORKLOAD_IDENTITY">Workload Identity</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Scope */}
      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          Scope
        </label>
        <Select value={selectedScopeId} onValueChange={setSelectedScopeId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a scope…" />
          </SelectTrigger>
          <SelectContent>
            {scopes.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {scopes.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No scopes available.{" "}
            <a
              href="/dashboard/scopes"
              className="underline text-primary hover:text-primary/80"
            >
              Create a scope
            </a>{" "}
            first.
          </p>
        )}
      </div>

      {/* Error display */}
      {createMutation.error && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{createMutation.error.message}</span>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end pt-2">
        <InteractiveButton
          type="submit"
          disabled={!isValid}
          loading={createMutation.isPending}
          loadingText="Creating…"
          icon={<ArrowRight className="h-4 w-4" />}
        >
          Create & Continue
        </InteractiveButton>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2: Authorize & Configure                                      */
/* ------------------------------------------------------------------ */

function StepAuthorize({
  tenantId,
  onComplete,
  onSkip,
  onBack,
}: {
  tenantId: string;
  onComplete: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const consentUrlQuery = trpc.tenant.getConsentUrl.useQuery(
    { tenantId },
    { enabled: !!tenantId, retry: false },
  );

  const credentialsMutation = trpc.tenant.setCredentials.useMutation({
    onSuccess: () => {
      onComplete();
    },
    onError: (err) => {
      const errorData = err.data as Record<string, unknown> | undefined;
      const cause = errorData?.cause as Record<string, unknown> | undefined;
      switch (cause?.errorCode) {
        case "WATCHTOWER:TENANT:NOT_FOUND":
          setFormError("Tenant no longer exists.");
          break;
        case "WATCHTOWER:TENANT:INVALID_CREDENTIALS":
          setFormError(
            "The provided credentials are invalid. Please check and try again.",
          );
          break;
        default:
          setFormError(err.message);
      }
    },
  });

  const handleCredentialsSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      if (!clientId.trim() || !clientSecret.trim()) {
        setFormError("Both Client ID and Client Secret are required.");
        return;
      }

      credentialsMutation.mutate({
        idempotencyKey: crypto.randomUUID(),
        tenantId,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
    },
    [credentialsMutation, tenantId, clientId, clientSecret],
  );

  return (
    <div className="space-y-5 px-1">
      {/* Info banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-border/20 bg-muted/10 px-4 py-3">
        <Building2 className="h-5 w-5 shrink-0 text-muted-foreground/60" />
        <div className="min-w-0">
          <p className="text-sm text-foreground">Tenant created successfully</p>
          <p className="text-xs font-mono text-muted-foreground truncate">
            {tenantId}
          </p>
        </div>
        <Badge variant="compliant" className="shrink-0 ml-auto">
          Created
        </Badge>
      </div>

      {/* Two credential options side-by-side */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Option 1: Manual Credentials */}
        <div className="rounded-2xl border border-border/20 bg-muted/5 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground/60" />
            <h4 className="text-sm font-semibold text-foreground">
              Manual Credentials
            </h4>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Enter your Azure AD application Client ID and Client Secret
            directly.
          </p>

          <form onSubmit={handleCredentialsSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="wiz-client-id"
                className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60"
              >
                Client ID
              </label>
              <Input
                id="wiz-client-id"
                type="text"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="wiz-client-secret"
                className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60"
              >
                Client Secret
              </label>
              <Input
                id="wiz-client-secret"
                type="password"
                placeholder="••••••••••••••••"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
            <InteractiveButton
              type="submit"
              size="sm"
              className="w-full"
              loading={credentialsMutation.isPending}
              loadingText="Saving…"
              icon={<Lock className="h-3.5 w-3.5" />}
              disabled={!clientId.trim() || !clientSecret.trim()}
            >
              Save Credentials
            </InteractiveButton>
          </form>
        </div>

        {/* Option 2: Azure Admin Consent */}
        <div className="rounded-2xl border border-border/20 bg-muted/5 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground/60" />
            <h4 className="text-sm font-semibold text-foreground">
              Azure Admin Consent
            </h4>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Authorize via Azure AD admin consent flow, then enter your
            credentials.
          </p>

          <div className="space-y-3">
            {consentUrlQuery.data?.url ? (
              <a
                href={consentUrlQuery.data.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex w-full items-center justify-center gap-2 rounded-2xl",
                  "bg-blue-500/10 px-4 py-2.5 text-sm font-medium text-blue-400",
                  "transition-colors hover:bg-blue-500/20 hover:text-blue-300",
                  "ring-1 ring-blue-500/20",
                )}
              >
                <ExternalLink className="h-4 w-4" />
                Authorize in Azure
              </a>
            ) : consentUrlQuery.isError ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300/80">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Azure AD consent is not configured. Enter credentials manually.
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-muted/10 px-4 py-2.5 text-sm text-muted-foreground/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading consent URL…
              </div>
            )}

            <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 px-3 py-2">
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                After granting consent in Azure, return here and enter your
                Client ID and Client Secret using the form on the left.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error display */}
      {formError && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onSkip}
          className="text-muted-foreground/60 hover:text-muted-foreground"
        >
          Skip for now — you can set up credentials later
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3: Verify Connection                                          */
/* ------------------------------------------------------------------ */

function StepVerifyConnection({
  tenantId,
  hasCredentials,
}: {
  tenantId: string;
  hasCredentials: boolean;
}) {
  const router = useRouter();

  const [connectionResult, setConnectionResult] = useState<{
    checked: boolean;
    connected: boolean;
    error: string | null;
  } | null>(null);

  const connectionQuery = trpc.tenant.checkConnection.useQuery(
    { tenantId },
    { enabled: false },
  );

  const checkConnection = useCallback(async () => {
    setConnectionResult(null);
    const result = await connectionQuery.refetch();
    if (result.data) {
      setConnectionResult({
        checked: true,
        connected: result.data.connected,
        error: result.data.error,
      });
    } else if (result.error) {
      setConnectionResult({
        checked: true,
        connected: false,
        error: result.error.message,
      });
    }
  }, [connectionQuery]);

  // Auto-check connection on mount if credentials were provided
  useEffect(() => {
    if (hasCredentials) {
      void checkConnection();
    }
  }, [hasCredentials, checkConnection]);

  const isChecking = connectionQuery.isFetching;
  const isConnected = connectionResult?.connected === true;
  const hasFailed = connectionResult?.checked === true && !connectionResult.connected;

  return (
    <div className="space-y-6 px-1">
      {/* Connection status display */}
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-2xl border px-6 py-10 text-center transition-all duration-500",
          isChecking && "border-border/20 bg-muted/5",
          isConnected && "border-emerald-500/20 bg-emerald-500/5",
          hasFailed && "border-red-500/20 bg-red-500/5",
          !connectionResult && !isChecking && "border-border/20 bg-muted/5",
        )}
      >
        {/* Checking state */}
        {isChecking && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/20 ring-2 ring-border/20">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Verifying connection…
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Testing connectivity to your M365 tenant
              </p>
            </div>
          </>
        )}

        {/* Connected state */}
        {!isChecking && isConnected && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <ShieldCheck className="h-7 w-7 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-300">
                Connection verified!
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                You&apos;re ready to run your first compliance scan.
              </p>
            </div>
          </>
        )}

        {/* Failed state */}
        {!isChecking && hasFailed && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 ring-2 ring-red-500/40">
              <X className="h-7 w-7 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-300">
                Connection failed
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                {connectionResult.error ??
                  "Unable to reach the tenant. Check your credentials and try again."}
              </p>
            </div>
            <InteractiveButton
              variant="outline"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void checkConnection()}
              loading={isChecking}
              loadingText="Retrying…"
            >
              Retry
            </InteractiveButton>
          </>
        )}

        {/* No credentials — skipped step 2 */}
        {!isChecking && !connectionResult && !hasCredentials && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 ring-2 ring-amber-500/20">
              <KeyRound className="h-7 w-7 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-300">
                Credentials not configured
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Set up credentials on the tenant detail page to enable scanning.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <InteractiveButton
          icon={<Building2 className="h-4 w-4" />}
          onClick={() => router.push(`/dashboard/tenants/${tenantId}`)}
        >
          Go to Tenant
        </InteractiveButton>
        {isConnected && (
          <InteractiveButton
            variant="outline"
            icon={<ShieldCheck className="h-4 w-4" />}
            onClick={() =>
              router.push(`/dashboard/tenants/${tenantId}?trigger_scan=true`)
            }
          >
            Trigger First Scan
          </InteractiveButton>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Wizard Component                                              */
/* ------------------------------------------------------------------ */

export function OnboardingWizard({ open, onOpenChange }: OnboardingWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);
  const [credentialsProvided, setCredentialsProvided] = useState(false);

  const utils = trpc.useUtils();

  // Reset all state when dialog closes
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        // Allow closing animation to complete before resetting
        setTimeout(() => {
          setStep(1);
          setCreatedTenantId(null);
          setCredentialsProvided(false);
        }, DIALOG_CLOSE_RESET_DELAY_MS);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  // Step 1 → Step 2: tenant was created
  const handleTenantCreated = useCallback(
    (tenantId: string) => {
      setCreatedTenantId(tenantId);
      utils.tenant.list.invalidate();
      setStep(2);
    },
    [utils],
  );

  // Step 2 → Step 3: credentials saved
  const handleCredentialsComplete = useCallback(() => {
    setCredentialsProvided(true);
    setStep(3);
  }, []);

  // Step 2 → Step 3: skipped credentials
  const handleSkipCredentials = useCallback(() => {
    setCredentialsProvided(false);
    setStep(3);
  }, []);

  // Step 2 → Step 1: go back (only if tenant was just created — allows re-try)
  const handleBackToCreate = useCallback(() => {
    setStep(1);
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-emerald-500/10">
              <Building2 className="h-4 w-4 text-emerald-400" />
            </div>
            Connect Tenant
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Walk through the setup to connect a Microsoft 365 tenant for
            compliance monitoring.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="border-y border-border/10 bg-muted/5 px-6 py-4">
          <StepperIndicator currentStep={step} />
        </div>

        {/* Step Content */}
        <div className="px-6 py-6 min-h-[320px]">
          {step === 1 && (
            <StepCreateTenant onCreated={handleTenantCreated} />
          )}
          {step === 2 && createdTenantId && (
            <StepAuthorize
              tenantId={createdTenantId}
              onComplete={handleCredentialsComplete}
              onSkip={handleSkipCredentials}
              onBack={handleBackToCreate}
            />
          )}
          {step === 3 && createdTenantId && (
            <StepVerifyConnection
              tenantId={createdTenantId}
              hasCredentials={credentialsProvided}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
