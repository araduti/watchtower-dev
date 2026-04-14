/**
 * evaluators/ca-policy-specs.ts
 *
 * CA (Conditional Access) policy match specifications.
 * These define the criteria for matching CA policies against CIS controls.
 *
 * NOTE from principles evaluation: Ideally these specs would be stored as
 * ControlAssertion data rows (with an `operator: "ca-match"` and a `matchSpec`
 * JSON field), making CA checks data-driven like simple assertions. This is
 * tracked for Phase 4. For now they remain as typed data in code, which is
 * still a significant improvement over being inlined in the engine.
 */

export interface PolicySpec {
  id: string;
  framework: string;
  frameworkVersion: string;
  product: string;
  title: string;
  match?: {
    users?: { include?: "All"; roles?: string[] };
    userActions?: string[];
    apps?: { include?: "All" | string; noExclusions?: boolean };
    grant?: {
      anyOf?: string[];
      authStrength?: string;
      operator?: "OR" | "AND";
    };
    authenticationFlows?: string[];
    userRisk?: string[];
    signInRisk?: string[];
    clientAppTypes?: string[];
    session?: { appEnforcedRestrictions?: boolean; signInFrequencyHours?: number; persistentBrowser?: boolean };
    exclusions?: "break-glass-only";
    state?: "active";
  };
}

export const ADMIN_ROLES = [
  '9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3',
  'c4e39bd9-1100-46d3-8c65-fb160da0071f',
  'b0f54661-2d74-4c50-afa3-1ec803f12efe',
  '158c047a-c907-4556-b7ef-446551a6b5f7',
  'b1be1c3e-b65d-4f19-8427-f6fa0d97feb9',
  '29232cdf-9323-42fd-ade2-1d097af3e4de',
  '62e90394-69f5-4237-9190-012177145e10',
  'f2ef992c-3afb-46b9-b7cf-a126ee74c451',
  '729827e3-9c14-49f7-bb1b-9608f156bbb8',
  '966707d0-3269-4727-9be2-8c3a10f19b9d',
  '7be44c8a-adaf-4e2a-84d6-ab2649e08a13',
  'e8611ab8-c189-46e8-94e1-60213ab1f814',
  '194ae4cb-b126-40b2-bd5b-6091b380977d',
  'f28a1f50-f6e7-4571-818b-6a12f2af6b6c',
  'fe930be7-5e62-47db-91af-98c3a49a38b1',
];

export const CA_POLICY_SPECS: Record<string, PolicySpec> = {
  "1.3.2b": {
    id: "1.3.2", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "Idle session timeout ≤ 3 hours (CA policy)",
    match: { users: { include: "All" }, apps: { include: "Office365" }, clientAppTypes: ["browser"], session: { appEnforcedRestrictions: true }, state: "active" },
  },
  "5.2.2.1": {
    id: "5.2.2.1", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "MFA required for admin roles",
    match: { users: { roles: ADMIN_ROLES }, apps: { include: "All", noExclusions: true }, grant: { anyOf: ["mfa"] }, exclusions: "break-glass-only", state: "active" },
  },
  "5.2.2.2": {
    id: "5.2.2.2", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "MFA required for all users",
    match: { users: { include: "All" }, apps: { include: "All", noExclusions: true }, grant: { anyOf: ["mfa"] }, exclusions: "break-glass-only", state: "active" },
  },
  "5.2.2.3": {
    id: "5.2.2.3", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "CA policies block legacy authentication",
    match: { users: { include: "All" }, apps: { include: "All" }, clientAppTypes: ["exchangeActiveSync", "other"], grant: { anyOf: ["block"] }, exclusions: "break-glass-only", state: "active" },
  },
  "5.2.2.4": {
    id: "5.2.2.4", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "Sign-in frequency for admins",
    match: { users: { roles: ADMIN_ROLES }, apps: { include: "All" }, session: { signInFrequencyHours: 4, persistentBrowser: false }, exclusions: "break-glass-only", state: "active" },
  },
  "5.2.2.5": {
    id: "5.2.2.5", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "Phishing-resistant MFA for admins",
    match: { users: { roles: ADMIN_ROLES }, apps: { include: "All", noExclusions: true }, grant: { authStrength: "00000000-0000-0000-0000-000000000004" }, exclusions: "break-glass-only", state: "active" },
  },
  "5.2.2.6": {
    id: "5.2.2.6", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "Identity Protection user risk policies",
    match: { users: { include: "All" }, apps: { include: "All" }, userRisk: ["high"], grant: { anyOf: ["mfa", "passwordChange"] }, session: { signInFrequencyHours: 0 }, exclusions: "break-glass-only", state: "active" },
  },
  "5.2.2.7": {
    id: "5.2.2.7", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "Identity Protection sign-in risk policies",
    match: { users: { include: "All" }, apps: { include: "All" }, signInRisk: ["high", "medium"], grant: { anyOf: ["mfa"] }, session: { signInFrequencyHours: 0 }, exclusions: "break-glass-only", state: "active" },
  },
  "5.2.2.8": {
    id: "5.2.2.8", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "Sign-in risk blocked for medium/high",
    match: { users: { include: "All" }, apps: { include: "All", noExclusions: true }, signInRisk: ["high", "medium"], grant: { anyOf: ["block"] }, exclusions: "break-glass-only", state: "active" },
  },
  "5.2.2.9": {
    id: "5.2.2.9", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "Managed device required",
    match: { users: { include: "All" }, apps: { include: "All" }, grant: { anyOf: ["compliantDevice", "domainJoinedDevice"], operator: "OR" }, exclusions: "break-glass-only", state: "active" },
  },
  "5.2.2.10": {
    id: "5.2.2.10", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "Managed device required to register security info",
    match: { users: { include: "All" }, userActions: ["urn:user:registerSecurityInfo"], grant: { anyOf: ["compliantDevice", "domainJoinedDevice"], operator: "OR" }, exclusions: "break-glass-only", state: "active" },
  },
  "5.2.2.11": {
    id: "5.2.2.11", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "Sign-in frequency for Intune Enrollment",
    match: { users: { include: "All" }, apps: { include: "d4ebce55-015a-49b5-a083-c84d1797ae8c" }, grant: { anyOf: ["mfa"] }, session: { signInFrequencyHours: 0 }, exclusions: "break-glass-only", state: "active" },
  },
  "5.2.2.12": {
    id: "5.2.2.12", framework: "cis-m365-3.0", frameworkVersion: "3.0", product: "M365",
    title: "Device code sign-in flow is blocked",
    match: { users: { include: "All" }, apps: { include: "All" }, authenticationFlows: ["deviceCodeFlow"], grant: { anyOf: ["block"] }, exclusions: "break-glass-only", state: "active" },
  },
};
