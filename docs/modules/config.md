# Module `config`

## Purpose
The single source of truth for all numeric game constants and the keyboard binding table. Everything subject to balance tuning (speeds, sizes, cooldowns, points, wave thresholds) is placed here, so balance changes reduce to editing one file without risking scattered "magic numbers" across the codebase. Without this module those numbers would spread across entities and scenes, making balance untraceable.

## Responsibilities
- Exporting named numeric/string constants, grouped by subsystem (Canvas, Simulation, Ship, Bullet, Asteroid, Ufo, Wave, Scoring).
- Exporting the abstract action enum `Action` and the binding table `INPUT_BINDINGS: Record<string, Action>`.
- Fixing starting balance values aligned with canonical Asteroids 1979.
- Serving as the sole tuning source — every balance parameter is changed only here.

### Non-Responsibilities
- Does not hold runtime state (does not know about current wave, score, or player lives).
- Does not contain game logic (no physics, no entity spawning, no collision resolution).
- Does not read values from external sources (no env vars, no `localStorage`, no query params).
- Does not provide runtime override mechanisms (no setters, no reload).
- Does not handle keyboard events — only describes the mapping, which is read by `InputSystem`.

## Public Interface
Everything — named exports from `src/config.ts`. No state or functions.

- `CANVAS` — object with rendering area dimensions.
- `SIMULATION` — game loop parameters (frequency, step).
- `SHIP` — player ship parameters.
- `BULLET` — bullet parameters.
- `ASTEROID` — asteroid parameters by size.
- `UFO` — UFO parameters by type.
- `WAVE` — wave and UFO spawn parameters.
- `SCORING` — scoring, lives, and high-score table parameters.
- `Action` — enum of abstract player actions.
- `INPUT_BINDINGS` — `keyCode → Action` table.

Every object is `as const` so TypeScript infers literal types and prohibits mutations.

## Data Model
The module owns no data in the DB sense; below is the shape of exported structures.

**`CANVAS`**
| Field | Type | Value | Purpose |
|---|---|---|---|
| `WIDTH` | number | `960` | game field width in pixels |
| `HEIGHT` | number | `720` | game field height in pixels |

**`SIMULATION`**
| Field | Type | Value | Purpose |
|---|---|---|---|
| `HZ` | number | `60` | simulation frequency (ticks per second) |
| `STEP` | number | `1 / 60` | fixed `dt` step in seconds |
| `MAX_FRAME_TIME` | number | `0.25` | frame delta upper bound, prevents "debt" on freeze |

**`SHIP`**
| Field | Type | Value | Purpose |
|---|---|---|---|
| `RADIUS` | number | `12` | ship collision radius |
| `MAX_SPEED` | number | `400` | max speed magnitude, px/s |
| `THRUST_ACCEL` | number | `250` | thrust acceleration, px/s² |
| `ROTATION_SPEED` | number | `3.5` | rotation angular velocity, rad/s |
| `FRICTION` | number | `0` | friction coefficient (0 = pure inertia of the original) |
| `FIRE_COOLDOWN` | number | `0.25` | minimum interval between shots, s |
| `MAX_BULLETS` | number | `4` | max bullets in flight simultaneously |
| `RESPAWN_INVULN_TIME` | number | `2.0` | invulnerability duration after respawn, s |
| `HYPERSPACE_COOLDOWN` | number | `1.0` | hyperspace cooldown, s |
| `HYPERSPACE_FAIL_CHANCE` | number | `0.1` | probability of a "failed jump" |

**`BULLET`**
| Field | Type | Value | Purpose |
|---|---|---|---|
| `RADIUS` | number | `2` | bullet collision radius |
| `SPEED` | number | `600` | bullet speed, px/s |
| `LIFETIME` | number | `1.0` | lifetime in seconds (limits range) |

**`ASTEROID`**
| Field | Type | Value | Purpose |
|---|---|---|---|
| `RADIUS.large` | number | `40` | large asteroid radius |
| `RADIUS.medium` | number | `20` | medium radius |
| `RADIUS.small` | number | `10` | small radius |
| `SPEED_MIN` | number | `30` | minimum speed magnitude, px/s |
| `SPEED_MAX` | number | `90` | maximum speed magnitude, px/s |
| `VERTICES_MIN` | number | `8` | minimum polygon vertices |
| `VERTICES_MAX` | number | `12` | maximum polygon vertices |
| `ROUGHNESS` | number | `0.35` | vertex radius noise amplitude (fraction of base) |
| `POINTS.large` | number | `20` | points for destroying |
| `POINTS.medium` | number | `50` | points for destroying |
| `POINTS.small` | number | `100` | points for destroying |
| `ANGULAR_SPEED_MAX` | number | `1.5` | max rotation angular speed, rad/s |

**`UFO`**
| Field | Type | Value | Purpose |
|---|---|---|---|
| `RADIUS.large` | number | `20` | large UFO radius |
| `RADIUS.small` | number | `10` | small UFO radius |
| `SPEED.large` | number | `120` | large UFO speed, px/s |
| `SPEED.small` | number | `160` | small UFO speed, px/s |
| `DIRECTION_CHANGE_INTERVAL` | number | `1.5` | average course-change interval, s |
| `FIRE_INTERVAL` | number | `1.2` | average interval between shots, s |
| `SMALL_AIM_ACCURACY` | number | `0.9` | small UFO aim accuracy (0..1) |
| `LARGE_AIM_ACCURACY` | number | `0.3` | large UFO accuracy (shoots "toward the player") |
| `POINTS.large` | number | `200` | points for large UFO |
| `POINTS.small` | number | `1000` | points for small UFO |

**`WAVE`**
| Field | Type | Value | Purpose |
|---|---|---|---|
| `INITIAL_ASTEROIDS` | number | `4` | large asteroids in the first wave |
| `ASTEROIDS_PER_WAVE_INCREMENT` | number | `2` | increment per subsequent wave |
| `MAX_ASTEROIDS` | number | `11` | starting asteroid count cap |
| `START_DELAY` | number | `2.0` | pause before wave starts, s |
| `UFO_SPAWN_CHANCE_BASE` | number | `0.002` | base UFO spawn probability per tick |
| `UFO_SPAWN_CHANCE_PER_WAVE` | number | `0.0005` | probability increment per wave |
| `UFO_SPAWN_CHANCE_MAX` | number | `0.01` | probability cap |
| `UFO_SMALL_THRESHOLD_WAVE` | number | `3` | wave from which small UFOs appear |

**`SCORING`**
| Field | Type | Value | Purpose |
|---|---|---|---|
| `INITIAL_LIVES` | number | `3` | starting lives count |
| `BONUS_LIFE_THRESHOLD` | number | `10000` | bonus life score step |
| `HIGHSCORE_TABLE_SIZE` | number | `10` | high-score table length |
| `HIGHSCORE_NAME_LENGTH` | number | `3` | player name length in table |
| `HIGHSCORE_STORAGE_KEY` | string | `'asteroids.highscores'` | `localStorage` key |

**`Action`** — string enum:
`RotateLeft`, `RotateRight`, `Thrust`, `Fire`, `Hyperspace`, `Pause`, `Confirm`.

**`INPUT_BINDINGS`** — `Record<string, Action>`:
| keyCode | Action | Comment |
|---|---|---|
| `ArrowLeft` | `RotateLeft` | primary control |
| `ArrowRight` | `RotateRight` | primary control |
| `ArrowUp` | `Thrust` | thrust |
| `Space` | `Fire` | fire |
| `ShiftLeft` | `Hyperspace` | hyperspace |
| `ShiftRight` | `Hyperspace` | duplicate |
| `Escape` | `Pause` | pause |
| `KeyP` | `Pause` | alternative pause |
| `Enter` | `Confirm` | confirm in menu / game over |

## Key Flows
1. **Entity imports a constant.** `Ship.ts` via `import { SHIP, SIMULATION } from './config'` gets static values; at game start it uses `SHIP.MAX_SPEED` to clamp speed and `SIMULATION.STEP` to compute thrust. No calls made — data is ready at module load time.
2. **Input mapping.** `InputSystem` on startup copies `INPUT_BINDINGS` into its internal table; on `keydown` it looks up `event.code` in that table, gets an `Action`, and updates the held-actions state. The `config` module is only read.
3. **UFO spawn calculation.** `WaveManager` each tick computes `min(UFO_SPAWN_CHANCE_MAX, UFO_SPAWN_CHANCE_BASE + wave * UFO_SPAWN_CHANCE_PER_WAVE)` and compares to a random number — decides whether to spawn a UFO. All three constants come from `WAVE`.
4. **Score and bonus life award.** On asteroid destruction `Scoring.addPoints` looks up `ASTEROID.POINTS[size]` and adds to the score; then checks if the score crossed the next multiple of `SCORING.BONUS_LIFE_THRESHOLD` — if so, increments lives by 1.

## Dependencies
None. The module is a leaf: no imports from other project modules, no browser API calls. This is intentional so that `config` can be imported from anywhere without risk of circular dependencies.

## Error Handling
The module is pure data and cannot generate runtime errors. Safeguards are at the compilation level:
- All objects are marked `as const`; mutation is prohibited by TS type checking.
- Values are literals; typos and incorrect types are caught by the compiler.
- Structural integrity (fields for all asteroid sizes, all UFO types, all `Action` values) is guaranteed by explicit types: `Record<AsteroidSize, number>`, `Record<UfoKind, number>`, etc. — a missing field gives a compile error.
- An invalid `keyCode` in `INPUT_BINDINGS` (e.g. a typo) is not caught statically but only causes the corresponding key to have no effect — graceful degradation on the `InputSystem` side.

No downstream failures (no outgoing calls). No partial success — the module is either fully loaded or the application has not started.

## Stack & Libraries
- **TypeScript, no dependencies.** Language defined by architecture; the only decision here: use `as const` and explicit types (`Record<K, V>`) for immutability and structural checking. No libraries (zod, io-ts) needed — values are known at build time, nothing to validate.

## Configuration
The module has no external configuration — it is itself the configuration. No env vars, secrets, or runtime settings. The only way to change behavior is to edit the file and rebuild the bundle.

## Open Questions
- Exact numeric balance values are approximate, subject to tuning after the first playable build (especially `THRUST_ACCEL`, `MAX_SPEED`, `ASTEROID.SPEED_MAX`, `UFO_SPAWN_CHANCE_*`).
- Whether to add an alternative WASD binding set alongside arrows — deferred to the `InputSystem` module.
- Whether to add a separate `PARTICLE` group (LIFETIME, COUNT_PER_EXPLOSION, SPEED_RANGE) now or wait for particle effect implementation — currently outside the MVP scope of this module.
- Whether to split `DIRECTION_CHANGE_INTERVAL` and `FIRE_INTERVAL` by UFO type (large/small) — in the canon, the small is more aggressive; if single values prove insufficient, the structure will be extended.
