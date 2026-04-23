# Module `particle`

## Purpose

The module defines the `Particle extends Entity` class — a short-lived particle used exclusively for the visual explosion effect (asteroid destruction, ship destruction, or UFO destruction). Each particle is a point or short line with its own velocity vector and lifetime timer, fading out (by alpha) as `lifetime` approaches zero. Without this module, explosions would have no visual feedback — objects would simply vanish silently, which feels like a bug.

In addition to the class itself, the module exports the `spawnExplosion(...)` factory, which assembles a batch of particles with scattered directions and speeds in a single call — the typical way to produce an explosion at one point in the code.

## Responsibilities

- Declaring the `Particle extends Entity` class with fields `lifetime` and `maxLifetime`.
- Implementing `update(dt)`: standard motion integration via `integrate(dt)` (with canvas-edge wrap-around like all entities) and decrementing `lifetime`; when `lifetime <= 0` — `alive = false`.
- Implementing `draw(ctx)`: drawing a point or short white line with `globalAlpha = lifetime / maxLifetime` for the fade effect.
- Exporting the factory `spawnExplosion(position, count, speedRange, lifetimeRange): Particle[]` — generates a batch of particles uniformly distributed in direction, with random speeds and lifetimes in the given ranges.
- Formally satisfying the `Entity` contract: `radius = 1` is set in the constructor but only to satisfy the base class signature.

### Non-Responsibilities

- **Does not participate in collisions.** `CollisionSystem` does not check particles; `world.particles` does not appear in its pairs. `radius = 1` — a formal placeholder, not a meaningful value.
- **Does not own the particle list.** Batches are created by the `spawnExplosion` factory and placed into `world.particles` by the calling code (`World`); cleaning up "dead" particles is the common `World` mechanism (filter by `alive`).
- **Does not know what caused the explosion.** Asteroid, ship, UFO — it doesn't matter; the caller decides how many and what kind of particles to spawn.
- **Is not responsible for the explosion sound.** Sound (if it ever appears) lives in a separate subsystem; `Particle` is purely visual.
- **Does not split or emit child particles.** It is a simple "one-shot" entity.
- **Does not store colour as a field.** Colour is fixed — white, in the spirit of the original's vector graphics; if coloured sparks are needed in the future, the field will be added and this section updated.

## Public Interface

Module exports:

- `class Particle extends Entity` — short-lived particle.
- `spawnExplosion(position: Vec2, count: number, speedRange: [number, number], lifetimeRange: [number, number]): Particle[]` — factory for a batch of explosion particles.

`Particle` instance fields (beyond those inherited from `Entity`):

- `lifetime: number` — remaining lifetime in seconds; decremented each tick.
- `maxLifetime: number` — the original `lifetime` value saved at creation time; needed to compute `alpha = lifetime / maxLifetime`.

Constructor:

- `constructor(position: Vec2, velocity: Vec2, lifetime: number)` — accepts the starting position, velocity vector, and lifetime. Internally calls `super(position, velocity, 1)` (radius is a formal unit), initialises `this.lifetime = lifetime` and `this.maxLifetime = lifetime`.

Methods:

- `update(dt: number): void` — decrements `lifetime` by `dt`, sets `alive = false` when `lifetime <= 0`, then calls `this.integrate(dt)` for movement + wrap-around.
- `draw(ctx: CanvasRenderingContext2D): void` — saves context state (`save`), sets `globalAlpha = lifetime / maxLifetime` and `strokeStyle/fillStyle = 'white'`, draws a point (`fillRect(x-0.5, y-0.5, 1, 1)`) or a short 2 px line along the velocity direction, restores context (`restore`).

Factory:

- `spawnExplosion(position, count, speedRange, lifetimeRange)` — returns an array of `count` particles. For each: a random angle in `[0, 2π)`, a random speed `randomRange(speedRange[0], speedRange[1])`, velocity vector = `rotate({x: 1, y: 0}, angle)` scaled by that speed (or `fromAngle(angle, speed)`), a random lifetime `randomRange(lifetimeRange[0], lifetimeRange[1])`, position — a copy of the given explosion centre.

## Data Model

The module describes the shape of one object in memory; it has no tables or collections in the DB sense.

**`Particle` fields (including inherited):**

| Field | Type | Source | Purpose |
|---|---|---|---|
| `position` | `Vec2` | `Entity` / constructor | current particle position on the canvas |
| `velocity` | `Vec2` | `Entity` / constructor | movement speed, px/s |
| `radius` | `number` | `Entity` / constructor (`= 1`) | formal placeholder for the `Entity` contract, not used |
| `alive` | `boolean` | `Entity` (default `true`) | `false` → `World` removes the particle at cleanup |
| `lifetime` | `number` | constructor | remaining lifetime, s |
| `maxLifetime` | `number` | constructor (copy of `lifetime`) | for computing `alpha = lifetime / maxLifetime` |

**Relations and indexes.** None. `Particle` is a "leaf" object, references no other entities. Lives in the flat array `World.particles: Particle[]`.

**Why a separate `maxLifetime` field.** Alternative — compute `alpha` from a fixed config lifetime constant. But the `spawnExplosion` factory generates particles with a random `lifetime` in a range, so each particle has its own initial value, and storing it in the instance is the simplest and most error-free approach.

## Key Flows

**Particle lifecycle tick.** `World.update(dt)` iterates `particles` and calls `particle.update(dt)` for each. Inside: `this.lifetime -= dt`; if `this.lifetime <= 0`, then `this.alive = false` (the method may return early, but an extra `integrate` is harmless); otherwise `this.integrate(dt)` is called, which shifts `position` by `velocity * dt` and wraps coordinates via `wrapVec2`. At end-of-tick `World` filters dead ones: `this.particles = this.particles.filter(p => p.alive)`.

**Drawing.** `GameScene.draw(ctx)` iterates `particles` and calls `particle.draw(ctx)` for each. The particle saves context, sets `globalAlpha = lifetime / maxLifetime` (smoothly transitions from 1 to 0), draws a point/short line in white, restores context. Result — on-screen, a spray of sparks gradually fading where an explosion just happened.

**Creating an explosion via `spawnExplosion`.** `World`, upon resolving a collision "asteroid destroyed", calls `const fx = spawnExplosion(asteroid.position, 12, [60, 180], [0.4, 0.9])` and appends the result: `this.particles.push(...fx)`. The factory internally generates a random angle `count` times, assembles a velocity vector of the required magnitude, a random `lifetime`, and creates `new Particle(position, velocity, lifetime)`. Returns the array.

**Wrap-around for escaping particles.** A particle inherits the common `integrate(dt)` from `Entity` and therefore wraps at canvas edges — just like asteroids and bullets. This is a deliberate simplicity choice: the alternative "particle flies off-screen and immediately dies" would require separate boundary-check code and, importantly, a separate no-wrap path in `integrate`. With a short `lifetime` (fractions of a second), the visual difference between the two variants is negligible — most particles die naturally before reaching the edge.

## Dependencies

- **`entity`** — base class `Entity` with common state and the `integrate(dt)` helper.
- **`vec2-math`** — type `Vec2`, factories and operations: `fromAngle` / `rotate`, `scale`, `randomRange`. Used both in `update` (via the inherited `integrate`) and in `spawnExplosion` for generating random velocity vectors.
- **`config`** — optional, only if a `PARTICLE` group with default constants is introduced (see Open Questions). Initially the module does not depend on `config` directly: all parameters (`count`, `speedRange`, `lifetimeRange`) are passed to `spawnExplosion` by the caller.
- **Standard DOM (`CanvasRenderingContext2D`)** — only as the type parameter for `draw(ctx)`.

Reverse dependencies: `World` imports `Particle` (as the array type `particles`) and `spawnExplosion` (to produce explosions when resolving collisions).

## Error Handling

- **Invalid `lifetime` in constructor (`<= 0`, `NaN`).** No runtime checks. `lifetime <= 0` will cause the particle to die on the very first tick without being drawn — a harmless degenerate case. `NaN` will propagate into `alpha` and produce an invisible particle until its death on the next frame; this is a caller bug, caught visually in a dev build.
- **`maxLifetime = 0` → division by zero when computing alpha.** Only possible when `lifetime = 0` on input (see above). Protection — simply don't pass zero lifetime; `spawnExplosion` controls the `lifetimeRange`, and the caller controls the range.
- **Particle escapes the screen.** Not an error — the common wrap-around from `integrate` fires. The particle continues moving on the torus until its natural death via `lifetime`.
- **Overload from a large number of particles.** If very many particles are spawned per explosion (hundreds or thousands), an FPS drop is possible due to O(n) `draw`. The contract is that the caller passes a reasonable `count` (on the order of tens per explosion). There is no runtime limiter in the module; if needed, `World` can add one (e.g. a ceiling on `world.particles.length`).
- **Exception in `update`/`draw`.** Not caught by the module; propagates to the game loop's top-level try/catch.
- **Downstream failure, partial success.** Not applicable: synchronous module with no I/O or external calls.

The module does not throw errors externally.

## Stack & Libraries

- **TypeScript (ES2022 target), classes with `extends`.** Language defined by architecture; inheritance from `Entity` is the only structural requirement.
- **No external libraries.** The module is a few dozen lines on top of `Entity` and `vec2-math`; no particle engines (`proton`, `tsparticles`) are needed.
- **Canvas 2D API** — `save/restore`, `globalAlpha`, `fillRect`/`moveTo+lineTo+stroke`. Nothing beyond what is already used in other `draw` methods.
- **No object pooling.** Particles are created with regular `new` and discarded via `alive = false`. For tens to hundreds of short explosions per session, GC pressure is negligibly small; a pool can be introduced later if the profiler shows a problem.
- **No runtime validation.** Contracts are at the TS type level.

## Configuration

The module has no external configuration. All numeric parameters (particle count, speed ranges, lifetime ranges) are passed externally to `spawnExplosion` — the calling code (usually `World` during collision resolution) decides how a specific explosion looks.

If and when a `PARTICLE` group is added to `config.ts` (see the corresponding open question in the `config` module), the anticipated fields:

| Field | Type | Tentative | Purpose |
|---|---|---|---|
| `PARTICLE.COUNT_ASTEROID_LARGE` | number | `12` | particle count for a large asteroid explosion |
| `PARTICLE.COUNT_ASTEROID_MEDIUM` | number | `8` | for medium |
| `PARTICLE.COUNT_ASTEROID_SMALL` | number | `5` | for small |
| `PARTICLE.COUNT_SHIP` | number | `20` | on ship death |
| `PARTICLE.COUNT_UFO` | number | `16` | on UFO destruction |
| `PARTICLE.SPEED_RANGE` | `[number, number]` | `[60, 180]` | speed magnitude range, px/s |
| `PARTICLE.LIFETIME_RANGE` | `[number, number]` | `[0.4, 0.9]` | lifetime range, s |

Until that group exists, values are passed to `spawnExplosion` as magic numbers from `World` (or local constants in `World`).

## Open Questions

- **Extract a `PARTICLE` group in `config` or keep values in `World`.** The second option reduces module coupling but scatters balance; the spirit of `config` is centralisation. Decision deferred until the first explosions are implemented — at that point it will be clear how many distinct number sets are actually needed.
- **Point or short line in `draw`.** A short line along the velocity looks like "a spark with a tail" and is closer to the classic feel; a point is cheaper and simpler. Choice after the first visual build.
- **Wrap or die at the edge.** Decided: use common `integrate(dt)` from `Entity` with wrap — simpler and consistent with other entities. With a short `lifetime` the difference is practically invisible. If it looks wrong visually — a wrap/no-wrap parameter can be added to `integrate` (see the open question in the `entity` module).
- **Whether colour needs to be a field.** Currently hardcoded white. If "coloured" explosions appear (e.g. reddish for the player's ship, green for a UFO), a `color: string` field will be added to the constructor; the factory will be extended with an additional parameter.
- **Whether to impose a ceiling on the number of simultaneously live particles.** In extreme situations (series of rapid explosions) FPS could theoretically drop. For now no limit — revisit after the first stress test.
- **Participation in collisions.** Fixed: does not participate. If gameplay design ever makes particles "dust that grazes the ship", that will be a different entity class, not an extension of `Particle`.
