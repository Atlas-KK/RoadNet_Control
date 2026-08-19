# Four-Layer Audit Guide

Use this guide for a full audit of AI-generated or AI-modified code. The goal is to combine human engineering judgment with security review, static analysis, and test evidence.

## Layer 1: Human Code-Review Methodology

Reference mindset: senior merge-request review.

Check:

- Correctness: The code implements the requested behavior and does not change unrelated behavior.
- Design: The solution belongs in the right layer and keeps the system easy to extend.
- Complexity: Functions, branches, and data flow remain understandable.
- Maintainability: Names, module boundaries, abstractions, and necessary comments make future changes safer.
- Compatibility: Public APIs, persisted data, routes, events, and config remain stable unless intentionally changed.
- Testability: The code can be tested without excessive mocks or hidden global state.
- Necessary comments: Business rules, boundary conditions, compatibility logic, and risk-mitigation logic that are not self-explanatory must include concise why-comments.

AI-specific failure patterns:

- The code fixes the observed sample but not the general case.
- The same rule is copied into UI, API, and service layers.
- Defensive checks hide invalid data instead of fixing the producer.
- New abstractions are generic in name but only serve one special case.
- A broad rewrite is mixed into a small bug fix.

## Layer 2: Security Verification

Reference mindset: OWASP ASVS / OWASP Top 10 style review.

Check:

- Authentication: identity is required where expected.
- Authorization: server-side role, object ownership, and tenant checks are enforced.
- Input validation: untrusted input is validated at boundaries.
- Injection: SQL, NoSQL, shell, template, HTML, path, selector, and expression injection risks are controlled.
- Secrets: credentials, tokens, private keys, and internal endpoints are not committed or logged.
- Error handling: errors do not disclose sensitive internals.
- Session/token handling: cookies, JWTs, refresh flows, CORS, and CSRF behavior remain safe.
- Supply chain: new dependencies are justified and do not introduce obvious security risk.

Treat a credible security path as a finding even when no exploit is executed.

## Layer 3: Static Scanning and Automated Checks

Prefer tools already present in the repository. Inspect package scripts, CI config, Makefile, task runner config, or language-native commands.

Common checks by category:

- Type and build: `tsc`, `npm run build`, `pnpm build`, `cargo check`, `go test`, `mvn test`, `gradle test`, etc.
- Lint and quality: ESLint, Ruff, Flake8, RuboCop, Checkstyle, Clippy, SonarQube.
- SAST: CodeQL, Semgrep, Bandit, Brakeman, gosec, SpotBugs, cargo-audit where relevant.
- Secrets: Gitleaks, TruffleHog, detect-secrets.
- Dependencies: npm audit, pnpm audit, yarn audit, pip-audit, safety, osv-scanner, Snyk, composer audit, bundler audit.

When tools are missing:

- Do not silently skip. Report the missing layer.
- Do not install tooling unless the user wants setup work or approval is appropriate.
- Provide the recommended command and why it matters.

## Layer 4: Test Validation

Choose tests from risk, not habit.

Use unit tests when:

- Logic is pure or easily isolated.
- Validation, parsing, formatting, calculation, permissions, or state transitions changed.

Use integration tests when:

- APIs, persistence, queues, jobs, transactions, or external service boundaries changed.

Use UI or end-to-end tests when:

- Navigation, forms, loading states, permissions, optimistic updates, or user workflows changed.

Use property-based or fuzz tests when:

- Inputs are varied or adversarial.
- Parsers, validators, converters, state machines, and calculations can fail on edge combinations.

Test quality checks:

- A regression test should fail against the old bug.
- A test should assert behavior, not implementation trivia.
- Avoid snapshots as the only verification for meaningful behavior.
- Do not weaken existing tests to make generated code pass.

## Merge Recommendation Rules

Block merge when:

- Any P0 exists.
- Any unresolved P1 affects security, data integrity, permission, migration, or core behavior.
- Critical behavior is untested and cannot be manually verified from available evidence.
- Static or secret scanning reports credible findings that are ignored.
- The code clearly worsens architecture by duplicating core rules or mixing module responsibilities.

Request changes when:

- P2 issues create future maintenance or test risk but do not immediately break core behavior.
- Tests are missing for important edge cases.
- Static checks were skipped because of environment limits but the risk is bounded.

Approve with follow-up when:

- Only P3 or low-risk P2 cleanup remains, and core functionality/security are verified.

Approve when:

- No blocking findings exist, relevant checks pass, and residual risk is explicitly stated.

