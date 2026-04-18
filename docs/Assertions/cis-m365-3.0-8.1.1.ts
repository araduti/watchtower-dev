export default {
  id: "8.1.1",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "External file sharing in Teams is enabled for only approved cloud storage services",
  source: "teamsClientConfiguration",
  assert: {
    property: "allowDropBox",
    value: false,
    also: [
      { property: "allowBox",         value: false },
      { property: "allowGoogleDrive", value: false },
      { property: "allowShareFile",   value: false },
      { property: "allowEgnyte",      value: false },
    ],
  },
};
