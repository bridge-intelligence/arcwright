<!-- File: /CLAUDE.md -->

# CLAUDE.md — Binari/BRIDGE Engineering Operating Rules (NON-NEGOTIABLE)

You are Claude Code with GitHub access. Your job is to deliver production-quality changes with strict repo hygiene.
You MUST follow this workflow every time.

## 1. Golden rules
1. No work without a GitHub Issue.
2. One Issue = one feature branch = one PR. No scope creep.
3. Never commit directly to `dev` or `main`. Only via PR from a feature branch.
4. Ask Hamza for approval before merging any PR to `dev` (or the repo's integration branch).
5. Keep PRs small and shippable. If it's getting big, split into multiple Issues/PRs.
6. No secrets ever in git. No API keys, tokens, `.env`, kubeconfigs, private certs, or dumps.
7. Don't "clean up" unrelated code. Only touch what the Issue requires.

## 2. Start-of-work checklist (required)
Before creating an Issue or branch:
1. Pull latest and inspect branch model:
   - `git fetch --all --prune`
   - `git branch -a`
2. Identify the integration base branch:
   - Prefer `dev` if it exists; otherwise use `main`.
   - If unsure, STOP and ask Hamza which branch is the integration target.
3. Read repo context quickly:
   - `README.md`
   - `CONTRIBUTING.md` (if present)
   - `Makefile` / `package.json` / build docs
4. Identify how tests/lint/build run in this repo (you must run them later).

## 3. Issue creation (mandatory)
You MUST create a GitHub Issue before coding.

### 3.1 Issue content standard
Each Issue MUST include:
1. Problem statement (what is broken/missing).
2. Goal (what "done" looks like).
3. Acceptance criteria (verifiable checks).
4. Out of scope (explicitly excluded items).
5. Implementation plan (3-10 bullets).
6. Test plan (exact commands + what to verify).
7. Rollout plan (feature flags, migration, backward compatibility).

### 3.2 Create the Issue via GitHub CLI
Use:
- `gh issue create --title "<concise title>" --body "<body>"`

After creation, immediately post a comment that includes:
- Branch name you will use
- PR will target base branch (dev/main)
- High-level steps

## 4. Branch discipline (mandatory)
Create a feature branch linked to the Issue.

### 4.1 Branch naming
Default format:
- `dev/issue-<ISSUE_NUMBER>-<kebab-slug>`

Create it from the integration base branch:
- `git checkout <base>` (dev or main)
- `git pull`
- `git checkout -b dev/issue-<n>-<slug>`
- `git push -u origin dev/issue-<n>-<slug>`

## 5. Commit discipline (mandatory)
1. Commit early, commit often. Avoid one giant commit.
2. Every commit message MUST reference the Issue number.

Commit message format:
- `feat: <summary> (Issue #<n>)`
- `fix: <summary> (Issue #<n>)`
- `chore: <summary> (Issue #<n>)`

## 6. Repo hygiene + anti-pollution guardrails (mandatory)
These rules exist to prevent repo decay. Enforce them in every PR.

### 6.1 Forbidden artifacts (never commit)
Never commit any of the following:
1. Dependency folders: `node_modules/`, `vendor/` (unless language convention requires vendor and explicitly approved), `.venv/`
2. Build outputs: `dist/`, `build/`, `.next/`, `out/`, `coverage/`, `.turbo/`, `.cache/`, `.parcel-cache/`
3. OS/editor junk: `.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/` (unless approved repo-level settings), swap files
4. Secrets: `.env`, `*.pem`, `*.key`, `*.p12`, `kubeconfig*`, `*service-account*.json`, `*.sqlite` with real data, dumps
5. Large binaries (unless explicitly approved + tracked via Git LFS)

### 6.2 `.gitignore` discipline (required)
1. Every repo MUST have a `.gitignore` that blocks the forbidden artifacts above.
2. If you see a missing ignore rule, create a dedicated Issue:
   - Title: `chore: harden gitignore + repo guardrails`
   - Implement on a separate branch/PR. Do not mix with product features.

### 6.3 Pre-push "pollution check" (required)
Before every push (and before PR), run:
1. `git status --porcelain`
2. `git diff --name-only --cached`
3. `git ls-files -o --exclude-standard`

If any forbidden artifacts appear, STOP, remove them, and fix `.gitignore`.

### 6.4 Secrets prevention (required)
1. Never add `.env`. Use `.env.example` with safe placeholders.
2. Any new configuration must be documented:
   - Add to `.env.example`
   - Document in `README.md` or `docs/` (short, direct)
3. Add guardrails if the repo doesn't have them (separate Issue/PR):
   - Secret scanning (recommended: Gitleaks action)
   - Commit-time hooks (optional, only if team uses them)

### 6.5 GitHub-level protections (recommended, track via Issue)
If not already enabled, create an Issue to add:
1. Branch protection on `dev` and `main`
2. Require PR reviews
3. Require status checks (lint/test/build)
4. Restrict force-pushes
5. Require signed commits (optional, if team policy)

## 7. Codebase organization + file sizing rules (mandatory)
You MUST keep code modular and readable. Avoid monolith files.

### 7.1 "One file" is not a strategy
Do not keep everything in one file to make LLM work easier.
LLMs can handle multi-file changes. Humans need maintainable structure.

### 7.2 When to split a file (hard rule)
Split/refactor when any of these are true:
1. File exceeds ~300-400 lines (TS/JS) or ~400-600 lines (Kotlin/Java) AND contains multiple responsibilities
2. A file contains 2+ distinct domains (e.g., HTTP routing + DB + business logic)
3. A file mixes transport concerns (API) with core logic (domain)
4. Tests are hard to write because logic is tangled

### 7.3 How to split (pattern)
Use this separation (adapt to repo conventions):
1. `src/api/` for REST controllers
2. `src/service/` for business logic orchestration
3. `src/domain/` for pure domain logic (no IO)
4. `src/repo/` for DB access (Spring Data JPA repositories)
5. `src/events/` for Kafka consumers/producers + inbox/outbox
6. `src/config/` for Spring configuration classes
7. `src/lib/` or `src/utils/` for shared helpers (keep minimal)

Rules:
1. Controllers/handlers should be thin (validation + calling service).
2. Domain logic must be testable without network/DB.
3. External vendors belong behind adapters/clients with clean interfaces.
4. Avoid circular imports. Keep dependency direction: api -> service -> domain -> repo/events.

### 7.4 Refactor scope control
1. Do not perform large reorganizations "while you're in there."
2. If splitting files is needed to complete the feature safely, do it as part of the feature Issue and describe it clearly in the PR.
3. If the refactor is broader than the feature, create a NEW Issue:
   - `refactor: modularize <area> into <structure>`

### 7.5 Naming + discoverability
1. File names must reflect responsibility:
   - `PostingService.kt`, `LedgerController.kt`, `AccountRepository.kt`, `LedgerEventConsumer.kt`
2. Keep folders shallow. Prefer 1-2 levels deep.
3. Avoid "god" utilities. If `Utils.kt` grows, split it.

## 8. Build, test, verify (mandatory)
You MUST run the repo's standard checks locally before opening the PR.

### 8.1 Minimum verification bar
1. Build succeeds: `./gradlew build`
2. Lint/format checks pass (if repo has them): `./gradlew ktlintCheck`
3. Tests pass: `./gradlew test`
4. If APIs are changed:
   - Update OpenAPI/spec if the repo uses it.
   - Provide at least 2 real request/response examples (curl/httpie).
   - If MCP tooling exists for API verification, use it and paste outputs.

### 8.2 Evidence requirement
You MUST capture evidence in the PR description:
- Commands run
- Key outputs (short excerpts)
- What endpoints/flows were verified

## 9. Pull Request workflow (mandatory)
Open a PR as soon as the branch has a coherent slice (not at the very end).

### 9.1 PR title
`<scope>: <summary> (Issue #<n>)`

### 9.2 PR body MUST include
1. What changed (bullet list).
2. Why (tie back to Issue).
3. How to test (exact commands).
4. Evidence (outputs, screenshots, curl results).
5. Rollout notes (flags, migrations, compatibility).
6. Risk/impact (what could break).
7. Link: "Closes #<n>"

### 9.3 Create PR via CLI
Use:
- `gh pr create --base <dev|main> --head dev/issue-<n>-<slug> --title "<title>" --body "<body>"`

Immediately comment on the Issue with:
- PR link
- Current status
- Any known risks

## 10. Merge rules (non-negotiable)
1. You MUST ask Hamza before merging.
2. Never merge if:
   - Tests not run
   - PR missing verification evidence
   - Acceptance criteria not satisfied
3. After approval, merge with squash (default):
   - `gh pr merge --squash --delete-branch`

## 11. Close-out rules (mandatory)
After merge:
1. Ensure the Issue is closed (should auto-close if "Closes #<n>" was used).
2. Post a final Issue comment including:
   - What was shipped
   - How it was verified
   - Any follow-ups as NEW Issues (do not extend scope)

If the work cannot be completed:
1. Do NOT silently abandon.
2. Comment on the Issue with:
   - What's blocking
   - What you tried
   - Next steps

## 12. Release + rollout (keep repos clean)
If the repo has releases:
1. Update CHANGELOG if present.
2. Tag/version only if repo convention requires it.
3. Provide a short rollout checklist in the PR:
   - migrations
   - config changes
   - deployment order
   - rollback steps

## 13. Scope control enforcement
If you discover related improvements:
1. Do NOT implement them in the current branch.
2. Create a NEW Issue with a separate branch/PR.
3. Mention it as a follow-up link in the current PR.

## 14. When to stop and ask Hamza (required)
Stop and ask before proceeding if:
1. Base branch is unclear (dev vs main).
2. The change impacts money movement, custody, signing, or key material.
3. You need a new dependency.
4. You suspect a breaking change for clients.
5. Tests are failing and the fix would expand scope.
6. A repo reorganization would touch >10 files or move directories.

## 15. Repo reorganization policy (strict)
Repo reorganizations are allowed only under controlled conditions.

1. Reorgs MUST be a dedicated Issue and dedicated PR.
2. Reorg PRs MUST be "mechanical":
   - Moves/renames + import/path fixes + tests passing
   - No behavior changes unless explicitly required
3. Reorg PRs MUST include:
   - Before/after tree summary
   - Verification commands + outputs
4. If the repo already has conventions, follow them. Do not impose a new structure without approval.

---

## 16. Purpose and Non-Goals

### Purpose
bridge-architecture-ui is a React+Vite SPA for exploring BRIDGE service architecture — dependency graphs, traffic flows, and service inventory. Consumes ecosystem metadata exported by the ecosystem-manager skill.

### Non-Goals
- No live service health (that is bridge-status-dashboard / bridge-corda-dashboards).
- No write operations against any BRIDGE service.
- No auth (internal tool, viewed via VPN or internal ingress).

## 17. Architecture Overview

```
bridge-architecture-ui/
├── src/
├── public/
├── packages/            # Shared UI components
├── workers/             # Cloudflare workers (if deployed there)
├── vscode-extension/    # VSCode extension surface (experimental)
├── index.html
├── vite.config.ts
└── package.json
```

## 18. Local Dev Commands

```bash
pnpm install
pnpm dev          # Vite dev on default port
pnpm build
pnpm lint
```

## 19. Domain Rules

1. **Static data only**: architecture metadata is committed JSON/YAML, not fetched live.
2. **Keep diagrams in sync with reality**: update after any service add/rename.
3. **No secrets**: this is a public-internal tool.

## 20. Forbidden Actions

1. Never fetch from production BRIDGE APIs directly.
2. Never bundle credentials in the build.
3. Never auto-generate diagrams that invent services that do not exist in bridge-service-stack.
