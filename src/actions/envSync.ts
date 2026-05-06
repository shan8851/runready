import path from "node:path";

import { appendTextFile, pathExists, readTextFile, writeTextFile } from "../utils/fileSystem.js";

import type { EnvEntry, EnvFile, EnvSyncConflict, EnvSyncPlan, ProjectContext } from "../types.js";

const localPathForExample = (exampleFile: EnvFile): string =>
  exampleFile.path.endsWith(".example")
    ? exampleFile.path.slice(0, -".example".length)
    : exampleFile.path.replace(/\.env$/, ".env.local");

const examplePathForLocal = (localFile: EnvFile): string => `${localFile.path}.example`;

const keysFromEntries = (entries: EnvEntry[]): Set<string> => new Set(entries.map((entry) => entry.key));

const redactEnvContent = (content: string): string =>
  content
    .split(/\r?\n/)
    .map((line) => {
      const match = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*).*$/.exec(line);

      return match?.[1] === undefined ? line : `${match[1]}`;
    })
    .join("\n");

const appendContentForEntries = (entries: EnvEntry[], useExampleValues: boolean): string =>
  entries.length === 0
    ? ""
    : `\n${entries
        .map((entry) => `${entry.key}=${useExampleValues ? entry.value : ""}`)
        .join("\n")}\n`;

const duplicateProfileConflicts = (envFiles: EnvFile[], kind: EnvFile["kind"]): EnvSyncConflict[] => {
  const counts = envFiles
    .filter((envFile) => envFile.kind === kind)
    .reduce(
      (profileCounts, envFile) =>
        new Map(profileCounts).set(envFile.profile, (profileCounts.get(envFile.profile) ?? 0) + 1),
      new Map<string, number>()
    );

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([profile]) => ({
      filePath: "",
      title: `Ambiguous ${kind} env profile: ${profile}`,
      detail: "Multiple env files map to the same profile, so sync skipped that profile."
    }));
};

const duplicateKeyConflicts = (envFiles: EnvFile[]): EnvSyncConflict[] =>
  envFiles
    .filter((envFile) => envFile.duplicateKeys.length > 0)
    .map((envFile) => ({
      filePath: envFile.path,
      title: `Duplicate keys in ${envFile.relativePath}`,
      detail: `Resolve duplicates before syncing: ${envFile.duplicateKeys.join(", ")}`
    }));

export const createEnvSyncPlan = async (context: ProjectContext): Promise<EnvSyncPlan> => {
  const envFiles = context.envFiles;
  const localFiles = envFiles.filter((envFile) => envFile.kind === "local");
  const exampleFiles = envFiles.filter((envFile) => envFile.kind === "example");
  const localByProfile = new Map(localFiles.map((envFile) => [envFile.profile, envFile]));
  const exampleByProfile = new Map(exampleFiles.map((envFile) => [envFile.profile, envFile]));
  const conflicts = [
    ...duplicateProfileConflicts(envFiles, "local"),
    ...duplicateProfileConflicts(envFiles, "example"),
    ...duplicateKeyConflicts(envFiles)
  ];
  const conflictedProfiles = new Set(
    conflicts
      .map((conflict) => /profile: (.*)$/.exec(conflict.title)?.[1])
      .filter((profile): profile is string => profile !== undefined)
  );
  const createLocalChanges = await Promise.all(
    exampleFiles
      .filter((exampleFile) => !conflictedProfiles.has(exampleFile.profile))
      .filter((exampleFile) => !localByProfile.has(exampleFile.profile))
      .map(async (exampleFile) => ({
        action: "create-local" as const,
        filePath: localPathForExample(exampleFile),
        title: `Create ${path.basename(localPathForExample(exampleFile))}`,
        detail: `From ${exampleFile.relativePath}`,
        content: (await readTextFile(exampleFile.path)) ?? ""
      }))
  );
  const createExampleChanges = await Promise.all(
    localFiles
      .filter((localFile) => !conflictedProfiles.has(localFile.profile))
      .filter((localFile) => !exampleByProfile.has(localFile.profile))
      .map(async (localFile) => ({
        action: "create-example" as const,
        filePath: examplePathForLocal(localFile),
        title: `Create ${path.basename(examplePathForLocal(localFile))}`,
        detail: `From ${localFile.relativePath} with values redacted`,
        content: redactEnvContent((await readTextFile(localFile.path)) ?? "")
      }))
  );
  const appendLocalChanges = exampleFiles
    .filter((exampleFile) => !conflictedProfiles.has(exampleFile.profile))
    .flatMap((exampleFile) => {
      const localFile = localByProfile.get(exampleFile.profile);
      const localKeys = keysFromEntries(localFile?.entries ?? []);
      const missingEntries = exampleFile.entries.filter((entry) => !localKeys.has(entry.key));

      return localFile === undefined || missingEntries.length === 0
        ? []
        : [
            {
              action: "append-local-key" as const,
              filePath: localFile.path,
              title: `Add ${missingEntries.length} missing ${missingEntries.length === 1 ? "key" : "keys"} to ${localFile.relativePath}`,
              detail: missingEntries.map((entry) => entry.key).join(", "),
              content: appendContentForEntries(missingEntries, true)
            }
          ];
    });
  const appendExampleChanges = localFiles
    .filter((localFile) => !conflictedProfiles.has(localFile.profile))
    .flatMap((localFile) => {
      const exampleFile = exampleByProfile.get(localFile.profile);
      const exampleKeys = keysFromEntries(exampleFile?.entries ?? []);
      const missingEntries = localFile.entries.filter((entry) => !exampleKeys.has(entry.key));

      return exampleFile === undefined || missingEntries.length === 0
        ? []
        : [
            {
              action: "append-example-key" as const,
              filePath: exampleFile.path,
              title: `Document ${missingEntries.length} local ${missingEntries.length === 1 ? "key" : "keys"} in ${exampleFile.relativePath}`,
              detail: missingEntries.map((entry) => entry.key).join(", "),
              content: appendContentForEntries(missingEntries, false)
            }
          ];
    });

  return {
    changes: [...createLocalChanges, ...createExampleChanges, ...appendLocalChanges, ...appendExampleChanges],
    conflicts
  };
};

export const applyEnvSyncPlan = async (plan: EnvSyncPlan): Promise<void> => {
  await Promise.all(
    plan.changes.map(async (change) => {
      const exists = await pathExists(change.filePath);

      if (change.action === "create-local" || change.action === "create-example") {
        if (exists) {
          return;
        }

        await writeTextFile(change.filePath, change.content ?? "");
        return;
      }

      await appendTextFile(change.filePath, change.content ?? "");
    })
  );
};
