# Module `asteroid`

## Purpose

The module defines the `Asteroid extends Entity` class — one of the central game entities: a flying, rotating, "rough" asteroid of one of three sizes (`large` / `medium` / `small`). Without it there is no primary shooting target, no split-into-smaller-fragments mechanic, no wave population — the game simply doesn't exist. The module encapsulates everything that distinguishes an asteroid from other entities: a randomly generated polygon shape, rotation, and the splitting rules on destruction.

## Responsibilities

- Declaring the `Asteroid extends Entity` class with fields for size, shape, rotation angle, and angular velocity.
- Generating the "rough" asteroid shape at construction time — an array of radii at uniformly distributed angles, slightly noised relative to the base radius (once, in the constructor).
- Initialising its own physics parameters from `config.ASTEROID` by size: collision radius, linear speed range, angular speed range, roughness amplitude, vertex count, and point value.
- Simulation step: accumulating the rotation angle (`rotation += angularVelocity * dt`) and delegating movement with wrap-around via `Entity.integrate(dt)`.
- Drawing a closed polyline through the `shape` vertex array taking into account current `rotation` and `position` — white lines, in the spirit of the original.
- Implementing `split()` — the splitting rules: `large → 2 × medium`, `medium → 2 × small`, `small → []`. New fragments are assigned the original asteroid's position and two oppositely directed velocity vectors (rotated relative to the original by ±30–45° with an increased magnitude).

### Non-Responsibilities

- Does not decide when an asteroid is destroyed — that is done by `CollisionSystem` + `World` by setting `alive = false`.
- Does not create the starting asteroid set for a wave — that is `WaveManager`'s domain; `Asteroid` only knows how to be created.
- Does not award points for its own destruction — `Scoring` reads `ASTEROID.POINTS[size]` from the collision event itself. `Asteroid` stores `size` but does not award points.
- Does not manage the fragment list: `split()` returns an array, and inserting it into `World.asteroids` and removing the original is done by the caller.
- Does not know about collisions: it uses `radius` from the base class; `CollisionSystem` performs the actual check.
- Does not use Canvas transforms (`ctx.translate` / `ctx.rotate`) — rotation is applied to vertices analytically; this simplifies debugging and avoids saving/restoring context state.
- Does not spawn explosion particles — the effect is created by `World` on a collision event.

## Public Interface

Single export — the class:

- `class Asteroid extends Entity` — a concrete "asteroid" game entity.

Public / instance fields:

- `size: 'large' | 'medium' | 'small'` — the size category, determines the base radius, speed, point value, and `split()` behaviour.
- `shape: readonly number[]` — array of vertex radii at uniformly distributed angles (length in the range `[ASTEROID.VERTICES_MIN, ASTEROID.VERTICES_MAX]`). Generated once in the constructor and never changed afterwards.
- `rotation: number` — current polygon rotation angle, radians.
- `angularVelocity: number` — rotation speed, rad/s; chosen randomly in `[-ASTEROID.ANGULAR_SPEED_MAX, +ASTEROID.ANGULAR_SPEED_MAX]` in the constructor.

Inherited from `Entity`: `position`, `velocity`, `radius`, `alive`.

Constructor:

- `constructor(size: 'large' | 'medium' | 'small', position: Vec2, velocity: Vec2)` — sets the size and initial motion; the remaining parameters (`radius`, `shape`, `rotation`, `angularVelocity`) are derived internally from `config.ASTEROID` and random number generators.

Methods:

- `update(dt: number): void` — applies `rotation += angularVelocity * dt`, then `this.integrate(dt)` for movement with wrap-around.
- `draw(ctx: CanvasRenderingContext2D): void` — draws the closed polyline through `shape` taking `rotation` and `position` into account; white stroke, no fill.
- `split(): Asteroid[]` — returns an array of 0 or 2 smaller-sized asteroids; see the Key Flows section.

## Data Model

The module is a single in-memory class with no external storage.

**`Asteroid` fields (in addition to `Entity`):**

| Field | Type | Default | Purpose |
|---|---|---|---|
| `size` | `'large' \| 'medium' \| 'small'` | from constructor | size category |
| `shape` | `readonly number[]` | generated in constructor | polygon vertex radii for the "rough" silhouette |
| `rotation` | `number` | `0` | current rotation angle, radians |
| `angularVelocity` | `number` | `randomRange(-ANGULAR_SPEED_MAX, +ANGULAR_SPEED_MAX)` | rotation speed, rad/s |

Additionally set via the base constructor:

- `radius = config.ASTEROID.RADIUS[size]`
- `position`, `velocity` — from arguments
- `alive = true`

**The `shape` array.** Length — a random integer in `[VERTICES_MIN, VERTICES_MAX]`. Each vertex `i` is a radius at angle `(i / N) * 2π`, equal to `radius * (1 + randomRange(-ROUGHNESS, +ROUGHNESS))`. Thus the array is a polar representation of the polygon with fixed angles and noised radii. Once generated, it is never changed — giving a stable, recognisable silhouette for the lifetime of a specific asteroid.

No relations to other entities or indexes — `Asteroid` lives in the flat list `World.asteroids`.

## Key Flows

**Creating an asteroid.** `WaveManager.startWave(n)` or `Asteroid.split()` call `new Asteroid(size, position, velocity)`. Constructor: (1) takes `radius = ASTEROID.RADIUS[size]`, (2) calls `super(position, velocity, radius)` to initialise base fields, (3) determines vertex count `N = randomInt(VERTICES_MIN, VERTICES_MAX)`, (4) fills `shape` of length `N` with radii of the form `radius * (1 + randomRange(-ROUGHNESS, +ROUGHNESS))`, (5) sets `rotation = 0` and `angularVelocity = randomRange(-ANGULAR_SPEED_MAX, +ANGULAR_SPEED_MAX)`. After the constructor the asteroid is fully ready for ticks and rendering.

**Simulation tick `update(dt)`.** First, its own rotation physics is applied: `this.rotation += this.angularVelocity * dt`. Then `this.integrate(dt)` from `Entity` shifts `position` by `velocity * dt` and wraps coordinates via `wrapVec2(position, CANVAS.WIDTH, CANVAS.HEIGHT)`. `rotation` is not normalised to `[0, 2π)` — the value grows without bounds; `Math.cos` / `Math.sin` work correctly with any input.

**Drawing `draw(ctx)`.** For each vertex `i` the angle `θ = (i / N) * 2π + rotation` and radius `r = shape[i]` are computed; the point in world coordinates is `position + {cos(θ) * r, sin(θ) * r}`. All points are connected via `ctx.beginPath()` → `moveTo` / `lineTo` in a loop → `closePath()` → `ctx.strokeStyle = '#fff'` → `ctx.lineWidth = 1` → `ctx.stroke()`. No `translate` / `rotate` is applied to the context — rotation is already accounted for in the analytical vertex coordinates. Wrap-around drawing at screen edges is the responsibility of `Renderer` utilities (a duplicate is drawn with an offset when necessary); `Asteroid` itself draws its polygon once.

**Splitting `split()`.** Rules:

- `size === 'small'` → empty array `[]` is returned. The caller (World) will simply remove the original asteroid; the explosion effect and points are outside this method's responsibility.
- `size === 'large'` → two `new Asteroid('medium', position, velocityA/B)`.
- `size === 'medium'` → two `new Asteroid('small', position, velocityA/B)`.

Fragment velocity vectors are constructed as follows: the original `this.velocity` is taken, rotated using `Vec2.rotate` by a random angle in the range `±[30°, 45°]` (specifically: one fragment at `+α`, the other at `-β`, where `α, β ∈ [30°, 45°]`, degrees converted to radians via `degToRad`), and its magnitude is increased (e.g. by multiplying by a factor in `[1.2, 1.6]` — standard Asteroids behaviour making fragments "faster" than the parent; the exact value is an open tuning question). Both fragments start at `this.position` of the original asteroid; they will immediately diverge due to their opposite velocity directions. `split()` does not change `alive` on `this` — that is done by the caller.

**Interaction with `World` on destruction.** `CollisionSystem.detect` returns a `bulletAsteroid` event; `World` on that event: (1) sets `bullet.alive = false` and `asteroid.alive = false`, (2) calls `asteroid.split()` and adds the resulting fragments to `world.asteroids`, (3) awards points via `Scoring.addPoints` using `asteroid.size`, (4) spawns explosion particles. The next pass `world.asteroids = world.asteroids.filter(a => a.alive)` removes the destroyed original; the new fragments are already alive and remain.

## Dependencies

- **`entity`** — base class `Entity`, its fields and `integrate(dt)`. `Asteroid.update` must call `super.integrate`.
- **`vec2-math`** — type `Vec2`, functions `rotate` (for rotating fragment velocity vectors in `split()`), `scale` (for increasing fragment speed magnitude), `randomRange`, `randomInt`, `degToRad`. Also indirectly via `Entity.integrate` — `wrapVec2`.
- **`config`** — object `ASTEROID`: `RADIUS[size]`, `VERTICES_MIN/MAX`, `ROUGHNESS`, `ANGULAR_SPEED_MAX`, `SPEED_MIN/MAX` (for choosing speed when created from `WaveManager`, not inside the constructor — the constructor receives velocity as an argument), and `CANVAS` sizes (indirectly via `integrate`).
- **Standard DOM (`CanvasRenderingContext2D`)** — only as the type parameter for `draw(ctx)`.

Reverse dependencies: `World` (holds the list), `CollisionSystem` (uses as collision event operands), `WaveManager` (creates), `Scoring` (reads `size` from the collision event).

## Error Handling

- **Invalid `size` in the constructor.** The value is constrained by the type `'large' | 'medium' | 'small'`; the compiler won't allow another value. No runtime checks. Indexing `config.ASTEROID.RADIUS[size]` is guaranteed to yield a number.
- **`split()` on `small`.** Not an error; it's expected behaviour: an empty array is returned. Handling — in `World`: simply remove the original asteroid by the `alive` flag and add no new fragments.
- **Downstream failure.** The module is synchronous, with no I/O or network — "downstream" is not applicable. The only external call is `ctx.stroke()` in `draw`; exceptions from the Canvas API (e.g. due to a corrupted context) propagate to the top-level try/catch in the game loop.
- **Partial success.** Not applicable: `update`, `draw`, `split` either complete fully or throw an exception.
- **`NaN` in `velocity` / `position`.** `Asteroid` does not check — like `Entity`, it passes values through transparently. A `NaN` source could be a bug in `split()` (`normalize` on a zero vector), but `Vec2.normalize` by contract returns `ZERO` for zero input, so that path is safe; `rotate` is also `NaN`-safe for any finite numbers.
- **Invalid input (empty `shape`).** Excluded by construction: `randomInt(VERTICES_MIN, VERTICES_MAX)` with `VERTICES_MIN ≥ 3` always yields ≥ 3 vertices; config guarantees `VERTICES_MIN = 8`.

The module does not throw errors on its own.

## Stack & Libraries

- **TypeScript, ES2022 class with `extends`.** Language and paradigm are defined by the architecture (classic OOP, common ancestor `Entity`). No decorators, mixins, factories — just a plain class with a constructor and three methods.
- **No external libraries.** No geometry (`polygon`, `clipper`) or noise generators (`simplex-noise`): the asteroid shape is simple enough to build from `Math.random` and basic trigonometry.
- **Canvas 2D API — only basic paths** (`beginPath`, `moveTo`, `lineTo`, `closePath`, `stroke`). `ctx.translate` / `rotate` / `save` / `restore` are deliberately not used — rotation is computed analytically on vertex coordinates. Reason: a single rendering pass with no side effects on context state, easier to debug.
- **No object pooling.** `split()` creates up to two new instances; GC pressure from dozens of asteroids per frame is negligible.
- **Randomness — `Math.random` via `vec2-math` utilities.** No seeded PRNG (consistent with the `vec2-math` decision).

## Configuration

The module has no env variables or secrets. All numeric parameters are read from `config.ASTEROID`:

| Name | Purpose | Default value source |
|---|---|---|
| `ASTEROID.RADIUS[size]` | base collision radius and reference radius for shape | `config.ts` (`40 / 20 / 10`) |
| `ASTEROID.VERTICES_MIN` / `VERTICES_MAX` | polygon vertex count range | `config.ts` (`8 / 12`) |
| `ASTEROID.ROUGHNESS` | vertex radius noise amplitude (fraction of base) | `config.ts` (`0.35`) |
| `ASTEROID.ANGULAR_SPEED_MAX` | upper bound of angular speed magnitude | `config.ts` (`1.5` rad/s) |
| `ASTEROID.SPEED_MIN` / `SPEED_MAX` | linear speed magnitude range (used when created externally by `WaveManager`) | `config.ts` (`30 / 90` px/s) |

The class defines no internal constants of its own.

## Open Questions

- The exact speed multiplier for fragments in `split()` (currently `[1.2, 1.6]`) — needs tuning after the first playable build and may move to `config.ASTEROID` as `SPLIT_SPEED_MULTIPLIER_MIN/MAX`.
- The exact angle range for rotating fragment velocities (`±[30°, 45°]`) — similarly, could move to `config.ASTEROID` as `SPLIT_ANGLE_MIN/MAX_DEG` to avoid hiding it inside the class code.
- Whether to preserve "inherited" rotation in fragments — i.e. pass the parent's `rotation` and/or `angularVelocity` to new `Asteroid` instances so they visually "continue" rotating. For now, independent values are generated — simpler and visually sufficient.
- Whether to move `rotation` and `angularVelocity` into the base `Entity` (there is an open question there as well) — if it turns out that `Ship` and `Ufo` also use them uniformly. For now kept in `Asteroid`.
- Format of `shape`: `readonly number[]` (radii at fixed angles) vs. `readonly Vec2[]` (pre-computed local points). The second saves one `cos`/`sin` per vertex per frame, but requires recomputing vertices on rotation — the difference is negligible at 60 Hz; the first was chosen as more compact and explicit.
- Whether to cache a built `Path2D` instead of recomputing in `draw` every frame. Given that rotation invalidates the cache constantly, there is no benefit — the decision is to keep the straightforward polyline approach.
