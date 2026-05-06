import { parse } from "@babel/parser";
import {
  isIdentifier,
  isImport,
  isMemberExpression,
  isMetaProperty,
  isStringLiteral
} from "@babel/types";

import { readTextFile, toPosixRelativePath } from "../utils/fileSystem.js";

import type { EnvSchemaRequirement, EnvUsage } from "../types.js";
import type { Node } from "@babel/types";

const parserPlugins = [
  "jsx",
  "typescript",
  "importAttributes",
  "decorators-legacy"
] as const;

const knownEnvSchemaFilePattern = /(^|\/)(env|environment|config)\.(c|m)?[tj]sx?$/;

const keyFromMemberProperty = (
  property: Node | null | undefined,
  computed: boolean
): string | undefined => {
  if (computed && isStringLiteral(property)) {
    return property.value;
  }

  if (!computed && isIdentifier(property)) {
    return property.name;
  }

  return undefined;
};

const isProcessEnvObject = (node: Node | null | undefined): boolean =>
  isMemberExpression(node) &&
  isIdentifier(node.object, { name: "process" }) &&
  isIdentifier(node.property, { name: "env" });

const isImportMetaEnvObject = (node: Node | null | undefined): boolean =>
  isMemberExpression(node) &&
  isMetaProperty(node.object) &&
  isImport(node.object.meta) &&
  isIdentifier(node.object.property, { name: "meta" }) &&
  isIdentifier(node.property, { name: "env" });

const isLocalEnvObject = (node: Node | null | undefined): boolean => isIdentifier(node, { name: "env" });

const isNodeLike = (value: unknown): value is Node =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof (value as { type?: unknown }).type === "string";

const walkAst = (node: Node, visit: (node: Node) => void): void => {
  visit(node);

  Object.values(node as unknown as Record<string, unknown>).forEach((value) => {
    if (Array.isArray(value)) {
      value.filter(isNodeLike).forEach((childNode) => walkAst(childNode, visit));
      return;
    }

    if (isNodeLike(value)) {
      walkAst(value, visit);
    }
  });
};

const scanSourceFileForUsage = async (
  rootPath: string,
  sourcePath: string
): Promise<EnvUsage[]> => {
  const content = await readTextFile(sourcePath);

  if (content === undefined) {
    return [];
  }

  const ast = parse(content, {
    errorRecovery: true,
    plugins: [...parserPlugins],
    sourceType: "unambiguous"
  });
  const relativePath = toPosixRelativePath(rootPath, sourcePath);
  const usages: EnvUsage[] = [];

  walkAst(ast, (node) => {
    if (!isMemberExpression(node)) {
      return;
    }

    const key = keyFromMemberProperty(node.property, node.computed);

    if (key === undefined) {
      return;
    }

    if (isProcessEnvObject(node.object)) {
      usages.push({
        key,
        sourcePath: relativePath,
        lineNumber: node.loc?.start.line ?? 1,
        origin: "process.env"
      });
      return;
    }

    if (isImportMetaEnvObject(node.object)) {
      usages.push({
        key,
        sourcePath: relativePath,
        lineNumber: node.loc?.start.line ?? 1,
        origin: "import.meta.env"
      });
      return;
    }

    if (isLocalEnvObject(node.object) && knownEnvSchemaFilePattern.test(relativePath)) {
      usages.push({
        key,
        sourcePath: relativePath,
        lineNumber: node.loc?.start.line ?? 1,
        origin: "env"
      });
    }
  });

  return usages;
};

const scanSourceFileForSchemaRequirements = async (
  rootPath: string,
  sourcePath: string
): Promise<EnvSchemaRequirement[]> => {
  const content = await readTextFile(sourcePath);

  if (content === undefined || (!content.includes("createEnv") && !content.includes("z.object"))) {
    return [];
  }

  const relativePath = toPosixRelativePath(rootPath, sourcePath);
  const schemaKeyPattern =
    /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*z\.[A-Za-z0-9_]+(?:\([^)]*\))?([^,\n}]*)/g;

  return Array.from(content.matchAll(schemaKeyPattern))
    .map((match) => ({
      key: match[1],
      chain: match[2] ?? "",
      index: match.index ?? 0
    }))
    .filter((match): match is { key: string; chain: string; index: number } => match.key !== undefined)
    .map((match) => ({
      key: match.key,
      required: !match.chain.includes(".optional(") && !match.chain.includes(".default("),
      sourcePath: relativePath,
      reason: "zod-schema" as const
    }));
};

export const detectEnvUsage = async (
  rootPath: string,
  sourceFiles: string[]
): Promise<EnvUsage[]> => {
  const usages = await Promise.all(
    sourceFiles
      .filter((sourcePath) => !sourcePath.endsWith(".d.ts"))
      .map((sourcePath) => scanSourceFileForUsage(rootPath, sourcePath))
  );

  return usages
    .flat()
    .filter((usage) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(usage.key))
    .sort((firstUsage, secondUsage) =>
      `${firstUsage.key}:${firstUsage.sourcePath}`.localeCompare(
        `${secondUsage.key}:${secondUsage.sourcePath}`
      )
    );
};

export const detectEnvSchemaRequirements = async (
  rootPath: string,
  sourceFiles: string[]
): Promise<EnvSchemaRequirement[]> => {
  const requirements = await Promise.all(
    sourceFiles
      .filter((sourcePath) => knownEnvSchemaFilePattern.test(toPosixRelativePath(rootPath, sourcePath)))
      .map((sourcePath) => scanSourceFileForSchemaRequirements(rootPath, sourcePath))
  );

  return requirements.flat().sort((firstRequirement, secondRequirement) =>
    firstRequirement.key.localeCompare(secondRequirement.key)
  );
};
