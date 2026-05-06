export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export type CheckCategory =
  | "repo"
  | "runtime"
  | "deps"
  | "env"
  | "scripts"
  | "docker"
  | "ports";

export type CheckResult = {
  id: string;
  category: CheckCategory;
  status: CheckStatus;
  title: string;
  detail?: string;
  expected?: string;
  actual?: string;
  suggestion?: string;
  nextStep?: string;
};

export type PackageManagerName = "pnpm" | "npm" | "yarn" | "bun";

export type PackageJson = {
  name?: string;
  packageManager?: string;
  engines?: {
    node?: string;
  };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  workspaces?: unknown;
};

export type Lockfile = {
  name: string;
  packageManager: PackageManagerName;
  path: string;
};

export type EnvEntry = {
  key: string;
  value: string;
  isEmpty: boolean;
  lineNumber: number;
};

export type EnvFile = {
  path: string;
  relativePath: string;
  profile: string;
  kind: "local" | "example";
  entries: EnvEntry[];
  duplicateKeys: string[];
};

export type EnvUsage = {
  key: string;
  sourcePath: string;
  lineNumber: number;
  origin: "process.env" | "import.meta.env" | "env";
};

export type EnvSchemaRequirement = {
  key: string;
  required: boolean;
  sourcePath: string;
  reason: "zod-schema";
};

export type ProjectContext = {
  targetPath: string;
  rootPath: string;
  name: string;
  isGitRepo: boolean;
  projectTypes: string[];
  packageJsonPath?: string;
  packageJson?: PackageJson;
  lockfiles: Lockfile[];
  inferredPackageManager?: PackageManagerName;
  packageManagerField?: PackageManagerName;
  envFiles: EnvFile[];
  sourceFiles: string[];
  dockerFiles: string[];
  composeFiles: string[];
  hasYarnPnp: boolean;
};

export type RunSummary = Record<CheckStatus, number>;

export type RunReport = {
  schemaVersion: 1;
  ok: boolean;
  summary: RunSummary;
  project: {
    name: string;
    root: string;
    type: string[];
  };
  checks: CheckResult[];
  nextSteps: string[];
};

export type CheckOptions = {
  only: CheckCategory[];
  strict: boolean;
  verbose: boolean;
};

export type EnvSyncChange = {
  action: "create-local" | "create-example" | "append-local-key" | "append-example-key";
  filePath: string;
  title: string;
  detail: string;
  content?: string;
  key?: string;
};

export type EnvSyncConflict = {
  filePath: string;
  title: string;
  detail: string;
};

export type EnvSyncPlan = {
  changes: EnvSyncChange[];
  conflicts: EnvSyncConflict[];
};
