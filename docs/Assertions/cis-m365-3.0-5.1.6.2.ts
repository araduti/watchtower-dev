export default {
  slug: "wt.entra.guest.access-restricted",
  id: "5.1.6.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Guest user access is restricted",
  source: "authorizationPolicy",
  assert: {
    property: "guestUserRoleId",
    // Both values pass:
    // 10dae51f-b6af-4016-8d66-8c2a99b929b3 = limited access (default)
    // 2af84b1e-32c8-42b7-82bc-daa82404023b = most restrictive
    // a0b1b346-4d3e-4e8b-98f8-753987be4970 = same as members (FAIL)
    allowedValues: [
      "10dae51f-b6af-4016-8d66-8c2a99b929b3",
      "2af84b1e-32c8-42b7-82bc-daa82404023b",
    ],
  },
};
