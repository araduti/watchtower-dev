export default {
  id: "8.5.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Anonymous users can't join a meeting",
  source: "teamsMeetingPolicy",
  assert: {
    property: "allowAnonymousUsersToJoinMeeting",
    value: false,
  },
};
