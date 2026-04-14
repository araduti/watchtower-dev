-- =============================================================================
-- Migration: Rename Observation → Evidence, CheckFrameworkMapping → Control
-- Add new models: ControlAssertion
-- Expand Check, Finding models
-- =============================================================================

-- 1. Rename Observation → Evidence
-- ---------------------------------
ALTER TABLE "Observation" RENAME TO "Evidence";

-- Rename the enum
ALTER TYPE "ObservationResult" RENAME TO "EvidenceResult";

-- Rename existing indexes
ALTER INDEX "Observation_pkey" RENAME TO "Evidence_pkey";
ALTER INDEX "Observation_workspaceId_scopeId_observedAt_idx" RENAME TO "Evidence_workspaceId_scopeId_observedAt_idx";
ALTER INDEX "Observation_findingId_observedAt_idx" RENAME TO "Evidence_findingId_observedAt_idx";
ALTER INDEX "Observation_scanId_idx" RENAME TO "Evidence_scanId_idx";

-- Rename foreign key constraints
ALTER TABLE "Evidence" RENAME CONSTRAINT "Observation_workspaceId_fkey" TO "Evidence_workspaceId_fkey";
ALTER TABLE "Evidence" RENAME CONSTRAINT "Observation_scopeId_fkey" TO "Evidence_scopeId_fkey";
ALTER TABLE "Evidence" RENAME CONSTRAINT "Observation_tenantId_fkey" TO "Evidence_tenantId_fkey";
ALTER TABLE "Evidence" RENAME CONSTRAINT "Observation_scanId_fkey" TO "Evidence_scanId_fkey";
ALTER TABLE "Evidence" RENAME CONSTRAINT "Observation_findingId_fkey" TO "Evidence_findingId_fkey";

-- Rename existing column: evidence → rawEvidence
ALTER TABLE "Evidence" RENAME COLUMN "evidence" TO "rawEvidence";

-- Add new columns to Evidence
ALTER TABLE "Evidence" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'AUTOMATED';
ALTER TABLE "Evidence" ADD COLUMN "value" JSONB;
ALTER TABLE "Evidence" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "Evidence" ADD COLUMN "fileName" TEXT;
ALTER TABLE "Evidence" ADD COLUMN "fileSize" INTEGER;
ALTER TABLE "Evidence" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "Evidence" ADD COLUMN "url" TEXT;
ALTER TABLE "Evidence" ADD COLUMN "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Evidence" ADD COLUMN "validUntil" TIMESTAMP(3);
ALTER TABLE "Evidence" ADD COLUMN "collectedBy" "ActorType" NOT NULL DEFAULT 'SYSTEM';
ALTER TABLE "Evidence" ADD COLUMN "collectedById" TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "Evidence" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "Evidence" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "Evidence" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Evidence" ADD COLUMN "reviewNotes" TEXT;

-- Create EvidenceType and ReviewStatus as proper enums
CREATE TYPE "EvidenceType" AS ENUM ('AUTOMATED', 'MANUAL', 'HYBRID');
CREATE TYPE "ReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- Convert text columns to proper enums
ALTER TABLE "Evidence" ALTER COLUMN "type" TYPE "EvidenceType" USING "type"::"EvidenceType";
ALTER TABLE "Evidence" ALTER COLUMN "reviewStatus" TYPE "ReviewStatus" USING "reviewStatus"::"ReviewStatus";

-- Remove collectedBy default (schema requires it explicitly)
ALTER TABLE "Evidence" ALTER COLUMN "collectedBy" DROP DEFAULT;
ALTER TABLE "Evidence" ALTER COLUMN "collectedById" DROP DEFAULT;

-- Update RLS policies for renamed table
-- Drop old policies (they reference "Observation")
DROP POLICY IF EXISTS observation_select ON "Evidence";
DROP POLICY IF EXISTS observation_insert ON "Evidence";

-- Re-create under new names
CREATE POLICY evidence_select ON "Evidence"
  FOR SELECT USING ("workspaceId" = current_setting('app.workspace_id', true));

CREATE POLICY evidence_insert ON "Evidence"
  FOR INSERT WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));

-- Ensure RLS stays enabled on renamed table
ALTER TABLE "Evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Evidence" FORCE ROW LEVEL SECURITY;

-- Update append-only trigger for Evidence
DROP TRIGGER IF EXISTS prevent_observation_mutation ON "Evidence";
CREATE TRIGGER prevent_evidence_mutation
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "Evidence"
  FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

-- Update REVOKE for renamed table (re-assert append-only)
REVOKE UPDATE, DELETE, TRUNCATE ON "Evidence" FROM watchtower_app;

-- 2. Rename CheckFrameworkMapping → Control
-- -------------------------------------------
ALTER TABLE "CheckFrameworkMapping" RENAME TO "Control";

-- Rename indexes
ALTER INDEX "CheckFrameworkMapping_pkey" RENAME TO "Control_pkey";
ALTER INDEX "CheckFrameworkMapping_frameworkId_idx" RENAME TO "Control_frameworkId_idx";
ALTER INDEX "CheckFrameworkMapping_checkSlug_idx" RENAME TO "Control_checkSlug_idx";

-- Rename foreign key constraints
ALTER TABLE "Control" RENAME CONSTRAINT "CheckFrameworkMapping_frameworkId_fkey" TO "Control_frameworkId_fkey";
ALTER TABLE "Control" RENAME CONSTRAINT "CheckFrameworkMapping_checkId_fkey" TO "Control_checkId_fkey";

-- Add new columns to Control
ALTER TABLE "Control" ADD COLUMN "classification" TEXT;
ALTER TABLE "Control" ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Control" ADD COLUMN "automated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Control" ADD COLUMN "evidenceRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Control" ADD COLUMN "assertionLogic" TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "Control" ADD COLUMN "description" TEXT;
ALTER TABLE "Control" ADD COLUMN "rationale" TEXT;
ALTER TABLE "Control" ADD COLUMN "remediation" TEXT;

-- 3. Create ControlAssertion table
-- ----------------------------------
CREATE TABLE "ControlAssertion" (
    "id" TEXT NOT NULL,
    "controlCheckSlug" TEXT NOT NULL,
    "controlFrameworkId" TEXT NOT NULL,
    "controlControlId" TEXT NOT NULL,
    "checkSlug" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "expectedValue" JSONB,
    "sourceFilter" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlAssertion_pkey" PRIMARY KEY ("id")
);

-- ControlAssertion FK → Control (composite)
ALTER TABLE "ControlAssertion" ADD CONSTRAINT "ControlAssertion_control_fkey"
    FOREIGN KEY ("controlCheckSlug", "controlFrameworkId", "controlControlId")
    REFERENCES "Control"("checkSlug", "frameworkId", "controlId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ControlAssertion_checkSlug_idx" ON "ControlAssertion"("checkSlug");
CREATE INDEX "ControlAssertion_controlCheckSlug_controlFrameworkId_contr_idx"
    ON "ControlAssertion"("controlCheckSlug", "controlFrameworkId", "controlControlId");

-- 4. Expand Check model
-- -----------------------
ALTER TABLE "Check" ADD COLUMN "dataSource" TEXT;
ALTER TABLE "Check" ADD COLUMN "property" TEXT;
ALTER TABLE "Check" ADD COLUMN "product" TEXT;
ALTER TABLE "Check" ADD COLUMN "connectors" TEXT[] DEFAULT '{}';
ALTER TABLE "Check" ADD COLUMN "allowedValues" JSONB;
ALTER TABLE "Check" ADD COLUMN "allowedOperators" TEXT[] DEFAULT '{}';

-- 5. Expand Finding model
-- -------------------------
ALTER TABLE "Finding" ADD COLUMN "latestEvidenceId" TEXT;
ALTER TABLE "Finding" ADD COLUMN "evidenceDueAt" TIMESTAMP(3);
