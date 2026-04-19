/**
 * CIS M365 stub evaluators — custom logic not yet implemented.
 *
 * These return transparent "not yet implemented" failures so scan results are
 * honest rather than silently wrong. Each stub will be replaced by a real
 * evaluator once we have the right connector data in scope.
 *
 * TODO — implement these evaluators:
 *   - authenticator-fatigue-protection  (MS Auth policy inspection)
 *   - dkim-enabled                      (Exchange DKIM config)
 *   - email-otp-disabled                (Entra ExternalIdentitiesPolicy)
 *   - entra-join-restricted             (Entra deviceRegistrationPolicy)
 *   - local-admin-assignment-restricted (Intune deviceEnrollmentConfig)
 *   - outlook-addins-blocked            (EWS policy / Org config)
 *   - system-preferred-mfa-enabled      (Entra auth methods policy)
 *   - third-party-storage-disabled      (OWA policy / M365 settings)
 *   - user-consent-disabled             (authorization policy consentPolicy)
 *   - users-cannot-register-apps        (user settings appRegistrations)
 *   - weak-auth-methods-disabled        (Entra auth methods policy)
 */

import type { EvaluatorModule } from "../types.ts";

function stub(slug: string, note?: string): EvaluatorModule {
  return {
    slug,
    evaluate: (_snapshot) => ({
      pass: false,
      warnings: [
        `CIS M365 evaluator "${slug}" not yet implemented${note ? ` — ${note}` : ""}`,
      ],
    }),
  };
}

const cisM365Stubs: EvaluatorModule[] = [
  stub("authenticator-fatigue-protection", "requires Entra auth-method policy inspection"),
  stub("dkim-enabled", "requires Exchange DKIM signing config"),
  stub("email-otp-disabled", "requires Entra externalIdentitiesPolicy"),
  stub("entra-join-restricted", "requires Entra deviceRegistrationPolicy"),
  stub("local-admin-assignment-restricted", "requires Intune deviceEnrollmentConfiguration"),
  stub("outlook-addins-blocked", "requires EWS / OWA policy inspection"),
  stub("system-preferred-mfa-enabled", "requires Entra systemCredentialPreferences"),
  stub("third-party-storage-disabled", "requires M365 OWA / org settings"),
  stub("user-consent-disabled", "requires Entra authorization policy consentPolicy"),
  stub("users-cannot-register-apps", "requires Entra user settings appRegistrations"),
  stub("weak-auth-methods-disabled", "requires Entra authentication methods policy"),
];

export default cisM365Stubs;
