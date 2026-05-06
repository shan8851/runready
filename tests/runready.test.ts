import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createEnvSyncPlan, applyEnvSyncPlan } from "../src/actions/envSync.js";
import { runEnvChecks } from "../src/checks/env.js";
import { detectProject } from "../src/detect/project.js";
import { executeCheck } from "../src/cli.js";

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

const fixturePath = (name: string): string => path.join(fixtureRoot, name);

const withTempFixture = async <T>(fixtureName: string, callback: (tempPath: string) => Promise<T>): Promise<T> => {
  const tempPath = await mkdtemp(path.join(os.tmpdir(), `runready-${fixtureName}-`));

  try {
    await cp(fixturePath(fixtureName), tempPath, { recursive: true });
    return await callback(tempPath);
  } finally {
    await rm(tempPath, { recursive: true, force: true });
  }
};

describe("runready", () => {
  it("detects a JS/TS project and package manager metadata", async () => {
    const context = await detectProject(fixturePath("basic"));

    expect(context.name).toBe("basic-app");
    expect(context.inferredPackageManager).toBe("pnpm");
    expect(context.projectTypes).toContain("node");
    expect(context.projectTypes).toContain("typescript");
    expect(context.envFiles.map((envFile) => envFile.relativePath)).toEqual([".env", ".env.example"]);
  });

  it("reports missing example env keys and undocumented source usage", async () => {
    const context = await detectProject(fixturePath("basic"));
    const checks = await runEnvChecks(context);

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "env.missing.base",
          status: "fail",
          detail: "REDIS_URL"
        }),
        expect.objectContaining({
          id: "env.source.undocumented",
          status: "warn",
          detail: "SOURCE_ONLY"
        })
      ])
    );
  });

  it("uses obvious T3/Zod schemas for requiredness without treating optional/default vars as required", async () => {
    const context = await detectProject(fixturePath("t3"));
    const checks = await runEnvChecks(context);

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "env.schema",
          status: "pass",
          detail: "Required: REQUIRED_URL"
        }),
        expect.objectContaining({
          id: "env.schema.missing",
          status: "fail",
          detail: "REQUIRED_URL"
        })
      ])
    );
  });

  it("plans env sync without overwriting existing values or leaking local values into examples", async () => {
    await withTempFixture("sync", async (tempPath) => {
      const context = await detectProject(tempPath);
      const plan = await createEnvSyncPlan(context);

      expect(plan.changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "append-local-key",
            detail: "REDIS_URL"
          }),
          expect.objectContaining({
            action: "append-example-key",
            detail: "LOCAL_ONLY_SECRET"
          })
        ])
      );

      await applyEnvSyncPlan(plan);

      const envContent = await readFile(path.join(tempPath, ".env"), "utf8");
      const exampleContent = await readFile(path.join(tempPath, ".env.example"), "utf8");

      expect(envContent).toContain("DATABASE_URL=postgres://localhost/example");
      expect(envContent).toContain("REDIS_URL=");
      expect(exampleContent).toContain("LOCAL_ONLY_SECRET=");
      expect(exampleContent).not.toContain("super-secret");
    });
  });

  it("emits JSON with stable status and no ANSI output", async () => {
    const execution = await executeCheck(fixturePath("basic"), {
      json: true,
      only: "env"
    });
    const parsedOutput = JSON.parse(execution.output) as { ok: boolean; checks: Array<{ id: string }> };

    expect(execution.exitCode).toBe(1);
    expect(parsedOutput.ok).toBe(false);
    expect(parsedOutput.checks.some((check) => check.id === "env.missing.base")).toBe(true);
    expect(execution.output).not.toContain("\u001B");
  });
});
