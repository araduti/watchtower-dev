/**
 * evaluators/builtin/index.ts
 *
 * Barrel export of all built-in evaluator modules.
 * Each module is a self-contained evaluator with a slug and evaluate function.
 *
 * To add a new built-in evaluator:
 *   1. Create a new file in this directory following the EvaluatorModule contract
 *   2. Import and add it to the `builtinEvaluators` array below
 *   3. Reference its slug in ControlAssertion.evaluatorSlug
 */

import type { EvaluatorModule } from "../types.ts";

// ── CIS / Entra ID evaluators ────────────────────────────────────────────────
import idleSessionTimeout from "./idle-session-timeout.ts";
import praRequiresApproval from "./pra-requires-approval.ts";
import privilegedRoleAccessReviews from "./privileged-role-access-reviews-configured.ts";
import guestAccessReviews from "./guest-access-reviews-configured.ts";
import pimUsedForPrivilegedRoles from "./pim-used-for-privileged-roles.ts";
import onpremPasswordProtection from "./onprem-password-protection-enabled.ts";
import customBannedPasswords from "./custom-banned-passwords-enabled.ts";
import b2bAllowedDomainsOnly from "./b2b-allowed-domains-only.ts";
import dynamicGuestGroup from "./dynamic-guest-group-exists.ts";
import personalDeviceEnrollment from "./personal-device-enrollment-blocked.ts";

// ── Teams evaluators ─────────────────────────────────────────────────────────
import teamsSecurityReporting from "./teams-security-reporting-enabled.ts";
import teamsUnmanagedInbound from "./teams-unmanaged-inbound-disabled.ts";
import teamsUnmanagedAccess from "./teams-unmanaged-access-disabled.ts";
import teamsExternalAccess from "./teams-external-access-restricted.ts";

// ── Exchange / transport evaluators ──────────────────────────────────────────
import noDomainWhitelisting from "./no-domain-whitelisting-transport-rules.ts";
import noExternalForwarding from "./no-external-forwarding-transport-rules.ts";

// ── DNS evaluators ───────────────────────────────────────────────────────────
import dmarcPublished from "./dmarc-published.ts";
import spfRecordsPublished from "./spf-records-published.ts";
import dmarcReject from "./dmarc-reject.ts";
import dmarcCisaContact from "./dmarc-cisa-contact.ts";

// ── ScubaGear evaluators ─────────────────────────────────────────────────────
import calendarSharingRestricted from "./calendar-sharing-restricted.ts";
import userConsentRestricted from "./user-consent-restricted.ts";
import presetPoliciesEnabled from "./preset-policies-enabled.ts";
import scubagearStubs from "./scubagear-stubs.ts";
import cisM365Stubs from "./cis-m365-stubs.ts";

/**
 * All built-in evaluator modules. The registry loads these and indexes
 * them by slug for O(1) lookup during evaluation.
 */
export const builtinEvaluators: EvaluatorModule[] = [
  // CIS / Entra ID
  idleSessionTimeout,
  praRequiresApproval,
  privilegedRoleAccessReviews,
  guestAccessReviews,
  pimUsedForPrivilegedRoles,
  onpremPasswordProtection,
  customBannedPasswords,
  b2bAllowedDomainsOnly,
  dynamicGuestGroup,
  personalDeviceEnrollment,

  // Teams
  teamsSecurityReporting,
  teamsUnmanagedInbound,
  teamsUnmanagedAccess,
  teamsExternalAccess,

  // Exchange / transport
  noDomainWhitelisting,
  noExternalForwarding,

  // DNS
  dmarcPublished,
  spfRecordsPublished,
  dmarcReject,
  dmarcCisaContact,

  // ScubaGear
  calendarSharingRestricted,
  userConsentRestricted,
  presetPoliciesEnabled,

  // ScubaGear stubs (not yet implemented)
  ...scubagearStubs,

  // CIS M365 custom evaluator stubs (not yet implemented)
  ...cisM365Stubs,
];
