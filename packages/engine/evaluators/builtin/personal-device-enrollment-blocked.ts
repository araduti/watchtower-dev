import type { EvaluatorFn, EvaluatorModule } from "../types.ts";

const evaluate: EvaluatorFn = (snapshot) => {
  const configs: any[] = snapshot.data?.enrollmentConfigurations ?? [];
  if (configs.length === 0) return { pass: false, warnings: ["No enrollment configurations in snapshot"] };

  const defaultConfig = configs.find((c: any) =>
    c.id?.includes("DefaultPlatformRestrictions") && c.priority === 0
  );

  if (!defaultConfig) return { pass: false, warnings: ["Default platform restriction policy not found"] };

  const platforms = [
    { key: "windowsRestriction",        label: "Windows"          },
    { key: "iosRestriction",            label: "iOS/iPadOS"       },
    { key: "androidRestriction",        label: "Android"          },
    { key: "androidForWorkRestriction", label: "Android for Work" },
    { key: "macOSRestriction",          label: "macOS"            },
  ];

  const failing: string[] = [];
  for (const { key, label } of platforms) {
    const restriction = defaultConfig[key];
    const platformBlocked = restriction?.platformBlocked === true;
    const personalBlocked = restriction?.personalDeviceEnrollmentBlocked === true;
    if (!platformBlocked && !personalBlocked) {
      failing.push(`${label} — personally owned enrollment not blocked`);
    }
  }

  return { pass: failing.length === 0, warnings: failing };
};

export default {
  slug: "personal-device-enrollment-blocked",
  evaluate,
} satisfies EvaluatorModule;
