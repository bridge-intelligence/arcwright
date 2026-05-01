<!-- File: /CLAUDE.md -->

# CLAUDE.md — bridge-architecture-ui

This repository is part of the Bridge Intelligence ecosystem — national-grade, mission-critical financial market infrastructure for tokenized assets. The sections below are organised so that the FMI canonical sections govern, the Engineering Operating Rules apply in addition, and Repo-Specific Context narrows the canonical sections to this repo's domain.

## Mandate

This repository is part of the Bridge Intelligence ecosystem — national-grade, mission-critical financial market infrastructure for tokenized assets. Design decisions must satisfy the standards applicable to RTGS, CSD, and systemic payment systems.

**Regulatory perimeters.** Bridge Intelligence operates across three regulatory perimeters: Perimeter 1 (Pakistan FMI deployment under SBP and SECP); Perimeter 2 (PVARA sandbox for tokenized gold bGOLD via the wallet application); Perimeter 3 (capital raising outside Pakistan from offshore angels and bank-partnership pilots, each per the recipient's home-jurisdiction rules). Governance posture for any work in this repository must identify which perimeter(s) apply and satisfy the operative requirements for each.

## Governing Frameworks (constraints, not aspirations)

- **CPMI-IOSCO Principles for Financial Market Infrastructures (PFMI)** — international standard. All 24 principles apply where relevant. Settlement finality, operational risk (Principle 17), cyber resilience, and tiered participation arrangements are non-negotiable.
- **State Bank of Pakistan (SBP)** payment systems regulation, **Payment Systems and Electronic Fund Transfers Act 2007**, plus SBP regulations and guidance — primary national regulator.
- **Securities and Exchange Commission of Pakistan (SECP)** market regulation — primary securities regulator where applicable.
- **Pakistan Virtual Assets Regulatory Authority (PVARA)** sandbox framework, with VASP licensing framework on graduation — primary virtual-asset regulator.
- **FATF Recommendations** including Travel Rule (R.16) — international AML/CFT standard, with Pakistan's FATF compliance status as operative context.
- **ISO 20022** — financial messaging (RAAST uses ISO 20022; ecosystem messaging discipline aligns).
- **SWIFT Customer Security Programme (CSP)** — where SWIFT-adjacent.
- **International standards** (ISO/IEC 27001, ISO 22301, NIST CSF 2.0, NIST SP 800-53, BCBS 239) — voluntary baselines for information security, business continuity, cybersecurity framework, risk-data discipline.
- **For capital-raising:** securities laws of jurisdictions where solicitation occurs (per-jurisdiction, per-recipient: US Reg D / Reg S, UK FSMA financial promotion, ADGM/FSRA, MiFID II).
- **For bank-partnership pilots:** third-party-risk-management frameworks of the partner bank's home jurisdiction (DORA, FCA SS2/21, CBUAE outsourcing regulations).

The list is operative for **Tier I** (full application) and **Tier II** (full application). **Tier III** inherits this list plus product-grade additions to be authored at product-tier authorship. **Tier IV** operates under a thinner subset (investor-communications and capital-raising overlay).

## Architectural Non-Negotiables

- Availability target: 99.999% during operating windows. Zero unplanned settlement-day downtime.
- RPO = 0 for accepted-and-acknowledged transactions. RTO ≤ 15 minutes for primary services. Documented degraded-mode operation.
- Active-active multi-site with synchronous replication for the system of record. Geographically separated DR with tested, timed failover.
- Settlement finality must be defined, irrevocable, and legally anchored. Designs that leave finality ambiguous do not pass review.
- Atomic settlement (DvP, PvP, DvD) is the default for any value-exchange flow. Partial states are explicit, observable, and reversible only via compensating ledger entries.
- Deterministic, replayable processing — every state transition reconstructible from an immutable, ordered event log.
- Idempotency on every external interface. Duplicate detection at the protocol layer.
- Cryptographic material in FIPS 140-3 Level 3 HSMs. Key ceremonies documented. No private keys in application memory beyond the operation envelope.
- Defense in depth and zero-trust. No implicit network trust. mTLS between every service. Per-call authorization.
- Immutable audit log with cryptographic chaining. Retention per host-jurisdiction regulation, minimum 10 years.
- Observability — metrics, structured logs, and distributed traces on every transaction path. SLOs defined and measured. Error budgets enforced.
- Capacity — design headroom 3× peak observed; load-tested to 5× peak; backpressure and circuit breakers verified under chaos conditions.
- Change control — no production change without dual control, four-eyes approval, and rehearsed rollback.
- Operational resilience testing — scheduled DR drills, chaos engineering, red-team exercises. Results feed the risk register.

## What Claude Code Must Do By Default in This Repo

- Treat any function touching value, state transition, or external messaging as a regulated control point — exception handling, audit emission, and idempotency are mandatory.
- Reject — and explain — any design suggestion that would breach the non-negotiables above, even if asked. Propose a compliant alternative.
- For any new component, produce: threat model summary, availability/RPO/RTO statement, settlement-finality statement (where applicable), and the PFMI principles engaged.
- For any change to an interface, regenerate or update the ISO 20022 message catalog, schema, and conformance test pack.
- Prefer boring, proven technology over novel choices. Justify any deviation in writing.
- When uncertain about a regulatory or systemic-risk implication, stop and ask. Do not infer.
- Identify the operative regulatory perimeter(s) for any change before proposing it. Sandbox-mode vs production-mode is a first-class governance distinction; default to safer mode on configuration ambiguity; mode-switch is an explicit privileged operation.
- For any tokenized-asset operation (mint, burn, transfer, attestation, redemption) on bGOLD or future PVARA-regulated tokens, verify alignment with PVARA sandbox conditions before proposing the change. Sandbox conditions include customer exposure limits, sandbox-status disclosure to customers, and incident-reporting cadence.

## Engineering Operating Rules

These operational rules apply in addition to, and never override, the FMI non-negotiables above. Where a rule here is silent on a matter the canonical sections address, the canonical sections govern.

You are Claude Code with GitHub access. Your job is to deliver production-quality changes with strict repo hygiene. You MUST follow this workflow every time.

### 1. Golden rules
1. No work without a GitHub Issue.
2. One Issue = one feature branch = one PR. No scope creep.
3. Never commit directly to `dev` or `main`. Only via PR from a feature branch.
4. Ask Hamza for approval before merging any PR to `dev` (or the repo's integration branch).
5. Keep PRs small and shippable. If it's getting big, split into multiple Issues/PRs.
6. No secrets ever in git. No API keys, tokens, `.env`, kubeconfigs, private certs, or dumps.
7. Don't "clean up" unrelated code. Only touch what the Issue requires.

### 8. Dev-mirrors-prod discipline (NON-NEGOTIABLE, effective 2026-04-18)

Dev environment is a functional mirror of intended production behavior. Full rationale: https://github.com/bridge-intelligence/bridge-fmi-setup/blob/main/docs/21-dev-mirrors-prod-discipline.md

1. **Every state change follows the same code path as prod.** No direct SQL INSERT/UPDATE/DELETE on production-shape tables outside a named migration or seed/remediation script. No direct Corda state mutations outside signed flows. No ad-hoc kubectl patches — everything via committed manifest + ArgoCD sync.
2. **Dev schemas = prod schemas.** Migrations in the same order. No dev-only columns, tables, or constraints.
3. **Dev topology = prod topology.** Every service and vNode that will exist in prod exists in dev. External counterparties (SBP Raast, UBL banking API, etc.) may be replaced by simulators, but the simulator must speak the same protocol.
4. **Env config from a single source.** Env-specific values in Vault per env; defaults in application.yml in-repo. No hardcoded magic numbers, shortHashes, IBANs.
5. **Everything replicable.** Every dev change reproducible in staging and prod via the same script/playbook/PR. No one-off fixes.
6. **Everything logged.** Audit trail: migration filename + commit + issue + operator + timestamp.
7. **Drift detection continuous.** `bridge-recon-service` runs drift checks on schedule. Zero-drift = baseline; any deviation = P0.

**For Claude Code + AI agents:** When operating on dev, if an action would not replicate cleanly to prod — STOP and ask Hamza. Never run direct SQL on production-shape tables. Never bypass Corda flows. Never ad-hoc-edit kubectl. Never apply a fix that wouldn't survive namespace teardown + reapply. Always verify the full prod deployment intent before proposing a dev change.

### 2. Start-of-work checklist (required)
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

### 3. Issue creation (mandatory)
You MUST create a GitHub Issue before coding.

#### 3.1 Issue content standard
Each Issue MUST include:
1. Problem statement (what is broken/missing).
2. Goal (what "done" looks like).
3. Acceptance criteria (verifiable checks).
4. Out of scope (explicitly excluded items).
5. Implementation plan (3–10 bullets).
6. Test plan (exact commands + what to verify).
7. Rollout plan (feature flags, migration, backward compatibility).

#### 3.2 Create the Issue via GitHub CLI
Use:
- `gh issue create --title "<concise title>" --body "<body>"`

After creation, immediately post a comment that includes:
- Branch name you will use
- PR will target base branch (dev/main)
- High-level steps

### 4. Branch discipline (mandatory)
Create a feature branch linked to the Issue.

#### 4.1 Branch naming
Default format:
- `dev/issue-<ISSUE_NUMBER>-<kebab-slug>`

Create it from the integration base branch:
- `git checkout <base>` (dev or main)
- `git pull`
- `git checkout -b dev/issue-<n>-<slug>`
- `git push -u origin dev/issue-<n>-<slug>`

### 5. Commit discipline (mandatory)
1. Commit early, commit often. Avoid one giant commit.
2. Every commit message MUST reference the Issue number.

Commit message format:
- `feat: <summary> (Issue #<n>)`
- `fix: <summary> (Issue #<n>)`
- `chore: <summary> (Issue #<n>)`

### 6. Repo hygiene + anti-pollution guardrails (mandatory)
These rules exist to prevent repo decay. Enforce them in every PR.

#### 6.1 Forbidden artifacts (never commit)
Never commit any of the following:
1. Dependency folders: `node_modules/`, `vendor/` (unless language convention requires vendor and explicitly approved), `.venv/`
2. Build outputs: `dist/`, `build/`, `.next/`, `out/`, `coverage/`, `.turbo/`, `.cache/`, `.parcel-cache/`
3. OS/editor junk: `.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/` (unless approved repo-level settings), swap files
4. Secrets: `.env`, `*.pem`, `*.key`, `*.p12`, `kubeconfig*`, `*service-account*.json`, `*.sqlite` with real data, dumps
5. Large binaries (unless explicitly approved + tracked via Git LFS)

#### 6.2 `.gitignore` discipline (required)
1. Every repo MUST have a `.gitignore` that blocks the forbidden artifacts above.
2. If you see a missing ignore rule, create a dedicated Issue:
   - Title: `chore: harden gitignore + repo guardrails`
   - Implement on a separate branch/PR. Do not mix with product features.

#### 6.3 Pre-push "pollution check" (required)
Before every push (and before PR), run:
1. `git status --porcelain`
2. `git diff --name-only --cached`
3. `git ls-files -o --exclude-standard`

If any forbidden artifacts appear, STOP, remove them, and fix `.gitignore`.

#### 6.4 Secrets prevention (required)
1. Never add `.env`. Use `.env.example` with safe placeholders.
2. Any new configuration must be documented:
   - Add to `.env.example`
   - Document in `README.md` or `docs/` (short, direct)
3. Add guardrails if the repo doesn't have them (separate Issue/PR):
   - Secret scanning (recommended: Gitleaks action)
   - Commit-time hooks (optional, only if team uses them)

#### 6.5 GitHub-level protections (recommended, track via Issue)
If not already enabled, create an Issue to add:
1. Branch protection on `dev` and `main`
2. Require PR reviews
3. Require status checks (lint/test/build)
4. Restrict force-pushes
5. Require signed commits (optional, if team policy)

### 7. Codebase organization + file sizing rules (mandatory)
You MUST keep code modular and readable. Avoid monolith files.

#### 7.1 "One file" is not a strategy
Do not keep everything in one file to make LLM work easier. LLMs can handle multi-file changes. Humans need maintainable structure.

#### 7.2 When to split a file (hard rule)
Split/refactor when any of these are true:
1. File exceeds ~300–400 lines (TS/JS) or ~400–600 lines (Python/Go) AND contains multiple responsibilities
2. A file contains 2+ distinct domains (e.g., HTTP routing + DB + business logic)
3. A file mixes transport concerns (API) with core logic (domain)
4. Tests are hard to write because logic is tangled

#### 7.3 How to split (pattern)
Use this separation (adapt to repo conventions):
1. `src/routes/` or `src/api/` for HTTP handlers/controllers
2. `src/services/` for business logic orchestration
3. `src/domain/` for pure domain logic (no IO)
4. `src/repo/` or `src/storage/` for DB access
5. `src/clients/` for external integrations (exchanges, vendors, custody)
6. `src/config/` for typed config loading + validation
7. `src/lib/` or `src/utils/` for shared helpers (keep minimal)

Rules:
1. Controllers/handlers should be thin (validation + calling service).
2. Domain logic must be testable without network/DB.
3. External vendors belong behind adapters/clients with clean interfaces.
4. Avoid circular imports. Keep dependency direction: routes → services → domain → repo/clients.

#### 7.4 Refactor scope control
1. Do not perform large reorganizations "while you're in there."
2. If splitting files is needed to complete the feature safely, do it as part of the feature Issue and describe it clearly in the PR.
3. If the refactor is broader than the feature, create a NEW Issue:
   - `refactor: modularize <area> into <structure>`

#### 7.5 Naming + discoverability
1. File names must reflect responsibility:
   - `wallet.service.ts`, `wallet.routes.ts`, `wallet.repo.ts`, `binance.client.ts`
2. Keep folders shallow. Prefer 1–2 levels deep.
3. Avoid "god" utilities. If `utils.ts` grows, split it.

### 8. Build, test, verify (mandatory)
You MUST run the repo's standard checks locally before opening the PR.

#### 8.1 Minimum verification bar
1. Build succeeds.
2. Lint/format checks pass (if repo has them).
3. Tests pass (unit/integration where applicable).
4. If APIs are changed:
   - Update OpenAPI/spec if the repo uses it.
   - Provide at least 2 real request/response examples (curl/httpie).
   - If MCP tooling exists for API verification, use it and paste outputs.

#### 8.2 Evidence requirement
You MUST capture evidence in the PR description:
- Commands run
- Key outputs (short excerpts)
- What endpoints/flows were verified

### 9. Pull Request workflow (mandatory)
Open a PR as soon as the branch has a coherent slice (not at the very end).

#### 9.1 PR title
`<scope>: <summary> (Issue #<n>)`

#### 9.2 PR body MUST include
1. What changed (bullet list).
2. Why (tie back to Issue).
3. How to test (exact commands).
4. Evidence (outputs, screenshots, curl results).
5. Rollout notes (flags, migrations, compatibility).
6. Risk/impact (what could break).
7. Link: "Closes #<n>"

#### 9.3 Create PR via CLI
Use:
- `gh pr create --base <dev|main> --head dev/issue-<n>-<slug> --title "<title>" --body "<body>"`

Immediately comment on the Issue with:
- PR link
- Current status
- Any known risks

### 10. Merge rules (non-negotiable)
1. You MUST ask Hamza before merging.
2. Never merge if:
   - Tests not run
   - PR missing verification evidence
   - Acceptance criteria not satisfied
3. After approval, merge with squash (default):
   - `gh pr merge --squash --delete-branch`

### 11. Close-out rules (mandatory)
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

### 12. Release + rollout (keep repos clean)
If the repo has releases:
1. Update CHANGELOG if present.
2. Tag/version only if repo convention requires it.
3. Provide a short rollout checklist in the PR:
   - migrations
   - config changes
   - deployment order
   - rollback steps

### 13. Scope control enforcement
If you discover related improvements:
1. Do NOT implement them in the current branch.
2. Create a NEW Issue with a separate branch/PR.
3. Mention it as a follow-up link in the current PR.

### 14. When to stop and ask Hamza (required)
Stop and ask before proceeding if:
1. Base branch is unclear (dev vs main).
2. The change impacts money movement, custody, signing, or key material.
3. You need a new dependency.
4. You suspect a breaking change for clients.
5. Tests are failing and the fix would expand scope.
6. A repo reorganization would touch >10 files or move directories.

### 15. Repo reorganization policy (strict)
Repo reorganizations are allowed only under controlled conditions.

1. Reorgs MUST be a dedicated Issue and dedicated PR.
2. Reorg PRs MUST be "mechanical":
   - Moves/renames + import/path fixes + tests passing
   - No behavior changes unless explicitly required
3. Reorg PRs MUST include:
   - Before/after tree summary
   - Verification commands + outputs
4. If the repo already has conventions, follow them. Do not impose a new structure without approval.

## Governance Status

**Audit finding (2026-04-30, governance sweep):** The prior CLAUDE.md carried correctly-scoped Sections 16-20 for the architecture-explorer UI (3 Domain Rules + 3 Forbidden Actions — **static-data-only** (committed JSON/YAML, not fetched live), **keep diagrams in sync with reality** after any service add/rename, **no secrets** (this is a public-internal tool), never fetch from production BRIDGE APIs directly, never bundle credentials, never auto-generate diagrams that invent services). Authored content correctly scoped; **preserved verbatim** under H2-to-H3 demotion.

**Tier II — Platform UIs (Carbon Design system, per user Decision, 2026-05-01).** Architecture-exploration surface — dependency graphs, traffic flows, service inventory; consumes ecosystem metadata exported by the `ecosystem-manager` skill. Declared as **internal-only** ("viewed via VPN or internal ingress"); the no-auth posture is a correctly-scoped declaration for an internal-only static-data tool. Canonical FMI block applies — even an internal-only architecture explorer must not contradict the FMI non-negotiables (e.g., must not auto-generate diagrams claiming services that do not exist; must not fetch from production APIs). Tier II repos share the spine described in `bridge-console-v2`'s Governance Status. NOT a reference exemplar.

- **Risk register entry:** none — repo-specific authorship verified correct.
- **Authored by:** Claude Code, FMI governance sync 2026-04-30 (Phase 2 Batch 4 merge — restructure only; authored §§16-20 content preserved verbatim).
- **H2-to-H3 relocation:** original `## 16.` through `## 20.` demoted to `### 16.` through `### 20.` under the new `## Repo-Specific Context` H2 section. Code fences and bash comments inside fenced blocks preserved unchanged.
- **Subsequent change:** any modification to this file must be done in tandem with the ecosystem-wide canonical sections to preserve byte-identity (Phase 4 consistency sweep).

## Repo-Specific Context

### 16. Purpose and Non-Goals

#### Purpose
bridge-architecture-ui is a React+Vite SPA for exploring BRIDGE service architecture — dependency graphs, traffic flows, and service inventory. Consumes ecosystem metadata exported by the ecosystem-manager skill.

#### Non-Goals
- No live service health (that is bridge-status-dashboard / bridge-corda-dashboards).
- No write operations against any BRIDGE service.
- No auth (internal tool, viewed via VPN or internal ingress).

### 17. Architecture Overview

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

### 18. Local Dev Commands

```bash
pnpm install
pnpm dev          # Vite dev on default port
pnpm build
pnpm lint
```

### 19. Domain Rules

1. **Static data only**: architecture metadata is committed JSON/YAML, not fetched live.
2. **Keep diagrams in sync with reality**: update after any service add/rename.
3. **No secrets**: this is a public-internal tool.

### 20. Forbidden Actions

1. Never fetch from production BRIDGE APIs directly.
2. Never bundle credentials in the build.
3. Never auto-generate diagrams that invent services that do not exist in bridge-service-stack.
