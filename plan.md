# runready — Original Plan

Implementation note: the working CLI/package name was changed from `envdoctor` to `runready`, and V1 intentionally ships without a config file. The implemented command surface is documented in `README.md`.

## High-level goal

Build a fast, deterministic CLI that diagnoses why a local development environment will not run.

The core promise:

> Run `envdoctor` in a repo and get a clear checklist of what is missing, broken, mismatched, or likely to fail — plus the next commands to fix it.

No LLM required. No SaaS. No auth. No magic. Just useful checks with excellent output.

## Target users

- Developers onboarding to a repo
- OSS maintainers who are tired of broken setup instructions
- Teams with flaky local dev environments
- Solo builders juggling lots of projects
- Agent/coding-assistant workflows that need a deterministic environment preflight before attempting work

## MVP scope

The first version should work well for common Node/TypeScript projects, with a structure that can later support Python, Go, Rust, Docker-heavy apps, Rails, etc.

MVP checks:

1. Repo detection
   - Detect git repo root
   - Detect project type from files:
     - `package.json`
     - lockfiles: `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`
     - `Dockerfile`
     - `docker-compose.yml` / `compose.yml`
     - `.env.example`

2. Runtime checks
   - Node installed
   - Node version satisfies `package.json#engines.node` when present
   - Package manager installed and matches lockfile/packageManager field
   - Git installed
   - Docker installed/running if Docker files exist or config requires it

3. Dependency checks
   - `node_modules` exists when appropriate
   - lockfile present
   - package manager can be resolved
   - optional: detect stale install by comparing lockfile/package.json mtimes to `node_modules`

4. Environment variable checks
   - Compare variables referenced in `.env.example` against `.env`
   - Never print secret values
   - Report missing, unused, or suspicious empty values
   - Later: scan source for `process.env.X` and compare with env files

5. Service/port checks
   - Read configured ports from `envdoctor.yml`
   - Optionally infer common services from Docker Compose
   - Check if expected ports are reachable/listening
   - Detect common conflicts: app port already taken, database port missing, Redis missing

6. Script checks
   - Inspect `package.json#scripts`
   - Detect common scripts: `dev`, `build`, `test`, `typecheck`, `lint`
   - Optional safe dry-run mode for configured checks

7. Output
   - Clear pass/fail/warn summary
   - Human-friendly explanation
   - Suggested next actions in order
   - Machine-readable JSON mode for agents/CI

## Non-goals for MVP

- Do not execute arbitrary project commands by default
- Do not read or print secret values
- Do not require cloud auth
- Do not use LLMs
- Do not try to support every language on day one
- Do not become a full CI runner

## Suggested CLI shape

```bash
envdoctor
```

Runs all safe checks in the current repo.

```bash
envdoctor check
```

Explicit alias for default behaviour.

```bash
envdoctor check --only env
```

Only run environment variable checks.

```bash
envdoctor check --only docker
```

Only run Docker/service checks.

```bash
envdoctor check --only runtime
```

Only run language/runtime/package-manager checks.

```bash
envdoctor check --only ports
```

Only run port/service reachability checks.

```bash
envdoctor doctor
```

More verbose guided output with explanations and suggested fixes.

```bash
envdoctor init
```

Generate a starter `envdoctor.yml` for the current repo.

```bash
envdoctor init --detect
```

Generate `envdoctor.yml` from detected package manager, env examples, Docker Compose services, and common scripts.

```bash
envdoctor json
```

Emit JSON output for agents, CI, or other tooling.

```bash
envdoctor check --fix
```

Optional future mode. Only performs safe fixes, for example:

- create `.env` from `.env.example`
- suggest package manager install command
- maybe run package install only if explicitly configured/confirmed

Do not implement risky fixes early.

## Example human output

```txt
envdoctor — local environment check

Repo: shan_site
Type: Node / TypeScript
Package manager: pnpm

✓ Git repo detected
✓ Node installed: 22.14.0
✗ Node version mismatch: package requires >=24, found 22.14.0
✓ pnpm installed: 10.12.1
✗ .env missing 2 required variables: DATABASE_URL, REDIS_URL
✗ Postgres not reachable on localhost:5432
✓ Docker is running
⚠ Port 3000 is already in use

Next steps:
1. nvm install 24 && nvm use 24
2. cp .env.example .env
3. docker compose up -d postgres redis
4. Free port 3000 or set PORT=3001
```

## Example JSON output

```json
{
  "ok": false,
  "summary": {
    "pass": 4,
    "warn": 1,
    "fail": 3
  },
  "repo": {
    "name": "shan_site",
    "root": "/path/to/repo",
    "type": ["node", "typescript"]
  },
  "checks": [
    {
      "id": "runtime.node.version",
      "status": "fail",
      "title": "Node version mismatch",
      "expected": ">=24",
      "actual": "22.14.0",
      "suggestion": "nvm install 24 && nvm use 24"
    }
  ],
  "nextSteps": [
    "nvm install 24 && nvm use 24",
    "cp .env.example .env",
    "docker compose up -d postgres redis"
  ]
}
```

## Config file proposal

`envdoctor.yml`

```yaml
runtime:
  node: ">=24"
  packageManager: pnpm

env:
  files:
    example: .env.example
    local: .env
  required:
    - DATABASE_URL
    - REDIS_URL

services:
  postgres:
    host: localhost
    port: 5432
    required: true
  redis:
    host: localhost
    port: 6379
    required: true

ports:
  app:
    port: 3000
    shouldBeFree: true

checks:
  safe:
    - name: typecheck
      command: pnpm typecheck
    - name: lint
      command: pnpm lint
```

Principle: config should be optional. The CLI should infer useful checks without config, then allow projects to become more explicit over time.

## Suggested architecture

Use TypeScript/Node for speed of development and easy package distribution via npm.

Possible stack:

- TypeScript
- `commander` or `cac` for CLI args
- `picocolors` or `chalk` for output
- `zod` for config validation
- `yaml` for `envdoctor.yml`
- `execa` for safe command probing
- `semver` for runtime version checks

Internal modules:

```txt
src/
  cli.ts
  detect/
    repo.ts
    node.ts
    docker.ts
    env.ts
  checks/
    runtime.ts
    package-manager.ts
    env-vars.ts
    docker.ts
    ports.ts
    scripts.ts
  output/
    human.ts
    json.ts
  config/
    load.ts
    schema.ts
  types.ts
```

## Check model

Every check should return a consistent result shape:

```ts
type CheckStatus = "pass" | "warn" | "fail" | "skip";

type CheckResult = {
  id: string;
  status: CheckStatus;
  title: string;
  detail?: string;
  expected?: string;
  actual?: string;
  suggestion?: string;
  nextStep?: string;
};
```

This keeps human output and JSON output generated from the same source.

## UX principles

- Fast by default
- Safe by default
- Deterministic output
- Fixes ordered by likely unblock value
- Never leak secrets
- Useful with zero config
- Better with small config
- Great for both humans and agents

## Later ideas

- Language support packs:
  - Python: pyenv, uv, poetry, venv, requirements
  - Go: go version, modules, toolchain
  - Rust: rustup, cargo, toolchain
  - Ruby/Rails: bundler, rbenv, database config
- GitHub Action mode
- `envdoctor badge` for README status
- `envdoctor explain <check-id>`
- `envdoctor snapshot` to create a redacted debug packet
- `envdoctor compare` to compare two machines/environments
- `envdoctor ci` to fail CI when setup docs/config drift

## Codex starting task

Implement the MVP CLI skeleton in TypeScript:

1. Create package scaffolding
2. Add `envdoctor` bin command
3. Implement repo detection
4. Implement Node/package-manager checks
5. Implement `.env.example` vs `.env` required variable checks
6. Implement human output
7. Implement JSON output
8. Add basic tests for check result generation

Keep the first version small and shippable.
