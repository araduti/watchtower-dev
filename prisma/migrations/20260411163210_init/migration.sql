-- CreateEnum
CREATE TYPE "ScopeIsolationMode" AS ENUM ('SOFT', 'STRICT');

-- CreateEnum
CREATE TYPE "TenantAuthMethod" AS ENUM ('CLIENT_SECRET', 'WORKLOAD_IDENTITY');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CheckSource" AS ENUM ('BUILTIN', 'PLUGIN');

-- CreateEnum
CREATE TYPE "PluginRepoStatus" AS ENUM ('ACTIVE', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ACCEPTED_RISK', 'RESOLVED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "FindingVisibility" AS ENUM ('DEFAULT', 'MUTED');

-- CreateEnum
CREATE TYPE "ObservationResult" AS ENUM ('PASS', 'FAIL', 'ERROR', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ScanTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'WEBHOOK', 'API');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScopeApplicability" AS ENUM ('WORKSPACE_ONLY', 'SCOPE_ONLY', 'BOTH');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'API_TOKEN', 'PLUGIN');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "betterAuthOrgId" TEXT NOT NULL,
    "scopeIsolationMode" "ScopeIsolationMode" NOT NULL DEFAULT 'SOFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scope" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentScopeId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Scope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "msTenantId" TEXT NOT NULL,
    "encryptedCredentials" BYTEA NOT NULL,
    "authMethod" "TenantAuthMethod" NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Check" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "remediation" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "severityRank" INTEGER NOT NULL,
    "source" "CheckSource" NOT NULL DEFAULT 'BUILTIN',
    "pluginRepoId" TEXT,
    "graphScopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginRepo" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "githubRepo" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncSha" TEXT,
    "status" "PluginRepoStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginRepo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Framework" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Framework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckFrameworkMapping" (
    "checkSlug" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "controlTitle" TEXT NOT NULL,

    CONSTRAINT "CheckFrameworkMapping_pkey" PRIMARY KEY ("checkSlug","frameworkId","controlId")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "checkSlug" TEXT NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "visibility" "FindingVisibility" NOT NULL DEFAULT 'DEFAULT',
    "severity" "Severity" NOT NULL,
    "severityRank" INTEGER NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "regressionFromResolvedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedBy" TEXT,
    "acceptanceReason" TEXT,
    "acceptanceExpiresAt" TIMESTAMP(3),
    "mutedAt" TIMESTAMP(3),
    "mutedBy" TEXT,
    "mutedUntil" TIMESTAMP(3),
    "assignedTo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "result" "ObservationResult" NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "triggeredBy" "ScanTrigger" NOT NULL,
    "triggeredByUserId" TEXT,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "checksRun" INTEGER NOT NULL DEFAULT 0,
    "checksFailed" INTEGER NOT NULL DEFAULT 0,
    "inngestRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scopeApplicability" "ScopeApplicability" NOT NULL,
    "assignableToCustomRoles" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isAssignable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionKey")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipRole" (
    "membershipId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "MembershipRole_pkey" PRIMARY KEY ("membershipId","roleId")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorIp" TEXT,
    "actorUserAgent" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "eventData" JSONB NOT NULL,
    "prevHash" TEXT NOT NULL,
    "rowHash" TEXT NOT NULL,
    "chainSequence" INTEGER NOT NULL,
    "signature" TEXT NOT NULL,
    "signingKeyId" TEXT NOT NULL,
    "traceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditSigningKey" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'ed25519',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "AuditSigningKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditAccessLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorIp" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "traceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseBody" JSONB NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_betterAuthOrgId_key" ON "Workspace"("betterAuthOrgId");

-- CreateIndex
CREATE INDEX "Workspace_deletedAt_idx" ON "Workspace"("deletedAt");

-- CreateIndex
CREATE INDEX "Scope_workspaceId_deletedAt_idx" ON "Scope"("workspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "Scope_parentScopeId_idx" ON "Scope"("parentScopeId");

-- CreateIndex
CREATE UNIQUE INDEX "Scope_workspaceId_slug_key" ON "Scope"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "Tenant_workspaceId_scopeId_deletedAt_idx" ON "Tenant"("workspaceId", "scopeId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_workspaceId_msTenantId_key" ON "Tenant"("workspaceId", "msTenantId");

-- CreateIndex
CREATE INDEX "Check_slug_idx" ON "Check"("slug");

-- CreateIndex
CREATE INDEX "Check_source_pluginRepoId_idx" ON "Check"("source", "pluginRepoId");

-- CreateIndex
CREATE UNIQUE INDEX "Check_slug_version_key" ON "Check"("slug", "version");

-- CreateIndex
CREATE INDEX "PluginRepo_workspaceId_idx" ON "PluginRepo"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginRepo_workspaceId_githubRepo_key" ON "PluginRepo"("workspaceId", "githubRepo");

-- CreateIndex
CREATE UNIQUE INDEX "Framework_slug_key" ON "Framework"("slug");

-- CreateIndex
CREATE INDEX "CheckFrameworkMapping_frameworkId_idx" ON "CheckFrameworkMapping"("frameworkId");

-- CreateIndex
CREATE INDEX "CheckFrameworkMapping_checkSlug_idx" ON "CheckFrameworkMapping"("checkSlug");

-- CreateIndex
CREATE INDEX "Finding_workspaceId_scopeId_status_severityRank_firstSeenAt_idx" ON "Finding"("workspaceId", "scopeId", "status", "severityRank" DESC, "firstSeenAt");

-- CreateIndex
CREATE INDEX "Finding_workspaceId_status_idx" ON "Finding"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Finding_tenantId_status_idx" ON "Finding"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Finding_assignedTo_idx" ON "Finding"("assignedTo");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_tenantId_checkSlug_key" ON "Finding"("tenantId", "checkSlug");

-- CreateIndex
CREATE INDEX "Observation_workspaceId_scopeId_observedAt_idx" ON "Observation"("workspaceId", "scopeId", "observedAt");

-- CreateIndex
CREATE INDEX "Observation_findingId_observedAt_idx" ON "Observation"("findingId", "observedAt");

-- CreateIndex
CREATE INDEX "Observation_scanId_idx" ON "Observation"("scanId");

-- CreateIndex
CREATE INDEX "Scan_workspaceId_scopeId_createdAt_idx" ON "Scan"("workspaceId", "scopeId", "createdAt");

-- CreateIndex
CREATE INDEX "Scan_tenantId_createdAt_idx" ON "Scan"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Scan_status_idx" ON "Scan"("status");

-- CreateIndex
CREATE INDEX "Role_workspaceId_idx" ON "Role"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_workspaceId_slug_key" ON "Role"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "RolePermission_permissionKey_idx" ON "RolePermission"("permissionKey");

-- CreateIndex
CREATE INDEX "Membership_workspaceId_userId_idx" ON "Membership"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "Membership_scopeId_idx" ON "Membership"("scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_workspaceId_scopeId_key" ON "Membership"("userId", "workspaceId", "scopeId");

-- CreateIndex
CREATE INDEX "MembershipRole_roleId_idx" ON "MembershipRole"("roleId");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_occurredAt_idx" ON "AuditEvent"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_targetType_targetId_idx" ON "AuditEvent"("workspaceId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_actorType_actorId_idx" ON "AuditEvent"("workspaceId", "actorType", "actorId");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_eventType_idx" ON "AuditEvent"("workspaceId", "eventType");

-- CreateIndex
CREATE INDEX "AuditEvent_traceId_idx" ON "AuditEvent"("traceId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_workspaceId_chainSequence_key" ON "AuditEvent"("workspaceId", "chainSequence");

-- CreateIndex
CREATE INDEX "AuditSigningKey_retiredAt_idx" ON "AuditSigningKey"("retiredAt");

-- CreateIndex
CREATE INDEX "AuditAccessLog_workspaceId_occurredAt_idx" ON "AuditAccessLog"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditAccessLog_workspaceId_resourceType_resourceId_idx" ON "AuditAccessLog"("workspaceId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditAccessLog_workspaceId_actorType_actorId_idx" ON "AuditAccessLog"("workspaceId", "actorType", "actorId");

-- CreateIndex
CREATE INDEX "AuditAccessLog_traceId_idx" ON "AuditAccessLog"("traceId");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_workspaceId_key_key" ON "IdempotencyKey"("workspaceId", "key");

-- AddForeignKey
ALTER TABLE "Scope" ADD CONSTRAINT "Scope_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scope" ADD CONSTRAINT "Scope_parentScopeId_fkey" FOREIGN KEY ("parentScopeId") REFERENCES "Scope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_pluginRepoId_fkey" FOREIGN KEY ("pluginRepoId") REFERENCES "PluginRepo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginRepo" ADD CONSTRAINT "PluginRepo_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckFrameworkMapping" ADD CONSTRAINT "CheckFrameworkMapping_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckFrameworkMapping" ADD CONSTRAINT "CheckFrameworkMapping_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "Check"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "Permission"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_signingKeyId_fkey" FOREIGN KEY ("signingKeyId") REFERENCES "AuditSigningKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditAccessLog" ADD CONSTRAINT "AuditAccessLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditAccessLog" ADD CONSTRAINT "AuditAccessLog_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
