import type { RunReport } from "../types.js";

export const renderJsonReport = (report: RunReport): string => `${JSON.stringify(report, null, 2)}\n`;
