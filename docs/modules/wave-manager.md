# Module `wave-manager`

## Purpose

The module defines the `WaveManager` class — a `World` satellite responsible for the game's pacing and population: on request from the scene it generates the starting set of asteroids for a specific wave, and on every tick it decides whether it is time to release a UFO onto the field. Without this module the game would be static — difficulty would not grow and the second source of danger would never appear. The module encapsulates all balance logic for "what to spawn and when", leaving the entities themselves (`Asteroid`, `Ufo`) to know only about themselves.

## Responsibilities

- Declaring the `WaveManager` class with the public methods `startWave` and `maybeSpawnUfo`.
- Computing the number of asteroids for wave `n` using the formula from `config.WAVE` (initial + increment × (n − 1), capped at `MAX_ASTEROIDS`).
- Generating `Asteroid[]` of size `large` with random positions outside the safe zone around the ship and random speeds in the range `[ASTEROID.SPEED_MIN, ASTEROID.SPEED_MAX]` with arbitrary direction.
- Maintaining an internal `ufoSpawnCooldown` timer: accumulating time between UFO spawn attempts and deciding on a spawn based on a probability that grows with the wave number.
- Choosing the UFO subtype (`large` / `small`) depending on the wave number: `small` appears more frequently starting at `WAVE.UFO_SMALL_THRESHOLD_WAVE`.
- Guaranteeing that at most one UFO is on the field at a time (via the external `hasUfo` parameter).
- Handling the case where the ship is absent (between respawns): using the canvas centre as the safe-zone anchor.

### Non-Responsibilities

- Does not store the asteroid or UFO list — that is `World`'s ownership. `WaveManager` only returns new instances to the caller.
- Does not track when a wave is "cleared" (the `isCleared` method is `World`/`GameScene`'s domain if needed; this module focuses on spawning).
- Does not award points or manage lives — that is `Scoring`.
- Does not know about player input, rendering, or sound.
- Does not handle asteroid and UFO physics — only their creation with correct initial parameters.
- Does not decide when the UFO fires — that is `Ufo.tryFire`'s internal logic.
- Does not add entities to `World`: returns them, and `GameScene` manages the lists.

## Public Interface

The sole export is the class:

- `class WaveManager` — the wave and UFO spawn manager.

Instance fields:

- `ufoSpawnCooldown: number` — accumulating timer until the next UFO spawn attempt, in seconds. Initialised to zero or a small starting value.

Constructor:

- `constructor()` — no arguments. Sets `ufoSpawnCooldown = 0`. All balance parameters are read from `config` at the point of use.

Methods:

- `startWave(n: number, shipPos: Vec2 | null): Asteroid[]` — generates and returns the starting set of large asteroids for wave `n`. The `shipPos` argument is used as the centre of the "safe zone" in which asteroids do not appear; if `null` — the canvas centre is used.
- `maybeSpawnUfo(dt: number, wave: number, hasUfo: boolean): Ufo | null` — on each tick decrements `ufoSpawnCooldown` by `dt` and with a growing probability (depending on `wave`) decides whether to release a UFO. If `hasUfo === true` — always returns `null` (at most one UFO at a time). Otherwise — returns a `Ufo` ready to be added to the world, or `null`.

## Data Model

The module owns no collections and has no external storage. Shape of one instance:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `ufoSpawnCooldown` | `number` | `0` | accumulating timer until the next UFO spawn chance, in seconds |

Derived values, computed at the point of use (not stored):

- Number of asteroids for wave `n`: `min(WAVE.MAX_ASTEROIDS, WAVE.INITIAL_ASTEROIDS + WAVE.ASTEROIDS_PER_WAVE_INCREMENT * (n - 1))`.
- UFO spawn probability for wave `wave` (per unit time): `min(WAVE.UFO_SPAWN_CHANCE_MAX, WAVE.UFO_SPAWN_CHANCE_BASE + wave * WAVE.UFO_SPAWN_CHANCE_PER_WAVE)`.
- Probability of choosing the `small` subtype: `0` if `wave < WAVE.UFO_SMALL_THRESHOLD_WAVE`, otherwise growing proportionally above the threshold (e.g. linearly up to a ceiling).

No relations to other entities — `WaveManager` lives as a single field `World.waveManager`.

## Key Flows

**Starting a wave.** `GameScene` after clearing the current wave increments the wave number and calls `waveManager.startWave(n, world.ship?.position ?? null)`. Internally: (1) `count = min(WAVE.MAX_ASTEROIDS, WAVE.INITIAL_ASTEROIDS + WAVE.ASTEROIDS_PER_WAVE_INCREMENT * (n - 1))` is computed; (2) the safe-zone anchor is determined: `anchor = shipPos ?? { x: CANVAS.WIDTH / 2, y: CANVAS.HEIGHT / 2 }`; (3) in a loop `count` times, a position is generated — a uniformly random point in the canvas rectangle, rejected and re-generated while `distance(pos, anchor) < WAVE.SAFE_RADIUS` (a config constant or derived from `ASTEROID.RADIUS.large` × a coefficient; see Open Questions); (4) a velocity is generated: a uniformly random angle in `[0, 2π)`, magnitude — `randomRange(ASTEROID.SPEED_MIN, ASTEROID.SPEED_MAX)`, resulting vector — `{ cos(θ) * speed, sin(θ) * speed }`; (5) `new Asteroid('large', position, velocity)` is created and added to the output array. The returned array is stored by `GameScene` in `world.asteroids`. `ufoSpawnCooldown` is not touched in `startWave` — the UFO continues to spawn on the shared timer regardless of wave boundaries.

**UFO spawn attempt per tick.** `GameScene` on every simulation tick calls `waveManager.maybeSpawnUfo(dt, world.wave, world.ufos.length > 0)`. Internally:

1. If `hasUfo === true` — immediately `return null` (restriction: no more than one UFO at a time).
2. `this.ufoSpawnCooldown -= dt` — decrement the accumulator.
3. If `ufoSpawnCooldown > 0` — `return null`, not yet time for an attempt.
4. Compute the per-attempt probability: `p = min(WAVE.UFO_SPAWN_CHANCE_MAX, WAVE.UFO_SPAWN_CHANCE_BASE + wave * WAVE.UFO_SPAWN_CHANCE_PER_WAVE)`. Roll `Math.random() < p`.
5. Regardless of the result, restart the cooldown to a short interval (e.g. `ufoSpawnCooldown = WAVE.UFO_SPAWN_CHECK_INTERVAL` — about 1 s; see Open Questions). This converts "chance per tick" into "chance per attempt", making behaviour independent of `SIMULATION.HZ`.
6. If the roll failed — `return null`. If it succeeded — select the subtype and create the UFO (see next flow).

**Selecting the UFO subtype.** On a successful roll the `small` probability is computed:

- If `wave < WAVE.UFO_SMALL_THRESHOLD_WAVE` — `pSmall = 0`, always `large`.
- Otherwise `pSmall = min(WAVE.UFO_SMALL_MAX_CHANCE, (wave - WAVE.UFO_SMALL_THRESHOLD_WAVE + 1) * WAVE.UFO_SMALL_CHANCE_PER_WAVE)` (exact constants are an open question; a monotonically growing dependency with a ceiling is sufficient).
- `kind = Math.random() < pSmall ? 'small' : 'large'`.

Then `const ufo = new Ufo(kind)` — the `Ufo` constructor places the UFO at the left or right canvas edge with a random height and direction toward the centre (see `docs/modules/ufo.md`). `WaveManager` does not participate in choosing the starting position or direction — it only dictates the moment of appearance and the subtype. The returned value is a ready `Ufo`.

**Behaviour while a UFO is alive.** While `hasUfo === true`, `ufoSpawnCooldown` continues decrementing in the `maybeSpawnUfo` call — no, it does not: the early `return null` when `hasUfo` means the timer is frozen. This is intentional: once the single UFO is destroyed or flies off, the chance of a new one does not accumulate "in advance" but starts from an honest countdown from the current moment.

## Dependencies

- **`asteroid`** — the `Asteroid` class, constructor `new Asteroid(size, position, velocity)`.
- **`ufo`** — the `Ufo` class, constructor `new Ufo(kind)`.
- **`vec2-math`** — the `Vec2` type, the functions `randomRange`, `randomInt` (if needed), `distance` (for safe-zone checking), basic trigonometry via `Math.cos`/`Math.sin`.
- **`config`** — the `WAVE` group (all spawn constants), `ASTEROID.SPEED_MIN`/`SPEED_MAX` (for asteroid speeds), `CANVAS.WIDTH`/`HEIGHT` (for the default anchor and position generation bounds).

Reverse dependencies: `GameScene`/`World` (holds the instance, calls `startWave` and `maybeSpawnUfo`).

## Error Handling

- **`shipPos === null` in `startWave`.** A normal situation (the ship just died, there is a pause between respawns, but the wave is ready to start). The canvas centre `{ CANVAS.WIDTH / 2, CANVAS.HEIGHT / 2 }` is used as the anchor — a reasonable compromise: the ship after respawn will appear approximately there, and the safe zone will cover its future position.
- **Infinite rejection loop in position generation.** If `SAFE_RADIUS` is too large relative to the canvas, the "reject until far enough" loop could run indefinitely. Guard: limit attempts (e.g. to 20) and if unsuccessful accept the position as-is — a nearby asteroid is better than a hung game. With default values (`SAFE_RADIUS` on the order of 150–200 px on a 960×720 field) this should not trigger.
- **`n <= 0`.** Not expected — waves are numbered from 1. The formula at `n = 1` gives exactly `INITIAL_ASTEROIDS`; at `n = 0` — `INITIAL_ASTEROIDS - INCREMENT` (may be negative). No special check; the calling contract is `n >= 1`.
- **`dt < 0` or very large `dt`.** A fixed simulation step is guaranteed by `GameLoop` (see `architecture.md`); `WaveManager` relies on this and does not validate `dt`.
- **Downstream failure / partial success.** Not applicable: the module is synchronous with no I/O. Errors from `Asteroid`/`Ufo` constructors (which should not occur) propagate upward.
- **`hasUfo` incorrectly reported by the caller.** If `GameScene` erroneously passes `false` while a UFO is alive, `WaveManager` will spawn a second; the "at most one" constraint is enforced by the caller. This is a deliberate simplification: the manager does not store a reference to the live UFO, to avoid duplicating `World` state.

## Stack & Libraries

- **TypeScript, ordinary ES2022 class.** Consistent with the architectural decision "classic OOP". No factory patterns, strategies, or state machines — the logic fits in two methods and one timer.
- **No external libraries.** All randomness comes via `Math.random` and `vec2-math` utilities; balance is in `config`. Additional generators (`seedrandom`, `chance.js`) are not needed — determinism is not required in this game.
- **No object pool.** `startWave` creates a handful of asteroids once every few tens of seconds; `maybeSpawnUfo` creates at most one `Ufo` per minute. GC pressure is negligible.
- **No config validation** — `config` is marked `as const` and verified by the compiler.

## Configuration

The module has no env variables or secrets. Parameters read from `config`:

| Name | Purpose | Default source |
|---|---|---|
| `WAVE.INITIAL_ASTEROIDS` | number of large asteroids in the first wave | `config.ts` (`4`) |
| `WAVE.ASTEROIDS_PER_WAVE_INCREMENT` | increment per wave | `config.ts` (`2`) |
| `WAVE.MAX_ASTEROIDS` | starting count ceiling | `config.ts` (`11`) |
| `WAVE.UFO_SPAWN_CHANCE_BASE` | base UFO spawn probability per attempt | `config.ts` (`0.002`) |
| `WAVE.UFO_SPAWN_CHANCE_PER_WAVE` | probability increment per wave | `config.ts` (`0.0005`) |
| `WAVE.UFO_SPAWN_CHANCE_MAX` | probability ceiling | `config.ts` (`0.01`) |
| `WAVE.UFO_SMALL_THRESHOLD_WAVE` | wave at which small UFOs begin to appear | `config.ts` (`3`) |
| `WAVE.SAFE_RADIUS` (planned) | safe-zone radius around the ship at wave start | expected `150`–`200` px |
| `WAVE.UFO_SPAWN_CHECK_INTERVAL` (planned) | period between UFO spawn roll attempts | expected `1.0` s |
| `WAVE.UFO_SMALL_CHANCE_PER_WAVE` (planned) | `small` share increment above the threshold | expected `0.15` |
| `WAVE.UFO_SMALL_MAX_CHANCE` (planned) | `small` share ceiling | expected `0.8` |
| `ASTEROID.SPEED_MIN` / `ASTEROID.SPEED_MAX` | asteroid speed magnitude range | `config.ts` (`30` / `90`) |
| `CANVAS.WIDTH` / `CANVAS.HEIGHT` | position generation bounds and default anchor | `config.ts` (`960` / `720`) |

Constants missing from the current `config.ts` (`SAFE_RADIUS`, `UFO_SPAWN_CHECK_INTERVAL`, `UFO_SMALL_*`) must be added to the `WAVE` group during module implementation.

## Open Questions

- **Units for `UFO_SPAWN_CHANCE_*`: "per tick" or "per attempt".** In `config.md` the values are described as "per tick", but the "per attempt" scheme is chosen here (via `UFO_SPAWN_CHECK_INTERVAL`), making behaviour independent of `SIMULATION.HZ`. The discrepancy with `config.md` needs to be resolved — either rename the constants or recalculate the values for "per tick" (at 60 Hz `0.002 × 60 = 0.12` per second, which is too high).
- **`SAFE_RADIUS` value.** This determines how comfortable wave starts are with the ship alive. A guideline — `2 × ASTEROID.RADIUS.large + SHIP.RADIUS` plus a margin (≈ 150 px); will be confirmed during playtesting.
- **`pSmall` growth formula.** Currently proposed as linear with a ceiling, but options include "stepwise" (e.g. every 3rd wave the share grows by 20%) or "logistic". For the first build, the simplest linear formula is sufficient.
- **Whether `WaveManager` should know about the score.** The spec mentions "UFO type depends on wave number and score", but the score currently lives in `Scoring`. If `pSmall` should also grow with score, an additional `score: number` argument or an aggregate `{ wave, score }` will need to be added to `maybeSpawnUfo`. For now only `wave` is used — simpler and sufficient.
- **Whether to freeze `ufoSpawnCooldown` while `hasUfo === true`.** Chosen: "freeze" (early `return null` before decrementing the timer). Alternative — "keep counting, so that immediately after the UFO dies a spawn chance arises" — would make the game harder. Will be resolved during playtesting.
- **Whether `isCleared(world)` belongs in this module.** In `architecture.md` it is mentioned as part of `WaveManager`, but is not implemented for the current task. It may migrate to `World`/`GameScene` (a trivial check `asteroids.length === 0 && ufos.length === 0`).
- **Wave start delay (`WAVE.START_DELAY`).** In the current API `startWave` returns asteroids immediately; the delay between "wave cleared" and "asteroids appear" is implemented by `GameScene` via its own timer. This could be encapsulated in `WaveManager`, but would then require internal state "wave is preparing, X seconds remaining" — for now the decision is to keep it outside.
