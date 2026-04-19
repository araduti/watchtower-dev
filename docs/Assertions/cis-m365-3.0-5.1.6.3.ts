export default {
  slug: "wt.entra.guest.invitations-restricted",
  id: "5.1.6.3",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Guest user invitations are limited to the Guest Inviter role",
  source: "authorizationPolicy",
  assert: {
    property: "allowInvitesFrom",
    // adminsAndGuestInviters = only specific admin roles (PASS)
    // adminsOnly = most restrictive (also PASS)
    // everyone / membersAndGuests = FAIL
    allowedValues: [
      "adminsAndGuestInviters",
      "adminsOnly",
    ],
  },
};
