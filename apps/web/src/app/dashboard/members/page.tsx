"use client";

import { useState } from "react";
import { Users, UserPlus } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@watchtower/ui";
import { trpc } from "@/lib/trpc";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import { PageContainer } from "@/components/shared/layouts";
import { EmptyState, LoadingState } from "@/components/shared/empty-loading";
import { DataTable } from "@/components/shared/data-table";
import { CursorPagination } from "@/components/shared/pagination";
import { InteractiveButton } from "@/components/shared/interactive-button";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PAGE_SIZE = 25;

/**
 * Role slugs that are built-in to the system. These get the "secondary"
 * badge variant to visually distinguish them from user-created custom roles,
 * which receive the "outline" variant.
 */
const SYSTEM_ROLE_SLUGS = new Set(["owner", "admin", "member", "viewer"]);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Local member shape matching the tRPC router output.
 * Extends Record<string, unknown> to satisfy DataTable's generic constraint.
 *
 * NOTE: When a shared `RouterOutputs` utility type is added to `@/lib/trpc`,
 * replace this with `RouterOutputs['member']['list']['items'][number]`
 * intersected with `Record<string, unknown>`.
 */
interface MemberRole {
  id: string;
  name: string;
  slug: string;
}

interface Member extends Record<string, unknown> {
  id: string;
  userId: string;
  workspaceId: string;
  scopeId: string | null;
  roles: MemberRole[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const columns = [
  {
    key: "userId",
    header: "User ID",
    mono: true,
    render: (m: Member) => (
      <span
        className="font-medium text-foreground"
        title={m.userId}
      >
        {m.userId.slice(0, 8)}
      </span>
    ),
    minWidth: "120px",
  },
  {
    key: "scopeId",
    header: "Scope",
    mono: true,
    render: (m: Member) =>
      m.scopeId ? (
        <span className="text-muted-foreground" title={m.scopeId}>
          {m.scopeId.slice(0, 8)}
        </span>
      ) : (
        <span className="text-muted-foreground italic">Workspace-wide</span>
      ),
    minWidth: "140px",
  },
  {
    key: "roles",
    header: "Roles",
    render: (m: Member) => (
      <div className="flex flex-wrap items-center gap-1.5">
        {m.roles.map((role) => (
          <Badge
            key={role.id}
            variant={SYSTEM_ROLE_SLUGS.has(role.slug) ? "secondary" : "outline"}
          >
            {role.name}
          </Badge>
        ))}
      </div>
    ),
    minWidth: "180px",
  },
  {
    key: "createdAt",
    header: "Joined",
    render: (m: Member) => (
      <span className="text-muted-foreground">
        {new Date(m.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function MembersPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedScopeId, setSelectedScopeId] = useState("");

  /* ---- Pagination state ---- */
  const { cursor, hasPrevPage, goToNextPage, goToPrevPage } = useCursorPagination();

  const { data, isLoading, isError, error } = trpc.member.list.useQuery({
    limit: DEFAULT_PAGE_SIZE,
    cursor,
  });

  const members = (data?.items ?? []) as unknown as Member[];
  const nextCursor = data?.nextCursor ?? null;

  /* ---- Roles and scopes for invite dialog ---- */
  const { data: roleData } = trpc.role.list.useQuery({ limit: 100 });
  const roles = roleData?.items ?? [];
  const { data: scopeData } = trpc.scope.list.useQuery({ limit: 100 });
  const scopes = scopeData?.items ?? [];

  /* ---- Invite mutation ---- */
  const utils = trpc.useUtils();
  const inviteMutation = trpc.member.invite.useMutation({
    onSuccess: () => {
      utils.member.list.invalidate();
      setInviteOpen(false);
      setUserId("");
      setSelectedRoleId("");
      setSelectedScopeId("");
    },
  });

  /* ---- Header action: invite button ---- */
  const headerActions = (
    <InteractiveButton
      icon={<UserPlus className="h-4 w-4" />}
      onClick={() => setInviteOpen(true)}
    >
      Invite Member
    </InteractiveButton>
  );

  return (
    <PageContainer
      title="Members"
      description="Team members and workspace access"
      actions={headerActions}
    >
      {/* Loading skeleton */}
      {isLoading && <LoadingState rows={6} />}

      {/* Error state */}
      {isError && (
        <EmptyState
          icon={<Users className="h-10 w-10 text-red-400" />}
          title="Failed to load members"
          description={error?.message ?? "An unexpected error occurred."}
        />
      )}

      {/* Empty state — no members */}
      {!isLoading && !isError && members.length === 0 && (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No team members"
          description="Invite team members to collaborate on compliance management within this workspace."
        />
      )}

      {/* Data table */}
      {!isLoading && !isError && members.length > 0 && (
        <>
          <DataTable<Member>
            columns={columns}
            data={members}
            getKey={(m) => m.id}
          />
          <CursorPagination
            hasNextPage={nextCursor !== null}
            hasPrevPage={hasPrevPage}
            onNextPage={() => { if (nextCursor) goToNextPage(nextCursor); }}
            onPrevPage={goToPrevPage}
            isLoading={isLoading}
            className="mt-2"
          />
        </>
      )}
      {/* Invite Member Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Add a user to this workspace with a role assignment.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invite-user-id" className="text-sm font-medium">User ID</label>
              <Input
                id="invite-user-id"
                placeholder="User ID"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Role</label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role…" />
                </SelectTrigger>
                <SelectContent>
                  {(roles as Array<{ id: string; name: string; isAssignable: boolean }>).filter((r) => r.isAssignable).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Scope (optional)</label>
              <Select value={selectedScopeId} onValueChange={setSelectedScopeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Workspace-wide" />
                </SelectTrigger>
                <SelectContent>
                  {(scopes as Array<{ id: string; name: string }>).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inviteMutation.error && (
              <p className="text-sm text-red-400">{inviteMutation.error.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              disabled={!userId || !selectedRoleId || inviteMutation.isPending}
              onClick={() => inviteMutation.mutate({
                idempotencyKey: crypto.randomUUID(),
                userId,
                roleIds: [selectedRoleId],
                ...(selectedScopeId ? { scopeId: selectedScopeId } : {}),
              })}
            >
              {inviteMutation.isPending ? "Inviting…" : "Invite Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
