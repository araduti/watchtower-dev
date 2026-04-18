export default {
  id: "8.5.4",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Users dialing in can't bypass the lobby",
  source: "teamsMeetingPolicy",
  assert: {
    property: "allowPSTNUsersToBypassLobby",
    value: false,
  },
};
