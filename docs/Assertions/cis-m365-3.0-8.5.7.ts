export default {
  id: "8.5.7",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "External participants can't give or request control",
  source: "teamsMeetingPolicy",
  assert: {
    property: "allowExternalParticipantGiveRequestControl",
    value: false,
  },
};
