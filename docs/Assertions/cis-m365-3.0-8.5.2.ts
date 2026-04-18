export default {
  id: "8.5.2",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Anonymous users and dial-in callers can't start a meeting",
  source: "teamsMeetingPolicy",
  assert: {
    property: "allowAnonymousUsersToStartMeeting",
    value: false,
  },
};
