export default {
  slug: "wt.teams.meeting.external-chat-disabled",
  id: "8.5.8",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "External meeting chat is off",
  source: "teamsMeetingPolicy",
  assert: {
    property: "allowExternalNonTrustedMeetingChat",
    value: false,
  },
};
