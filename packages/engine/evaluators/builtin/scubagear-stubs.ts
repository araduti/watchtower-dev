/**
 * ScubaGear stub evaluators — not yet implemented.
 *
 * These return explicit "not yet implemented" failures so results are
 * transparent rather than silently wrong. Each will be implemented via
 * CA policy match engine or dedicated PIM/role management logic.
 *
 * TODO: Implement via CA policy match engine:
 *   - blockLegacyAuth (MS.AAD.1.1v1)
 *   - blockHighRiskUsers (MS.AAD.2.1v1)
 *   - blockHighRiskSignIns (MS.AAD.2.3v1)
 *   - requireMFAAllUsers (MS.AAD.3.2v2)
 *   - phishingResistantMFAAdmins (MS.AAD.3.6v1)
 *
 * TODO: Implement via PIM role management policy inspection:
 *   - noPermanentActiveAssignment (MS.AAD.7.4v1)
 *   - globalAdminApprovalRequired (MS.AAD.7.6v1)
 *   - assignmentAlertConfigured (MS.AAD.7.7v1)
 *   - globalAdminActivationAlert (MS.AAD.7.8v1)
 *
 * TODO: Implement via Teams federation configuration inspection:
 *   - externalAccessPerDomain (MS.TEAMS.2.1v2)
 */

import type { EvaluatorModule } from "../types.ts";

function stub(slug: string): EvaluatorModule {
  return {
    slug,
    evaluate: (_snapshot) => ({ pass: false, warnings: [`ScubaGear evaluator "${slug}" not yet implemented`] }),
  };
}

const stubs: EvaluatorModule[] = [
  stub("blockLegacyAuth"),
  stub("blockHighRiskUsers"),
  stub("blockHighRiskSignIns"),
  stub("requireMFAAllUsers"),
  stub("phishingResistantMFAAdmins"),
  stub("noPermanentActiveAssignment"),
  stub("globalAdminApprovalRequired"),
  stub("assignmentAlertConfigured"),
  stub("globalAdminActivationAlert"),
  stub("externalAccessPerDomain"),
];

export default stubs;
