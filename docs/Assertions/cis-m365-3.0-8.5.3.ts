export default {
  id: "8.5.3",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Only people in my org can bypass the lobby",
  source: "teamsMeetingPolicy",
  assert: {
    property: "autoAdmittedUsers",
    // Passing values (most to least restrictive):
    // OrganizerOnly, EveryoneInCompanyExcludingGuests, InvitedUsers, EveryoneInCompany
    // FAIL: Everyone (anyone can bypass)
    allowedValues: ["OrganizerOnly", "EveryoneInCompanyExcludingGuests", "InvitedUsers", "EveryoneInCompany"],
  },
};
