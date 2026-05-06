import { runDependencyChecks } from "./deps.js";
import { runDockerChecks } from "./docker.js";
import { runEnvChecks } from "./env.js";
import { runPortChecks } from "./ports.js";
import { runRepoChecks } from "./repo.js";
import { runRuntimeChecks } from "./runtime.js";
import { runScriptChecks } from "./scripts.js";

import type { CheckCategory, CheckOptions, CheckResult, ProjectContext } from "../types.js";

const categoryOrder: CheckCategory[] = ["repo", "runtime", "deps", "env", "scripts", "docker", "ports"];

const shouldRunCategory = (category: CheckCategory, only: CheckCategory[]): boolean =>
  only.length === 0 || only.includes(category);

export const runChecks = async (
  context: ProjectContext,
  options: CheckOptions
): Promise<CheckResult[]> => {
  const checksByCategory: Array<Promise<CheckResult[]>> = [
    Promise.resolve(shouldRunCategory("repo", options.only) ? runRepoChecks(context) : []),
    shouldRunCategory("runtime", options.only) ? runRuntimeChecks(context) : Promise.resolve([]),
    shouldRunCategory("deps", options.only) ? runDependencyChecks(context) : Promise.resolve([]),
    shouldRunCategory("env", options.only) ? runEnvChecks(context) : Promise.resolve([]),
    Promise.resolve(shouldRunCategory("scripts", options.only) ? runScriptChecks(context) : []),
    shouldRunCategory("docker", options.only) ? runDockerChecks(context) : Promise.resolve([]),
    shouldRunCategory("ports", options.only) ? runPortChecks(context) : Promise.resolve([])
  ];
  const results = (await Promise.all(checksByCategory)).flat();

  return results.sort(
    (firstResult, secondResult) =>
      categoryOrder.indexOf(firstResult.category) - categoryOrder.indexOf(secondResult.category)
  );
};
