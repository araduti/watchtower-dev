export default {
  slug: "wt.teams.meeting.chat-no-anonymous",
  id: "8.5.5",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Meeting chat does not allow anonymous users",
  source: "teamsMeetingPolicy",
  assert: {
    property: "meetingChatEnabledType",
    allowedValues: ["EnabledExceptAnonymous", "EnabledInMeetingOnlyForAllExceptAnonymous", "Disabled"],
  },
};
