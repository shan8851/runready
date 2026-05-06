import semver from "semver";

import { commandVersion } from "../utils/shell.js";

import type { CheckResult, PackageManagerName, ProjectContext } from "../types.js";

const packageManagerVersionCommands: Record<PackageManagerName, string[]> = {
  bun: ["--version"],
  npm: ["--version"],
  pnpm: ["--version"],
  yarn: ["--version"]
};

const suggestionForNodeRange = (range: string): string => {
  const minimumVersion = semver.minVersion(range);
  const majorVersion = minimumVersion?.major;

  return majorVersion === undefined ? `Install a Node version matching ${range}` : `nvm install ${majorVersion} && nvm use ${majorVersion}`;
};

export const runRuntimeChecks = async (context: ProjectContext): Promise<CheckResult[]> => {
  const gitVersion = await commandVersion("git", ["--version"], context.rootPath);
  const packageManager = context.inferredPackageManager;
  const packageManagerVersion =
    packageManager === undefined
      ? undefined
      : await commandVersion(packageManager, packageManagerVersionCommands[packageManager], context.rootPath);
  const requiredNodeRange = context.packageJson?.engines?.node;
  const currentNodeVersion = process.versions.node;

  return [
    {
      id: "runtime.git",
      category: "runtime",
      status: gitVersion === undefined ? "warn" : "pass",
      title: gitVersion === undefined ? "Git is not available" : "Git is available",
      actual: gitVersion,
      suggestion: gitVersion === undefined ? "Install Git before working in this project." : undefined
    },
    {
      id: "runtime.node.available",
      category: "runtime",
      status: "pass",
      title: `Node is available: ${currentNodeVersion}`
    },
    {
      id: "runtime.node.version",
      category: "runtime",
      status:
        requiredNodeRange === undefined || semver.satisfies(currentNodeVersion, requiredNodeRange)
          ? "pass"
          : "fail",
      title:
        requiredNodeRange === undefined
          ? "No Node engine range declared"
          : semver.satisfies(currentNodeVersion, requiredNodeRange)
            ? `Node satisfies ${requiredNodeRange}`
            : "Node version mismatch",
      expected: requiredNodeRange,
      actual: currentNodeVersion,
      suggestion:
        requiredNodeRange === undefined || semver.satisfies(currentNodeVersion, requiredNodeRange)
          ? undefined
          : suggestionForNodeRange(requiredNodeRange),
      nextStep:
        requiredNodeRange === undefined || semver.satisfies(currentNodeVersion, requiredNodeRange)
          ? undefined
          : suggestionForNodeRange(requiredNodeRange)
    },
    {
      id: "runtime.package-manager",
      category: "runtime",
      status:
        context.packageJson === undefined
          ? "skip"
          : packageManager === undefined
            ? "warn"
            : packageManagerVersion === undefined
              ? "fail"
              : "pass",
      title:
        context.packageJson === undefined
          ? "No package manager needed"
          : packageManager === undefined
            ? "Package manager could not be inferred"
            : packageManagerVersion === undefined
              ? `${packageManager} is not available`
              : `${packageManager} is available: ${packageManagerVersion}`,
      suggestion:
        packageManager !== undefined && packageManagerVersion === undefined
          ? `Install ${packageManager} or enable it with corepack.`
          : undefined,
      nextStep:
        packageManager !== undefined && packageManagerVersion === undefined
          ? `corepack enable && corepack prepare ${packageManager}@latest --activate`
          : undefined
    }
  ];
};
