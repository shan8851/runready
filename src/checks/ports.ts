import net from "node:net";

import { readTextFile } from "../utils/fileSystem.js";

import type { CheckResult, ProjectContext } from "../types.js";

const appPortKeys = new Set(["PORT", "APP_PORT", "WEB_PORT", "VITE_PORT", "NEXT_PORT"]);

const isPortFree = async (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });

const numericPortFromValue = (value: string): number | undefined => {
  const port = Number.parseInt(value, 10);

  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : undefined;
};

const inferAppPortsFromEnv = (context: ProjectContext): number[] =>
  Array.from(
    new Set(
      context.envFiles
        .flatMap((envFile) => envFile.entries)
        .filter((entry) => appPortKeys.has(entry.key))
        .map((entry) => numericPortFromValue(entry.value))
        .filter((port): port is number => port !== undefined)
    )
  ).sort((firstPort, secondPort) => firstPort - secondPort);

const inferComposePorts = async (context: ProjectContext): Promise<number[]> => {
  const composeContents = await Promise.all(context.composeFiles.map(readTextFile));
  const hostPortMatches = composeContents
    .filter((content): content is string => content !== undefined)
    .flatMap((content) => Array.from(content.matchAll(/["']?(\d{2,5}):\d{2,5}["']?/g)))
    .map((match) => numericPortFromValue(match[1] ?? ""));

  return Array.from(new Set(hostPortMatches.filter((port): port is number => port !== undefined))).sort(
    (firstPort, secondPort) => firstPort - secondPort
  );
};

export const runPortChecks = async (context: ProjectContext): Promise<CheckResult[]> => {
  const appPorts = inferAppPortsFromEnv(context);
  const composePorts = await inferComposePorts(context);
  const appPortStatuses = await Promise.all(
    appPorts.map(async (port) => ({
      port,
      isFree: await isPortFree(port)
    }))
  );
  const occupiedAppPorts = appPortStatuses.filter((portStatus) => !portStatus.isFree).map((portStatus) => portStatus.port);

  return [
    {
      id: "ports.inferred",
      category: "ports",
      status: appPorts.length > 0 || composePorts.length > 0 ? "pass" : "skip",
      title:
        appPorts.length > 0 || composePorts.length > 0
          ? "Inferred project ports"
          : "No ports inferred",
      detail: [
        appPorts.length > 0 ? `App: ${appPorts.join(", ")}` : undefined,
        composePorts.length > 0 ? `Compose: ${composePorts.join(", ")}` : undefined
      ]
        .filter((detail): detail is string => detail !== undefined)
        .join(" | ")
    },
    {
      id: "ports.app-free",
      category: "ports",
      status: occupiedAppPorts.length > 0 ? "warn" : appPorts.length > 0 ? "pass" : "skip",
      title:
        occupiedAppPorts.length > 0
          ? `${occupiedAppPorts.length} app ${occupiedAppPorts.length === 1 ? "port is" : "ports are"} already in use`
          : appPorts.length > 0
            ? "Inferred app ports are free"
            : "App port conflict check skipped",
      detail: occupiedAppPorts.length > 0 ? occupiedAppPorts.join(", ") : undefined,
      suggestion:
        occupiedAppPorts.length > 0
          ? "Free the port or set a different app port in your local env."
          : undefined
    }
  ];
};
