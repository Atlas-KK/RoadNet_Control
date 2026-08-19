# Review Output Template

Use this structure for final audit reports. Keep it concise and actionable.

## When Issues Exist

Start with findings. Use this shape:

```markdown
**Findings**

- `[P1] Title`
  File: `path/to/file.ext:123`
  Layer: Human review / Security / Static scanning / Test validation
  Impact: Explain the user-visible, data, security, or maintainability risk.
  Evidence: Point to the code behavior, call path, scanner result, test gap, or command result.
  Modification advice: State the concrete change needed.

- `[P2] Title`
  File: `path/to/another-file.ext:45`
  Layer: ...
  Impact: ...
  Evidence: ...
  Modification advice: ...

**Four-Layer Audit Status**

- Human code-review methodology: Completed / Partial / Skipped, with reason.
- Security verification: Completed / Partial / Skipped, with reason.
- Static scanning and automated checks: Completed / Partial / Skipped, with commands or reason.
- Test validation: Completed / Partial / Skipped, with commands or reason.

**Test and Scan Results**

- Passed: `command or verification`
- Failed: `command or verification`
- Not run: `reason`

**Test Gaps**

- Missing test or scenario.

**Merge Recommendation**

Block merge / Request changes / Accept with follow-up / Approve.

**Summary**

One short paragraph summarizing the review.
```

## When No Issues Are Found

```markdown
No blocking issues found.

**Four-Layer Audit Status**

- Human code-review methodology: Completed / Partial / Skipped, with reason.
- Security verification: Completed / Partial / Skipped, with reason.
- Static scanning and automated checks: Completed / Partial / Skipped, with commands or reason.
- Test validation: Completed / Partial / Skipped, with commands or reason.

**Test and Scan Results**

- Passed: `command or verification`
- Not run: `reason, if any`

**Residual Risk**

- Note any untested areas or assumptions.

**Summary**

Short description of what was reviewed.
```

## Writing Rules

- Put findings before summary.
- Use severity labels: P0, P1, P2, P3.
- Include file and line references whenever available.
- Tie each finding to one of the four layers.
- Avoid generic advice such as "improve code quality"; name the exact change.
- If evidence is inferred, say so.
- Do not claim tests, scans, or layers passed unless they actually ran or were manually completed.
- Do not hide uncertainty. State assumptions and unverified areas plainly.
