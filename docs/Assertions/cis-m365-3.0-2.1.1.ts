export default {
  id: "2.1.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Safe Links for Office Applications is enabled",
  requiresConnector: "defender-exchange", // Get-SafeLinksPolicy
  source: "safeLinksPolicies",
  assert: {
    // At least one policy must have all of these set correctly
    property: "enableSafeLinksForEmail",
    value: true,
    also: [
      { property: "enableSafeLinksForTeams",    value: true  },
      { property: "enableSafeLinksForOffice",   value: true  },
      { property: "trackClicks",                value: true  },
      { property: "allowClickThrough",          value: false },
      { property: "scanUrls",                   value: true  },
      { property: "enableForInternalSenders",   value: true  },
      { property: "deliverMessageAfterScan",    value: true  },
      { property: "disableUrlRewrite",          value: false },
    ],
  },
};
