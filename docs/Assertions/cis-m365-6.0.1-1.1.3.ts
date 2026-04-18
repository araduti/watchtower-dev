export default {
  id: "1.1.3",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Between two and four global admins are designated",
  source: "privilegedUsers",
  assert: {
    filter: { roleTemplateId: "62e90394-69f5-4237-9190-012177145e10" }, // Global Administrator
    count: { min: 2, max: 4 },
  },
};
