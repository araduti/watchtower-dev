export default {
  id: "1.2.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Only organizationally managed/approved public groups exist",
  source: "groups",
  assert: {
    filter: { groupTypes: "Unified" },
    property: "visibility",
    value: "Public",
    negate: true,
  },
};
