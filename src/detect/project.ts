import path from "node:path";

import fg from "fast-glob";
import { z } from "zod";

import { detectEnvFiles } from "./envFiles.js";
import { findUp, pathExists, readJsonFile } from "../utils/fileSystem.js";
import { runCommand } from "../utils/shell.js";

import type { Lockfile, PackageJson, PackageManagerName, ProjectContext } from "../types.js";

const packageJsonSchema: z.ZodType<PackageJson> = z
  .object({
    name: z.string().optional(),
    packageManager: z.string().optional(),
    engines: z.object({ node: z.string().optional() }).optional(),
    scripts: z.record(z.string(), z.string()).optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
    optionalDependencies: z.record(z.string(), z.string()).optional(),
    workspaces: z.unknown().optional()
  })
  .passthrough();

const lockfileDefinitions: Array<Omit<Lockfile, "path">> = [
  { name: "pnpm-lock.yaml", packageManager: "pnpm" },
  { name: "package-lock.json", packageManager: "npm" },
  { name: "yarn.lock", packageManager: "yarn" },
  { name: "bun.lockb", packageManager: "bun" },
  { name: "bun.lock", packageManager: "bun" }
];

const sourceFilePatterns = ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"];
const sourceIgnores = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/.turbo/**",
  "**/.git/**",
  "**/tests/fixtures/**",
  "**/__fixtures__/**",
  "**/*.test.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  "**/*.spec.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"
];

const dockerFileNames = ["Dockerfile", "Dockerfile.dev"];
const composeFileNames = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];

const parsePackageManagerField = (packageManager?: string): PackageManagerName | undefined => {
  const name = packageManager?.split("@").filter(Boolean).at(0);

  return name === "pnpm" || name === "npm" || name === "yarn" || name === "bun" ? name : undefined;
};

const detectGitRoot = async (targetPath: string): Promise<string | undefined> => {
  const result = await runCommand("git", ["rev-parse", "--show-toplevel"], targetPath);

  return result.ok ? result.stdout : undefined;
};

const hasProjectMarkerAtTarget = async (targetPath: string): Promise<boolean> => {
  const markerChecks = await Promise.all(
    [
      "package.json",
      "tsconfig.json",
      ".env",
      ".env.example",
      ...dockerFileNames,
      ...composeFileNames
    ].map((fileName) => pathExists(path.join(targetPath, fileName)))
  );

  return markerChecks.some(Boolean);
};

const detectLockfiles = async (rootPath: string): Promise<Lockfile[]> => {
  const existingLockfiles = await Promise.all(
    lockfileDefinitions.map(async (definition) => ({
      ...definition,
      path: path.join(rootPath, definition.name),
      exists: await pathExists(path.join(rootPath, definition.name))
    }))
  );

  return existingLockfiles
    .filter((lockfile) => lockfile.exists)
    .map((lockfile) => ({
      name: lockfile.name,
      packageManager: lockfile.packageManager,
      path: lockfile.path
    }));
};

const detectNamedFiles = async (rootPath: string, fileNames: string[]): Promise<string[]> => {
  const results = await Promise.all(
    fileNames.map(async (fileName) => ({
      filePath: path.join(rootPath, fileName),
      exists: await pathExists(path.join(rootPath, fileName))
    }))
  );

  return results.filter((result) => result.exists).map((result) => result.filePath);
};

const detectProjectTypes = (input: {
  packageJson?: PackageJson;
  sourceFiles: string[];
  dockerFiles: string[];
  composeFiles: string[];
}): string[] =>
  [
    input.packageJson === undefined ? undefined : "node",
    input.sourceFiles.some((filePath) => /\.(ts|tsx|mts|cts)$/.test(filePath)) ? "typescript" : undefined,
    input.dockerFiles.length > 0 || input.composeFiles.length > 0 ? "docker" : undefined
  ].filter((projectType): projectType is string => projectType !== undefined);

export const detectProject = async (targetPathInput: string): Promise<ProjectContext> => {
  const targetPath = path.resolve(targetPathInput);
  const gitRoot = await detectGitRoot(targetPath);
  const packageJsonPathFromUp = await findUp(targetPath, "package.json");
  const hasMarkerAtTarget = await hasProjectMarkerAtTarget(targetPath);
  const rootPath =
    hasMarkerAtTarget
      ? targetPath
      : gitRoot ?? path.dirname(packageJsonPathFromUp ?? path.join(targetPath, "package.json"));
  const packageJsonPath = path.join(rootPath, "package.json");
  const packageJson = await readJsonFile(packageJsonPath, packageJsonSchema);
  const lockfiles = await detectLockfiles(rootPath);
  const sourceFiles = await fg(sourceFilePatterns, {
    absolute: true,
    cwd: rootPath,
    ignore: sourceIgnores,
    onlyFiles: true,
    unique: true
  });
  const dockerFiles = await detectNamedFiles(rootPath, dockerFileNames);
  const composeFiles = await detectNamedFiles(rootPath, composeFileNames);
  const envFiles = await detectEnvFiles(rootPath);
  const packageManagerField = parsePackageManagerField(packageJson?.packageManager);
  const inferredPackageManager = packageManagerField ?? lockfiles.at(0)?.packageManager;
  const hasYarnPnp = await pathExists(path.join(rootPath, ".pnp.cjs"));
  const projectTypes = detectProjectTypes({ packageJson, sourceFiles, dockerFiles, composeFiles });

  return {
    targetPath,
    rootPath,
    name: packageJson?.name ?? path.basename(rootPath),
    isGitRepo: gitRoot !== undefined,
    projectTypes,
    packageJsonPath: packageJson === undefined ? undefined : packageJsonPath,
    packageJson,
    lockfiles,
    inferredPackageManager,
    packageManagerField,
    envFiles,
    sourceFiles,
    dockerFiles,
    composeFiles,
    hasYarnPnp
  };
};
