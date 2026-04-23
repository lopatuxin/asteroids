# Module — HighScoreStorage

## Purpose

`HighScoreStorage` is a thin adapter over `window.localStorage` responsible for the persistent high-score table of the game. The module encapsulates serialisation, sorting, and trimming the list to a top-10, and is the single point in the entire application that reads from and writes to `localStorage`. Without it the player's final score has nowhere to be saved, and `GameOverScene` cannot display the high-score table or determine whether a new result ranked in the top.

## Responsibilities

- Reading the score array from `localStorage` by a fixed key and deserialising JSON into a typed `ScoreEntry[]` list.
- Validating the shape of loaded data: if the JSON is invalid or does not match the schema, the module returns an empty array (behaviour: "as if no records exist yet").
- Normalising the player name: trim to exactly 3 characters, uppercase, replace non-alphabetic characters with `'A'`.
- Inserting a new entry, stably sorting by descending score, and trimming to `TOP_N` (10).
- Writing the final array back to `localStorage`, catching exceptions (private mode, `QuotaExceededError`).
- Telling the caller whether the entry ranked in the top and at what position.
- Fully clearing the score table (`clear()`) — for debugging/service scenarios.

### Non-Responsibilities

- Does not render the score table — that is done by `GameOverScene`/`MenuScene` through Renderer.
- Does not collect player name input (that is the scene's responsibility); the module receives the already-entered string.
- Does not know about the current session, lives, waves, or in-game score — only about the final entry.
- Does not manage versioning/schema migrations: on format mismatch, data is treated as absent, with no conversion attempt.
- Does not interact with any storage other than `window.localStorage` (no `IndexedDB`, no `sessionStorage`, no cookies).
- Does not encrypt or sign data — scores are local; protection against tampering is not required.

## Public Interface

The module exports the `HighScoreStorage` class and the `ScoreEntry` type. Class state is a stateless wrapper (or all logic in static methods); below are instance method signatures.

- `load(): ScoreEntry[]` — reads and returns the score array, already sorted by descending score. On any read/parse error returns `[]`.
- `trySubmit(score: number, name: string): { accepted: boolean; position: number | null }` — attempts to add a new result. Returns `{ accepted: true, position: i }` (index 0..9) if the entry made it into the top-10, otherwise `{ accepted: false, position: null }`. On a `localStorage` write error returns `{ accepted: false, position: null }`.
- `clear(): void` — removes the table key from `localStorage`. Errors are suppressed.

Key constant — `STORAGE_KEY = 'asteroids.highscores'`, private to the module.

## Data Model

The single entity — `ScoreEntry`, stored in an array under the key `asteroids.highscores`.

| Field | Type | Constraints |
|---|---|---|
| `name` | `string` | Exactly 3 characters, A–Z only (uppercase). Non-alphabetic → `'A'`. |
| `score` | `number` | Non-negative integer, final session score. |
| `date` | `string` | ISO-8601, moment of saving the entry (`new Date().toISOString()`). |

In `localStorage`: a serialised JSON array: `ScoreEntry[]`, length `0..10`, sorted by `score` descending. Indexes are not stored — position is determined by order in the array. No relations to other entities. Indexes/secondary keys are not needed — the array is short.

## Key Flows

**1. Loading the score table when opening `MenuScene` / `GameOverScene`.** The scene calls `storage.load()` → the module reads the string at key `asteroids.highscores` → if `null`, returns `[]` → otherwise `JSON.parse` inside `try/catch` → validates that the result is an array of objects with fields `name:string(len=3)`, `score:number`, `date:string` → filters out corrupt entries; if at least one entry fails the format check, the entire array is treated as invalid and `[]` is returned (simple "all or nothing" strategy — see Error Handling) → sorts by `score` descending (protection against externally corrupted order) → trims to 10 → returns.

**2. Submitting a result after game over.** `GameOverScene` collects the name (3 characters) and calls `storage.trySubmit(finalScore, name)` → the module normalises the name (uppercase, length 3, non-alphabetic → `'A'`) → calls `load()` → creates a new entry `{ name, score, date: new Date().toISOString() }` → concatenates with the loaded array → sorts by descending score (stable sort: on equal scores the old entry stays above the new one) → trims to 10 → searches for the new entry in the final array by reference equality (reference to the just-created object is unique) → if found — `JSON.stringify` and `setItem` inside `try/catch`, returns `{ accepted: true, position: index }`; if not found (the new entry was pushed out of the top-10) — nothing is written, returns `{ accepted: false, position: null }`; if `setItem` threw — returns `{ accepted: false, position: null }`.

**3. Service table reset.** Somewhere in dev tools or via a hidden key combination, `storage.clear()` is called → the module calls `localStorage.removeItem('asteroids.highscores')` inside `try/catch` → after this `load()` will return `[]`.

## Dependencies

- **`config` module** — imports constants `TOP_N` (e.g. `10`) and `NAME_LENGTH` (e.g. `3`) to avoid hardcoding numbers inside the class. The `STORAGE_KEY` is kept local to the module — it is an implementation detail, not a balance setting.
- **`window.localStorage`** — browser API, the only external integration.
- **`JSON` (built-in)** — serialisation/deserialisation.
- **`Date` (built-in)** — generating the ISO string for the `date` field.

The module is logically depended on by nobody except `GameOverScene` (submit) and `MenuScene`/`GameOverScene` (read). It has no state between calls.

## Error Handling

- **Invalid JSON in storage** (`JSON.parse` throws) — caught by `try/catch`; `load()` returns `[]`. The corrupt value is not automatically overwritten to avoid silently losing data due to potential bugs; the next successful `trySubmit` will overwrite it with a correct array.
- **Schema mismatch** (not an array; element missing required fields; `name` not length 3; `score` not a number) — the entire table is treated as absent; `load()` returns `[]`. This is the simplest "migration" strategy: no old formats are supported, no conversion is ever attempted.
- **`localStorage` unavailable** (Safari private mode, disabled storage, `SecurityError` accessing `window.localStorage` from an `iframe`) — access is wrapped in `try/catch`; `load()` → `[]`, `trySubmit()` → `{ accepted: false, position: null }`, `clear()` — no-op.
- **`QuotaExceededError` on `setItem`** — caught; `trySubmit()` returns `{ accepted: false, position: null }`. In practice, the quota cannot be exceeded by an array of 10 short entries, but the handler is there for robustness.
- **Invalid `score` input** (`NaN`, `Infinity`, negative number) — sanitisation: `NaN`/`Infinity` → entry not accepted (`{ accepted: false, position: null }`); negative values are formally allowed but don't occur in practice (Scoring doesn't go negative).
- **Invalid `name` input** — not an error, but a normalisation scenario: any string is trimmed to 3 uppercase characters with non-A–Z replaced by `'A'` (strings shorter than 3 are padded with `'A'` on the right, longer ones are truncated).
- **Dev build logging error** — internal errors are written via `console.warn('[highscores]', …)` only when `import.meta.env.DEV`; exceptions are never propagated externally. The player sees no error — graceful degradation, as prescribed by the architecture.

## Stack & Libraries

- **TypeScript** — strict typing of `ScoreEntry` and return values prevents errors at the `GameOverScene` boundary.
- **`window.localStorage`** — standard browser API, synchronous, no dependencies. For top-10 short entries its performance and quota are more than sufficient.
- **Built-in `JSON.stringify` / `JSON.parse`** — serialisation. External libraries (zod, io-ts) are excessive: the schema is trivial; manual validation in 10 lines of code is simpler and adds no bundle dependency.
- **`Array.prototype.sort`** — stable sorting in modern engines (ES2019+), matching the target browsers of the project.
- **No HTTP/transport libraries, no mock stores** — the module is by definition local.

## Configuration

| Name | Purpose | Default |
|---|---|---|
| `STORAGE_KEY` | Key in `localStorage` under which the array is stored. | `'asteroids.highscores'` |
| `TOP_N` | Maximum length of the score table. | `10` (from `config.ts`) |
| `NAME_LENGTH` | Fixed player name length. | `3` (from `config.ts`) |
| `NAME_PAD_CHAR` | Pad character for invalid name positions. | `'A'` |

No environment variables — all configuration is compiled into the bundle via `config.ts`. No secrets.

## Open Questions

- Whether to protect against concurrent writes from multiple tabs of the same origin (`storage` event)? For MVP: ignored — opening two tabs is rare, and the worst case is one tab overwriting the other's record.
- Whether to store the date of the last game separately from the score array (statistics "played at all")? For now — no; the `date` field inside each entry is sufficient.
- Whether to add import/export of the score table (copy JSON string manually)? Out of MVP scope.
- Strategy on detecting corrupt JSON: "return empty but don't overwrite" or "overwrite immediately"? Currently the former; may be revisited if corrupt data accumulates from bugs in past versions.
