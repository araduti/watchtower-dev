"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { PageContainer } from "@/components/shared/layouts";
import { GlowCard } from "@/components/shared/glow-card";
import { LoadingState } from "@/components/shared/empty-loading";
import { Badge, Input } from "@watchtower/ui";
import { InteractiveButton } from "@/components/shared/interactive-button";
import { Settings, Shield, AlertTriangle, Check, X, Copy } from "lucide-react";
import { ClientDate } from "@/components/shared/client-date";

type IsolationMode = "SOFT" | "STRICT";

export default function SettingsPage() {
  const workspace = trpc.workspace.get.useQuery();

  const [nameInput, setNameInput] = useState("");
  const [nameInitialized, setNameInitialized] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Initialize name input when data loads
  useEffect(() => {
    if (workspace.data && !nameInitialized) {
      setNameInput(workspace.data.name);
      setNameInitialized(true);
    }
  }, [workspace.data, nameInitialized]);

  // Auto-clear feedback after 4 seconds
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const updateSettings = trpc.workspace.updateSettings.useMutation({
    onSuccess: () => {
      setFeedback({ type: "success", message: "Settings updated successfully." });
      workspace.refetch();
    },
    onError: (error) => {
      const errorCode = (error as { data?: { cause?: { errorCode?: string } } }).data?.cause
        ?.errorCode;
      switch (errorCode) {
        case "WATCHTOWER:WORKSPACE:NOT_FOUND":
          setFeedback({ type: "error", message: "Workspace not found." });
          break;
        case "WATCHTOWER:AUTH:FORBIDDEN":
          setFeedback({
            type: "error",
            message: "You do not have permission to update workspace settings.",
          });
          break;
        default:
          setFeedback({ type: "error", message: error.message });
      }
    },
  });

  function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === workspace.data?.name) return;
    updateSettings.mutate({
      idempotencyKey: crypto.randomUUID(),
      name: trimmed,
    });
  }

  function handleToggleIsolation() {
    if (!workspace.data) return;
    const newMode: IsolationMode =
      workspace.data.scopeIsolationMode === "SOFT" ? "STRICT" : "SOFT";
    updateSettings.mutate({
      idempotencyKey: crypto.randomUUID(),
      scopeIsolationMode: newMode,
    });
  }

  function handleCopyId() {
    if (!workspace.data) return;
    navigator.clipboard.writeText(workspace.data.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteWorkspace = trpc.workspace.softDelete.useMutation({
    onSuccess: () => {
      setFeedback({ type: "success", message: "Workspace deleted. Redirecting…" });
      // Redirect to root after a short delay
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    },
    onError: (error) => {
      const errorCode = (error as { data?: { cause?: { errorCode?: string } } }).data?.cause
        ?.errorCode;
      switch (errorCode) {
        case "WATCHTOWER:WORKSPACE:NOT_FOUND":
          setFeedback({ type: "error", message: "Workspace not found." });
          break;
        case "WATCHTOWER:WORKSPACE:ALREADY_DELETED":
          setFeedback({ type: "error", message: "Workspace has already been deleted." });
          break;
        default:
          setFeedback({ type: "error", message: error.message });
      }
      setShowDeleteConfirm(false);
    },
  });

  function handleDeleteWorkspace() {
    deleteWorkspace.mutate({
      idempotencyKey: crypto.randomUUID(),
    });
  }

  if (workspace.isLoading) {
    return (
      <PageContainer title="Settings" description="Workspace configuration">
        <LoadingState rows={6} />
      </PageContainer>
    );
  }

  if (workspace.isError || !workspace.data) {
    return (
      <PageContainer title="Settings" description="Workspace configuration">
        <GlowCard glow="red" className="p-6">
          <p className="text-red-400">
            Failed to load workspace settings. Please try again.
          </p>
        </GlowCard>
      </PageContainer>
    );
  }

  const data = workspace.data;
  const isSoft = data.scopeIsolationMode === "SOFT";

  return (
    <PageContainer
      title="Settings"
      description="Manage your workspace configuration and security policies"
      actions={
        <Badge variant={isSoft ? "compliant" : "high"}>
          {data.scopeIsolationMode} isolation
        </Badge>
      }
    >
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium ${
            feedback.type === "success"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          {feedback.type === "success" ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <X className="h-4 w-4 shrink-0" />
          )}
          {feedback.message}
        </div>
      )}

      <div className="space-y-6">
        {/* ── General Settings ─────────────────────────────── */}
        <GlowCard glow="blue" className="p-6">
          <div className="mb-5 flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold tracking-tight">
              General Settings
            </h2>
          </div>

          <div className="space-y-5">
            {/* Workspace Name */}
            <div className="space-y-2">
              <label
                htmlFor="workspace-name"
                className="text-sm font-medium text-muted-foreground"
              >
                Workspace Name
              </label>
              <div className="flex items-center gap-3">
                <Input
                  id="workspace-name"
                  value={nameInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNameInput(e.target.value)
                  }
                  placeholder="Workspace name"
                  className="max-w-sm rounded-2xl bg-background/50 backdrop-blur-sm border-border/40"
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") handleSaveName();
                  }}
                />
                <InteractiveButton
                  onClick={handleSaveName}
                  loading={updateSettings.isPending}
                  loadingText="Saving…"
                  disabled={
                    !nameInput.trim() || nameInput.trim() === data.name
                  }
                  variant="default"
                  className="rounded-2xl"
                >
                  Save
                </InteractiveButton>
              </div>
            </div>

            {/* Workspace ID */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Workspace ID
              </label>
              <div className="flex items-center gap-2">
                <code className="rounded-2xl bg-background/50 border border-border/40 px-3 py-2 font-mono text-sm text-muted-foreground select-all">
                  {data.id}
                </code>
                <button
                  onClick={handleCopyId}
                  className="rounded-2xl p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  title="Copy workspace ID"
                  type="button"
                >
                  {copiedId ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Created
                </p>
                <p className="font-mono text-sm"><ClientDate value={data.createdAt} variant="datetime" /></p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Last Updated
                </p>
                <p className="font-mono text-sm"><ClientDate value={data.updatedAt} variant="datetime" /></p>
              </div>
            </div>
          </div>
        </GlowCard>

        {/* ── Isolation Mode ──────────────────────────────── */}
        <GlowCard glow={isSoft ? "green" : "amber"} className="p-6">
          <div className="mb-5 flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold tracking-tight">
              Scope Isolation Mode
            </h2>
          </div>

          <div className="mb-5 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Current mode:</span>
            <Badge variant={isSoft ? "compliant" : "high"}>
              {data.scopeIsolationMode}
            </Badge>
          </div>

          <div className="mb-5 space-y-3 rounded-2xl bg-background/30 border border-border/20 p-4">
            <div className="flex items-start gap-3">
              <Badge variant="compliant" className="mt-0.5 shrink-0">
                SOFT
              </Badge>
              <p className="text-sm text-muted-foreground">
                Members can access resources across all scopes within the
                workspace. Suitable for small teams and single-entity
                organizations where full visibility is preferred.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="high" className="mt-0.5 shrink-0">
                STRICT
              </Badge>
              <p className="text-sm text-muted-foreground">
                Members can only access resources within their assigned scopes.
                Required for MSPs managing multiple customers or enterprises
                with regulatory data separation requirements.
              </p>
            </div>
          </div>

          <InteractiveButton
            onClick={handleToggleIsolation}
            loading={updateSettings.isPending}
            loadingText="Switching…"
            icon={<Shield className="h-4 w-4" />}
            variant={isSoft ? "default" : "secondary"}
            className="rounded-2xl"
          >
            Switch to {isSoft ? "STRICT" : "SOFT"} mode
          </InteractiveButton>
        </GlowCard>

        {/* ── Danger Zone ─────────────────────────────────── */}
        <GlowCard glow="red" className="p-6">
          <div className="mb-5 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <h2 className="text-lg font-semibold tracking-tight text-red-400">
              Danger Zone
            </h2>
          </div>

          <p className="mb-4 text-sm text-muted-foreground">
            Permanently delete this workspace and all associated data including
            scopes, tenants, findings, scans, and audit logs. This action
            cannot be undone.
          </p>

          {!showDeleteConfirm ? (
            <InteractiveButton
              variant="destructive"
              className="rounded-2xl"
              icon={<AlertTriangle className="h-4 w-4" />}
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Workspace
            </InteractiveButton>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-destructive font-medium">
                Are you sure? This cannot be undone.
              </span>
              <InteractiveButton
                variant="destructive"
                size="sm"
                className="rounded-2xl"
                onClick={handleDeleteWorkspace}
                loading={deleteWorkspace.isPending}
              >
                Confirm Delete
              </InteractiveButton>
              <InteractiveButton
                variant="outline"
                size="sm"
                className="rounded-2xl"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </InteractiveButton>
            </div>
          )}
        </GlowCard>
      </div>
    </PageContainer>
  );
}
