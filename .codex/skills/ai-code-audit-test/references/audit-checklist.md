# AI Code Audit Checklist

Use this checklist when auditing code generated or modified by AI. Focus on defects that survive basic smoke tests.

## 1. Intent and Scope

- Does the implementation match the user's actual acceptance criteria?
- Did the change alter behavior outside the requested scope?
- Are unrelated formatting, dependency, or architecture changes mixed in?
- Can the AI explain why each changed file needed to change?

## 2. Root Cause vs Patch

Look for signs of patch accumulation:

- New `if/else` branches added around symptoms without changing the faulty model or flow.
- Same condition copied into multiple locations.
- Temporary names such as `fix`, `new`, `temp`, `hack`, `flag1`, or `legacy2`.
- Defensive null checks that hide why invalid data exists.
- Broad `try/catch` blocks that convert failures into empty values.

Prefer modification advice that removes duplicated special cases and moves the rule to the correct owner.

## 3. Architecture and Ownership

Check whether responsibilities remain separated:

- UI components should not own business policy, persistence rules, or permission decisions.
- API handlers/controllers should not become large orchestration and formatting containers.
- Service/domain code should not depend on presentation-only concepts.
- Shared utilities should remain generic; business-specific behavior belongs in domain modules.
- Constants, enums, schemas, and mappings should have one authoritative location.

Flag any change that makes the next feature harder to place.

## 4. Data and State Correctness

Audit:

- Empty, null, undefined, missing field, malformed input, and default-value behavior.
- State transitions, especially multi-step workflows and approval flows.
- Race conditions, stale cache, repeated submission, retry, cancellation, and optimistic update behavior.
- Date, timezone, unit conversion, sorting, pagination, and precision issues.
- Backward compatibility for persisted data and API responses.

## 5. Security and Permissions

Check:

- Server-side permission enforcement, not only UI hiding.
- Trust boundaries around request body, query params, headers, local storage, and route params.
- Injection risks in SQL, command execution, template rendering, and dynamic selectors.
- Sensitive data exposure in logs, errors, client bundles, and telemetry.
- Authentication, authorization, tenant isolation, and ownership checks.

Security issues should be findings even if no exploit is proven.

## 6. Error Handling and Observability

Audit whether failures are:

- Surfaced to callers or users appropriately.
- Logged with useful context but without sensitive data.
- Retried only when safe.
- Not converted into misleading success states.
- Covered by tests or manual validation.

Silent failure is a common AI-code defect.

## 7. Tests

Check test quality, not just test existence:

- Tests should fail against the old broken behavior.
- Tests should cover edge cases and negative paths, not only the happy path.
- Tests should not over-mock the code under review.
- Assertions should verify meaningful behavior, not implementation trivia.
- Snapshot updates should be justified.
- Deleted or weakened tests require explicit explanation.

Recommend targeted tests when coverage is missing.

## 8. Maintainability

Review:

- Function length and nesting depth.
- Naming clarity.
- Repetition and duplicated transformations.
- Magic numbers and strings.
- Excessive coupling between modules.
- Whether comments explain "why" instead of repeating "what".
- Whether non-obvious business rules, boundary conditions, compatibility logic, and risk-mitigation logic have concise comments explaining why they exist.
- Whether AI avoided removing necessary comments merely to make code look shorter.

Maintenance findings should include a concrete restructure suggestion, not vague cleanup advice.

## 9. Dependency and Build Impact

Check:

- New dependencies are necessary, maintained, and already accepted by project conventions.
- Bundle size, runtime compatibility, and license risk if relevant.
- Build, typecheck, lint, and formatting behavior.
- Environment variable and configuration changes.

## 10. Merge Decision

Classify the result:

- Approve: no blocking findings; residual risks are acceptable.
- Approve with changes requested: low to medium issues should be fixed soon.
- Block merge: P0/P1 issues, unverified critical behavior, security risks, or architecture damage.

