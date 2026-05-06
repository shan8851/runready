import path from "node:path";

import { pathExists } from "../utils/fileSystem.js";

import type { CheckResult, PackageJson, ProjectContext } from "../types.js";

const installCommandForPackageManager = (packageManager: string | undefined): string =>
  packageManager === undefined ? "Install dependencies with the project package manager." : `${packageManager} install`;

const declaredDependencyNames = (packageJson: PackageJson): string[] =>
  Array.from(
    new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {})
    ])
  ).sort();

const dependencyPath = (rootPath: string, dependencyName: string): string =>
  path.join(rootPath, "node_modules", ...dependencyName.split("/"));

const missingDeclaredDependencies = async (
  context: ProjectContext,
  dependencyNames: string[]
): Promise<string[]> => {
  const dependencyChecks = await Promise.all(
    dependencyNames.map(async (dependencyName) => ({
      dependencyName,
      exists: await pathExists(dependencyPath(context.rootPath, dependencyName))
    }))
  );

  return dependencyChecks
    .filter((dependencyCheck) => !dependencyCheck.exists)
    .map((dependencyCheck) => dependencyCheck.dependencyName);
};

const summarizeDependencies = (dependencyNames: string[]): string =>
  dependencyNames.length <= 8
    ? dependencyNames.join(", ")
    : `${dependencyNames.slice(0, 8).join(", ")} and ${dependencyNames.length - 8} more`;

export const runDependencyChecks = async (context: ProjectContext): Promise<CheckResult[]> => {
  if (context.packageJson === undefined) {
    return [
      {
        id: "deps.package-json",
        category: "deps",
        status: "skip",
        title: "No package.json detected"
      }
    ];
  }

  const nodeModulesPath = path.join(context.rootPath, "node_modules");
  const nodeModulesExists = await pathExists(nodeModulesPath);
  const lockfilePackageManagers = context.lockfiles.map((lockfile) => lockfile.packageManager);
  const hasPackageManagerConflict =
    context.packageManagerField !== undefined &&
    lockfilePackageManagers.length > 0 &&
    !lockfilePackageManagers.includes(context.packageManagerField);
  const dependencyNames = declaredDependencyNames(context.packageJson);
  const missingDependencies =
    context.hasYarnPnp || !nodeModulesExists
      ? []
      : await missingDeclaredDependencies(context, dependencyNames);

  return [
    {
      id: "deps.lockfile",
      category: "deps",
      status: context.lockfiles.length === 0 ? "warn" : context.lockfiles.length > 1 ? "warn" : "pass",
      title:
        context.lockfiles.length === 0
          ? "No lockfile detected"
          : context.lockfiles.length > 1
            ? "Multiple lockfiles detected"
            : `Lockfile detected: ${context.lockfiles[0]?.name}`,
      detail:
        context.lockfiles.length > 1
          ? context.lockfiles.map((lockfile) => lockfile.name).join(", ")
          : undefined
    },
    {
      id: "deps.package-manager-consistency",
      category: "deps",
      status: hasPackageManagerConflict ? "fail" : "pass",
      title: hasPackageManagerConflict
        ? "packageManager field conflicts with lockfile"
        : "Package manager metadata is consistent",
      expected: context.packageManagerField,
      actual: lockfilePackageManagers.join(", ") || undefined
    },
    {
      id: "deps.installed",
      category: "deps",
      status: context.hasYarnPnp || nodeModulesExists ? "pass" : "fail",
      title: context.hasYarnPnp
        ? "Yarn PnP install detected"
        : nodeModulesExists
          ? "Dependencies appear installed"
          : "Dependencies are not installed",
      suggestion:
        context.hasYarnPnp || nodeModulesExists
          ? undefined
          : installCommandForPackageManager(context.inferredPackageManager),
      nextStep:
        context.hasYarnPnp || nodeModulesExists
          ? undefined
          : installCommandForPackageManager(context.inferredPackageManager)
    },
    {
      id: "deps.declared-installed",
      category: "deps",
      status:
        context.hasYarnPnp || !nodeModulesExists || dependencyNames.length === 0
          ? "skip"
          : missingDependencies.length > 0
            ? "warn"
            : "pass",
      title:
        context.hasYarnPnp
          ? "Declared dependency check skipped for Yarn PnP"
          : !nodeModulesExists
            ? "Declared dependency check skipped"
            : dependencyNames.length === 0
              ? "No declared dependencies to check"
              : missingDependencies.length > 0
                ? `${missingDependencies.length} declared ${missingDependencies.length === 1 ? "dependency is" : "dependencies are"} missing from node_modules`
                : "Declared dependencies are present in node_modules",
      detail: missingDependencies.length > 0 ? summarizeDependencies(missingDependencies) : undefined,
      suggestion:
        missingDependencies.length > 0
          ? "Run the project install command to restore missing dependency links."
          : undefined,
      nextStep:
        missingDependencies.length > 0
          ? installCommandForPackageManager(context.inferredPackageManager)
          : undefined
    }
  ];
};
