import type { CheckResult, ProjectContext } from "../types.js";

export const runRepoChecks = (context: ProjectContext): CheckResult[] => [
  {
    id: "repo.root",
    category: "repo",
    status: "pass",
    title: context.isGitRepo ? "Git repo detected" : "Project folder detected",
    detail: context.rootPath
  },
  {
    id: "repo.type",
    category: "repo",
    status: context.projectTypes.length > 0 ? "pass" : "warn",
    title:
      context.projectTypes.length > 0
        ? `Project type: ${context.projectTypes.join(" / ")}`
        : "Project type could not be inferred",
    detail:
      context.projectTypes.length > 0
        ? undefined
        : "No package.json, TypeScript config, Docker files, or common source files were found."
  }
];
