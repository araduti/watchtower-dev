export default {
  slug: "wt.teams.meeting.recording-off-by-default",
  id: "8.5.9",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Meeting recording is off by default",
  source: "teamsMeetingPolicy",
  assert: {
    property: "allowCloudRecording",
    value: false,
  },
};
