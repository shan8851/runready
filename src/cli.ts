import { createInterface } from "node:readline/promises";

import { Command } from "commander";
import pc from "picocolors";

import { applyEnvSyncPlan, createEnvSyncPlan } from "./actions/envSync.js";
import { runChecks } from "./checks/runChecks.js";
import { detectProject } from "./detect/project.js";
import { renderHumanReport } from "./output/human.js";
import { renderJsonReport } from "./output/json.js";
import { buildReport } from "./output/report.js";

import type { CheckCategory, EnvSyncPlan, RunReport } from "./types.js";

type CheckCommandOptions = {
  json?: boolean;
  only?: string;
  noColor?: boolean;
  strict?: boolean;
  verbose?: boolean;
};

type EnvSyncCommandOptions = {
  dryRun?: boolean;
  yes?: boolean;
  noColor?: boolean;
};

type CheckExecution = {
  report: RunReport;
  output: string;
  exitCode: number;
};

const selectableCategories: CheckCategory[] = ["env", "runtime", "deps", "scripts", "docker", "ports"];

const parseOnlyCategories = (only?: string): CheckCategory[] => {
  if (only === undefined || only.trim().length === 0) {
    return [];
  }

  const categories = only
    .split(",")
    .map((category) => category.trim())
    .filter((category) => category.length > 0);
  const invalidCategories = categories.filter(
    (category): category is string => !selectableCategories.includes(category as CheckCategory)
  );

  if (invalidCategories.length > 0) {
    throw new Error(`Unknown check category: ${invalidCategories.join(", ")}`);
  }

  return categories as CheckCategory[];
};

const applyNoColor = (noColor: boolean | undefined): void => {
  if (noColor === true) {
    process.env.NO_COLOR = "1";
  }
};

export const executeCheck = async (
  targetPath: string,
  options: CheckCommandOptions
): Promise<CheckExecution> => {
  applyNoColor(options.noColor);

  const context = await detectProject(targetPath);
  const only = parseOnlyCategories(options.only);
  const checks = await runChecks(context, {
    only,
    strict: options.strict ?? false,
    verbose: options.verbose ?? false
  });
  const report = buildReport(context, checks, options.strict ?? false);
  const output = options.json === true ? renderJsonReport(report) : `${renderHumanReport(report, options.verbose ?? false)}\n`;

  return {
    report,
    output,
    exitCode: report.ok ? 0 : 1
  };
};

const renderEnvSyncPlan = (plan: EnvSyncPlan): string => {
  const conflictLines =
    plan.conflicts.length === 0
      ? []
      : [
          pc.bold(pc.yellow("Conflicts")),
          ...plan.conflicts.map((conflict) =>
            [`! ${conflict.title}`, conflict.filePath.length > 0 ? `  ${conflict.filePath}` : undefined, `  ${conflict.detail}`]
              .filter((line): line is string => line !== undefined)
              .join("\n")
          )
        ];
  const changeLines =
    plan.changes.length === 0
      ? [pc.green("No env sync changes needed.")]
      : [
          pc.bold("Planned env sync changes"),
          ...plan.changes.map((change, index) => `${pc.cyan(`${index + 1}.`)} ${change.title}\n   ${pc.dim(change.detail)}`)
        ];

  return [...conflictLines, ...changeLines].join("\n\n");
};

const confirmEnvSync = async (): Promise<boolean> => {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const answer = await readline.question("Apply these env sync changes? [y/N] ");

  readline.close();

  return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
};

const runCheckAction = async (
  targetPath: string | undefined,
  options: CheckCommandOptions
): Promise<void> => {
  const execution = await executeCheck(targetPath ?? process.cwd(), options);

  process.stdout.write(execution.output);
  process.exitCode = execution.exitCode;
};

const runEnvSyncAction = async (
  targetPath: string | undefined,
  options: EnvSyncCommandOptions
): Promise<void> => {
  applyNoColor(options.noColor);

  const context = await detectProject(targetPath ?? process.cwd());
  const plan = await createEnvSyncPlan(context);
  const output = renderEnvSyncPlan(plan);

  process.stdout.write(`${output}\n`);

  if (plan.conflicts.length > 0) {
    process.stderr.write("Env sync blocked because conflicts need to be resolved first.\n");
    process.exitCode = 1;
    return;
  }

  if (plan.changes.length === 0 || options.dryRun === true) {
    process.exitCode = 0;
    return;
  }

  const shouldApply = options.yes === true ? true : await confirmEnvSync();

  if (!shouldApply) {
    process.stdout.write("Env sync cancelled.\n");
    process.exitCode = 0;
    return;
  }

  await applyEnvSyncPlan(plan);
  process.stdout.write(pc.green("Env sync complete.\n"));
  process.exitCode = 0;
};

const attachCheckOptions = (command: Command): Command =>
  command
    .option("--json", "emit machine-readable JSON")
    .option("--only <categories>", "comma-separated categories: env,runtime,deps,scripts,docker,ports")
    .option("--no-color", "disable ANSI color")
    .option("--strict", "treat warnings as failures")
    .option("--verbose", "show expanded details");

export const createRunreadyProgram = (): Command => {
  const program = new Command();

  program
    .name("runready")
    .description("Check whether a local repo is ready to run.")
    .version("0.1.0");

  attachCheckOptions(
    program
      .command("check", { isDefault: true })
      .description("Run safe local dev preflight checks.")
      .argument("[path]", "project path")
      .action((targetPath: string | undefined, options: CheckCommandOptions) =>
        runCheckAction(targetPath, options)
      )
  );

  attachCheckOptions(
    program
      .command("doctor")
      .description("Run verbose local dev diagnostics.")
      .argument("[path]", "project path")
      .action((targetPath: string | undefined, options: CheckCommandOptions) =>
        runCheckAction(targetPath, { ...options, verbose: true })
      )
  );

  program
    .command("env")
    .description("Work with env files.")
    .command("sync")
    .description("Safely align .env files and .env.example files.")
    .argument("[path]", "project path")
    .option("--dry-run", "preview changes without writing")
    .option("--yes", "apply planned changes without prompting")
    .option("--no-color", "disable ANSI color")
    .action((targetPath: string | undefined, options: EnvSyncCommandOptions) =>
      runEnvSyncAction(targetPath, options)
    );

  return program;
};

export const runCli = async (argv: string[] = process.argv): Promise<void> => {
  const program = createRunreadyProgram();

  try {
    await program.parseAsync(argv);
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : "runready failed"}\n`);
    process.exitCode = 2;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
