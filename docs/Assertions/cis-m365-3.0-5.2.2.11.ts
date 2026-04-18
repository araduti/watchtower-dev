export default {
  id: "5.2.2.11",
  framework: "CIS",
  frameworkVersion: "3.0",
  product: "M365",
  title: "Sign-in frequency for Intune Enrollment is set to Every time",
  match: {
    users: { include: "All" },
    apps: { include: "d4ebce55-015a-49b5-a083-c84d1797ae8c" }, // Microsoft Intune Enrollment
    grant: { anyOf: ["mfa"] },
    session: { signInFrequencyHours: 0 }, // Every time
    exclusions: "break-glass-only",
    state: "active",
  },
};
