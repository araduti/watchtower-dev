-- Extend ControlAssertion so each row is fully self-describing for the engine.
-- Multi-property checks (CIS "also:") and custom evaluators no longer require
-- splitting into multiple Checks.

ALTER TABLE "ControlAssertion"
  ADD COLUMN "source"               TEXT,
  ADD COLUMN "property"             TEXT,
  ADD COLUMN "assertionLogic"       TEXT    NOT NULL DEFAULT 'ALL',
  ADD COLUMN "evaluatorSlug"        TEXT,
  ADD COLUMN "additionalAssertions" JSONB,
  ADD COLUMN "nestedFind"           JSONB;
