# Module `entity`

## Purpose

The module defines the abstract base class `Entity` — the unified skeleton and contract for all game objects on the scene (`Ship`, `Asteroid`, `Bullet`, `Ufo`, `Particle`). It fixes the common fields (position, velocity, radius, alive flag) and requires subclasses to implement two methods — `update(dt)` and `draw(ctx)` — allowing `World` to store all entities in flat lists and iterate them with a single uniform loop. Without this common contract, each entity would need to be serviced by individual code, and the `update/draw`/dead-object-filter loop would spread across the scene.

## Responsibilities

- Declaring the abstract class `Entity` — the single ancestor of all game objects.
- Storing the common state of any entity: `position: Vec2`, `velocity: Vec2`, `radius: number`, `alive: boolean`.
- Declaring the mandatory contract `update(dt): void` and `draw(ctx): void` — as `abstract` methods required to be implemented in subclasses.
- Providing the protected helper method `integrate(dt)`, which implements the standard step "inertial movement + canvas-size wrap-around". Subclasses call it from their own `update(dt)` after applying their own specifics (thrust, rotation, speed changes, etc.).
- Initialising fields via a common constructor accepting `position`, `velocity`, `radius`; the `alive` flag defaults to `true`.

### Non-Responsibilities

- Does not contain concrete entities (`Ship`, `Asteroid`, `Bullet`, `Ufo`, `Particle`) — each lives in its own module.
- Is not responsible for collisions — that is `CollisionSystem`'s domain; `Entity` only provides `position` and `radius` for calculations.
- Does not manage entity lists or delete dead objects — that is done by `World`, filtering by the `alive` flag.
- Does not know about scenes, the game loop, input, waves, or points.
- Does not contain renderer specifics (Canvas primitives, line styles) — the `draw(ctx)` signature is abstract; implementations are given by subclasses using `Renderer` utilities.
- Does not perform runtime validation of constructor arguments (negative radius, `NaN` coordinates) — these are contract violations, caught by the calling code.
- Does not restore entities to the "alive" state: the `alive: true → false` transition is one-way.

## Public Interface

Single export — the abstract class:

- `abstract class Entity` — the base game object skeleton.

Instance fields:

- `position: Vec2` — current position of the entity's centre in canvas coordinates.
- `velocity: Vec2` — current velocity vector in px/s.
- `radius: number` — radius of the bounding circle for collisions and approximate rendering.
- `alive: boolean` — "alive/remove" flag; `World` cleans lists by filtering on this flag.

Constructor:

- `constructor(position: Vec2, velocity: Vec2, radius: number)` — sets the initial state; `alive` is initialised to `true`.

Abstract methods (must be implemented in subclasses):

- `abstract update(dt: number): void` — advances the entity simulation by `dt` seconds.
- `abstract draw(ctx: CanvasRenderingContext2D): void` — draws the entity on the given context.

Protected helper:

- `protected integrate(dt: number): void` — single movement step: `position = wrapVec2(position + velocity * dt, CANVAS.WIDTH, CANVAS.HEIGHT)`. Subclasses call it from their `update(dt)` after applying their own physics (thrust, rotation, TTL decrement, etc.).

## Data Model

The module does not own tables or collections in the DB sense; it describes the shape of one object in memory.

**`Entity` fields:**

| Field | Type | Default | Purpose |
|---|---|---|---|
| `position` | `Vec2` | from constructor | entity centre on the canvas |
| `velocity` | `Vec2` | from constructor | speed in px/s |
| `radius` | `number` | from constructor | collision radius and rendering footprint |
| `alive` | `boolean` | `true` | `false` → entity will be removed by `World` at the next cleanup |

**Relations and indexes.** None — `Entity` stores no references to other entities and participates in no index structures. Subclasses add their own fields (see data model in `architecture.md`: `heading`, `cooldown`, `size`, `lifetime`, etc.).

**Why abstract class rather than interface.** A TypeScript interface would describe the shape (`position`, `velocity`, …, `update`, `draw`), but:

- It gives no shared `integrate(dt)` implementation — it would have to be copied into each subclass or moved to a free function, losing the convenience of `this.integrate(dt)`.
- It does not guarantee uniform field initialisation via a common constructor — each subclass would describe its own fields separately, with a risk of diverging names/types.
- It gives no single-point default of `alive = true`.

An abstract class solves all three: stores state, provides a common constructor, gives the `integrate` implementation, and still forces subclasses to implement `update` and `draw` through `abstract` methods.

## Key Flows

**Subclass simulation step via `integrate`.** A subclass (e.g. `Asteroid`) in its `update(dt)` first applies its own specifics — for an asteroid this is `this.rotation += this.angularVelocity * dt` (for a bullet — `this.lifetime -= dt` and checking `if (this.lifetime <= 0) this.alive = false`). Then it calls `this.integrate(dt)`: the helper shifts `position` by `velocity * dt` and wraps coordinates via `wrapVec2(position, CANVAS.WIDTH, CANVAS.HEIGHT)`. Result — the entity correctly moves across the torus screen without duplicating wrap code in each subclass.

**Entity death.** When the "dead" condition fires (bullet `lifetime` expired, bullet hit an asteroid, ship collided with a UFO while not invulnerable), the responsible code (the subclass itself in `update(dt)` or `World` in collision resolution) simply sets `this.alive = false`. After handling all collisions, `World` filters lists with `list.filter(e => e.alive)` and removes dead objects. Memory is released by the GC on the next cycle.

**Creating a new entity to replace an old one.** Since `alive` is not reset to `true`, "resurrecting" the ship after death — is creating a new `Ship(...)` instance at the centre with an invulnerability timer, not resetting the flag on the old object. This eliminates a class of bugs where a "dead" entity accidentally remains in lists and continues to be processed after it has already been accounted for in points/lives.

**Drawing.** `GameScene.draw(ctx)` iterates all lists (`asteroids`, `bullets`, `ufos`, `particles`, `ship`) and calls `entity.draw(ctx)` for each. Dispatch is polymorphic: `Entity.draw` is abstract, so the concrete subclass implementation will be called, using `Renderer` utilities for vector lines.

## Dependencies

- **`vec2-math`** — vector types and operations: `Vec2`, `add`, `scale`, `wrapVec2`. Used in `integrate(dt)` and in the constructor (field typing).
- **`config`** — canvas dimensions `CANVAS.WIDTH` and `CANVAS.HEIGHT`, needed by `wrapVec2` in `integrate`.
- **Standard DOM (`CanvasRenderingContext2D`)** — only as the type parameter for `draw(ctx)`; the module itself does no rendering.

Reverse dependencies (who imports `Entity`): all entity modules — `Ship`, `Asteroid`, `Bullet`, `Ufo`, `Particle`. Also `World` and `CollisionSystem` may use the type `Entity` for generic lists and collision pairs (`CollisionEvent { a: Entity, b: Entity, … }`).

## Error Handling

- **Invalid constructor input (`radius < 0`, `NaN` coordinates).** This is a contract violation by the subclass — no checks are performed, the value is accepted as-is. A negative radius will be apparent immediately: collisions will stop firing, drawing will produce a visible artifact — the bug will be seen and caught in a dev build.
- **Attempting to "resurrect" an entity by assigning `alive = true`.** Not prohibited by the type, but prohibited by the contract: the intended transition is one-way `true → false`. A contract violation may result in a removed entity remaining in lists after it has already been processed in collisions. Protection — caller code discipline: "new entity = new instance", not mutation of the flag.
- **Exception in `update(dt)` or `draw(ctx)` of a subclass.** `Entity` catches nothing. The exception propagates up to the game loop's top-level try/catch (see `architecture.md`, "Error Handling"): in a dev build the game stops with a message; in prod it returns to `MenuScene`.
- **Downstream failure, partial success.** Not applicable: the module is synchronous, with no I/O and no external calls. `integrate(dt)` cannot "partially succeed" — it either completes or throws an exception on arithmetic (which means `NaN` in `position`/`velocity`, i.e. a caller bug, not this module's).

The module does not throw errors on its own: it throws no exceptions, only returns values or mutates its own fields.

## Stack & Libraries

- **TypeScript (ES2022 target), classes with `abstract`.** Language defined by architecture; `abstract class` and `abstract` methods have existed in TypeScript for a long time and compile to a regular ES2022 class with a "cannot instantiate" check at the type level. This is the only language feature the module requires.
- **No external libraries.** The module is a dozen lines on top of `vec2-math` and `config`; dependencies like `mitt`, `rxjs`, or an ECS framework are not needed.
- **No runtime checks.** No `if (radius < 0) throw` and similar: contracts are enforced by the TS compiler, and semantic violations (negative radius, `alive` reset to `true`) are caught visually in a dev build.
- **No object pooling.** Each subclass is created with regular `new` and deleted via `alive = false` + list filter; GC pressure from dozens of entities at 60 Hz is negligible.

## Configuration

The module has no external configuration — no env variables, secrets, or runtime settings. The only thing it reads externally during operation is `CANVAS.WIDTH` and `CANVAS.HEIGHT` from the `config` module in `integrate(dt)`, via a normal `import`. Changing these values requires editing `config.ts` and rebuilding the bundle.

The module defines no internal constants.

## Open Questions

- Whether to make `draw(ctx)` optional and provide an empty default implementation in `Entity` — for example, `Particle` is drawn as a single point/line and might want to skip its own method. For now kept strictly `abstract`; will reconsider when implementing `Particle`.
- Whether to add a common `kill(): void` method as syntactic sugar over `this.alive = false` (plus a potential place to emit an "entity died" event for explosion particles). Decision deferred until `Particle` and explosion effects are implemented.
- Whether to introduce general `angularVelocity` and `rotation` fields in `Entity` — used by `Asteroid` and indirectly by `Ship` (via `heading`). For now kept in subclasses to avoid carrying unused fields into `Bullet`/`Particle`; will reconsider if duplicate rotation code is found.
- Whether to parametrise `integrate(dt)` with a "wrap / no-wrap" flag in case some future entity (e.g. an off-screen spawner) should not wrap. Today all entities in the architecture wrap identically — the flag is not needed.
