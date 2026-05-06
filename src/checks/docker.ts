import { commandVersion, runCommand } from "../utils/shell.js";

import type { CheckResult, ProjectContext } from "../types.js";

export const runDockerChecks = async (context: ProjectContext): Promise<CheckResult[]> => {
  const hasDockerFiles = context.dockerFiles.length > 0 || context.composeFiles.length > 0;

  if (!hasDockerFiles) {
    return [
      {
        id: "docker.files",
        category: "docker",
        status: "skip",
        title: "No Docker files detected"
      }
    ];
  }

  const dockerVersion = await commandVersion("docker", ["--version"], context.rootPath);
  const dockerInfo = dockerVersion === undefined ? undefined : await runCommand("docker", ["info"], context.rootPath);

  return [
    {
      id: "docker.files",
      category: "docker",
      status: "pass",
      title: "Docker configuration detected",
      detail: [...context.dockerFiles, ...context.composeFiles].map((filePath) => filePath.split("/").at(-1)).join(", ")
    },
    {
      id: "docker.available",
      category: "docker",
      status: dockerVersion === undefined ? "fail" : "pass",
      title: dockerVersion === undefined ? "Docker is not available" : "Docker is available",
      actual: dockerVersion,
      suggestion: dockerVersion === undefined ? "Install Docker Desktop or Docker Engine." : undefined
    },
    {
      id: "docker.running",
      category: "docker",
      status: dockerVersion === undefined ? "skip" : dockerInfo?.ok === true ? "pass" : "warn",
      title:
        dockerVersion === undefined
          ? "Docker running check skipped"
          : dockerInfo?.ok === true
            ? "Docker daemon is running"
            : "Docker daemon is not reachable",
      suggestion:
        dockerVersion !== undefined && dockerInfo?.ok !== true
          ? "Start Docker before running services from Compose."
          : undefined
    }
  ];
};
