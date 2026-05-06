# runready

`runready` checks whether a local JavaScript/TypeScript project is ready to run.

It is a zero-config, read-only preflight by default. It looks for common setup blockers such as missing env values, mismatched Node/package-manager metadata, missing installs, Docker readiness, script availability, and app port conflicts.

## Usage

```bash
runready
runready check path/to/project
runready doctor path/to/project
runready check --only env --json
runready env sync --dry-run
```

## Commands

- `runready [path]`: run the default preflight checks.
- `runready check [path]`: explicit default check command.
- `runready doctor [path]`: verbose diagnostic output.
- `runready check --only env,runtime,deps,scripts,docker,ports`: run selected categories.
- `runready check --json`: emit machine-readable JSON.
- `runready env sync [path]`: safely align `.env*` and `.env*.example` files after preview/confirmation.

## Env Sync Safety

`runready env sync` can create missing local/example env files and append missing keys, but it never overwrites existing keys or values. Example files created from local env files redact values.

## Development

This CLI requires Node `>=20`.

```bash
pnpm install
pnpm test
pnpm run typecheck
pnpm run lint
pnpm build
```
