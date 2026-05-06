import path from "node:path";

import { detectEnvSchemaRequirements, detectEnvUsage } from "../detect/envUsage.js";

import type { CheckResult, EnvFile, ProjectContext } from "../types.js";

const ambientEnvKeys = new Set([
  "CI",
  "DEBUG",
  "FORCE_COLOR",
  "APPDATA",
  "HOME",
  "LOCALAPPDATA",
  "NO_COLOR",
  "NODE_ENV",
  "PATH",
  "PWD",
  "SHELL",
  "USER",
  "XDG_CACHE_HOME"
]);

const uniqueSorted = (values: string[]): string[] => Array.from(new Set(values)).sort();

const keysFromEnvFile = (envFile: EnvFile | undefined): string[] =>
  envFile === undefined ? [] : uniqueSorted(envFile.entries.map((entry) => entry.key));

const envFileLabel = (envFile: EnvFile): string =>
  envFile.profile === "base" ? envFile.relativePath : `${envFile.relativePath} (${envFile.profile})`;

const summarizeKeys = (keys: string[]): string =>
  keys.length <= 8 ? keys.join(", ") : `${keys.slice(0, 8).join(", ")} and ${keys.length - 8} more`;

const buildDuplicateResults = (envFiles: EnvFile[]): CheckResult[] =>
  envFiles
    .filter((envFile) => envFile.duplicateKeys.length > 0)
    .map((envFile) => ({
      id: `env.duplicates.${envFile.relativePath}`,
      category: "env" as const,
      status: "warn" as const,
      title: `Duplicate env keys in ${envFile.relativePath}`,
      detail: summarizeKeys(envFile.duplicateKeys),
      suggestion: "Keep one declaration for each key so checks are deterministic."
    }));

const buildExamplePairResults = (envFiles: EnvFile[]): CheckResult[] => {
  const localByProfile = new Map(
    envFiles.filter((envFile) => envFile.kind === "local").map((envFile) => [envFile.profile, envFile])
  );

  return envFiles
    .filter((envFile) => envFile.kind === "example")
    .map((exampleFile) => {
      const localFile = localByProfile.get(exampleFile.profile);
      const localKeys = new Set(keysFromEnvFile(localFile));
      const missingKeys = keysFromEnvFile(exampleFile).filter((key) => !localKeys.has(key));
      const missingEmptyKeys = exampleFile.entries
        .filter((entry) => entry.isEmpty && !localKeys.has(entry.key))
        .map((entry) => entry.key);

      if (localFile === undefined) {
        return {
          id: `env.local-file.${exampleFile.profile}`,
          category: "env" as const,
          status: exampleFile.entries.length > 0 ? ("fail" as const) : ("warn" as const),
          title: `Missing local env file for ${envFileLabel(exampleFile)}`,
          detail:
            exampleFile.entries.length > 0
              ? `Expected ${exampleFile.relativePath.replace(/\.example$/, "")}`
              : "The example file has no keys.",
          suggestion: "Create the local env file from its example.",
          nextStep: "runready env sync"
        };
      }

      if (missingKeys.length === 0) {
        return {
          id: `env.example.${exampleFile.profile}`,
          category: "env" as const,
          status: "pass" as const,
          title: `${envFileLabel(localFile)} matches ${exampleFile.relativePath}`
        };
      }

      return {
        id: `env.missing.${exampleFile.profile}`,
        category: "env" as const,
        status: "fail" as const,
        title: `${localFile.relativePath} is missing ${missingKeys.length} env ${missingKeys.length === 1 ? "key" : "keys"}`,
        detail: summarizeKeys(missingKeys),
        suggestion:
          missingEmptyKeys.length > 0
            ? "Add the missing keys and fill their values locally."
            : "Sync the missing keys from the example file.",
        nextStep: "runready env sync"
      };
    });
};

export const runEnvChecks = async (context: ProjectContext): Promise<CheckResult[]> => {
  const envFiles = context.envFiles;
  const localFiles = envFiles.filter((envFile) => envFile.kind === "local");
  const exampleFiles = envFiles.filter((envFile) => envFile.kind === "example");
  const allEnvKeys = new Set(envFiles.flatMap(keysFromEnvFile));
  const envUsage = await detectEnvUsage(context.rootPath, context.sourceFiles);
  const projectEnvUsage = envUsage.filter((usage) => !ambientEnvKeys.has(usage.key));
  const schemaRequirements = await detectEnvSchemaRequirements(context.rootPath, context.sourceFiles);
  const requiredSchemaKeys = uniqueSorted(
    schemaRequirements.filter((requirement) => requirement.required).map((requirement) => requirement.key)
  );
  const optionalSchemaKeys = uniqueSorted(
    schemaRequirements.filter((requirement) => !requirement.required).map((requirement) => requirement.key)
  );
  const localKeys = new Set(localFiles.flatMap(keysFromEnvFile));
  const missingSchemaKeys = requiredSchemaKeys.filter((key) => !localKeys.has(key));
  const undocumentedSourceKeys = uniqueSorted(
    projectEnvUsage
      .map((usage) => usage.key)
      .filter((key) =>
        !allEnvKeys.has(key) &&
        !requiredSchemaKeys.includes(key) &&
        !optionalSchemaKeys.includes(key)
      )
  );
  const localOnlyKeys = uniqueSorted(
    localFiles
      .flatMap(keysFromEnvFile)
      .filter((key) => !exampleFiles.flatMap(keysFromEnvFile).includes(key) && !requiredSchemaKeys.includes(key))
  );
  const emptyLocalKeys = uniqueSorted(
    localFiles.flatMap((envFile) =>
      envFile.entries.filter((entry) => entry.isEmpty).map((entry) => `${entry.key} (${path.basename(envFile.path)})`)
    )
  );

  return [
    {
      id: "env.files",
      category: "env",
      status: envFiles.length > 0 ? "pass" : "skip",
      title:
        envFiles.length > 0
          ? `Detected ${envFiles.length} env ${envFiles.length === 1 ? "file" : "files"}`
          : "No env files detected",
      detail: envFiles.length > 0 ? envFiles.map(envFileLabel).join(", ") : undefined
    },
    ...buildDuplicateResults(envFiles),
    ...buildExamplePairResults(envFiles),
    {
      id: "env.schema",
      category: "env",
      status: schemaRequirements.length > 0 ? "pass" : "skip",
      title:
        schemaRequirements.length > 0
          ? `Detected env schema: ${requiredSchemaKeys.length} required, ${optionalSchemaKeys.length} optional`
          : "No T3/Zod env schema detected",
      detail:
        requiredSchemaKeys.length > 0
          ? `Required: ${summarizeKeys(requiredSchemaKeys)}`
          : optionalSchemaKeys.length > 0
            ? `Optional: ${summarizeKeys(optionalSchemaKeys)}`
            : undefined
    },
    {
      id: "env.schema.missing",
      category: "env",
      status: missingSchemaKeys.length > 0 ? "fail" : schemaRequirements.length > 0 ? "pass" : "skip",
      title:
        missingSchemaKeys.length > 0
          ? `Local env is missing ${missingSchemaKeys.length} required schema ${missingSchemaKeys.length === 1 ? "key" : "keys"}`
          : schemaRequirements.length > 0
            ? "Required schema env keys are present locally"
            : "Schema requiredness check skipped",
      detail: missingSchemaKeys.length > 0 ? summarizeKeys(missingSchemaKeys) : undefined,
      nextStep: missingSchemaKeys.length > 0 ? "runready env sync" : undefined
    },
    {
      id: "env.empty",
      category: "env",
      status: emptyLocalKeys.length > 0 ? "warn" : localFiles.length > 0 ? "pass" : "skip",
      title:
        emptyLocalKeys.length > 0
          ? `${emptyLocalKeys.length} local env ${emptyLocalKeys.length === 1 ? "key is" : "keys are"} empty`
          : localFiles.length > 0
            ? "No empty local env values detected"
            : "Empty value check skipped",
      detail: emptyLocalKeys.length > 0 ? summarizeKeys(emptyLocalKeys) : undefined
    },
    {
      id: "env.source",
      category: "env",
      status: projectEnvUsage.length > 0 ? "pass" : "skip",
      title:
        projectEnvUsage.length > 0
          ? `Detected ${uniqueSorted(projectEnvUsage.map((usage) => usage.key)).length} env keys in source`
          : "No static env usage detected"
    },
    {
      id: "env.source.undocumented",
      category: "env",
      status: undocumentedSourceKeys.length > 0 ? "warn" : projectEnvUsage.length > 0 ? "pass" : "skip",
      title:
        undocumentedSourceKeys.length > 0
          ? `${undocumentedSourceKeys.length} source env ${undocumentedSourceKeys.length === 1 ? "key is" : "keys are"} undocumented`
          : projectEnvUsage.length > 0
            ? "Source env usage is documented"
            : "Source env documentation check skipped",
      detail: undocumentedSourceKeys.length > 0 ? summarizeKeys(undocumentedSourceKeys) : undefined,
      suggestion:
        undocumentedSourceKeys.length > 0
          ? "Add these keys to an example env file or schema if they are real project inputs."
          : undefined
    },
    {
      id: "env.local.undocumented",
      category: "env",
      status: localOnlyKeys.length > 0 && exampleFiles.length > 0 ? "warn" : "pass",
      title:
        localOnlyKeys.length > 0 && exampleFiles.length > 0
          ? `${localOnlyKeys.length} local env ${localOnlyKeys.length === 1 ? "key is" : "keys are"} missing from examples`
          : "Local env examples look aligned",
      detail: localOnlyKeys.length > 0 && exampleFiles.length > 0 ? summarizeKeys(localOnlyKeys) : undefined,
      nextStep: localOnlyKeys.length > 0 && exampleFiles.length > 0 ? "runready env sync" : undefined
    }
  ];
};
