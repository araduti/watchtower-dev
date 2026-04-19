export default {
  slug: "wt.entra.per-user-mfa-disabled",
  id: "5.1.2.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Per-user MFA is disabled",
  // Per-user MFA state (enabled/enforced/disabled) is not exposed in Graph v1.
  // beta endpoint /users/{id}/authentication/requirements returns it per-user
  // but requires N batch calls across all users — expensive at scale.
  // Flag for a dedicated auth methods connector that batches this efficiently.
  requiresConnector: "auth-methods", // GET /beta/users/{id}/authentication/requirements per user
  source: "perUserMfaStates",
  assert: {
    property: "perUserMfaState",
    value: "disabled",
    negate: false,
  },
};
