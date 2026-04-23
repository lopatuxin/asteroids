# Architecture — Asteroids

## Overview
A single-player browser arcade game in the spirit of Atari Asteroids (1979), implemented in TypeScript + Canvas 2D and bundled by Vite into a static build. The application is a pure front-end with no server-side: all game logic (physics, collisions, waves, scoring) executes in the browser's main thread; the only external storage is `localStorage` for the high-score table. The architectural core is a stable game loop with a fixed simulation step on top of `requestAnimationFrame` and a scene state stack (menu / game / pause / game over). The code style is classic OOP: every game entity (Ship, Asteroid, Bullet, Ufo, Particle) implements the common contract `update(dt) / draw(ctx)`. Graphics — only vector lines on Canvas 2D, no assets, sounds, or external fonts.

## Key Architectural Decisions
- **Canvas 2D instead of WebGL/PixiJS** — the volume of graphics (dozens of lines per frame) is trivially handled by `CanvasRenderingContext2D`; WebGL would be overkill and would complicate the build.
- **Vite as the bundler** — provides native TypeScript support, a dev server with HMR, and minimal configuration for a single-page project; the production artifact is static files.
- **Fixed 60 Hz simulation step on top of `requestAnimationFrame`** — deterministic physics and collisions are independent of the monitor's refresh rate; rendering runs at the browser's pace, simulation runs at a fixed `dt = 1/60` via a time accumulator. 60 Hz is sufficient for this game; 120 Hz would give smoother physics but double the load without a noticeable benefit.
- **Classic OOP, no ECS** — the number of entity types is small, relationships are simple; a full ECS adds more complexity than it saves.
- **Scene stack (state machine)** — transitions menu ↔ game ↔ pause ↔ game over map naturally onto a state stack with `enter/exit/update/draw/handleInput` methods.
- **Unified base contract `Entity`** — all game objects are updated and drawn uniformly; World stores them in flat lists and iterates with a single loop.
- **Circle-to-circle collisions, no broad-phase structures** — with the expected number of objects (units to tens), naive O(n²) over pairs is cheaper than maintaining a quad-tree.
- **Torus screen (wrap-around)** — coordinates are normalized modulo canvas size in one place (Renderer + update), without special geometry.
- **`localStorage` as the only persistent storage** — required by the concept; abstracted by a thin adapter to isolate it from the rest of the code.
- **No external assets** — rendering is fully procedural (lines + `fillText` in monospace), which eliminates the loading stage and simplifies deployment.

## Components

**Bootstrap (main.ts + index.html)** — entry point: creates `<canvas>`, instantiates `GameLoop`, `SceneManager`, and the starting scene (MenuScene), attaches the input system to `window`. Owns the root application objects. Interface — a single `bootstrap()` function called on page load. Depends on all core subsystems.

**GameLoop** — responsible for the `requestAnimationFrame` loop with a time accumulator and a fixed simulation step. Owns accumulated time and the previous timestamp. Provides `start() / stop()` methods, accepts `onUpdate(dt)` and `onRender(alpha)` callbacks. Knows nothing about game objects.

**SceneManager (scene stack)** — holds a stack of active scenes and delegates `update/draw/handleInput` to the top scene. Owns the `Scene[]` stack. Interface: `push(scene) / pop() / replace(scene) / update(dt) / draw(ctx) / handleInput(event)`. Depends on the `Scene` interface. Pause is implemented by pushing `PauseScene` on top of `GameScene` — the lower scene continues to render but does not update.

**Scene (interface)** — base screen contract: `enter() / exit() / update(dt) / draw(ctx) / handleInput(action)`. Concrete implementations: `MenuScene`, `GameScene`, `PauseScene`, `GameOverScene`.

**GameScene / World** — central game scene: owns lists of entities (ship, asteroids, bullets, ufos, particles), current score, lives count, a reference to `WaveManager`, `CollisionSystem`, and `Scoring`. In `update(dt)` it runs all entities, triggers collisions, checks wave transition and game-over conditions. In `draw(ctx)` it renders all entities and the HUD. Depends on `InputSystem`, `CollisionSystem`, `WaveManager`, `Scoring`, `HighScoreStorage`.

**Entity (base class/interface)** — common contract for all game objects: fields `position: Vec2`, `velocity: Vec2`, `radius: number`, `alive: boolean`; methods `update(dt)`, `draw(ctx)`. Concrete subclasses add their own state and behavior.

**Ship** — the player's ship. Owns the rotation angle (`heading`), thrust and fire flags, a reload timer, a post-respawn invulnerability counter, and a hyperspace cooldown timer. `update(dt)` applies inertia, thrust along the heading vector, and wrap-around; `draw(ctx)` — a triangle in lines, with a flame tongue when thrusting. Provides `rotate(dir) / thrust(on) / fire() → Bullet? / hyperspace()` methods. Hyperspace is an instant teleport to a random screen location with a small chance of a "failed jump" (appearing on an asteroid), with a cooldown after use. No more than 4 player bullets in the air simultaneously (creation limited in `fire()`).

**Asteroid** — an asteroid of one of three sizes (large/medium/small). Owns the size, shape (polygon of random radii for a rough look), and angular velocity. `update(dt)` moves and rotates; `draw(ctx)` — a closed polyline. Method `split() → Asteroid[]` returns two smaller asteroids on destruction (or an empty array for small).

**Bullet** — a bullet with a limited lifetime (TTL). Owns `lifetime`, a source flag (`fromShip | fromUfo`). `update(dt)` moves at constant speed and decreases `lifetime`; when it reaches zero — `alive = false`.

**Ufo** — a UFO in one of two types (large/small, affecting accuracy and points). Owns an AI direction-change timer and a fire timer. `update(dt)` moves across the screen, periodically changing course and shooting at the enemy; `draw(ctx)` — a stylized silhouette in lines.

**Particle** — a short-lived particle for an explosion effect (a line or point with TTL and fade). Owns `lifetime`, color/brightness. Created in batches on asteroid/ship/UFO destruction. Part of MVP.

**InputSystem** — listens to `keydown/keyup` on `window`, maps keys to abstract actions (`RotateLeft`, `RotateRight`, `Thrust`, `Fire`, `Hyperspace`, `Pause`, `Confirm`). Owns the binding table and the current state of held actions. Interface: `isDown(action) → bool`, `onPressed(action, cb)`, `consumeEvent(event)`. The active scene reads the input state each tick.

**CollisionSystem** — checks circle intersections for relevant pairs: bullet(ship)↔asteroid, bullet(ship)↔ufo, bullet(ufo)↔ship, ship↔asteroid, ship↔ufo. Does not own data; works with references to World's entity lists. Interface: `detect(world) → CollisionEvent[]`, where an event is a pair of colliding entities. Collision resolution (removal, asteroid split, scoring, life loss) is done in World using the event list.

**WaveManager** — manages waves: stores the current wave number, generates the starting set of asteroids (large size, scattered around screen edges, no closer than a given radius to the ship), decides when to spawn a UFO (by timer/probability depending on wave number). Interface: `startWave(n) → Asteroid[]`, `maybeSpawnUfo(dt, world) → Ufo?`, `isCleared(world) → bool`.

**Scoring** — holds current score, lives count, kill awards (points depend on asteroid size and UFO type). Interface: `addPoints(kind)`, `loseLife()`, `isGameOver() → bool`, `snapshot() → {score, lives, wave}`. Bonus life awarding at score thresholds is handled here.

**HighScoreStorage** — a thin adapter over `localStorage`: serializes/deserializes the array of `{name, score, date}` records, sorts and trims to top-10. The player name is exactly 3 characters in arcade style (AAA). Interface: `load() → Score[]`, `trySubmit(score, name) → boolean` (true if ranked in top-10), `clear()`. The only point of interaction with `window.localStorage`.

**Renderer (utilities)** — a set of functions for drawing on `CanvasRenderingContext2D`: vector primitives (polyline, triangle, circle outline), wrap-around drawing (an object near the edge is also drawn offset by the canvas size to correctly show "crossing"), monospace text. No state. Used by scenes and `draw(ctx)` methods of entities.

**Vec2 and math utils** — a 2D vector with add/sub/scale/rotate/length/normalize operations and utilities (random number in range, wrap-modulo, powers and clamps). Stateless, pure functions/immutable values.

## Data Flows

**Game loop tick.** `requestAnimationFrame` wakes `GameLoop`, which calculates elapsed time since the last frame and adds it to the accumulator. While the accumulator ≥ the fixed step (e.g. 1/60 s), `SceneManager.update(dt)` is called with that fixed `dt`, and the accumulator is decremented. The top scene (usually `GameScene`) reads `InputSystem` state, applies actions to the ship (rotation, thrust, fire, hyperspace), then runs `update(dt)` on all entities, then `CollisionSystem.detect(world)`, then resolves collisions (kills entities, splits asteroids, spends a life, adds points and particles), then asks `WaveManager`: is the wave cleared, should a UFO be spawned? After all simulation steps, `SceneManager.draw(ctx)` is called once — the active scene draws the world and HUD via Renderer utilities.

**Player input → entity action.** A keyboard event is caught by `InputSystem` at the `window` level, translated to an action via the binding table, and updates the internal state (set of held actions, queue of just-pressed). On the next tick, `GameScene` reads `InputSystem.isDown(Thrust)`, `isDown(RotateLeft)` and calls the corresponding `Ship` methods; `onPressed(Fire)` triggers an attempt to create a `Bullet` respecting the reload timer; `onPressed(Pause)` executes `SceneManager.push(PauseScene)` and further simulation ticks are frozen.

**Wave end and next wave spawn.** After collision resolution, `GameScene` calls `WaveManager.isCleared(world)`. If no asteroids remain and there are no active UFOs, `WaveManager` increments the wave number, generates a new `Asteroid[]` via `startWave(n+1)` — with increased count and/or speed — and World adds them to its list. In parallel, `WaveManager.maybeSpawnUfo(dt, world)` on each tick probabilistically decides whether to add a UFO.

**Game over and high score.** When `Scoring.isGameOver()` becomes true (lives exhausted after the last collision), `GameScene` calls `SceneManager.replace(GameOverScene)`, passing the final score. `GameOverScene` calls `HighScoreStorage.trySubmit(score, name)`; the adapter reads the current array from `localStorage`, inserts the record, sorts by descending score, trims to top-N, and writes back. The scene displays the high-score table; pressing `Confirm` returns to `MenuScene`.

## Data Model (Top Level)

Game state lives in tab memory and is represented by objects:

- `World { ship: Ship?, asteroids: Asteroid[], bullets: Bullet[], ufos: Ufo[], particles: Particle[], score: number, lives: number, wave: number }` — aggregate of the active game session.
- `Entity { position: Vec2, velocity: Vec2, radius: number, alive: boolean }` — common skeleton.
- `Ship extends Entity { heading: number, thrusting: boolean, cooldown: number, invulnUntil: number }`.
- `Asteroid extends Entity { size: 'large' | 'medium' | 'small', shape: number[], angularVelocity: number }`.
- `Bullet extends Entity { lifetime: number, source: 'ship' | 'ufo' }`.
- `Ufo extends Entity { kind: 'large' | 'small', directionTimer: number, fireTimer: number }`.
- `Particle extends Entity { lifetime: number }`.
- `InputBindings { [keyCode: string]: Action }` — mapping table.
- `Action` — enum of abstract actions.
- `CollisionEvent { a: Entity, b: Entity, kind: 'bulletAsteroid' | 'shipAsteroid' | 'bulletShip' | 'shipUfo' | 'bulletUfo' }`.

Persistently — only the high-score table in `localStorage` under the key `asteroids.highscores`:

- `ScoreEntry { name: string, score: number, date: string }`.
- `HighScores = ScoreEntry[]` — sorted by descending score, length capped (e.g. top-10).

Relations: `World` 1↔0..1 `Ship`, 1↔* `Asteroid/Bullet/Ufo/Particle`. `WaveManager` and `Scoring` are `World` satellites, not containing entities. `HighScoreStorage` is connected only to `GameOverScene`.

## Stack

- **Language: TypeScript** — types catch errors at scene/entity transitions and make refactoring safe.
- **Rendering: Canvas 2D (`CanvasRenderingContext2D`)** — the volume of graphics is trivial, the API is built into the browser, no asset pipeline is needed.
- **Build: Vite** — native TS support, fast dev server with HMR, production build to pure statics with a single command.
- **Game loop: `requestAnimationFrame` + time accumulator** — standard approach for deterministic simulation over variable render frequency.
- **Paradigm: classic OOP (ES2022 classes, inheritance from `Entity`)** — small number of entity types, simple relations, ECS is excessive.
- **Storage: `window.localStorage`** — the only thing needed persistently (records), available without dependencies.
- **No tests** — educational project, small; correctness is verified by manual play-testing.
- **Lint/format: ESLint + Prettier** — standard for TS projects, keeps code uniform.
- **Font: system monospace via CSS + `ctx.font`** — no external fonts, retro style is preserved.
- **Assets: none** — rendering is purely procedural, no sounds.

## Cross-Cutting Concerns

**Authentication.** Absent: the game is single-player and offline. When entering the high-score table the player types a short nickname (3 characters in the style of the original) — stored only locally, not an account.

**Logging.** In dev builds — `console.log/warn/error` with subsystem prefix (`[loop]`, `[input]`, `[collision]`). In production builds logging is suppressed via the Vite environment flag (`import.meta.env.DEV`). No external logging services.

**Error handling.** Errors accessing `localStorage` (e.g. private mode, quota exceeded) are caught inside `HighScoreStorage` and lead to graceful degradation — the high-score table is treated as empty, writes are ignored, the user sees no error. Exceptions in `update/draw` in dev builds stop the game with an informative message; in production they are caught by a top-level try/catch around the game loop tick, and the game returns to `MenuScene`.

**Configuration.** All game constants (ship speed, thrust force, bullet lifetime, asteroid sizes, starting lives, wave thresholds, kill scores, leaderboard size) are placed in a separate `config.ts` module as named constants. No runtime configuration from external sources. Keyboard bindings are a constant in that same module.

**Observability.** Limited to dev tools: an optional HUD overlay in dev builds showing FPS, number of active entities, and current wave number. In production — only the game HUD (score, lives). No metrics or telemetry are sent externally.

## Deployment Topology

The production artifact is a set of static files produced by `vite build`: `index.html`, one JS bundle, one CSS (minimal, only canvas layout and background). All components live in this bundle and execute in the user's browser main thread. No server, no backend, no API calls. The artifact can be opened as a local file or served from any static host (GitHub Pages, Netlify, nginx — any); the CI/CD pipeline amounts to "build and upload the `dist/` folder". Game state and records live in tab memory and `localStorage` of the same origin; changing browser or clearing site data loses the records. Dev build — `vite dev` with HMR, same file structure, same code.

## Open Questions

- Exact balance values (speeds, sizes, asteroids per wave, UFO frequency, bonus life thresholds, hyperspace cooldown and "failed jump" probability) — subject to tuning after the first playable build.
- Support only arrow keys or both arrows and WASD simultaneously — to be decided at the `InputSystem` module stage.
