export default {
  id: "5.2.4.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Self service password reset enabled is set to All",
  manual: true,
  // allowedToUseSSPR in authorizationPolicy confirms SSPR is enabled but
  // does not distinguish between All vs Selected (group-scoped) — UI verification required.
  // Navigate to: Entra ID > Password reset > Properties
};
