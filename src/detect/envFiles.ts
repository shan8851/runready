import path from "node:path";

import fg from "fast-glob";

import { readTextFile, toPosixRelativePath } from "../utils/fileSystem.js";

import type { EnvEntry, EnvFile } from "../types.js";

const ENV_FILE_PATTERN = ".env*";
const EXCLUDED_ENV_FILE_NAMES = new Set([".envrc"]);

const parseProfile = (fileName: string): string => {
  const withoutExample = fileName.endsWith(".example")
    ? fileName.slice(0, -".example".length)
    : fileName;

  return withoutExample === ".env" ? "base" : withoutExample.replace(/^\.env\./, "");
};

const parseEnvEntry = (line: string, lineIndex: number): EnvEntry | undefined => {
  const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/.exec(line);

  if (match?.[1] === undefined) {
    return undefined;
  }

  const rawValue = match[2] ?? "";
  const trimmedValue = rawValue.trim().replace(/^['"]|['"]$/g, "");

  return {
    key: match[1],
    value: trimmedValue,
    isEmpty: trimmedValue.length === 0,
    lineNumber: lineIndex + 1
  };
};

const duplicateKeysFromEntries = (entries: EnvEntry[]): string[] =>
  Array.from(
    entries
      .map((entry) => entry.key)
      .reduce(
        (counts, key) => new Map(counts).set(key, (counts.get(key) ?? 0) + 1),
        new Map<string, number>()
      )
      .entries()
  )
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();

const parseEnvFile = async (rootPath: string, filePath: string): Promise<EnvFile | undefined> => {
  const content = await readTextFile(filePath);

  if (content === undefined) {
    return undefined;
  }

  const fileName = path.basename(filePath);
  const entries = content
    .split(/\r?\n/)
    .map(parseEnvEntry)
    .filter((entry): entry is EnvEntry => entry !== undefined);

  return {
    path: filePath,
    relativePath: toPosixRelativePath(rootPath, filePath),
    profile: parseProfile(fileName),
    kind: fileName.endsWith(".example") ? "example" : "local",
    entries,
    duplicateKeys: duplicateKeysFromEntries(entries)
  };
};

export const detectEnvFiles = async (rootPath: string): Promise<EnvFile[]> => {
  const relativePaths = await fg(ENV_FILE_PATTERN, {
    cwd: rootPath,
    dot: true,
    ignore: ["**/node_modules/**", "**/.git/**"],
    onlyFiles: true,
    unique: true
  });

  const parsedFiles = await Promise.all(
    relativePaths
      .filter((relativePath) => !EXCLUDED_ENV_FILE_NAMES.has(path.basename(relativePath)))
      .map((relativePath) => parseEnvFile(rootPath, path.join(rootPath, relativePath)))
  );

  return parsedFiles
    .filter((envFile): envFile is EnvFile => envFile !== undefined)
    .sort((firstFile, secondFile) => firstFile.relativePath.localeCompare(secondFile.relativePath));
};
