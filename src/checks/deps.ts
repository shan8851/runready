import path from "node:path";

import { getModifiedTime, pathExists } from "../utils/fileSystem.js";

import type { CheckResult, ProjectContext } from "../types.js";

const installCommandForPackageManager = (packageManager: string | undefined): string =>
  packageManager === undefined ? "Install dependencies with the project package manager." : `${packageManager} install`;

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
  const packageJsonMtime = await getModifiedTime(path.join(context.rootPath, "package.json"));
  const lockfileMtimes = await Promise.all(context.lockfiles.map((lockfile) => getModifiedTime(lockfile.path)));
  const newestManifestMtime = Math.max(packageJsonMtime ?? 0, ...lockfileMtimes.map((mtime) => mtime ?? 0));
  const nodeModulesMtime = await getModifiedTime(nodeModulesPath);
  const lockfilePackageManagers = context.lockfiles.map((lockfile) => lockfile.packageManager);
  const hasPackageManagerConflict =
    context.packageManagerField !== undefined &&
    lockfilePackageManagers.length > 0 &&
    !lockfilePackageManagers.includes(context.packageManagerField);

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
      id: "deps.stale-install",
      category: "deps",
      status:
        context.hasYarnPnp || !nodeModulesExists || nodeModulesMtime === undefined
          ? "skip"
          : newestManifestMtime > nodeModulesMtime
            ? "warn"
            : "pass",
      title:
        context.hasYarnPnp || !nodeModulesExists || nodeModulesMtime === undefined
          ? "Install freshness check skipped"
          : newestManifestMtime > nodeModulesMtime
            ? "Dependencies may be stale"
            : "Dependencies look current",
      suggestion:
        !context.hasYarnPnp && nodeModulesExists && nodeModulesMtime !== undefined && newestManifestMtime > nodeModulesMtime
          ? installCommandForPackageManager(context.inferredPackageManager)
          : undefined,
      nextStep:
        !context.hasYarnPnp && nodeModulesExists && nodeModulesMtime !== undefined && newestManifestMtime > nodeModulesMtime
          ? installCommandForPackageManager(context.inferredPackageManager)
          : undefined
    }
  ];
};
