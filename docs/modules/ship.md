# Module `ship`

## Purpose

The module defines the `Ship extends Entity` class — the player's ship, the only entity actively controlled from the keyboard in the world. It encapsulates all player-specific behaviour: rotation, thrust along the nose direction with the inertia of the original (no friction), firing with a cooldown and simultaneous bullet cap, hyperspace with the risk of a "failed jump", post-respawn invulnerability, and visual indicators of these states (thruster flame, blinking during invulnerability). Without this module `GameScene` would have to serve the player with individual code, breaking the uniform `Entity` contract and scattering game logic across the scene.

## Responsibilities

- Storing player-ship-specific state: rotation angle `heading`, the `thrusting` flag, timers `fireCooldown`, `hyperspaceCooldown`, the end-of-invulnerability timestamp `invulnUntil`, and the active bullet counter `bulletsInFlight`.
- Implementing the control API: `rotate(dir, dt)`, `setThrust(on)`, `fire(): Bullet|null`, `hyperspace(): void`, `respawn(centerPos)`.
- Physics step (`update(dt)`): applying thrust along the nose vector, clamping speed to `SHIP.MAX_SPEED`, integrating position via `integrate(dt)` from `Entity`, decrementing cooldown timers.
- Rendering (`draw(ctx)`): triangle drawn with three-vertex lines, thruster flame (flickering), blinking in invulnerability mode (draw every other frame).
- Reverse callback `onBulletExpired()` — decrements `bulletsInFlight` when a player bullet dies; called by the `World`/`Bullet` infrastructure so the ship knows when a slot is freed.
- Hyperspace flow: choosing a random position within canvas bounds, probabilistic "accident" (death on the spot), zeroing velocity, setting the cooldown.

### Non-Responsibilities

- Does not listen to keyboard events — `InputSystem` translates presses into calls to `rotate/setThrust/fire/hyperspace`. `Ship` knows only its own API.
- Does not store or render bullets — creates a `Bullet` instance in `fire()` and returns it; storing and updating bullets is `World`'s responsibility.
- Does not perform collisions — intersection checks between the ship's circle and asteroids/UFOs/UFO bullets are delegated to `CollisionSystem`. The ship only exposes `position`, `radius`, and the `isInvulnerable(now)` check as data.
- Does not award points or deduct lives — that is `Scoring`'s domain in `GameScene`.
- Does not decide when to respawn: that is `GameScene`'s domain (after life loss and the delay timer expires). The `respawn` method only brings the object into a "fresh" state.
- Does not handle coordinate wrap-around — that is done by `Entity.integrate(dt)` via `wrapVec2`.
- Does not draw the HUD (lives, score) — only the ship itself.
- Contains no runtime validation: invalid values (`dir` outside `-1|0|1`) are caught by TS types on the caller's side.

## Public Interface

The sole export is the class `Ship`, inheriting from `Entity`.

Instance fields (beyond `Entity` fields):

- `heading: number` — the ship's nose rotation angle in radians. `0` means the nose points right; positive direction is clockwise (the Y axis grows downward in Canvas).
- `thrusting: boolean` — whether thrust is engaged this tick. Set by `setThrust`, read in `update` and `draw`.
- `fireCooldown: number` — seconds until the next shot is ready. Decremented in `update(dt)` to zero.
- `invulnUntil: number` — simulation timestamp (in seconds of accumulated game time) until which the ship is invulnerable. Used by `CollisionSystem`/`GameScene` to ignore collisions.
- `hyperspaceCooldown: number` — seconds until the next jump is ready; decremented in `update`.
- `bulletsInFlight: number` — current number of live bullets fired by the ship. Incremented in `fire()`, decremented via `onBulletExpired()`.

Constructor:

- `constructor(position: Vec2)` — creates the ship at the specified position with `velocity = ZERO`, `radius = SHIP.RADIUS`, `heading = -Math.PI/2` (nose pointing up), all timers at `0`, `bulletsInFlight = 0`, `thrusting = false`. Initial invulnerability is set via a subsequent `respawn(pos)` call or not at all (depending on `GameScene`'s decision).

Control methods (called by `GameScene` per `InputSystem` commands):

- `rotate(dir: -1 | 0 | 1, dt: number): void` — rotation: `heading += dir * SHIP.ROTATION_SPEED * dt`. `-1` — counter-clockwise, `+1` — clockwise, `0` — no-op (convenient so the scene always calls it unconditionally).
- `setThrust(on: boolean): void` — toggles the `thrusting` flag. Actual thrust application happens in `update(dt)`.
- `fire(): Bullet | null` — attempts to fire. Returns a new `Bullet` on success or `null` on failure (see Key Flows and Error Handling).
- `hyperspace(): void` — instant teleport to a random point on the canvas. May leave the ship alive (with zeroed velocity and a new cooldown) or kill it with probability `SHIP.HYPERSPACE_FAIL_CHANCE`.
- `respawn(centerPos: Vec2): void` — brings the ship to the "just spawned" state: `position = centerPos`, `velocity = ZERO`, `heading = -Math.PI/2`, all timers reset, `invulnUntil = now + SHIP.RESPAWN_INVULN_TIME`, `alive = true`, `thrusting = false`.
- `onBulletExpired(): void` — decrements `bulletsInFlight` by 1 (not below zero). Called when a player bullet becomes `alive = false` (hit or TTL expiry).

Overridden `Entity` methods:

- `update(dt: number): void` — applies thrust, clamps speed, decrements timers, calls `this.integrate(dt)`.
- `draw(ctx: CanvasRenderingContext2D): void` — draws the ship triangle, thruster flame, handles blinking during invulnerability.

Auxiliary (internal, not necessarily exported):

- `isInvulnerable(now: number): boolean` — `now < this.invulnUntil`. Useful for `CollisionSystem` and `draw`.

## Data Model

The module owns no DB tables; it describes the shape of one object in memory.

**`Ship` fields (beyond `Entity`):**

| Field | Type | Default | Purpose |
|---|---|---|---|
| `heading` | `number` | `-Math.PI / 2` | nose angle in radians |
| `thrusting` | `boolean` | `false` | whether thrust is engaged this tick |
| `fireCooldown` | `number` | `0` | seconds until the next shot |
| `invulnUntil` | `number` | `0` | simulation timestamp until which the ship is invulnerable |
| `hyperspaceCooldown` | `number` | `0` | seconds until the next jump |
| `bulletsInFlight` | `number` | `0` | number of active player bullets |

Relations: `Ship` is an element of `World.ship` (0..1). Bullets created by `fire()` are stored in `World.bullets` and are connected to the ship only through the `bulletsInFlight` counter (via the `onBulletExpired` callback).

Invariant: `0 <= bulletsInFlight <= SHIP.MAX_BULLETS`. Maintained strictly by `fire()` discipline (does not create a bullet when the cap is reached) and `onBulletExpired()` (decrements on every player bullet death).

On `now` and simulation time: the ship receives `now` for `invulnUntil` and `hyperspace` from the accumulated game time (`GameScene` maintains `simTime += dt` and passes it to `ship.hyperspace`/`respawn`). Alternative — convert `invulnUntil` to a decrement counter (like `fireCooldown`); the decision is noted in Open Questions.

## Key Flows

**Normal tick with thrust and rotation.** `GameScene` reads `InputSystem.isDown(RotateLeft/RotateRight/Thrust)`. Calls `ship.rotate(-1, dt)` / `ship.rotate(+1, dt)` / `ship.rotate(0, dt)` and `ship.setThrust(isDown(Thrust))`. Then calls `ship.update(dt)`: if `thrusting`, the nose vector `forward = fromAngle(heading, 1)` is computed and added to velocity: `velocity = velocity + forward * SHIP.THRUST_ACCEL * dt`; the magnitude is checked and clamped — if `length(velocity) > SHIP.MAX_SPEED`, the velocity is normalised and multiplied by `SHIP.MAX_SPEED`. There is no friction (`SHIP.FRICTION = 0`), inertia is preserved as in the original. Then `fireCooldown` and `hyperspaceCooldown` are decremented to zero (no lower), and `this.integrate(dt)` from `Entity` is called — shifting position and wrapping at the canvas edge.

**Firing.** `GameScene` on the `onPressed(Fire)` event calls `ship.fire()`. Internally: if `fireCooldown > 0` or `bulletsInFlight >= SHIP.MAX_BULLETS` — return `null` (no-op for the scene). Otherwise — the direction vector `forward = fromAngle(heading, 1)` is computed, the muzzle point `muzzle = position + forward * SHIP.RADIUS`, the bullet velocity `bulletVel = velocity + forward * BULLET.SPEED` (inherits the ship's velocity, as in the original). A `new Bullet(muzzle, bulletVel, 'ship')` is constructed, `fireCooldown = SHIP.FIRE_COOLDOWN` is set, `bulletsInFlight += 1` is incremented, and the bullet is returned to the scene, which adds it to `World.bullets`. When the bullet dies (by TTL or on impact), the `World`/`Bullet` infrastructure calls `ship.onBulletExpired()` — the slot is returned.

**Hyperspace.** `GameScene` on `onPressed(Hyperspace)` calls `ship.hyperspace()`. Internally: if `hyperspaceCooldown > 0` — no-op (no teleport). Otherwise: new position `position = vec2(randomRange(0, CANVAS.WIDTH), randomRange(0, CANVAS.HEIGHT))`; velocity `velocity = ZERO` (emergency inertia reset in the spirit of the original); `hyperspaceCooldown = SHIP.HYPERSPACE_COOLDOWN`. Then a roll: `Math.random() < SHIP.HYPERSPACE_FAIL_CHANCE`: if triggered — `alive = false` (failed jump, the ship explodes at the new position; `GameScene` will spawn particles and deduct a life through the normal death pipeline). Otherwise the ship lives and continues moving from the new position.

**Respawn after death.** `GameScene` detects `ship.alive === false`, decrements a life via `Scoring.loseLife()`, waits a brief delay (during the explosion particle animation), then either calls `ship.respawn(vec2(CANVAS.WIDTH/2, CANVAS.HEIGHT/2))` on the existing instance or creates a new `Ship` at the centre. The specific choice is an open question (see below); both options are semantically equivalent with a correct `respawn` implementation. During `SHIP.RESPAWN_INVULN_TIME` after respawn, `CollisionSystem` skips all pairs involving the ship, and `draw` blinks.

**Rendering.** `ship.draw(ctx)` checks invulnerability: if `isInvulnerable(now)` and `Math.floor(now * BLINK_HZ) % 2 === 0` — return without drawing (blinking effect). Otherwise three triangle vertices are built in local coordinates (nose, left wing, right wing; values derived from `SHIP.RADIUS`), rotated by `heading`, and shifted by `position`. Drawn as a closed polyline. If `thrusting`, an additional "flame tongue" is drawn behind the ship: a small triangle aft, present every other frame (alternating by a global frame counter) or with ~0.5 probability per frame — thruster flicker effect.

## Dependencies

- **`entity`** — inheritance from `Entity`, use of the protected `integrate(dt)` and fields `position`, `velocity`, `radius`, `alive`.
- **`vec2-math`** — `Vec2`, `vec2`, `ZERO`, `add`, `scale`, `fromAngle`, `length`, `normalize`, `rotate`, `randomRange`. Used in physics step, bullet factory, hyperspace, triangle vertex calculation.
- **`config`** — constants `SHIP.*`, `BULLET.SPEED`, `CANVAS.WIDTH/HEIGHT`. No magic numbers inside the module.
- **`bullet` (value import)** — `Ship.fire()` returns `Bullet | null`. The real `Bullet` constructor is imported as a value (needed for `new Bullet(...)`). To avoid a circular dependency, if one arises (e.g. if `Bullet` ever needs to know about `Ship`), only the type can be imported and the bullet factory moved to a separate module or the scene. Currently no cycle is expected; a value import is acceptable.
- **Standard DOM** — `CanvasRenderingContext2D` as the type parameter for `draw`.

Reverse dependencies: `GameScene`/`World` (owns the instance), `CollisionSystem` (reads `position`, `radius`, may call `isInvulnerable`), `InputSystem` — indirectly via the scene.

## Error Handling

- **Repeated `fire()` before the cooldown expires.** Returns `null`, no side effects. The scene simply does not add a bullet. This is not an error — it is the normal rate-of-fire limiting mode.
- **Calling `fire()` when `bulletsInFlight >= SHIP.MAX_BULLETS`.** Similarly — `null`, no-op. The original Asteroids capped the player at 4 simultaneous bullets; this behaviour is preserved.
- **Repeated `hyperspace()` before the cooldown ends.** No-op: the ship stays in place, state unchanged. In a dev build the fact can be logged for debugging; in prod — silently ignored.
- **"Failed jump".** Expected contract behaviour: with probability `SHIP.HYPERSPACE_FAIL_CHANCE` the ship becomes `alive = false` at the new position. `GameScene` handles this as a normal death (animation, life loss, respawn) — no special branch is needed.
- **Invalid `dir` in `rotate` (e.g. `2`).** Cut off by the type system (`-1 | 0 | 1`); no runtime checks. If bypassed via `any`, incorrect rotation occurs — that is a caller bug.
- **Inconsistent `bulletsInFlight` (e.g. forgot to call `onBulletExpired`).** Symptom — ship "won't fire" after a few shots: the counter reached the cap and is not decremented. Guard — `World`/`Bullet` discipline: the callback is mandatory on any player bullet transition to `alive = false`. No runtime monitoring.
- **`NaN`/`Infinity` in `heading` or `velocity`.** Will manifest as `NaN` contamination in position after `integrate`. The module does not produce these itself (given correct inputs), but also does not filter them; caught by the game loop's top-level try/catch.
- **Downstream failure, partial success.** Not applicable: the module is synchronous with no I/O or external calls. Either the method completed or it threw an arithmetic exception.

No external exceptions are thrown: all "failures" (`fire` on cooldown, `hyperspace` on cooldown) are expressed as `null` return / no-op.

## Stack & Libraries

- **TypeScript (ES2022 target), class with `extends Entity`.** Language dictated by the architecture. The narrow literal type `-1 | 0 | 1` for `dir` catches caller errors at compile time.
- **No external libraries.** All functionality is covered by `vec2-math` and `config`; inertia physics and ship nose triangulation are tens of lines.
- **No runtime argument validation.** Contracts are held by the compiler; invalid values will manifest visually in a dev build.
- **No object pool.** A new `Bullet` is created on each shot; the peak volume is up to `SHIP.MAX_BULLETS` simultaneous bullets, GC pressure is negligible.
- **`Math.random()` directly.** The source of randomness for `hyperspace` and flame flicker is the global `Math.random()` via the `randomRange` utility from `vec2-math`. A deterministic seed-based simulation is out of MVP scope.

## Configuration

The module has no own constants — all balance values are read from `config`:

- `SHIP.RADIUS` — collision radius and scale of the drawn triangle.
- `SHIP.MAX_SPEED` — velocity magnitude cap for post-thrust clamping.
- `SHIP.THRUST_ACCEL` — thrust acceleration, px/s².
- `SHIP.ROTATION_SPEED` — angular rotation speed, rad/s.
- `SHIP.FIRE_COOLDOWN` — interval between shots, s.
- `SHIP.MAX_BULLETS` — cap on simultaneous player bullets in flight.
- `SHIP.RESPAWN_INVULN_TIME` — invulnerability duration after respawn, s.
- `SHIP.HYPERSPACE_COOLDOWN` — hyperspace cooldown, s.
- `SHIP.HYPERSPACE_FAIL_CHANCE` — probability of a "failed jump".
- `BULLET.SPEED` — initial bullet speed (used in `fire`).
- `CANVAS.WIDTH`, `CANVAS.HEIGHT` — bounds for the random hyperspace destination.

Internal module constant, not promoted to `config`:

- `BLINK_HZ: number` — blink frequency in invulnerability mode (e.g. `10` Hz — 10 visibility toggles per second). A candidate for promotion to `config.SHIP.INVULN_BLINK_HZ` if tuning is ever needed (see Open Questions).

No env variables, secrets, or runtime settings.

## Open Questions

- **`invulnUntil` as a timestamp vs. a decrement counter.** Currently `invulnUntil` is a moment in simulation time; this means the module must obtain `now` from somewhere. Alternative — `invulnRemaining: number`, decremented in `update(dt)` like `fireCooldown`. This eliminates the `now` parameter but complicates `respawn` (the duration must be taken from `config` inside `respawn`, rather than passed in from outside). Leaning toward the second scheme; decision to be finalised during implementation.
- **Respawn: new instance vs. mutation of existing.** `entity.md` recommends "new entity = new instance", but `Ship` is unique (the single ship in `World`) and `World.ship` is more convenient as a stable reference. The current `respawn(centerPos)` API implies mutation; a revision toward `new Ship(centerPos)` with a `World.ship` update is possible.
- **Flame effect: deterministic alternating frames vs. random.** Deterministic — predictable, easier to test; random — looks more alive. For now, alternating by a global frame counter is assumed; final choice after a visual check.
- **`BLINK_HZ` in `config` or as a magic module constant.** Decision depends on whether tuning is needed at the balancing stage; if so, it will be moved to `config.SHIP`.
- **`onBulletExpired` callback vs. ship subscribing to bullet events.** Alternatives: `Bullet` knows its owner and calls it back, `World` calls the callback when filtering dead player bullets, or a mini event bus is introduced. Simplest — `World` calls `ship.onBulletExpired()` when removing a `source === 'ship'` bullet. Will be resolved during `Bullet`/`World` implementation.
- **Bullet speed: absolute vs. inheriting ship velocity.** Asteroids canon — inherits; this is baked into Key Flows. If a fast-moving ship makes bullets nearly useless (it outruns them), switching to absolute `BULLET.SPEED` without adding `velocity` will be considered.
- **Hyperspace without a guaranteed "safe" landing.** The architecture and concept state that the position is chosen randomly, including the possibility of landing on an asteroid. No "safety" check on the new position is performed — "failure" is modelled only by `HYPERSPACE_FAIL_CHANCE`. If testing shows too-frequent instant deaths from spawning on an asteroid, additional deflection logic or a retry for the position will be added.
