# Module `bullet`

## Purpose

The module implements the `Bullet extends Entity` class — a projectile fired by the player's ship or a UFO. The bullet is responsible for straight-line motion at constant speed, a limited lifetime (TTL), and properly notifying its "owner" (`Ship`) that an in-flight slot has been freed — this is critical for correctly enforcing the `SHIP.MAX_BULLETS = 4` limit. Without this module the shooting mechanic (the primary verb of the game) does not exist, and without the owner notification the active-bullet counter goes out of sync, causing the player to either lose the ability to shoot or gain unlimited fire rate.

## Responsibilities

- Declaring the `Bullet extends Entity` class with fields `lifetime`, `source`, and `owner`.
- Initialising the bullet in the constructor: position (at the shooter's nose), the already-computed velocity vector (`direction × BULLET.SPEED`), radius from `BULLET.RADIUS`, initial `lifetime = BULLET.LIFETIME`.
- Per-step update: `integrate(dt)` (movement + wrap via the base class) plus decrementing `lifetime`.
- Self-destruction on TTL expiry: setting `alive = false`.
- Notifying the owning ship about the bullet's removal via `owner.onBulletExpired()` — **in every death scenario**, whether it is a natural TTL expiry or an external kill (hit on an asteroid/UFO/ship).
- Drawing: a short line or 1–2 px white dot on `CanvasRenderingContext2D`.
- Storing the source discriminator (`source: 'ship' | 'ufo'`) for `CollisionSystem` — to distinguish the pairs `bullet(ship)↔asteroid`, `bullet(ship)↔ufo` from `bullet(ufo)↔ship`.

### Non-Responsibilities

- Does not detect collisions — that is `CollisionSystem`; `Bullet` only provides `position` and `radius`.
- Does not decide what happens to the target on hit (asteroid split, point award, life loss) — that is `World`'s collision resolution from `CollisionEvent` list.
- Does not create itself: instances are born in `Ship.fire()` and in `Ufo` AI code (on a fire timer), not inside `Bullet`.
- Does not track the `SHIP.MAX_BULLETS` limit — the limit lives in `Ship` (counter `bulletsInFlight`); `Bullet` only notifies on its own removal.
- Does not know about waves, score, HUD, or scenes.
- Does not catch exceptions: if `owner.onBulletExpired()` throws, the exception propagates up to the game loop's top-level try/catch.
- Contains no sound effects or particles — those are delegated to `Particle` / a future audio module.

## Public Interface

Single export — the class:

- `class Bullet extends Entity` — a bullet with a limited lifetime.

Instance fields (beyond inherited `position`, `velocity`, `radius`, `alive`):

- `lifetime: number` — remaining lifetime in seconds; decremented each tick.
- `source: 'ship' | 'ufo'` — who fired it; read by `CollisionSystem` to select relevant pairs.
- `owner: Ship | Ufo | null` — direct reference to the shooter. Mandatory for a ship bullet (needed for `onBulletExpired`); `null` or a `Ufo` reference is acceptable for a UFO bullet (not currently used, kept for potential AI expansion).

Constructor:

- `constructor(position: Vec2, velocity: Vec2, source: 'ship' | 'ufo', owner: Ship | Ufo | null)` — `radius` is taken from `BULLET.RADIUS`, `lifetime` is initialised to `BULLET.LIFETIME`. `velocity` is already computed by the caller (typically: `fromAngle(heading, BULLET.SPEED)` for the ship, inheriting its velocity; for the UFO — direction toward the player accounting for accuracy).

Methods:

- `update(dt: number): void` — decrements `lifetime`, calls `integrate(dt)`; when `lifetime <= 0` sets `alive = false` and, if the owner is a `Ship`, calls `owner.onBulletExpired()`.
- `draw(ctx: CanvasRenderingContext2D): void` — draws a short white line or a 1–2 px dot.

The module exports no free functions or constants.

## Data Model

The module does not own tables or collections — it describes the shape of one object in memory.

**`Bullet` fields:**

| Field | Type | Default | Purpose |
|---|---|---|---|
| `position` | `Vec2` | from constructor | bullet position; starts at the shooter's nose |
| `velocity` | `Vec2` | from constructor | constant motion vector; unchanged after creation |
| `radius` | `number` | `BULLET.RADIUS` (2) | collision radius |
| `alive` | `boolean` | `true` | transitions to `false` on TTL expiry or hit |
| `lifetime` | `number` | `BULLET.LIFETIME` (1.0 s) | remaining lifetime |
| `source` | `'ship' \| 'ufo'` | from constructor | source type, used to filter collision pairs |
| `owner` | `Ship \| Ufo \| null` | from constructor | reference to the shooter for `onBulletExpired` |

**Relations.** The bullet holds a back-reference to its owner (`owner`). This is the only non-trivial inter-entity reference in the game: other entities do not reference each other directly. The reference is needed so the bullet can call `onBulletExpired` in any death scenario — without it one would need either a global event bus or `World` tracking which bullet belongs to which ship (spreading the invariant across the codebase).

No indexes, no persistence.

## Key Flows

**Ship creating a bullet.** `Ship.fire()` checks cooldown and limit `bulletsInFlight < SHIP.MAX_BULLETS`. If both conditions are met: computes the starting position as the ship's nose (`position + fromAngle(heading, SHIP.RADIUS)`), velocity as `add(ship.velocity, fromAngle(heading, BULLET.SPEED))` (inheriting ship momentum + bullet speed), creates `new Bullet(pos, vel, 'ship', this)`, increments `bulletsInFlight`, adds the bullet to `world.bullets`. `Ship` resets the reload timer.

**Motion tick.** On each `update(dt)` the bullet first decrements `lifetime -= dt`. If `lifetime <= 0` — sets `alive = false` and, if `source === 'ship'` and `owner instanceof Ship`, calls `owner.onBulletExpired()`, which decrements `bulletsInFlight`. Then `integrate(dt)` is called — the basic motion step with wrap-around by canvas size (bullets, like everything else in the game, cross screen edges).

**Death on hit.** `CollisionSystem.detect` returns a `bulletAsteroid` / `bulletUfo` / `bulletShip` event. `World` in resolution: sets `bullet.alive = false`, splits the asteroid (or kills the UFO / takes a life), awards points, spawns particles. **Important:** after `World` marks the bullet dead, it must call `bullet.owner.onBulletExpired()` — but it is cleaner to delegate this to the bullet itself through a single path. Therefore the invariant is: **any bullet death scenario for a ship bullet must result in exactly one call to `onBulletExpired`**. Implementation — in `World.resolveCollisions`, immediately after assigning `bullet.alive = false`: if `bullet.source === 'ship'`, call `bullet.owner?.onBulletExpired()`. Alternative (and preferred) — introduce a `Bullet.kill()` method on the bullet itself that centralises this; the question is left open.

**Drawing.** `draw(ctx)` sets `strokeStyle = '#fff'`, `lineWidth = 2` and draws either a short line 2–3 px long along `velocity`, or a filled rectangle/circle 2×2 px at `position`. No additional effects (trail, glow) in MVP.

## Dependencies

- **`entity`** — base class `Entity`, method `integrate(dt)`, fields `position`/`velocity`/`radius`/`alive`.
- **`vec2-math`** — type `Vec2` for constructor parameters and fields (via `Entity`).
- **`config`** — constants `BULLET.RADIUS`, `BULLET.LIFETIME` (and indirectly `CANVAS.WIDTH`/`HEIGHT` inside `integrate`).
- **`ship`** — type only: `import type { Ship }` for the `owner` field. `Bullet` does not call anything from `Ship` except `onBulletExpired()` through the object; using `import type` avoids a circular dependency (`Ship` imports `Bullet` by value, `Bullet` imports `Ship` by type only).
- **`ufo`** — similarly, `import type { Ufo }` for the `owner` field.
- **Standard DOM (`CanvasRenderingContext2D`)** — only as the type parameter for `draw(ctx)`.

Reverse dependencies: `Ship` creates bullets in `fire()`, `Ufo` creates them in its AI logic; `World` holds `bullets: Bullet[]`; `CollisionSystem` reads `source`, `position`, `radius`.

## Error Handling

- **`owner === null` for a ship bullet.** Contract violation by the caller: if `source === 'ship'`, `owner` must be a `Ship`. Protection — optional call: `if (this.source === 'ship' && this.owner instanceof Ship) this.owner.onBulletExpired()`. If `owner` is `null`, the bullet simply dies, and the ship's `bulletsInFlight` counter stays elevated — visible immediately (player stops being able to shoot). The bug will surface in a dev build at once.
- **Exception in `owner.onBulletExpired()`.** `Bullet` catches nothing: the exception propagates through `update(dt)` into the game loop's top-level try/catch (see `architecture.md`, "Error Handling"). In dev — the game stops; in prod — returns to `MenuScene`.
- **Double death (TTL expired and hit in the same tick).** Scenario: in one tick `update(dt)` zeroed `lifetime` (alive → false, `onBulletExpired` called), then `CollisionSystem` found a collision for the same bullet with an asteroid. Protection — in `World` resolution: check `if (!bullet.alive) continue;` before processing an event; a second `onBulletExpired` call should not happen. Alternative: make `onBulletExpired` idempotent on the `Ship` side (`if (this.bulletsInFlight > 0) this.bulletsInFlight--`), but this masks the bug. Solution — filter in `World`.
- **Invalid `dt` (`NaN`, negative).** Not filtered. `lifetime` will become `NaN`, the comparison `<= 0` will return `false`, the bullet will "hang"; `integrate` will produce `NaN` in position. This is a caller bug (`GameLoop`/`GameScene`), caught visually.
- **Downstream failure, partial success** — not applicable: synchronous module with no I/O.

The module itself does not throw exceptions.

## Stack & Libraries

- **TypeScript (ES2022 target), plain `class extends Entity`.** Language defined by architecture; inheritance is a standard ES2022 mechanism. No additional language features required.
- **`import type` for `Ship` and `Ufo`.** Must be type-only imports so that no circular value dependency arises at compile time (`Ship` → `Bullet` → `Ship`). TypeScript strips `type` imports at emit.
- **No external libraries.** The module is a few dozen lines on top of `Entity`, `vec2-math`, and `config`.
- **No object pooling.** Bullets live for 1 second, at most 4–5 simultaneously; GC pressure is negligible.
- **Rendering — direct `ctx.strokeRect`/`ctx.beginPath`+`ctx.stroke` calls.** Using `Renderer` utility is possible, but overkill for a 1–2 px point/line; will revisit on the first `Renderer` pass.

## Configuration

The module has no external configuration — no env variables or secrets. All numeric parameters come from the `config` module:

| Constant | Value | Purpose |
|---|---|---|
| `BULLET.RADIUS` | `2` | bullet collision radius |
| `BULLET.SPEED` | `600` | bullet speed in px/s (read by **the caller** when computing `velocity`, not by `Bullet` itself) |
| `BULLET.LIFETIME` | `1.0` | initial `lifetime` value in seconds |

Internal constants (line colour, width) can be hardcoded (`'#fff'`, `2`) — these are visual style, not balance; they can be moved to `config.BULLET.COLOR` when the number of visual parameters grows. For now — hardcoded.

## Open Questions

- **Single `Bullet.kill()` method vs. explicit `onBulletExpired` call from `World`.** Currently the invariant "any death path → `onBulletExpired`" is described, but the implementation is spread between `Bullet.update` (for TTL) and `World.resolveCollisions` (for hits). Cleaner — introduce `Bullet.kill()`, which does `alive = false` and `owner?.onBulletExpired?.()`, and call it from both places. Deferred until `CollisionSystem`/`World` implementation.
- **`owner` for UFO bullet.** Currently `Ufo | null` is allowed, but no code reads it. Leave the field for the future (e.g. statistics "who killed whom") or simplify the type to `Ship | null` — will decide during `Ufo` implementation.
- **Ship momentum inheritance by bullet.** Canonical Asteroids: bullet velocity is `ship.velocity + direction * BULLET.SPEED`, making a fast-flying ship more dangerous (can catch its own bullet). Whether this behaviour is needed or a "clean" speed `direction * BULLET.SPEED` is preferred — a balance question, resolved during tuning after the first playable build.
- **Visual bullet line length.** A 2×2 px dot is closest to the original; a short line along `velocity` (2–4 px) looks "faster" and gives a visual sense of direction. Choice — during visual tuning.
- **Moving colour and width to `config.BULLET`.** Currently hardcoded; if variants appear (e.g. UFO bullet colour — red), they will move to `config`.
