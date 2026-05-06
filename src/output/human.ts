import boxen from "boxen";
import pc from "picocolors";

import type { CheckCategory, CheckResult, RunReport } from "../types.js";

const categoryTitles: Record<CheckCategory, string> = {
  deps: "Dependencies",
  docker: "Docker",
  env: "Environment",
  ports: "Ports",
  repo: "Project",
  runtime: "Runtime",
  scripts: "Scripts"
};

const categoryOrder: CheckCategory[] = ["repo", "runtime", "deps", "env", "scripts", "docker", "ports"];

const statusWeight = {
  fail: 0,
  warn: 1,
  pass: 2,
  skip: 3
} as const;

const runreadyHeader = String.raw`
                         __
   _______  ______  ____/ /_______  ____ _____/ /_  __
  / ___/ / / / __ \/ __  / ___/ _ \/ __  / __  / / / /
 / /  / /_/ / / / / /_/ / /  /  __/ /_/ / /_/ / /_/ /
/_/   \__,_/_/ /_/\__,_/_/   \___/\__,_/\__,_/\__, /
                                              /____/
`;

const colorStatus = (status: CheckResult["status"]): string => {
  const markerByStatus: Record<CheckResult["status"], string> = {
    fail: pc.red("x"),
    pass: pc.green("✓"),
    skip: pc.dim("-"),
    warn: pc.yellow("!")
  };

  return markerByStatus[status];
};

const titleColorByStatus: Record<CheckResult["status"], (value: string) => string> = {
  fail: pc.red,
  pass: (value) => value,
  skip: pc.dim,
  warn: pc.yellow
};

const colorTitle = (check: CheckResult): string => titleColorByStatus[check.status](check.title);

const statusLabel = (check: CheckResult): string => `${colorStatus(check.status)} ${colorTitle(check)}`;

const formatCheck = (check: CheckResult, verbose: boolean): string => {
  const primaryLine = statusLabel(check);
  const detailLines = [
    check.detail,
    verbose && check.expected !== undefined ? `Expected: ${check.expected}` : undefined,
    verbose && check.actual !== undefined ? `Actual: ${check.actual}` : undefined,
    verbose && check.suggestion !== undefined ? `Suggestion: ${check.suggestion}` : undefined
  ].filter((line): line is string => line !== undefined && line.length > 0);

  return detailLines.length === 0
    ? primaryLine
    : [primaryLine, ...detailLines.map((line) => pc.dim(`  ${line}`))].join("\n");
};

const groupChecks = (checks: CheckResult[]): Array<[CheckCategory, CheckResult[]]> =>
  categoryOrder
    .map((category) => [category, checks.filter((check) => check.category === category)] as [CheckCategory, CheckResult[]])
    .filter(([, categoryChecks]) => categoryChecks.length > 0);

const borderColorForChecks = (checks: CheckResult[]): "green" | "red" | "yellow" => {
  if (checks.some((check) => check.status === "fail")) {
    return "red";
  }

  return checks.some((check) => check.status === "warn") ? "yellow" : "green";
};

const renderGroup = ([category, checks]: [CheckCategory, CheckResult[]], verbose: boolean): string =>
  boxen(
    checks
      .sort((firstCheck, secondCheck) => statusWeight[firstCheck.status] - statusWeight[secondCheck.status])
      .map((check) => formatCheck(check, verbose))
      .join("\n"),
    {
      borderColor: borderColorForChecks(checks),
      borderStyle: "round",
      padding: 1,
      title: categoryTitles[category],
      titleAlignment: "left"
    }
  );

const renderNextSteps = (nextSteps: string[]): string =>
  nextSteps.length === 0
    ? pc.green("No next steps needed.")
    : [
        pc.bold("Next steps"),
        ...nextSteps.map((step, index) => `${pc.cyan(`${index + 1}.`)} ${step}`)
      ].join("\n");

const compactCategoryStatus = (checks: CheckResult[]): string => {
  if (checks.some((check) => check.status === "fail")) {
    return pc.red("fail");
  }

  if (checks.some((check) => check.status === "warn")) {
    return pc.yellow("warn");
  }

  if (checks.every((check) => check.status === "skip")) {
    return pc.dim("skip");
  }

  return pc.green("ok");
};

const summaryColorForReport = (report: RunReport): ((value: string) => string) => {
  if (report.summary.fail > 0) {
    return pc.red;
  }

  return report.summary.warn > 0 ? pc.yellow : pc.green;
};

const readinessLabelForReport = (report: RunReport): string => {
  if (report.summary.fail > 0) {
    return pc.red("blocked");
  }

  return report.summary.warn > 0 ? pc.yellow("ready with warnings") : pc.green("ready");
};

const notableChecksForReport = (report: RunReport): CheckResult[] =>
  report.checks
    .filter((check) => check.status === "fail" || check.status === "warn")
    .sort((firstCheck, secondCheck) => statusWeight[firstCheck.status] - statusWeight[secondCheck.status]);

const renderNotableLines = (notableChecks: CheckResult[]): string[] => {
  if (notableChecks.length === 0) {
    return [pc.green("✓ Everything notable looks ready") + "."];
  }

  const visibleLines = notableChecks
    .slice(0, 8)
    .flatMap((check) => [
      statusLabel(check),
      check.detail === undefined ? undefined : pc.dim(`  ${check.detail}`)
    ])
    .filter((line): line is string => line !== undefined);
  const hiddenCount = notableChecks.length - 8;

  return hiddenCount > 0
    ? [...visibleLines, pc.dim(`…and ${hiddenCount} more. Run runready doctor for full detail.`)]
    : visibleLines;
};

const renderCompactReport = (report: RunReport): string => {
  const summaryText = `${report.summary.fail} fail  ${report.summary.warn} warn  ${report.summary.pass} pass  ${report.summary.skip} skip`;
  const categoryLine = groupChecks(report.checks)
    .map(([category, checks]) => `${categoryTitles[category]} ${compactCategoryStatus(checks)}`)
    .join(pc.dim("  ·  "));
  const notableChecks = notableChecksForReport(report);

  return [
    boxen(
      [
        `${pc.bold("runready")} ${readinessLabelForReport(report)}`,
        `Project: ${pc.bold(report.project.name)}  ${pc.dim(report.project.root)}`,
        `Summary: ${summaryColorForReport(report)(summaryText)}`
      ].join("\n"),
      {
        borderColor: report.summary.fail > 0 ? "red" : report.summary.warn > 0 ? "yellow" : "green",
        borderStyle: "round",
        padding: 1
      }
    ),
    categoryLine,
    "",
    pc.bold("Notable"),
    ...renderNotableLines(notableChecks),
    "",
    renderNextSteps(report.nextSteps),
    notableChecks.length > 0 ? pc.dim("Run runready doctor for the full diagnostic view.") : undefined
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
};

const renderDoctorReport = (report: RunReport, verbose: boolean): string => {
  const summaryLine = `${report.summary.pass} pass  ${report.summary.warn} warn  ${report.summary.fail} fail  ${report.summary.skip} skip`;
  const intro = [
    pc.cyan(runreadyHeader),
    pc.bold("Local dev preflight"),
    `Project: ${pc.bold(report.project.name)}`,
    `Root: ${pc.dim(report.project.root)}`,
    `Type: ${report.project.type.length > 0 ? report.project.type.join(" / ") : "unknown"}`,
    `Summary: ${report.ok ? pc.green(summaryLine) : pc.yellow(summaryLine)}`
  ].join("\n");

  return [
    intro,
    ...groupChecks(report.checks).map((group) => renderGroup(group, verbose)),
    renderNextSteps(report.nextSteps)
  ].join("\n\n");
};

export const renderHumanReport = (report: RunReport, verbose: boolean): string =>
  verbose ? renderDoctorReport(report, verbose) : renderCompactReport(report);
