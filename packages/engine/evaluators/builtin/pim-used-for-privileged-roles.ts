import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const SENSITIVE_ROLES = new Set([
  '9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3',
  'c4e39bd9-1100-46d3-8c65-fb160da0071f',
  'b0f54661-2d74-4c50-afa3-1ec803f12efe',
  '158c047a-c907-4556-b7ef-446551a6b5f7',
  '7698a772-787b-4ac8-901f-60d6b08affd2',
  '17315797-102d-40b4-93e0-432062caca18',
  '29232cdf-9323-42fd-ade2-1d097af3e4de',
  '62e90394-69f5-4237-9190-012177145e10',
  '729827e3-9c14-49f7-bb1b-9608f156bbb8',
  '3a2c62db-5318-420d-8d74-23affee5d9d5',
  '966707d0-3269-4727-9be2-8c3a10f19b9d',
  '7be44c8a-adaf-4e2a-84d6-ab2649e08a13',
  'e8611ab8-c189-46e8-94e1-60213ab1f814',
  '194ae4cb-b126-40b2-bd5b-6091b380977d',
  'f28a1f50-f6e7-4571-818b-6a12f2af6b6c',
  '69091246-20e8-4a56-aa4d-066075b2a7a8',
  'fe930be7-5e62-47db-91af-98c3a49a38b1',
]);

const evaluate: EvaluatorFn = (snapshot) => {
  // Permanent assignments = privilegedUsers with roleTemplateId in sensitive roles
  const permanent: any[] = (snapshot.data?.privilegedUsers ?? [])
    .filter((a: any) => SENSITIVE_ROLES.has(a.roleTemplateId) && a.principal?.userPrincipalName);

  // Eligible assignments via PIM
  const eligible: any[] = (snapshot.data?.pimEligibleAssignments ?? [])
    .filter((a: any) => SENSITIVE_ROLES.has(a.roleDefinitionId));

  if (permanent.length === 0 && eligible.length === 0) {
    return { pass: false, warnings: ["No role assignments found — check snapshot data"] };
  }

  // Find principals with permanent assignments to sensitive roles that have no eligible assignment
  const eligiblePrincipals = new Set(eligible.map((a: any) => a.principalId));
  const permanentOnly = permanent.filter((a: any) => !eligiblePrincipals.has(a.principalId));

  if (permanentOnly.length === 0) {
    return { pass: true, warnings: [] };
  }

  return {
    pass: false,
    warnings: permanentOnly.map((a: any) =>
      `${a.principal?.userPrincipalName ?? a.principalId} has permanent assignment to role ${a.roleTemplateId} — should be eligible (JIT) only`
    ),
  };
};

export default {
  slug: "pim-used-for-privileged-roles",
  evaluate,
} satisfies EvaluatorModule;
