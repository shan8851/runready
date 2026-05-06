# runready — Plan

## High-level goal

Build a fast, deterministic CLI that answers one practical question:

> Is this repo ready to run on this machine?

`runready` should find the boring local setup blockers before a developer wastes half an hour swearing at localhost.

No LLM. No SaaS. No auth. No required config file. It should infer useful checks from the repo and stay safe by default.

## Target users

- Developers onboarding to a repo
- OSS maintainers who are tired of broken setup instructions
- Teams with flaky local dev environments
- Solo builders juggling lots of projects
- Agent/coding-assistant workflows that need deterministic repo preflight checks

## MVP scope

V1 is focused on JavaScript/TypeScript repos, with room to support more ecosystems later.

Core checks:

1. Repo detection
   - Detect git repo root
   - Detect project type from files:
     - `package.json`
     - JS/TS source files
     - lockfiles
     - Docker files
     - env files

2. Runtime checks
   - Git availability
   - Node availability
   - Current Node version vs `package.json#engines.node`
   - Package manager availability from `packageManager` or lockfile

3. Dependency checks
   - Lockfile presence
   - Package-manager consistency
   - `node_modules` / Yarn PnP presence
   - Declared dependency links present in `node_modules` where this is safe to infer

4. Env checks
   - Detect `.env*` and `.env*.example` pairs
   - Report missing local env files
   - Report missing local keys from examples
   - Report duplicate keys
   - Detect obvious source/schema env usage while ignoring tests/fixtures
   - Never print secret values

5. Env sync
   - `runready env sync`
   - Create missing local/example env files where safe
   - Append missing keys only
   - Redact values when writing examples from local env files
   - Never overwrite existing values
   - Block writes when conflicts exist

6. Docker checks
   - Detect Docker/Compose files
   - Check Docker CLI availability
   - Check daemon reachability

7. Port checks
   - Infer app ports from env keys like `PORT`, `APP_PORT`, `VITE_PORT`, `NEXT_PORT`
   - Infer host ports from Compose mappings
   - Warn when app ports are already occupied

## Command shape

```bash
runready
runready check path/to/project
runready doctor path/to/project
runready check --only env
runready check --only runtime,deps
runready check --only docker,ports
runready check --json
runready env sync --dry-run
runready env sync --yes
```

## Output goals

Default output should be compact but polished:

- Project summary
- Pass/warn/fail counts
- Category health line
- Notable failures/warnings only
- Ordered next steps
- Hint to run `runready doctor` for full detail

`runready doctor` should keep the fuller diagnostic layout with grouped checks and more detail.

JSON output should stay stable for agents/CI:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "summary": {
    "pass": 4,
    "warn": 1,
    "fail": 2,
    "skip": 3
  },
  "project": {
    "name": "example-app",
    "root": "/path/to/repo",
    "type": ["node", "typescript"]
  },
  "checks": [
    {
      "id": "runtime.node.version",
      "category": "runtime",
      "status": "fail",
      "title": "Node version mismatch",
      "expected": ">=20",
      "actual": "18.20.0",
      "suggestion": "nvm install 20 && nvm use 20",
      "nextStep": "nvm install 20 && nvm use 20"
    }
  ],
  "nextSteps": [
    "nvm install 20 && nvm use 20",
    "runready env sync"
  ]
}
```

## Non-goals for V1

- No config file
- No LLM calls
- No arbitrary command execution by default
- No automatic dependency installs
- No destructive fixes
- No secret value output
- No attempt to support every language immediately

## UX principles

- Fast by default
- Safe by default
- Useful with zero config
- Deterministic and testable
- False positives are worse than missing clever checks
- Fix suggestions should be ordered by unblock value
- Human output and JSON should come from the same check model

## Suggested architecture

TypeScript/Node CLI distributed via npm.

Current shape:

```txt
src/
  cli.ts
  actions/
    envSync.ts
  checks/
    deps.ts
    docker.ts
    env.ts
    ports.ts
    repo.ts
    runChecks.ts
    runtime.ts
    scripts.ts
  detect/
    envFiles.ts
    envUsage.ts
    project.ts
  output/
    human.ts
    json.ts
    report.ts
  utils/
    fileSystem.ts
    shell.ts
  types.ts
```

## Later ideas

- Python support: pyenv, uv, poetry, venv
- Go support: toolchain, modules
- Rust support: rustup, cargo
- Ruby/Rails support: bundler, database config
- GitHub Action mode
- `runready snapshot` for redacted debug packets
- `runready compare` for comparing two machines/environments
- `runready ci` for failing CI when setup docs drift
