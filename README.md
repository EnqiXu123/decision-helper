# Decision Helper PRD v1.0 (MVP, Client-Side Web App)

## Brief Summary

Decision Helper is a client-side web app that helps users compare options using weighted scoring. Users define options and criteria, set criterion weights, rate each option per criterion, and see ranked results with explainable reasons.  
This PRD locks edge-case behavior, scoring rules, data contracts, accessibility behavior, and measurable quality targets so implementation can be deterministic.

## Product Overview

- Product: Decision Helper
- Version: V1 (MVP)
- Owner: [Your Name]
- Platform: Browser web app
- Architecture: Plain HTML/CSS/JavaScript, no backend, no login, no frameworks
- Persistence: `localStorage` only

## Problem Statement

Users making trade-off decisions often overweight one factor, forget criteria, or rely on emotion. They need a simple, transparent method that:

- forces explicit priorities,
- quantifies trade-offs,
- explains outcomes,
- works instantly without account setup.

## Goals and Success Criteria

- Users can complete a decision from empty/default state without guidance.
- Scores and rankings are mathematically correct and update live.
- Tie behavior and missing-data behavior are explicit and consistent.
- Result explanation ("Top reasons") is deterministic.
- State survives refresh and browser restart via `localStorage`.
- App is usable on 320px+ screens and keyboard/screen-reader accessible.

## In Scope (MVP)

- Decision title (optional)
- Option CRUD (minimum 2, maximum 20)
- Criterion CRUD with weight 1-5 (minimum 1, maximum 20)
- Rating grid (1-5 stars, clear supported)
- Live scoring and ranking
- Winner or co-winner display
- Top 3 contributing criteria explanation
- Notes per option (non-scoring)
- Autosave and restore from `localStorage`
- Reset decision with confirmation

## Out of Scope (MVP)

- AI suggestions/recommendations
- Sensitivity simulations
- Collaboration, sharing links, cloud sync
- Export (PDF/CSV)
- Backend, DB, authentication
- Third-party frontend frameworks

## Functional Requirements

### FR-01 Decision Setup

- Optional title input.
- Default title empty.
- Title max length: 80 chars.
- Trim whitespace on save.

### FR-02 Options Management

- User can add, rename, and delete options.
- Minimum options: 2.
- Maximum options: 20.
- Default options on fresh load: 2 starter options.
- Option name rules:
  - required after trim,
  - length 1-60,
  - unique case-insensitive among options.
- If delete would reduce below 2, block action and show inline message.
- Deleting an option removes its related ratings only.

### FR-03 Criteria Management

- User can add, rename, reweight, and delete criteria.
- Minimum criteria: 1.
- Maximum criteria: 20.
- Default criteria on fresh load: 3 starter criteria.
- Criterion rules:
  - name required after trim,
  - length 1-40,
  - unique case-insensitive among criteria,
  - weight integer 1-5 only.
- Weight labels:
  - 1 = Meh
  - 2 = Slight
  - 3 = Medium
  - 4 = Important
  - 5 = Dealbreaker
- If delete would reduce below 1, block action and show inline message.
- Deleting a criterion removes ratings tied to that criterion.

### FR-04 Rating Grid

- Grid dimension = options x criteria.
- Each cell supports values `{1,2,3,4,5}` plus cleared state.
- Cleared state stored as `null` (or absent in sparse map) and treated as 0 in scoring.
- Rating updates score immediately without reload.
- Keyboard and pointer input both supported.

### FR-05 Scoring Logic (Normative)

Definitions:

- `w(c)` = criterion weight in `[1..5]`
- `r(o,c)` = rating in `[1..5]`; if missing/cleared then `0`
- `raw(o) = sum_c (w(c) * r(o,c))`
- `maxRaw = sum_c (w(c) * 5)`
- `pct(o) = (raw(o) / maxRaw) * 100`, rounded to 1 decimal for display

Rules:

- Store and compare using full-precision raw numeric values (not rounded display).
- Display score as `raw/maxRaw` and `pct%` (both shown).
- Recompute all affected outputs on any mutation (title excluded from scoring).

### FR-06 Ranking and Winner Logic

- Ranking sorted by:
  1. `raw(o)` descending
  2. stable creation order ascending (for display stability only)
- Winner policy: shared winners.
  - All options with `raw == highestRaw` are co-winners.
- If all options have `raw = 0`, still rank stably and show tie/co-winner message.

### FR-07 Top 3 Reasons

For each winner option:

- Contribution per criterion: `contrib(o,c) = w(c) * r(o,c)`
- Sort reasons by:
  1. `contrib` descending
  2. `w(c)` descending
  3. criterion creation order ascending
- Show up to 3 criteria with `contrib > 0`.
- If none have positive contribution, show: "No contributing criteria yet. Add ratings."

### FR-08 Notes Per Option

- Optional note per option.
- Max length: 500 chars.
- Notes do not affect scoring.

### FR-09 Persistence

- Autosave to `localStorage` after each state mutation (debounced, target 150ms).
- Restore on load if state is valid.
- On corrupted/unparseable storage:
  - fall back to default state,
  - keep app usable,
  - show non-blocking notice.

### FR-10 Reset

- Reset button opens confirmation dialog.
- On confirm:
  - clear app storage key,
  - restore default state,
  - recompute ranking/results.

### FR-11 Validation and Error Messaging

- Validation is immediate and human-readable.
- Errors never break scoring engine.
- Blocking validations prevent invalid state writes.
- Messages appear near field and through accessible live region.

### FR-12 Accessibility Behavior

- Rating cell exposed as accessible control with meaningful `aria-label`.
- Full keyboard support:
  - `Tab` to focus controls,
  - arrow keys to move/select stars,
  - `Space/Enter` to set,
  - clear action available via keyboard.
- Live region announces winner changes and validation errors.
- Contrast meets WCAG AA (4.5:1 for body text).

## Edge Cases (Explicit)

1. Delete option when exactly 2 options exist: block, show "At least 2 options required."
2. Delete criterion when exactly 1 criterion exists: block, show "At least 1 criterion required."
3. Duplicate option/criterion names differing only by case: reject.
4. Blank name with spaces only: reject after trim.
5. Cleared rating: treated as 0, not validation error.
6. All ratings missing: all scores 0; show co-winner tie message.
7. All options equal non-zero score: show co-winner tie message.
8. Fewer than 3 positive contributions: show only available count.
9. Criterion renamed: historical contributions recalc using same criterion ID.
10. Option/criterion delete: remove orphaned ratings immediately.
11. Storage contains unknown version: attempt migration if supported, else safe reset to defaults.
12. Storage payload partially missing fields: repair with defaults where safe, else reset.
13. User enters max matrix (20x20): app remains responsive within NFR limits.
14. Title/notes extremely long input: enforce max length and retain valid prefix only.
15. Browser storage full/quota exceeded: show non-blocking "Could not save" warning, keep session functional.
16. Rapid edits (typing/weight/rating bursts): no data corruption; latest state wins.

## Non-Functional Requirements (Measurable)

### NFR-01 Technology

- Plain HTML/CSS/JS only.
- No backend calls in normal operation.

### NFR-02 Performance

- At 20 options x 20 criteria:
  - score recompute + ranking update target <= 50ms on mid-tier mobile browser,
  - <= 16ms on modern desktop target path.
- No full page reload for any in-app operation.

### NFR-03 Responsiveness

- Supports viewport width >= 320px.
- Touch targets >= 44px where practical.
- No horizontal overflow in primary workflows.

### NFR-04 Accessibility

- Keyboard-only completion of full decision flow.
- WCAG AA contrast minimum for text/UI.
- Semantic labels for interactive controls and status announcements.

### NFR-05 Reliability

- No uncaught JS exceptions in normal flows.
- Stable IDs for options/criteria across edits.
- Deterministic outcomes for equal inputs.

## Public Interfaces / Data Contracts (New)

No external API. Internal persisted contract:

```ts
type Id = string; // UUID-like stable ID
type RatingValue = 1 | 2 | 3 | 4 | 5 | null;

interface OptionItem {
  id: Id;
  name: string;
  note: string;
  createdAt: number;
}

interface CriterionItem {
  id: Id;
  name: string;
  weight: 1 | 2 | 3 | 4 | 5;
  createdAt: number;
}

interface AppStateV1 {
  version: 1;
  title: string;
  options: OptionItem[];
  criteria: CriterionItem[];
  ratings: Record<string, RatingValue>; // key format: `${optionId}:${criterionId}`
  updatedAt: number;
}
```

Storage:

- Key: `decision-helper.v1.state`
- Migration:
  - if `version === 1`, load directly;
  - else attempt explicit migrator;
  - on failure, reset to defaults with notice.

## Process Flow

1. Open app.
2. Attempt restore from `localStorage`.
3. If missing/invalid, load defaults.
4. User edits options/criteria/weights/ratings/notes/title.
5. App validates input.
6. App recalculates scores and ranking live.
7. App updates winner/co-winner and reasons.
8. App autosaves state.
9. User continues or resets.

## Test Cases and Scenarios

1. Fresh load creates default state with 2 options and 3 criteria.
2. Add option up to 20 succeeds; 21st blocked.
3. Delete option at count 2 blocked.
4. Add criterion up to 20 succeeds; 21st blocked.
5. Delete criterion at count 1 blocked.
6. Option name empty/whitespace rejected.
7. Criterion duplicate name (case-insensitive) rejected.
8. Rating clear sets null and score uses 0.
9. Known matrix yields exact expected raw totals.
10. Percent display equals `raw/maxRaw` rounded to 1 decimal.
11. Ranking sorts by score desc and preserves creation order on ties.
12. Multiple top scores produce co-winner display.
13. Top reasons sorted by contribution, then weight, then creation order.
14. Winner with no positive contributions shows fallback reason message.
15. Notes persist and do not alter scores.
16. Reload restores exact prior state.
17. Corrupted storage falls back safely to defaults.
18. Reset clears state and restores defaults.
19. Keyboard-only user can set/clear ratings and complete flow.
20. 20x20 matrix interaction meets responsiveness target and no crashes.

## Definition of Done

- All FR-01 to FR-12 implemented as specified.
- All edge cases above handled exactly as defined.
- All NFR targets met or documented with measured variance.
- All 20 test scenarios pass.
- No critical defects in scoring, ranking, persistence, or accessibility flows.

## Assumptions and Defaults Chosen

- Tie policy: shared winners (no forced single winner).
- Score display: both points and percentage.
- Performance guarantee scope: up to 20 options x 20 criteria.
- Cleared/missing rating is null in state and 0 in scoring.
- Name uniqueness enforced case-insensitively for clarity.
