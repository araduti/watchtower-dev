export default {
  id: "1.3.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Password expiration policy is set to never expire",
  source: "domains",
  assert: {
    // Only verified, non-.onmicrosoft.com domains — the default domain can't be changed
    filter: { isVerified: true },
    property: "passwordValidityPeriodInDays",
    value: 2147483647, // Microsoft's magic number for "never expire"
  },
};