import { constants } from "node:fs";
import { access, appendFile, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { z } from "zod";

export const pathExists = async (filePath: string): Promise<boolean> =>
  access(filePath, constants.F_OK)
    .then(() => true)
    .catch(() => false);

export const readTextFile = async (filePath: string): Promise<string | undefined> =>
  readFile(filePath, "utf8").catch(() => undefined);

export const writeTextFile = async (filePath: string, content: string): Promise<void> => {
  await writeFile(filePath, content, "utf8");
};

export const appendTextFile = async (filePath: string, content: string): Promise<void> => {
  await appendFile(filePath, content, "utf8");
};

export const getModifiedTime = async (filePath: string): Promise<number | undefined> =>
  stat(filePath)
    .then((fileStat) => fileStat.mtimeMs)
    .catch(() => undefined);

export const readJsonFile = async <T>(
  filePath: string,
  schema: z.ZodType<T>
): Promise<T | undefined> => {
  const content = await readTextFile(filePath);

  if (content === undefined) {
    return undefined;
  }

  try {
    return schema.safeParse(JSON.parse(content)).data;
  } catch {
    return undefined;
  }
};

export const toPosixRelativePath = (rootPath: string, filePath: string): string =>
  path.relative(rootPath, filePath).split(path.sep).join("/");

const findUpFrom = async (currentPath: string, fileName: string): Promise<string | undefined> => {
  const candidatePath = path.join(currentPath, fileName);
  const exists = await pathExists(candidatePath);

  if (exists) {
    return candidatePath;
  }

  const parentPath = path.dirname(currentPath);

  return parentPath === currentPath ? undefined : findUpFrom(parentPath, fileName);
};

export const findUp = async (startPath: string, fileName: string): Promise<string | undefined> =>
  findUpFrom(path.resolve(startPath), fileName);
