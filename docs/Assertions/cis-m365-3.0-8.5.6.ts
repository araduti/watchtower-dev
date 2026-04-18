export default {
  id: "8.5.6",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Only organizers and co-organizers can present",
  source: "teamsMeetingPolicy",
  assert: {
    property: "designatedPresenterRoleMode",
    value: "OrganizerOnlyUserOverride",
  },
};
