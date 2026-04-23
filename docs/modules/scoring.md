# Module — Scoring

## Purpose

The `Scoring` module is the single source of truth about the current session's progress: how many points have been scored, how many lives remain, and which wave is active. Without it, `GameScene` cannot make decisions about game over or awarding bonus lives, and the HUD doesn't know what to display. All score-awarding logic (by table) and bonus life logic (by thresholds) is gathered in one place so that other subsystems don't duplicate balance data.

## Responsibilities

- Storing the current session score (`score`).
- Storing the current number of lives (`lives`).
- Storing the current wave number (`wave`).
- Awarding points for destroying an entity by its type and size, according to the table from `config`.
- Granting a bonus life when the next threshold is crossed (by default every 10,000 points).
- Reducing the life count on ship loss and answering the question "is the game over?".
- Incrementing the wave number on request from `WaveManager`/`GameScene`.
- Providing an immutable state snapshot for the HUD and `GameOverScene`.

### Non-Responsibilities

- Does not perform collision detection — it receives an already-resolved "what was destroyed" from `GameScene` after resolving a `CollisionEvent`.
- Does not decide when to spawn the next wave or UFO — that is `WaveManager`.
- Does not manage ship respawn, post-death invulnerability, or animations — those belong to `Ship`/`GameScene`.
- Does not read or write `localStorage` — high scores are saved by `HighScoreStorage` after game over.
- Does not render the HUD — only exposes data externally via `snapshot()`.
- Does not store score history or event logs.

## Public Interface

The module exports the class `Scoring`. All methods are synchronous with no side effects outside their own state.

- `constructor(config: ScoringConfig)` — accepts the score table, starting lives, and bonus life threshold from the global `config`. Initialises `score = 0`, `lives = config.startingLives`, `wave = 1`, `nextBonusLifeAt = config.bonusLifeThreshold`.
- `addKill(kind: AsteroidSize | UfoKind): void` — awards points for destroying the specified target and, when crossing a threshold, adds bonus lives.
- `loseLife(): void` — decrements `lives` by 1, but not below zero. After reaching zero, subsequent calls are a no-op.
- `nextWave(): void` — increments the wave number by 1.
- `isGameOver(): boolean` — `true` if `lives === 0`.
- `snapshot(): { score: number; lives: number; wave: number }` — returns a copy of the current values for the HUD and game over screen.

Types used in signatures:

- `AsteroidSize = 'large' | 'medium' | 'small'` — from the `Asteroid` module.
- `UfoKind = 'large' | 'small'` — from the `Ufo` module.
- `ScoringConfig = { points: Record<AsteroidSize | UfoKind, number>; startingLives: number; bonusLifeThreshold: number }`.

## Data Model

State lives in instance fields, all primitives:

- `score: number` — current session score, non-negative, monotonically increasing.
- `lives: number` — non-negative integer, starts at `config.startingLives` (typically 3), never drops below 0.
- `wave: number` — integer ≥ 1, starts at 1.
- `nextBonusLifeAt: number` — threshold at which the next bonus life is granted (starts at `config.bonusLifeThreshold`, e.g. 10,000; increments by the same step after being awarded).

No external tables or indexes. Relations: a `Scoring` instance belongs to `GameScene`/`World`, lives for exactly one session, and is recreated at the start of a new one.

## Key Flows

**Awarding points for a kill.** `CollisionSystem` reports a bullet–asteroid/UFO collision to `GameScene`. `GameScene` resolves the collision (marks the entity as dead, calls `split()` on the asteroid), then calls `scoring.addKill(asteroid.size)` or `scoring.addKill(ufo.kind)`. Scoring looks up `config.points[kind]`, adds it to `score`, then loops: `while (score >= nextBonusLifeAt)`: `lives++`, `nextBonusLifeAt += config.bonusLifeThreshold`. The loop is needed so that a large single award correctly grants multiple bonus lives, e.g. if a UFO kill crosses several thresholds at once.

**Losing a life.** When a ship↔asteroid or UFO bullet↔ship collision occurs, `GameScene` calls `scoring.loseLife()`. Scoring decrements `lives` by 1, but if it was already 0 — leaves it at 0 (guard against double calls in a single tick). After this, `GameScene` asks `scoring.isGameOver()` — if `true`, `SceneManager.replace(GameOverScene)` is called with `scoring.snapshot()` passed out; if `false`, `GameScene` initiates ship respawn.

**Advancing to the next wave.** After `WaveManager.isCleared(world)` returns `true`, `GameScene` calls `scoring.nextWave()`, then `waveManager.startWave(scoring.snapshot().wave)`. Scoring simply increments the `wave` field — it does not make decisions about wave composition, only tracks the counter.

**HUD rendering.** Each tick `GameScene.draw(ctx)` reads `scoring.snapshot()` and passes it to Renderer for drawing the score digits, life icons, and wave number in the canvas corners. The snapshot is a copy, so accidental external mutation cannot corrupt the internal state.

## Dependencies

- **`config`** — reads the score table (`points: Record<AsteroidSize | UfoKind, number>`), starting lives (`startingLives`), and bonus life threshold (`bonusLifeThreshold`). Values arrive once in the constructor and are not re-read.
- **Types `AsteroidSize` and `UfoKind`** — imported from the `Asteroid` and `Ufo` modules for type-safe table keys.

No outgoing dependencies on other modules: Scoring calls nobody; it is called (primarily by `GameScene`). This is deliberate — it keeps it trivially testable and doesn't drag in renderer/input/physics.

## Error Handling

- **Unknown `kind` in `addKill`.** TypeScript won't allow passing a value outside `AsteroidSize | UfoKind`, but at runtime it is possible due to type drift. Behaviour: if `config.points[kind]` is `undefined`, `addKill` does nothing (early return); in a dev build, it writes `console.warn('[scoring] unknown kill kind', kind)`.
- **`loseLife()` when `lives === 0`.** No-op; `lives` does not go negative. This guards against the situation where a ship collides with multiple entities in a single tick and `GameScene` calls `loseLife` twice.
- **Score overflow.** Theoretically `number` in JS supports up to `Number.MAX_SAFE_INTEGER` (~9.007×10¹⁵), which is unreachable in any reasonable session for an arcade score counter. No special protection is added.
- **Snapshot mutation by caller.** `snapshot()` returns a new object literal on each call, so even if the consumer modifies its fields — the internal state is unaffected.
- **Partial failure.** The module is purely synchronous with no I/O or promises — there is no partial state: either the operation completed in full, or it never started.

## Stack & Libraries

- **TypeScript (ES2022 classes)** — language dictated by the architecture. A regular class with private fields (`#score`, `#lives`, …) is used. Nothing to inherit from, one external interface — the class itself.
- **No external libraries.** Scoring is pure state and arithmetic; pulling in RxJS/EventEmitter/immutable collections makes no sense.
- **No persistence.** No `localStorage`, `IndexedDB`, or promises — everything is in class fields, all synchronous.
- **No events/subscriptions.** Consumers read `snapshot()` on demand each frame; callbacks like `onBonusLife` are not introduced, to avoid added complexity.

## Configuration

All parameters are taken from the `config` module and passed into the `Scoring` constructor. There is no external runtime configuration.

- `points: Record<AsteroidSize | UfoKind, number>` — purpose: score table for kills. Default (guideline, subject to tuning): `{ large: 20, medium: 50, small: 100, ufoLarge: 200, ufoSmall: 1000 }` in the spirit of the original Atari.
- `startingLives: number` — purpose: how many lives the player has at the start of a session. Default: `3`.
- `bonusLifeThreshold: number` — purpose: the step threshold for awarding a bonus life. Default: `10000`. The first bonus life is at 10,000, the next at 20,000, and so on.

No secrets or environment variables.

## Open Questions

- Exact `points` values by asteroid size and UFO type — require tuning after the first playable build; the guideline values above are taken from the 1979 original and may be revised.
- Whether to keep a fixed bonus life step (10,000) or switch to a growing step (e.g. 10k → 15k → 20k) for balancing long sessions.
- Whether to cap the maximum number of lives (e.g. 7, as in some clones) so the player can't accumulate an infinite stockpile. For MVP — no cap.
- Whether to show the player a visual notification when a bonus life is awarded (a brief "EXTRA LIFE" text in the HUD). If yes — a callback from `addKill` or a `bonusJustAwarded` flag in `snapshot` would be needed.
- Whether a `reset()` method is needed for restarting a session without recreating the object, or whether `GameScene` always creates a new `Scoring` on start. The second option is preferred as more explicit.
