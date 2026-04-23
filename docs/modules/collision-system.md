# Module `collision-system`

## Purpose

The module defines a circle-to-circle intersection detection system between game entities. Its sole job is to identify all pairs of entities that collided in the current tick in a single world pass, and return a list of `CollisionEvent`s for subsequent resolution in `World`. Without it there are no interactions between bullets, asteroids, the ship, and UFOs — meaning no asteroid destruction, no life loss, and no point scoring. The module is deliberately separated from resolution: it mutates nothing and makes no game decisions, making it a clean, predictable, easily debuggable part of the pipeline.

## Responsibilities

- Declaring the `CollisionEvent` type and the collision kind enumeration (`CollisionKind`).
- Implementing the `detect(world): CollisionEvent[]` function/method — a pure function that iterates relevant entity pairs and returns a list of detected intersections.
- Checking two-circle intersection via the formula `distanceSq(a.position, b.position) < (a.radius + b.radius)²` — without a square root for performance.
- Accounting for wrap-around (torus screen): when comparing distances between entities, the "across the edge" variant is considered — torus distance, not plain Euclidean distance in canvas coordinates.
- Filtering irrelevant pairs:
  - dead entities (`alive === false`) are skipped;
  - an invulnerable ship (`now < ship.invulnUntil`, or an equivalent flag) excludes all `Ship—*` pairs;
  - a bullet is not checked against its source: a ship bullet cannot hit the ship, a UFO bullet cannot hit the UFO.
- Returning a stable event shape: `{ kind, a, b }`, where `a` and `b` are references to `Entity` instances from `World` (not copies).

### Non-Responsibilities

- Does not mutate `world`: does not set `alive = false`, does not change positions, does not reset `bulletsInFlight`, does not award points. All resolution is in `World.resolveCollisions(events)`.
- Does not create or delete entities: does not split asteroids, does not spawn explosion particles, does not deduct lives, does not respawn the ship.
- Does not know about points, waves, HUD, scenes, sounds, or input.
- Does not contain broad-phase structures (quad-tree, spatial hash, sweep-and-prune): the expected number of entities is a handful to a few dozen; naïve O(n²) over relevant pairs is cheaper than maintaining any broad-phase.
- Does not check non-pairwise configurations (e.g. continuous collision detection for fast bullets): works strictly on discrete position snapshots at the start/end of a tick, after `integrate`.
- Does not handle "double-death" resolution (bullet hitting two asteroids in one tick): simply returns two events; `World` decides what to do (typically — one of them is a no-op after the first resolution).
- Contains no runtime argument validation and throws no exceptions of its own.
- Does not sort or deduplicate events: order follows list traversal order.

## Public Interface

Types:

- `type CollisionKind = 'bulletShipAsteroid' | 'bulletShipUfo' | 'bulletUfoShip' | 'shipAsteroid' | 'shipUfo'` — five allowed pair types.
- `type CollisionEvent = { kind: CollisionKind; a: Entity; b: Entity }` — describes one pair of colliding entities. References `a` and `b` point to real objects from `World` lists; `kind` provides enough information for `World` to know which fields of `a`/`b` are safe to treat as `Bullet`/`Ship`/`Asteroid`/`Ufo` (without `instanceof` dispatch in resolution).

Function (or static method of a `CollisionSystem` class):

- `detect(world: World): CollisionEvent[]` — pure function. Accepts a snapshot of the world by reference, mutates nothing, returns a new event array. Empty array if no intersections.

Internal helpers (not required to be exported, mentioned in Key Flows):

- `distanceSqTorus(a: Vec2, b: Vec2, width: number, height: number): number` — squared minimum distance between two points on a torus of size `width × height`. May live here or be moved to `vec2-math` (see Open Questions).
- `circlesOverlap(a: Entity, b: Entity): boolean` — `distanceSqTorus(a.position, b.position, CANVAS.WIDTH, CANVAS.HEIGHT) < (a.radius + b.radius) ** 2`.

`kind` → `a`/`b` type mapping:

| `kind` | `a` | `b` |
|---|---|---|
| `bulletShipAsteroid` | `Bullet` (`source === 'ship'`) | `Asteroid` |
| `bulletShipUfo` | `Bullet` (`source === 'ship'`) | `Ufo` |
| `bulletUfoShip` | `Bullet` (`source === 'ufo'`) | `Ship` |
| `shipAsteroid` | `Ship` | `Asteroid` |
| `shipUfo` | `Ship` | `Ufo` |

`World` uses this table to determine operand roles in resolution without additional type checks.

## Data Model

The module owns no collections and has no state. All data is received by reference from `World` and returned as a clean event list.

**`CollisionEvent` shape:**

| Field | Type | Purpose |
|---|---|---|
| `kind` | `CollisionKind` | discriminant for resolution |
| `a` | `Entity` | first entity of the pair; concrete type given by the `kind` table |
| `b` | `Entity` | second entity of the pair; concrete type given by the `kind` table |

The `a`/`b` order is normalised by the table: "bullet is always `a`", "ship in a pair with asteroid/UFO is always `a`", "in a UFO bullet ↔ ship pair bullet is `a`, ship is `b`". This eliminates branching in resolution.

No relations or indexes; no persistence.

## Key Flows

**One `detect(world)` pass.** The function builds the result array `events: CollisionEvent[]` and iterates through several nested loops over relevant pairs. General structure:

1. A flag `shipVulnerable = world.ship !== null && world.ship.alive && !isInvulnerable(world.ship, now)` is determined. If `false`, all `Ship—*` pairs are skipped entirely — the corresponding inner loops do not run.
2. Loop over `world.bullets`. For each `bullet.alive` bullet:
   - If `bullet.source === 'ship'`:
     - Nested loop over `world.asteroids`: for each `asteroid.alive`, check `circlesOverlap(bullet, asteroid)`; on intersection — `events.push({ kind: 'bulletShipAsteroid', a: bullet, b: asteroid })`;
     - Nested loop over `world.ufos`: similarly, with `kind: 'bulletShipUfo'`.
     - The pair "ship bullet — ship" is not checked: a bullet does not hit its own source.
   - If `bullet.source === 'ufo'`:
     - Check against the ship: if `shipVulnerable`, `circlesOverlap(bullet, world.ship)` → `events.push({ kind: 'bulletUfoShip', a: bullet, b: world.ship })`.
     - Pairs "UFO bullet — UFO" and "UFO bullet — asteroid" are not checked: by scope rules a UFO bullet only hits the ship. (If the game later allows UFOs to destroy asteroids, a new `kind` would be added; for now — no.)
3. If `shipVulnerable`:
   - Loop over `world.asteroids`: for each `asteroid.alive` — `circlesOverlap(world.ship, asteroid)` → `events.push({ kind: 'shipAsteroid', a: world.ship, b: asteroid })`;
   - Loop over `world.ufos`: similarly, with `kind: 'shipUfo'`.
4. Return `events`.

Complexity — O(|bullets| × (|asteroids| + |ufos|) + |asteroids| + |ufos|). At typical sizes (up to ~30 asteroids, up to 5 bullets, 0–1 UFOs) this is a few hundred pairs per frame — trivial at 60 Hz.

**Intersection check with wrap-around.** Straight Euclidean check `(bx - ax)² + (by - ay)²` breaks for objects near opposite canvas edges: an asteroid at `x = 955` and a bullet at `x = 5` (with `CANVAS.WIDTH = 960`) are visually adjacent on the torus screen but formally ~950 pixels apart. To cover this case the module uses torus distance: for the `x` component, `dx = abs(a.x - b.x); dx = min(dx, CANVAS.WIDTH - dx)`, similarly for `y`; then `dSq = dx*dx + dy*dy`. This is equivalent to checking nine "copies" of one of the points with offsets `(±W, ±H)` and selecting the nearest, but costs only two `min` calls per component. Intersection: `dSq < (a.radius + b.radius)²`. This check is correct for any radii not exceeding half of the smaller canvas dimension (for Asteroids this holds with a large margin — the largest radius is about 40, half the canvas is 360+).

**Skipping the invulnerable ship.** Just after respawn or at the start of a game, the ship spends `SHIP.RESPAWN_INVULN_TIME` in invulnerability. `detect` checks this via the helper `isInvulnerable(ship, now)` (or equivalent — depends on the final decision on `Ship.invulnUntil` vs. `Ship.invulnRemaining`, see `ship.md`, Open Questions). If the ship is invulnerable, all three pairs involving it (`shipAsteroid`, `shipUfo`, `bulletUfoShip`) are skipped. Pairs "player bullet ↔ asteroid/UFO" continue to be checked normally — the player can shoot while invulnerable.

**Skipping dead entities.** Any entity with `alive === false` is skipped at the loop level. This applies to `world.ship` as well: if the ship is already dead and not yet respawned, `world.ship` may be `null` (depending on the final respawn scheme) or a live object with `alive = false` — both cases read as "no ship". Similarly — asteroids and UFOs killed in earlier collisions of the same tick are not filtered inside a single `detect` call (all events are collected from one version of the snapshot); `World` in resolution simply ignores events where any entity already became `alive = false` from an earlier event in the same batch.

**Example tick.** Player fires; bullet moves; after `integrate` the bullet ended up inside an asteroid's circle. `GameScene` calls `detect(world)`; the function finds the intersection and returns `[{ kind: 'bulletShipAsteroid', a: bullet, b: asteroid }]`. `World.resolveCollisions` on that event: `bullet.alive = false`; `asteroid.alive = false`; `asteroid.split()` → two new `medium` asteroids are added to `world.asteroids`; `ship.onBulletExpired()` decrements the counter; `Scoring.addPoints('asteroid.large')`; particles are spawned.

## Dependencies

- **`entity`** — type `Entity` (for `CollisionEvent` fields), fields `position`, `radius`, `alive`.
- **`ship`** — type `Ship` and access to the invulnerability property (`invulnUntil` or derived helper `isInvulnerable`).
- **`asteroid`** — type `Asteroid` (for typing only; the detector does not read type-specific fields, only inherited ones).
- **`bullet`** — type `Bullet` and field `source: 'ship' | 'ufo'` — the primary pair filter.
- **`ufo`** — type `Ufo` (analogously to `Asteroid`).
- **`vec2-math`** — type `Vec2`; functions `distanceSq` and/or a new `distanceSqTorus` (or torus-distance implementation inside `collision-system` as a private function).
- **`config`** — `CANVAS.WIDTH`, `CANVAS.HEIGHT` for torus distance.
- **`world`** (type) — signature `detect(world: World)`. Imported as `import type { World }` to avoid a circular value dependency.

Reverse dependencies: `GameScene` calls `detect(world)` each tick; `World.resolveCollisions` consumes the returned array.

## Error Handling

- **Invalid input — `world` without `ship` (`world.ship === null`).** Normal case between respawns. All ship-related pairs are skipped; bullets, asteroids, and UFOs continue to be checked by their own rules (in current scope — only `bulletShip-*`; "asteroid ↔ UFO" interactions don't exist). No ship-involving events in the result.
- **Invalid input — empty lists (`bullets = []`, `asteroids = []`, `ufos = []`).** The function returns an empty array in O(1) — all loops don't run. Expected state at the start/end of a wave.
- **Downstream failure.** Not applicable: the module is synchronous, with no I/O, no async, and no external calls. The only external calls are pure `vec2-math` functions and `Math.*`.
- **Partial success.** Not applicable: the function either completed fully and returned an array, or propagated an exception from some internal call (which means a bug — e.g. `NaN` in coordinates). No intermediate states since nothing is mutated.
- **`NaN`/`Infinity` in `position` or `radius`.** The detector does not filter: the comparison `dSq < rSumSq` with `NaN` gives `false`, and the intersection simply won't be registered. This is fail-safe: no false events, but the bug is not masked — the bullet will "pass through" an asteroid, visible immediately in a dev build.
- **Double-counting a single intersection.** Excluded by loop structure: each pair is checked exactly once, `(a, b)` order normalised by the `kind` table.
- **Event after resolution of another event from the same batch.** Example: a bullet hit asteroid `A`; the same tick — the bullet hits asteroid `B`; after resolving the first event the bullet is already `alive = false`, but the `B` event is already in the array. Protection — in `World.resolveCollisions`: skip an event if `!event.a.alive || !event.b.alive`. `detect` itself does not do such filtering (the snapshot is coherent).
- **Exceptions.** The module does not throw on its own. An error from `distanceSqTorus` is impossible for finite inputs; an error from `Math.*` likewise. Any propagated exception is a caller bug, caught by the game loop's top-level try/catch.

## Stack & Libraries

- **TypeScript (ES2022 target).** Language defined by architecture. Discriminated union (`CollisionKind`) and literal types provide safe resolution in `World` via `switch (event.kind)` without `instanceof`.
- **Implementation — pure function `detect(world)` or `class CollisionSystem { static detect(world) }`.** Both are equivalent; a pure functional export is preferred: the module has no state, a class without fields is redundant wrapping. If the architecture insists on "every subsystem is a class", it will be a class with a static method.
- **No external libraries.** The algorithm is two or three nested loops, comparison arithmetic, and torus distance. No geometry/physics engines (`matter-js`, `p2`) are needed.
- **No broad-phase structures (quad-tree, spatial hash).** Justification: with the expected number of entities, naïve O(n²) is simpler, faster in absolute terms, and wastes no memory on index maintenance. If `WaveManager` in later waves generates hundreds of asteroids (which is not in the concept), broad-phase could be considered — see Open Questions.
- **No object pooling for `CollisionEvent`.** The array is recreated each tick; per-frame events number in single digits, GC pressure is negligible. Event pooling is premature optimisation.

## Configuration

The module has no env variables, secrets, or runtime settings. The only externally read constants are `CANVAS.WIDTH` and `CANVAS.HEIGHT` from `config` — for torus distance. Changing canvas dimensions requires editing `config.ts` and rebuilding the bundle.

The module has no internal constants: all "magic" comes from entity fields (`position`, `radius`) and `config.CANVAS`.

## Open Questions

- **Where to put `distanceSqTorus` — in `vec2-math` or keep it private in `collision-system`.** The function is useful only here, but conceptually belongs to vector math. Leaning toward moving it to `vec2-math` as `distanceSqTorus(a, b, width, height)` for consistency with `distanceSq`; will be decided at implementation time.
- **Whether to account for torus distance at all or limit to plain Euclidean.** Plain is one step simpler and strictly speaking only errs for pairs near opposite edges with very fast objects. In the original Asteroids this problem was at the level of "rare but noticeable"; for our game it is better to do it correctly from the start — otherwise the player gets the bug "bullet passed through an asteroid at the screen edge" in the first minutes of play. Recommendation — implement torus distance from the start.
- **API form: free function `detect(world)` or `class CollisionSystem`.** Discussed in Stack & Libraries. Will be decided at implementation; the consumer (`GameScene`) imports one entity in either case.
- **How to read ship invulnerability.** Compare `now < ship.invulnUntil` directly or call `ship.isInvulnerable(now)` / `ship.invulnRemaining > 0` — depends on the final scheme in `ship.md`. The detector either receives `now` as an argument (`detect(world, now)`) or asks the ship via a helper. Leaning toward the latter: fewer parameters and less coupling to game time.
- **Whether `kind === 'bulletShipUfo'` is needed or one `bulletUfo` suffices.** Currently player bullets are explicitly separated by target (`bulletShipAsteroid`, `bulletShipUfo`) — so `World` can award points directly by `kind` in resolution. Alternative — one `kind: 'bulletAsteroid' | 'bulletUfo' | 'bulletShip'`, distinguishing by `a.source` in resolution. The current variant is more explicit but has a longer enumeration.
- **Sorting/prioritising events.** If in one tick a bullet caught an asteroid at the same moment the ship flew into it, a scenario is possible where `shipAsteroid` is processed first (player loses a life) and then `bulletShipAsteroid` (asteroid is still destroyed but the life is already gone). In most cases this is acceptable; if desired, a priority "bullets first" could be introduced by sorting the array before returning. Decision — after play-testing.
- **Extension to future entities.** If mines, bosses, or bonuses are added — the `CollisionKind` table expands. For now the enumeration is closed at five kinds; adding new pairs requires targeted changes to `detect` and its consumer in `World`.
