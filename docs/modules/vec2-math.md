# Module — vec2-math

## Purpose

The module provides the fundamental building block of all game physics and geometry — a two-dimensional vector `Vec2` and a set of general-purpose mathematical utilities (random numbers in a range, `clamp`, modular `wrap`, `lerp`, degree-to-radian conversion and back). Without it no game entity can correctly move, rotate, or "cross" the screen-torus edge; circle-to-circle collision detection and ship thrust along the nose direction also rely on this module. The module contains no state and depends on nothing beyond the standard ES2022 library.

## Responsibilities

- Defining the shape of a two-dimensional vector `Vec2` as an immutable value.
- Basic vector operations: addition, subtraction, scalar multiplication, dot product, length and squared length, normalisation, rotation by an angle, distance between points.
- Scalar math utilities: `clamp(x, min, max)`, `lerp(a, b, t)`, `wrap(x, size)` (non-negative modulus), `randomRange(min, max)`, `randomInt(min, max)`.
- Angle conversion: `degToRad(deg)`, `radToDeg(rad)`.
- Pure functions without side effects or hidden state: all operations return a new value without mutating inputs.

### Non-Responsibilities

- The module does not handle collisions (that is `CollisionSystem`'s job), knows nothing about circles, rectangles, or AABBs.
- Does not implement matrices, quaternions, 3D vectors, or any linear algebra beyond basic `Vec2` operations.
- Does not contain Canvas 2D-specific functions (context rotation, matrix transforms) — that is `Renderer`'s domain.
- Does not hold or cache any values between calls; does not provide object pools for reuse.
- Does not perform runtime validation of arguments (NaN, infinities, wrong types) — correctness is guaranteed by the TypeScript type system at compile time.
- Does not encapsulate a random number generator with its own seed — uses the global `Math.random()`.

## Public Interface

Vector type and factory:

- `type Vec2 = { readonly x: number; readonly y: number }` — an immutable coordinate pair.
- `vec2(x: number, y: number): Vec2` — factory creating a new vector. Equivalent to the literal `{ x, y }`, but more convenient in calls.
- `ZERO: Vec2` — the constant `{ x: 0, y: 0 }`, a single shared instance.

Vector operations (all return a new `Vec2`, do not mutate inputs):

- `add(a: Vec2, b: Vec2): Vec2` — component-wise sum.
- `sub(a: Vec2, b: Vec2): Vec2` — component-wise difference.
- `scale(v: Vec2, k: number): Vec2` — multiplication by a scalar.
- `dot(a: Vec2, b: Vec2): number` — dot product.
- `length(v: Vec2): number` — vector length, `sqrt(x*x + y*y)`.
- `lengthSq(v: Vec2): number` — squared length, without `sqrt`, for distance comparisons.
- `normalize(v: Vec2): Vec2` — unit vector of the same direction; for the zero vector returns `ZERO` (see Error Handling).
- `rotate(v: Vec2, angleRad: number): Vec2` — rotation by an angle in radians around the origin.
- `fromAngle(angleRad: number, length: number = 1): Vec2` — vector of the given length in the direction of the angle (convenient for the ship's nose direction).
- `distance(a: Vec2, b: Vec2): number` — distance between two points.
- `distanceSq(a: Vec2, b: Vec2): number` — squared distance, for collisions.

Scalar utilities:

- `clamp(x: number, min: number, max: number): number` — clamps a number to a range.
- `lerp(a: number, b: number, t: number): number` — linear interpolation; `t` is not clamped.
- `wrap(x: number, size: number): number` — non-negative modulus: result is always in `[0, size)` even for negative `x`.
- `wrapVec2(v: Vec2, width: number, height: number): Vec2` — component-wise `wrap` for coordinates on the canvas-torus.
- `randomRange(min: number, max: number): number` — a random floating-point number in `[min, max)`.
- `randomInt(min: number, max: number): number` — a random integer in `[min, max]` inclusive.
- `degToRad(deg: number): number`, `radToDeg(rad: number): number` — angle conversion.

## Data Model

The primary type — `Vec2`:

```
type Vec2 = { readonly x: number; readonly y: number }
```

Fields:

- `x: number` — horizontal coordinate in canvas pixels (0 is the left edge).
- `y: number` — vertical coordinate (0 is the top edge, y grows downward, as is standard in Canvas 2D).
- Both fields are marked `readonly` — mutation of a vector after creation is forbidden at the type level.

The `{ x, y }` object variant was chosen over a "tuple `[number, number]`" or "two separate `number, number` parameters":

- An object with named fields reads significantly more clearly in calls (`position.x + velocity.x * dt` vs. `position[0] + velocity[0] * dt`), which matters with a large number of physics formulas.
- The base `Entity` contract from the architecture already describes `position: Vec2, velocity: Vec2` as standalone values — this naturally fits a struct object.
- Two separate numbers in signatures would force calling code to constantly pack/unpack values, which is worse for both readability and error resistance (easy to mix up the order).
- The overhead of creating small objects at 60 Hz with tens of entities is negligible; premature optimisation via tuples or typed arrays is not justified for this project.
- No indexes or relations (the module has no state); no persistence either.

## Key Flows

**Vector rotation `rotate(v, angle)`.** From the input vector `{x, y}` and the angle in radians, `cos` and `sin` are computed once, then the standard rotation formula is applied: new `x' = x * cos - y * sin`, new `y' = x * sin + y * cos`. A new `Vec2` is returned. The function is used, for example, to build the ship's nose vector: `fromAngle(ship.heading, 1)` is internally implemented as `rotate({x: 1, y: 0}, heading)` or directly via `cos`/`sin`.

**Coordinate wrap via `wrapVec2(v, width, height)`.** For entities to seamlessly "cross" the canvas-torus edge, after updating `position += velocity * dt`, `wrapVec2` is called. Internally `wrap(x, size)` is applied to each component: `((x % size) + size) % size`. The double modulus is needed because `%` in JavaScript gives a negative remainder for negative numbers, and we need a non-negative result in `[0, size)`. The result — position is always correctly "wrapped" regardless of how far the entity went past the edge (and even at excessive speeds).

**Normalisation `normalize(v)`.** `len = length(v)` is computed; if `len` is zero (or very close to zero — below a fixed `EPSILON`, e.g. `1e-9`), `ZERO` is returned to avoid division by zero and `NaN` contamination of the game state. Otherwise `{ x: v.x / len, y: v.y / len }` is returned.

**Generating a random point on screen.** `WaveManager` when creating asteroids calls `vec2(randomRange(0, width), randomRange(0, height))`; `Ship.hyperspace()` uses the same combination for choosing a random new position. No state between calls — each call is independent.

## Dependencies

None. The module imports nothing beyond the language's built-in `Math.*` and `Math.random`. It is, conversely, imported by virtually every other module in the project: `Entity`, `Ship`, `Asteroid`, `Bullet`, `Ufo`, `Particle`, `CollisionSystem`, `WaveManager`, `Renderer`.

## Error Handling

- **Division by zero when `normalize` is called on the zero vector.** Scenario: the ship is stationary, `velocity = {x: 0, y: 0}`, and some code asks for its direction of movement. Response: the function returns `ZERO` instead of a `NaN` vector. This protects the physics from `NaN` "infection" — a single `NaN` in a position immediately corrupts all subsequent calculations and collisions for many frames. The comparison threshold is a small `EPSILON` to catch both the formal zero and a practical zero from accumulated floating-point error.
- **`wrap(x, size)` when `size <= 0`.** This scenario is considered impossible by the type contract (canvas size is always a positive number); there is no runtime check. With `size === 0` the result will be `NaN` — an acceptable fail-fast in a dev build that will immediately surface in the game loop's top-level try/catch.
- **`randomInt(min, max)` when `min > max`.** A contract violation; no runtime checks. Behaviour is undefined (may return `min` or something out of range); correctness is the caller's responsibility.
- **Invalid numbers on input (`NaN`, `Infinity`).** Not filtered. The module passes them through transparently; `NaN` in vectors is assumed to be a bug in the calling code and should be caught there, not obscured here.
- **Downstream failure, partial success** — not applicable: the module is synchronous with no I/O, no async, and no external dependencies.

The module throws no errors externally: it throws no exceptions, only returns values.

## Stack & Libraries

- **TypeScript (ES2022 target).** Language dictated by the architecture. `readonly` fields on `Vec2` enforce immutability at the type level.
- **No external libraries** (`gl-matrix`, `vec2`, `ramda`, etc.). The module code is tens of lines; pulling in a dependency for five formulas is pointless, and it keeps the bundle size minimal.
- **Only `Math.*` from the standard library** — `Math.sin/cos/sqrt/abs/floor/random/PI`. Sufficient for all operations.
- **No runtime argument validation.** No `if (typeof x !== 'number') throw` — the compiler enforces type correctness. In a dev build, invalid inputs will manifest as `NaN` in game state and will be caught visually or by the top-level try/catch.
- **No object pool.** Each operation returns a new `Vec2` literal. GC pressure at this scale (tens of entities × a few vector ops per tick × 60 Hz) is negligible and is not worth the loss of readability from a mutable API.

## Configuration

The module does not read environment variables and has no external settings. The only internal constants:

- `EPSILON: number` — threshold for comparing a vector's length to zero in `normalize`. Default value — `1e-9`. Purpose — avoid division by zero with numerically near-zero vectors.
- `ZERO: Vec2` — the singleton constant `{ x: 0, y: 0 }`. Purpose — a common "zero" vector for returning from `normalize(0)` and for comparisons.

No secrets, env variables, or external services.

## Open Questions

- Whether to define a separate `TAU = 2 * Math.PI` constant in this module or leave `Math.PI * 2` at call sites. Will be decided if frequent repetition appears in entity code.
- The threshold `EPSILON = 1e-9` — chosen by intuition; if numerical artefacts appear in physics (e.g. a stationary ship drifting), it may need to be raised to `1e-6`.
- The name `wrap` is short and potentially conflicts with the familiar semantics in other libraries; possibly rename to `wrapMod` or `wrapUnsigned` for clarity. Decision — after the first pass through calling modules' code.
- Whether to add `clampVec2(v, min, max)` and `lerpVec2(a, b, t)` as separate functions, or let clients compose them from the scalar versions. For now not added — no direct consumers visible in the architecture.
