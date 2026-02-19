# Scoring Normalization Design

## Problem

The current scoring formula `100 - (errors × 3) - (warnings × 1)` is not normalized by project size. A 1,370-file project (slack-clone) with 120 warnings scores 0/100, while a 10-file project with 5 warnings scores 95/100. The score bottoms out at 0 for any project with 34+ issues regardless of scale.

## Decision

**Approach: Exponential decay with density normalization**

```
penalty = (errors × 3) + (warnings × 1)
density = penalty / filesScanned
score = round(100 × e^(-3 × density))
```

### Properties

- 0 issues → 100 (perfect)
- Low density (~0.01) → ~97 (nearly clean)
- Medium density (~0.1) → ~74 (needs work)
- High density (~0.5) → ~22 (major problems)
- Smooth curve, first issues hurt most, diminishing returns

### Expected scores

| Scenario | Files | Issues | Density | Score |
|---|---|---|---|---|
| slack-clone | 1370 | 120 warnings | 0.088 | 77 ("Good") |
| Tiny mess | 10 | 5 warnings | 0.50 | 22 ("Critical") |
| Small clean | 50 | 5 warnings | 0.10 | 74 ("Needs Work") |
| Large + errors | 1000 | 30 errors | 0.09 | 76 ("Good") |
| Perfect | any | 0 | 0 | 100 ("Excellent") |

### Decisions

- **Severity weights**: Keep current 3:1 (error:warning). No third tier.
- **Labels**: Unchanged — Excellent (90+), Good (75+), Needs Work (50+), Critical (<50).
- **CI threshold**: Fixed at 75 for `--score` exit code.
- **Edge case**: `filesScanned === 0` → score 100.

## Changes Required

- `src/scorer.ts`: Add `filesScanned` parameter, new formula
- `src/index.ts`: Pass `filesScanned` to `computeScore`
- `tests/scorer.test.ts`: Update tests for new signature and normalization
- Reporters and types: No changes needed
