export default [
  {
    slug: "wt.exo.no-external-forwarding-rules",
    id: "6.2.1a",
    framework: "CIS",
    frameworkVersion: "3.0",
    product: "M365",
    title: "No transport rules redirect email to external domains",
    custom: "no-external-forwarding-transport-rules",
  },
  {
    slug: "wt.exo.outbound-spam-no-auto-forward",
    id: "6.2.1b",
    framework: "CIS",
    frameworkVersion: "3.0",
    product: "M365",
    title: "Outbound spam policy has auto-forwarding disabled",
    requiresConnector: "exchange-online",
    source: "hostedOutboundSpamFilterPolicies",
    assert: {
      property: "autoForwardingMode",
      value: "Off",
    },
  },
];
