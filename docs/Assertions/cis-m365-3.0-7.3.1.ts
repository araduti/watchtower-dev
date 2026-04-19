export default {
  slug: "wt.spo.infected-files-blocked",
  id: "7.3.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "SharePoint infected files are disallowed for download",
  requiresConnector: "sharepoint-online",
  source: "spoTenant",
  assert: {
    property: "disallowInfectedFileDownload",
    value: true,
  },
};
