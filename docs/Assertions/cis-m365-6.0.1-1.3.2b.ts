export default {
  id: "1.3.2",
  part: 2,
  groupId: "1.3.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Idle session timeout is set to 3 hours or less (CA policy)",
  match: {
    users: { include: "All" },
    apps: { include: "Office365" },
    clientAppTypes: ["browser"],
    session: { appEnforcedRestrictions: true },
    state: "active",
  },
};
