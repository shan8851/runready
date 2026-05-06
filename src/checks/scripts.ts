import type { CheckResult, ProjectContext } from "../types.js";

const commonScripts = ["dev", "build", "test", "typecheck", "lint"];

export const runScriptChecks = (context: ProjectContext): CheckResult[] => {
  const scripts = context.packageJson?.scripts ?? {};
  const presentScripts = commonScripts.filter((scriptName) => scripts[scriptName] !== undefined);
  const missingScripts = commonScripts.filter((scriptName) => scripts[scriptName] === undefined);

  if (context.packageJson === undefined) {
    return [
      {
        id: "scripts.package-json",
        category: "scripts",
        status: "skip",
        title: "No package scripts detected"
      }
    ];
  }

  return [
    {
      id: "scripts.common",
      category: "scripts",
      status: presentScripts.includes("dev") ? "pass" : "warn",
      title: presentScripts.includes("dev") ? "Dev script is available" : "No dev script found",
      detail:
        presentScripts.length > 0
          ? `Available common scripts: ${presentScripts.join(", ")}`
          : "No common setup scripts were found.",
      suggestion: missingScripts.length > 0 ? `Missing common scripts: ${missingScripts.join(", ")}` : undefined
    }
  ];
};
