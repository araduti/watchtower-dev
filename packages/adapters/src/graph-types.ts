/**
 * Microsoft Graph adapter types.
 *
 * Defines the shape of data collected from Microsoft Graph API.
 * These types represent Watchtower's internal model for Graph data —
 * they are NOT the raw Graph API response shapes. The adapter is
 * responsible for transforming raw responses into these types.
 *
 * Each key in `GraphDataSources` corresponds to a logical data source
 * that the Graph adapter can collect. The scan pipeline uses these
 * keys to request specific data during a compliance scan.
 */

/**
 * Configuration specific to the Microsoft Graph adapter.
 * Extends AdapterConfig with Graph-specific settings.
 */
export interface GraphAdapterConfig {
  /** Microsoft tenant GUID (from Tenant.msTenantId). */
  readonly msTenantId: string;

  /** Maximum concurrent Graph API requests. Default: 4. */
  readonly maxConcurrency?: number;

  /** Timeout per Graph API call in milliseconds. Default: 30000. */
  readonly timeoutMs?: number;
}

/**
 * Map of all data sources the Graph adapter can collect.
 *
 * Each key is a stable identifier used in Check.dataSource and
 * Check.connectors fields. Adding a new data source is an additive
 * change — existing keys are never renamed or removed.
 */
export interface GraphDataSources {
  /** Index signature for Record<string, unknown> compatibility. */
  readonly [key: string]: unknown;

  /** Conditional Access policies. */
  conditionalAccessPolicies: ConditionalAccessPolicy[];

  /** Directory role assignments (PIM-eligible and active). */
  directoryRoles: DirectoryRoleAssignment[];

  /** Security defaults configuration. */
  securityDefaults: SecurityDefaultsConfig;

  /** Authentication methods policy. */
  authMethodsPolicy: AuthMethodsPolicy;

  /** User consent settings. */
  userConsentSettings: UserConsentConfig;

  /** SharePoint/OneDrive tenant configuration. */
  spoTenant: SharePointTenantConfig;

  /** Exchange Online transport rule (legacy Graph compatibility key). */
  transportRules: TransportRule[];

  /** Domain DNS records for DMARC/SPF/DKIM validation. */
  domainDnsRecords: DomainDnsRecord[];

  /** Teams messaging policies. */
  teamsMessagingPolicies: TeamsMessagingPolicy[];

  /** Guest access / B2B collaboration settings. */
  b2bPolicy: B2BCollaborationPolicy;
}

/** Union of all valid data source keys. */
export type GraphDataSourceKey = keyof GraphDataSources;

// ---------------------------------------------------------------------------
// Data source shapes — Watchtower's internal model
// ---------------------------------------------------------------------------

/** Conditional Access policy (simplified from Graph response). */
export interface ConditionalAccessPolicy {
  readonly id: string;
  readonly displayName: string;
  readonly state: "enabled" | "disabled" | "enabledForReportingButNotEnforced";
  readonly conditions: Record<string, unknown>;
  readonly grantControls: Record<string, unknown> | null;
  readonly sessionControls: Record<string, unknown> | null;
}

/** Directory role assignment with eligibility status. */
export interface DirectoryRoleAssignment {
  readonly roleDefinitionId: string;
  readonly roleDisplayName: string;
  readonly principalId: string;
  readonly principalDisplayName: string;
  readonly assignmentType: "active" | "eligible";
}

/** Security defaults tenant configuration. */
export interface SecurityDefaultsConfig {
  readonly isEnabled: boolean;
}

/** Authentication methods policy. */
export interface AuthMethodsPolicy {
  readonly registrationEnforcement: {
    readonly authenticationMethodsRegistrationCampaign: {
      readonly state: string;
    };
  };
}

/** User consent settings for application permissions. */
export interface UserConsentConfig {
  readonly isEnabled: boolean;
  readonly blockUserConsentForRiskyApps: boolean;
}

/** SharePoint/OneDrive tenant configuration. */
export interface SharePointTenantConfig {
  readonly sharingCapability: string;
  readonly externalSharingEnabled: boolean;
}

/** Exchange Online transport rule. */
export interface TransportRule {
  readonly id: string;
  readonly name: string;
  readonly state: "Enabled" | "Disabled";
  readonly priority: number;
  readonly conditions: Record<string, unknown>;
  readonly actions: Record<string, unknown>;
}


/** Domain DNS record for email security validation. */
export interface DomainDnsRecord {
  readonly domain: string;
  readonly recordType: string;
  readonly value: string;
}

/** Teams messaging policy. */
export interface TeamsMessagingPolicy {
  readonly identity: string;
  readonly allowUrlPreviews: boolean;
  readonly allowOwnerDeleteMessage: boolean;
  readonly allowUserEditMessage: boolean;
  readonly allowUserDeleteMessage: boolean;
  readonly allowUserChat: boolean;
  readonly readReceiptsEnabledType: string;
}

/** B2B collaboration / guest access policy. */
export interface B2BCollaborationPolicy {
  readonly allowInvitesFrom: string;
  readonly allowedDomains: string[];
  readonly blockedDomains: string[];
  readonly isAllowlistOnly: boolean;
}
