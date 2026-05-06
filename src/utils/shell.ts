import { execa } from "execa";

export type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
};

export const runCommand = async (
  command: string,
  args: string[],
  cwd: string
): Promise<CommandResult> =>
  execa(command, args, { cwd, reject: false })
    .then((result) => ({
      ok: result.exitCode === 0,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    }))
    .catch((error: unknown) => ({
      ok: false,
      stdout: "",
      stderr: error instanceof Error ? error.message : "Command failed"
    }));

export const commandVersion = async (
  command: string,
  args: string[],
  cwd: string
): Promise<string | undefined> => {
  const result = await runCommand(command, args, cwd);

  return result.ok ? result.stdout : undefined;
};
