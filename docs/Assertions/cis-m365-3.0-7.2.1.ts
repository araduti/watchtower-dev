export default {
  slug: "wt.spo.modern-auth-required",
  id: "7.2.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Modern authentication for SharePoint applications is required",
  source: "spoTenant",
  assert: { property: "legacyAuthProtocolsEnabled", value: false },
};
