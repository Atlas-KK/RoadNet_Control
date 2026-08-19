---
name: ai-code-audit-test
description: Audit and test code generated or modified by Codex or other AI coding agents using a four-layer review model: human code-review methodology, security verification, static scanning, and test validation. Use when the user asks to review AI-generated code, inspect a diff, find hidden bugs, identify patch-on-patch architecture debt, validate tests, assess maintainability, run SAST or secret scans, or output actionable modification advice before merging code.
---

# AI Code Audit Test

Use this skill to review AI-generated or AI-modified code with a four-layer audit stance: human code-review methodology, security verification, static scanning, and test validation. Prioritize correctness, hidden defects, maintainability, architecture extensibility, and whether the implementation solved the root cause instead of stacking another patch.

## Operating Rules

1. Review before editing unless the user explicitly asks for direct fixes.
2. Treat "the project runs" as insufficient evidence. Look for silent failures, brittle assumptions, untested edges, and architecture damage.
3. Protect user changes. Do not revert unrelated work.
4. Prefer repository conventions over generic best practices.
5. Verify claims with code, tests, build output, scanner results, or clearly labeled reasoning.
6. Output modification advice as actionable findings with file and line references whenever possible.
7. Do not claim a layer was completed unless it was actually performed; mark skipped layers and reasons plainly.
8. Do not sacrifice maintainability to avoid comments. Business rules, boundary conditions, compatibility logic, and risk-mitigation logic that reviewers cannot understand from naming and structure alone must include concise comments explaining why the code exists.

## Four-Layer Audit Workflow

### 1. Scope and Baseline

Identify the change under review:

- Current working tree diff, recent commit, PR branch, user-provided patch, or specific files.
- User intent and acceptance criteria.
- Runtime, framework, build tool, test tool, and important project conventions.
- Risk category: UI behavior, backend API, data model, permissions, state flow, async task, integration, security, or infrastructure.

If the scope is ambiguous, inspect local project state and likely changed files first. Ask the user only when the target cannot be inferred safely.

### 2. Layer 1: Human Code-Review Methodology

Review the change like a senior engineer reviewing a merge request:

- Does the implementation satisfy the requested behavior?
- Does it solve the root cause rather than masking symptoms?
- Are module boundaries, naming, complexity, and readability acceptable?
- Are necessary why-comments present for non-obvious business rules, boundary conditions, compatibility logic, and risk-mitigation logic?
- Are business rules centralized in the right owner?
- Does the change preserve public contracts and backward compatibility?
- Can the next similar feature be added without duplicating this logic?

Read `references/audit-checklist.md` for detailed architecture, maintainability, and AI patch-accumulation checks.

### 3. Layer 2: Security Verification

Apply OWASP-style security thinking to the changed code path:

- Authentication, authorization, tenant isolation, and object ownership.
- Server-side enforcement instead of UI-only restrictions.
- Input validation, output encoding, injection risk, path traversal, command execution, and deserialization.
- Sensitive data in logs, errors, client bundles, configs, and tests.
- Unsafe dependency, environment, CORS, cookie, token, or secret handling.

Escalate security issues even if the exploit path is inferred. Do not require proof-of-exploit to report a credible risk.

### 4. Layer 3: Static Scanning and Automated Checks

Use available project tools before inventing new ones:

- Typecheck, lint, format check, and build scripts from the repository.
- Existing SAST or quality tools such as CodeQL, Semgrep, SonarQube, ESLint security rules, Bandit, Brakeman, gosec, cargo-audit, or similar.
- Secret scanning such as Gitleaks when credentials, config, logs, env files, or generated examples are touched.
- Dependency checks such as npm audit, pnpm audit, pip-audit, safety, osv-scanner, Snyk, or native ecosystem audit tools when dependencies changed.

If a tool is not installed or configured, do not install new dependencies unless the user asked for it or approval is appropriate. Instead, state the skipped check and recommend the exact tool or command.

### 5. Layer 4: Test Validation

Run or design tests based on risk:

- Unit tests for pure logic, parsing, formatting, permissions, validation, and state transitions.
- Integration tests for API flows, data persistence, service orchestration, and external boundaries.
- UI or end-to-end checks for user workflows, routing, forms, loading states, and error states.
- Property-based, fuzz, or boundary tests for parsers, validators, calculations, state machines, and input-heavy logic.
- Regression tests that would fail against the original bug.

If tests cannot be run, state why and provide a concrete manual or automated test plan. Do not claim verification without evidence.

## Decision Gates

Use these gates before recommending merge:

1. Root-cause gate: no obvious symptom-only patch remains.
2. Architecture gate: no new ownership confusion, duplicate rule, or hard-coded business exception is introduced.
3. Comment gate: reviewers can understand non-obvious business rules, boundary conditions, compatibility logic, and risk-mitigation logic because the code includes concise why-comments where naming and structure are insufficient.
4. Security gate: no credible P0/P1 security issue remains unaddressed.
5. Static-check gate: relevant existing automated checks pass or skipped checks are justified.
6. Test gate: critical behavior is covered by executed tests or a clearly stated test gap blocks merge.

## Severity Guide

- P0: Breaks core functionality, causes data loss, creates security exposure, or blocks release.
- P1: Likely hidden bug, incorrect business behavior, permission issue, migration risk, or serious architecture regression.
- P2: Maintainability, extensibility, missing edge handling, fragile test coverage, or duplicated business logic.
- P3: Minor readability, naming, low-risk cleanup, or localized style issue.

Do not inflate severity. A finding should explain why the risk matters.

## Red Lines

Mark code as not mergeable when any of these are present:

- Permission bypass or unsafe trust in client input.
- Silent exception swallowing on critical paths.
- Public contract changes without compatibility handling.
- Business rules duplicated across multiple places.
- Hard-coded production data, credentials, endpoints, or role rules.
- Test assertions weakened to make generated code pass.
- Large unrelated rewrites mixed into a small fix.
- A fix that only works for the observed sample and not the class of problem.
- Security scanner or secret scanner findings ignored without justification.
- Critical behavior has no executable test and no credible manual verification path.

## Output Requirements

Produce findings first, ordered by severity. Each finding must include impact, evidence, and modification advice. Include the four-layer audit status and test/scanner results. For the exact report structure, read `references/review-output-template.md`.

## Resource Use

- Read `references/four-layer-audit.md` before running a full four-layer audit.
- Read `references/audit-checklist.md` for detailed review dimensions and common AI-code failure patterns.
- Read `references/review-output-template.md` before writing the final audit report.

