# Module `ufo`

## Purpose

The module defines the `Ufo extends Entity` class — the UFO enemy that periodically appears on the field and fires at the player's ship. It exists in two subtypes (`large` and `small`), differing in size, speed, and aiming accuracy. Without this module the game lacks the second source of danger (besides asteroids) and loses the second key mechanic of the original Asteroids — the UFO "hunting" the player.

## Responsibilities

- Declaring the `Ufo extends Entity` class with a concrete `update(dt, shipPos)` and `draw(ctx)` implementation.
- Storing the subtype (`kind: 'large' | 'small'`) and associated behaviour timers (`directionTimer`, `fireTimer`).
- Choosing the starting position and flight direction: appearing at the left or right edge of the canvas at a random height, with horizontal velocity pointing toward the opposite edge.
- Periodically adjusting the vertical velocity component: when `directionTimer` expires — random change to `velocity.y`, timer restart.
- Periodic firing toward the player's ship with accuracy depending on the subtype: when `fireTimer` expires — returning a `Bullet` ready to be added to the world, timer restart.
- Specific "movement without X wrap-around": if the UFO goes beyond the left or right edge — it is considered "flown off", `alive = false`; Y wrap-around is preserved.
- Rendering the vector UFO silhouette with lines (dome + body) with proportions depending on `kind`.

### Non-Responsibilities

- Does not decide when and with what probability to spawn a UFO — that is `WaveManager.maybeSpawnUfo`'s domain.
- Does not add created bullets to `World` and does not notify `CollisionSystem`: `tryFire` only returns a `Bullet`; further routing is `GameScene`/`World`'s responsibility.
- Does not award points for its own death — `Scoring` handles that based on the `CollisionEvent { kind: 'bulletUfo' }` event.
- Does not check collisions with the ship, bullets, or asteroids — that is `CollisionSystem`.
- Does not know about game state (waves, score, lives) and does not read player input.
- Contains no explosion effect logic — particles are created by `World` when resolving a collision.

## Public Interface

The sole export is the class:

- `class Ufo extends Entity` — the UFO enemy.

Instance fields (beyond inherited `position`, `velocity`, `radius`, `alive`):

- `kind: 'large' | 'small'` — subtype, affecting radius, speed, accuracy, silhouette proportions, and score value.
- `directionTimer: number` — seconds until the next random adjustment of `velocity.y`.
- `fireTimer: number` — seconds until the next shot.

Constructor:

- `constructor(kind: 'large' | 'small')` — creates a UFO with parameters taken from `UFO` (`config`). Randomly chooses the spawn side (left or right edge of the canvas), a random `y ∈ [0, CANVAS.HEIGHT)`, the X direction toward the opposite edge, and speed magnitude `UFO.SPEED[kind]`. The initial `velocity.y` is zero or a small random value. Timers are initialised near `UFO.DIRECTION_CHANGE_INTERVAL` and `UFO.FIRE_INTERVAL` (with small random jitter so different UFOs don't synchronise).

Methods:

- `update(dt: number, shipPos: Vec2 | null): void` — main simulation step. Decrements `directionTimer` and `fireTimer`; when `directionTimer` fires — changes `velocity.y` and restarts the timer; advances position via integration (see Key Flows); checks for exit past horizontal canvas bounds and sets `alive = false` if the UFO has flown off.
- `tryFire(shipPos: Vec2 | null): Bullet | null` — checks `fireTimer`; if it is ≤ 0 and `shipPos !== null`, constructs a `Bullet` aimed at the ship with the appropriate spread, restarts `fireTimer`, and returns the bullet. Otherwise — returns `null`. The timer is decremented in `update`, not here.
- `draw(ctx: CanvasRenderingContext2D): void` — draws the UFO silhouette: a horizontal elliptical "body" (lower part) and a semi-circular "dome" on top, connected by lines; proportions are scaled by `UFO.RADIUS[kind]`.

## Data Model

The module owns no collections; it describes the shape of one instance in memory.

**`Ufo` fields (beyond those inherited from `Entity`):**

| Field | Type | Default | Purpose |
|---|---|---|---|
| `kind` | `'large' \| 'small'` | from constructor | UFO subtype, determines all balance parameters |
| `directionTimer` | `number` | `UFO.DIRECTION_CHANGE_INTERVAL` ± jitter | seconds until the next `velocity.y` change |
| `fireTimer` | `number` | `UFO.FIRE_INTERVAL` ± jitter | seconds until the next shot |

**Derived parameters, read from `config`:**

- `radius = UFO.RADIUS[kind]` — set in the constructor via `super(...)`.
- speed `|velocity.x| = UFO.SPEED[kind]` — set in the constructor.
- aiming accuracy — `UFO.LARGE_AIM_ACCURACY` or `UFO.SMALL_AIM_ACCURACY`, used in `tryFire`.

**Relations.** No direct references to other entities. `Ufo` receives `shipPos` as an argument each tick — the only connection to the ship, and it is one-directional (the UFO reads the position, knows nothing about the `Ship` object itself). In `tryFire`, the returned `Bullet` is passed by value to the caller — no references remain between the `Ufo` and its bullet.

## Key Flows

**Initialisation and flight start.** `WaveManager.maybeSpawnUfo` decides it is time to add a UFO and creates `new Ufo(kind)`. The constructor randomly chooses the spawn side: `side = randomBool() ? 'left' : 'right'`; `position.x = side === 'left' ? 0 : CANVAS.WIDTH`; `position.y = randomRange(0, CANVAS.HEIGHT)`. `velocity.x = side === 'left' ? +UFO.SPEED[kind] : -UFO.SPEED[kind]`, `velocity.y = randomRange(-UFO.SPEED[kind] * 0.25, +UFO.SPEED[kind] * 0.25)` (small initial vertical component). Timers are set to `UFO.DIRECTION_CHANGE_INTERVAL` and `UFO.FIRE_INTERVAL` with small random jitter. `World.ufos.push(ufo)`.

**`update(dt, shipPos)` tick.** Sequentially:

1. `this.directionTimer -= dt`. If `≤ 0` — a new value `velocity.y = randomRange(-UFO.SPEED[kind] * 0.5, +UFO.SPEED[kind] * 0.5)` is generated, `this.directionTimer = UFO.DIRECTION_CHANGE_INTERVAL + jitter`. `velocity.x` is not changed (the UFO always moves toward the opposite edge).
2. `this.fireTimer -= dt` — the targeting timer decrements continuously; the actual shot is initiated by a separate `tryFire` call from `GameScene` (see next flow).
3. Position update — done manually, without calling the base `integrate`, because the standard `integrate` wraps on both axes, but we need wrapping only on Y: `this.position = { x: this.position.x + this.velocity.x * dt, y: wrap(this.position.y + this.velocity.y * dt, CANVAS.HEIGHT) }`.
4. Check for exit past horizontal bounds: if `position.x < 0` or `position.x > CANVAS.WIDTH` — `this.alive = false`. The UFO is considered "flown off"; `World` will remove it at the next list cleanup. No points are awarded for a flown-off UFO.

**Firing attempt via `tryFire(shipPos)`.** `GameScene` after updating all entities iterates `world.ufos` and calls `ufo.tryFire(world.ship?.position ?? null)` for each. Internally: if `this.fireTimer > 0` — return `null`. If `shipPos === null` (ship is dead, between respawns) — the shot is cancelled, `fireTimer` is not restarted (the next tick will try again; as soon as the ship appears, the UFO will fire). Otherwise — the ideal direction `dir = normalize(sub(shipPos, this.position))` is computed, and a random deviation inversely proportional to accuracy is added to the angle: `accuracy = UFO[kind === 'small' ? 'SMALL_AIM_ACCURACY' : 'LARGE_AIM_ACCURACY']`; `aimJitter = randomRange(-1, 1) * (1 - accuracy) * maxSpread` (where `maxSpread` is a module constant or part of the `UFO` config, e.g. `π/4` for large). The resulting direction is `rotate(dir, aimJitter)`. A `new Bullet({ position: this.position, velocity: scale(aimedDir, BULLET.SPEED), source: 'ufo' })` is created, `this.fireTimer = UFO.FIRE_INTERVAL + jitter` is set, the bullet is returned. `GameScene` adds it to `world.bullets`.

**Rendering.** `draw(ctx)` uses `ctx.beginPath` / `ctx.stroke` with coordinates offset relative to `position`. Drawn: (1) a horizontal elliptical "saucer" — two arcs or a closed polyline; (2) the upper semi-circular "dome"; (3) thin "rim" lines between the dome and body. All geometric sizes are scaled from `radius` (`UFO.RADIUS.large` for `large`, `UFO.RADIUS.small` for `small`), so `small` looks smaller and proportionally more precise.

## Dependencies

- **`entity`** — inheritance from `Entity`: `position`, `velocity`, `radius`, `alive`, `update`/`draw` signatures. The base `integrate` is intentionally not used in `Ufo` (see Key Flows rationale).
- **`vec2-math`** — `Vec2`, `add`, `sub`, `scale`, `normalize`, `rotate`, `wrap`, `randomRange`. Used in the constructor, in `update` (manual update with Y-only wrap), and in `tryFire` (aiming).
- **`config`** — `CANVAS.WIDTH`, `CANVAS.HEIGHT`, the `UFO` group (`RADIUS`, `SPEED`, `DIRECTION_CHANGE_INTERVAL`, `FIRE_INTERVAL`, `SMALL_AIM_ACCURACY`, `LARGE_AIM_ACCURACY`), `BULLET.SPEED` (for the speed of the fired bullet).
- **`bullet`** — the `Bullet` constructor with `source: 'ufo'`; the result is returned from `tryFire`.
- **Standard DOM (`CanvasRenderingContext2D`)** — only as the type parameter for `draw(ctx)`.

Reverse dependencies (who imports `Ufo`): `WaveManager` (spawn), `GameScene`/`World` (storing in the list, calling `update`/`tryFire`/`draw`), `CollisionSystem` (type in collision pairs).

## Error Handling

- **`shipPos === null` (ship dead between respawns).** Decision from the document: **shot is cancelled**, `fireTimer` is neither restarted nor reset. Rationale: firing in a random direction when there is no target is anti-game (the player has no control over the ship at this moment, and a bullet arriving at the respawn point feels unfair). Cancelling with the timer intact means: as soon as the ship respawns, the UFO will fire on the next tick where `fireTimer` has already expired — no delay introduced.
- **UFO flew off past the X boundary.** Normal behaviour, not an error: `alive = false` is set, `World` removes the object. No points are awarded (the player did not destroy the UFO), consistent with canon.
- **Invalid `kind` in the constructor.** Forbidden by type (`'large' | 'small'`), no runtime checks. Accessing `UFO.RADIUS[kind]` with an unknown value will yield `undefined` and subsequent `NaN` in position — fail-fast, immediately visible.
- **`shipPos === position` (zero vector after `sub`).** Unlikely scenario (UFO is at the exact same point as the ship), but possible during a collision before resolution. `normalize(ZERO)` per the `vec2-math` contract returns `ZERO`; the bullet will fly with zero velocity and immediately "burn out" by TTL or trigger a collision instantly. This is an acceptable edge case — not specially handled.
- **Exception in `update`/`draw`.** `Ufo` catches nothing; propagates up to the game loop's top-level try/catch (see `architecture.md`).
- **Downstream failure / partial success** — not applicable: synchronous code with no I/O.

## Stack & Libraries

- **TypeScript class, inheritance from `Entity`.** Consistent with the architectural decision "classic OOP, common base class". No state machines, AI frameworks, or behaviour trees — the UFO logic fits in two timers and conditional branching.
- **No external libraries.** Everything is built on `vec2-math`, `config`, `entity`, `bullet`. The UFO behaviour is elementary (linear movement + random adjustment + aimed shot); a full AI is excessive.
- **`update` with an extra argument `shipPos`** — a deliberate deviation from the clean `update(dt)` base `Entity` signature. Alternative (storing a ship reference in `Ufo` fields) is worse: creates a hard coupling between entities and complicates ship removal. The extended signature explicitly signals that the UFO is not a fully "self-contained" entity and needs an external target. Possibly worth formalising as a separate interface method `updateWithTarget(dt, target)` — see Open Questions.
- **Rendering via direct `ctx.moveTo` / `ctx.lineTo` / `ctx.arc` calls**, without the `Renderer.polyline` helper — the silhouette consists of arcs and lines; the raw Canvas API is simpler here.

## Configuration

The module has no env variables or secrets. All numeric parameters are read from `config.UFO`:

| Name | Purpose | Default |
|---|---|---|
| `UFO.RADIUS.large` | large UFO collision radius | `20` |
| `UFO.RADIUS.small` | small UFO collision radius | `10` |
| `UFO.SPEED.large` | large UFO horizontal speed magnitude, px/s | `120` |
| `UFO.SPEED.small` | small UFO speed magnitude, px/s | `160` |
| `UFO.DIRECTION_CHANGE_INTERVAL` | average `velocity.y` change interval, s | `1.5` |
| `UFO.FIRE_INTERVAL` | average interval between shots, s | `1.2` |
| `UFO.LARGE_AIM_ACCURACY` | large UFO aiming accuracy (0..1) | `0.3` |
| `UFO.SMALL_AIM_ACCURACY` | small UFO accuracy (0..1) | `0.9` |
| `BULLET.SPEED` | fired bullet speed, px/s | `600` |
| `CANVAS.WIDTH`, `CANVAS.HEIGHT` | canvas dimensions for spawn and Y wrap | `960`, `720` |

Timer jitter amplitude and maximum spread angle (`maxSpread`) are internal module constants; if they prove sensitive for balance, they will be promoted to `config.UFO`.

## Open Questions

- **Separate `DIRECTION_CHANGE_INTERVAL` and `FIRE_INTERVAL` by type.** The small UFO is more aggressive and manoeuvrable in the original; a single value may not be sufficient. Overlaps with the open question in `config.md`.
- **Where to put `maxSpread` for aiming spread.** Currently assumed to be an internal `Ufo` constant; possibly better placed in `config.UFO` (e.g. `AIM_MAX_SPREAD_RAD`).
- **Extended `update(dt, shipPos)` signature vs. the "clean" `update(dt)` from the base `Entity`.** Violates the single-contract principle. Alternative — method `updateWithTarget(dt, target)` plus an empty `update(dt)` from the base class; `GameScene` calls the appropriate method for `Ufo` separately. Decision — during `World` loop implementation.
- **Whether the UFO needs a behavioural transition "on spotting the ship nearby — retreat" / "fire more frequently"** (as in some Asteroids implementations). Not yet; will be added if the game feels too easy on the first build.
- **UFO spawn sound and "burbling" during flight** — noted in the concept as an optional feature; the `ufo` module does not handle sound, but a callback in the constructor/`update` for triggering is possible. Deferred until an audio subsystem exists.
- **Behaviour when `shipPos === null`.** Chosen: "cancel the shot, don't touch the timer". Alternative — "fire in a random direction" (closer to canon in some versions). Keeping the current approach as fairer; will revisit after playtesting.
