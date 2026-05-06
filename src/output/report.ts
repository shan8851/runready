import type { CheckResult, ProjectContext, RunReport, RunSummary } from "../types.js";

const emptySummary: RunSummary = {
  fail: 0,
  pass: 0,
  skip: 0,
  warn: 0
};

export const buildSummary = (checks: CheckResult[]): RunSummary =>
  checks.reduce(
    (summary, check) => ({
      ...summary,
      [check.status]: summary[check.status] + 1
    }),
    emptySummary
  );

export const buildNextSteps = (checks: CheckResult[]): string[] =>
  Array.from(
    new Set(
      checks
        .filter((check) => check.status === "fail" || check.status === "warn")
        .map((check) => check.nextStep ?? check.suggestion)
        .filter((step): step is string => step !== undefined && step.trim().length > 0)
    )
  );

export const buildReport = (
  context: ProjectContext,
  checks: CheckResult[],
  strict: boolean
): RunReport => {
  const summary = buildSummary(checks);

  return {
    schemaVersion: 1,
    ok: summary.fail === 0 && (!strict || summary.warn === 0),
    summary,
    project: {
      name: context.name,
      root: context.rootPath,
      type: context.projectTypes
    },
    checks,
    nextSteps: buildNextSteps(checks)
  };
};
