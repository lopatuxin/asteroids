# Module — GameScene (World)

## Purpose
`GameScene` is the central game scene, implementing the `Scene` contract and simultaneously acting as the `World` aggregate from the architecture: it owns all live entities of the current session (ship, asteroids, bullets, UFOs, particles) and coordinates their lifecycle in a single tick. Without it no game mechanic starts: this is where input, physics, collisions, waves, scoring, and the transition to `GameOverScene` are wired together. All other game modules (`Ship`, `Asteroid`, `CollisionSystem`, `WaveManager`, `Scoring`, `HighScoreStorage`) do nothing in isolation — `GameScene` is what connects them.

## Responsibilities
- Stores flat entity lists for the session: `ship`, `asteroids`, `bullets`, `ufos`, `particles`.
- Holds satellite objects — `Scoring` (points, lives, wave number) and `WaveManager` (wave progression and UFO spawning).
- Receives a reference to `HighScoreStorage` and uses it only at game over (to pass the final score to `GameOverScene`).
- Implements the `Scene` interface: `enter() / exit() / update(dt, input) / draw(ctx) / handleInput(action)`.
- Each tick: applies player input to the ship, updates all entities, runs `CollisionSystem.detect`, resolves returned events (damage, split, particles, point awards, life loss).
- Filters entity lists by the `alive` flag — frees memory from dead objects at the end of each tick.
- Monitors the wave-clear condition and asks `WaveManager` to start the next wave.
- Calls `WaveManager.maybeSpawnUfo` and adds any returned `Ufo` to the list.
- Manages ship respawn: maintains `respawnTimer`, returns the ship to centre with invulnerability when it reaches zero; if no lives remain — transitions to `GameOverScene`.
- Draws the world and HUD: score, number of lives (as ship silhouettes), current wave.
- Pauses the game via `SceneManager.push(PauseScene)` on the `Pause` action.

### Non-Responsibilities
- Does not implement entity movement physics — `Ship/Asteroid/Bullet/Ufo/Particle` do that in their own `update(dt)`.
- Does not detect collisions itself — delegates to `CollisionSystem.detect(this)`.
- Does not decide how many asteroids are in which wave or when a UFO appears — that is `WaveManager`.
- Does not hold keyboard bindings or read `keydown` directly — only through `InputSystem`.
- Is not responsible for render primitives — uses `Renderer` utilities (`clearScreen`, `withWrap`, `drawText`).
- Does not write to `localStorage` — passes the final score to `GameOverScene`, which then works with `HighScoreStorage`.
- Does not draw the menu, pause screen, or game over screen — those are separate scenes.
- Does not own the game loop — its `update/draw` is called by `SceneManager`, which is driven by `GameLoop`.

## Public Interface
Class `GameScene implements Scene`:

- `constructor(deps: { input: InputSystem, scoring: Scoring, waveManager: WaveManager, highScores: HighScoreStorage, sceneManager: SceneManager, canvasSize: {w:number,h:number} })` — all dependencies are injected externally (convenient for tests and scene recreation).
- `enter(): void` — session initialisation: resets `Scoring`, spawns the ship at the centre with an invulnerability window, `waveManager.startWave(1)` → fills `asteroids`, zeroes all other lists.
- `exit(): void` — releases entity references (arrays are cleared), clears timers.
- `update(dt: number, input: InputSystem): void` — full simulation tick (detailed in Key Flows).
- `draw(ctx: CanvasRenderingContext2D): void` — world and HUD rendering.
- `handleInput(action: Action): void` — reserved for discrete actions (e.g. `Pause`) if `SceneManager` passes them directly; primary input reading happens through `input` inside `update`.

Internal (not public) methods used in the tick:

- `private applyInputToShip(input: InputSystem): void`.
- `private updateEntities(dt: number): void`.
- `private resolveCollisions(events: CollisionEvent[]): void`.
- `private compactEntities(): void` — filter by `alive`.
- `private checkWaveCleared(): void`.
- `private tickRespawn(dt: number): void`.
- `private spawnExplosion(at: Vec2, intensity: number): void`.
- `private drawHud(ctx): void`.

## Data Model
`GameScene` instance fields:

| Field | Type | Purpose |
|---|---|---|
| `ship` | `Ship \| null` | Current player ship; `null` during the time between death and respawn. |
| `asteroids` | `Asteroid[]` | Active asteroids of all sizes. |
| `bullets` | `Bullet[]` | All in-flight bullets — both player and UFO; distinguished by `bullet.source`. |
| `ufos` | `Ufo[]` | Active UFOs (in MVP — 0 or 1 simultaneously, but an array for uniformity). |
| `particles` | `Particle[]` | Explosion particles, short-lived. |
| `scoring` | `Scoring` | Points, lives, current wave, bonus lives. |
| `waveManager` | `WaveManager` | Wave generator and UFO spawner. |
| `highScores` | `HighScoreStorage` | Passed on to `GameOverScene`. |
| `input` | `InputSystem` | Source of key states and fresh presses. |
| `sceneManager` | `SceneManager` | Needed for `push(PauseScene)` and `replace(GameOverScene)`. |
| `respawnTimer` | `number` | Seconds until ship respawn after its death; `0` while the ship is alive. |
| `canvasSize` | `{w:number,h:number}` | World size (for the respawn centre and wrap-around in `draw`). |

Relations: `GameScene` aggregates all entities "by value" — they do not exist outside the scene. `Scoring` and `WaveManager` live as long as the scene (recreated in `enter`). `HighScoreStorage`, `InputSystem`, `SceneManager` — outlive the scene and come from outside.

## Key Flows

### 1. Scene entry — `enter()`
1. Resets `scoring` to its initial state (score 0, lives per `config.STARTING_LIVES`, wave 1).
2. Clears all entity lists.
3. Spawns `ship` at the screen centre with zero velocity and an invulnerability window (`invulnUntil = now + config.RESPAWN_INVULN`).
4. Calls `waveManager.startWave(1, ship.position)` and puts the returned asteroids into `asteroids`.
5. Zeroes `respawnTimer`.

### 2. Game tick — `update(dt, input)`
The sequence is strictly fixed:

1. **Input → ship.** If `ship` is not `null`:
   - `input.isDown(RotateLeft)` → `ship.rotate(-1, dt)`.
   - `input.isDown(RotateRight)` → `ship.rotate(+1, dt)`.
   - `input.isDown(Thrust)` → `ship.setThrust(true)`; otherwise `ship.setThrust(false)`.
   - `input.wasPressed(Fire)` → `const b = ship.fire()`; if not `null` — `bullets.push(b)`.
   - `input.wasPressed(Hyperspace)` → `ship.hyperspace()`.
   - `input.wasPressed(Pause)` → `sceneManager.push(new PauseScene())` and immediate `return` from `update` (the current tick is not completed, so that the pause feels instant).
2. **Entity updates.** For each element in all lists, `entity.update(dt)` is called. For UFOs additionally: `const b = ufo.tryFire(ship?.position)`; if not `null` — `bullets.push(b)`. If `ship` is `null`, the UFO receives `undefined`/`null` and decides itself whether to fire.
3. **Collisions.** `const events = CollisionSystem.detect(this)` — returns an event array with a `kind` field.
4. **Event resolution.** For each event — see the "Collision Resolution" subsection below.
5. **Compaction.** Each list is filtered by `alive`: `asteroids = asteroids.filter(a => a.alive)` etc. If `ship && !ship.alive` — `ship = null` (in addition to what was done in resolution).
6. **Wave.** If `asteroids.length === 0 && ufos.length === 0`:
   - `scoring.nextWave()` — increments the wave number and possibly awards a bonus life.
   - `const next = scoring.snapshot().wave`.
   - `const spawned = waveManager.startWave(next, ship?.position ?? center)` → `asteroids.push(...spawned)`.
7. **UFO spawn.** `const ufo = waveManager.maybeSpawnUfo(dt, this)`. If not `null` — `ufos.push(ufo)`.
8. **Respawn / game over.** If `ship === null && respawnTimer > 0`: `respawnTimer -= dt`; when `respawnTimer <= 0`:
   - If `scoring.isGameOver()` → `sceneManager.replace(new GameOverScene(scoring.snapshot(), highScores))`.
   - Otherwise — spawn a new `Ship` at the centre with an invulnerability window, `respawnTimer = 0`.

### 3. Drawing — `draw(ctx)`
1. `Renderer.clearScreen(ctx, canvasSize)` — fill with black.
2. For each entity: `Renderer.withWrap(ctx, entity.position, entity.radius, canvasSize, (offsetCtx) => entity.draw(offsetCtx))`. This draws the entity at both canvas edges when it "crosses" the boundary.
3. Draw order: `particles` → `asteroids` → `ufos` → `bullets` → `ship` (on top — the player's active objects).
4. HUD: `drawHud(ctx)` — score number at the top left, wave number at the top right, lives — a row of small ship silhouettes below the score (`scoring.snapshot().lives` of them). All via `Renderer.drawText` and primitives.

### 4. Collision Resolution
`CollisionSystem` returns events of the form `{ a, b, kind }`, where `kind` ∈ `{ bulletAsteroid, bulletUfo, bulletShip, shipAsteroid, shipUfo }`. Field `a.source` on a bullet distinguishes `bulletShip` vs `bulletUfo`.

- **bullet(ship) ↔ Asteroid.** `bullet.alive = false`; `ship?.onBulletExpired()` (the ship may account for the bullet freeing a reload slot); `asteroid.alive = false`; `asteroids.push(...asteroid.split())` (returns `[]` for `small`); `spawnExplosion(asteroid.position, asteroid.size)`; `scoring.addKill(asteroid.size)`.
- **bullet(ship) ↔ Ufo.** `bullet.alive = false`; `ship?.onBulletExpired()`; `ufo.alive = false`; `spawnExplosion(ufo.position, 'ufo')`; `scoring.addKill(ufo.kind)`.
- **bullet(ufo) ↔ Ship.** If `ship && !ship.isInvulnerable()`: `bullet.alive = false`; `ship.alive = false`; `spawnExplosion(ship.position, 'ship')`; `scoring.loseLife()`; `ship = null`; `respawnTimer = config.RESPAWN_DELAY`.
- **Ship ↔ Asteroid.** If `!ship.isInvulnerable()`: `ship.alive = false`; `asteroid.alive = false`; `asteroids.push(...asteroid.split())`; `spawnExplosion` on both; `scoring.loseLife()`; `ship = null`; `respawnTimer = config.RESPAWN_DELAY`. Points are not awarded for the asteroid that kills the player (see Open Questions).
- **Ship ↔ Ufo.** If `!ship.isInvulnerable()`: both `alive = false`; `spawnExplosion` on both; `scoring.loseLife()`; `ship = null`; `respawnTimer = config.RESPAWN_DELAY`.

All events from one tick are applied in one pass; duplicates for the same pair are impossible (guaranteed by `CollisionSystem`). Entity compaction follows resolution.

## Dependencies
- **`Ship`** — creation/respawn, calls `rotate / setThrust / fire / hyperspace / isInvulnerable / onBulletExpired`, reading `position`, `alive`.
- **`Asteroid`** — reading `alive`, `position`, `size`; calling `split()`.
- **`Bullet`** — reading `alive`, `source`; populating the list.
- **`Ufo`** — reading `alive`, `position`, `kind`; calling `tryFire(shipPos?)`.
- **`Particle`** — creating a batch in `spawnExplosion`, storing and updating.
- **`InputSystem`** — `isDown(action)`, `wasPressed(action)`; input source for the `ship`.
- **`CollisionSystem`** — `detect(scene) → CollisionEvent[]`; the single collision detection point.
- **`WaveManager`** — `startWave(n, shipPos) → Asteroid[]`, `maybeSpawnUfo(dt, scene) → Ufo | null`, optional `isCleared(scene)`.
- **`Scoring`** — `addKill(kind) / loseLife() / isGameOver() / nextWave() / snapshot()`.
- **`HighScoreStorage`** — passed only to `GameOverScene` at the end; the scene does not call its methods directly.
- **`SceneManager`** — `push(PauseScene)`, `replace(GameOverScene)`.
- **`Renderer`** — `clearScreen`, `withWrap`, `drawText`, primitives for life icons.
- **`config`** — constants `STARTING_LIVES`, `RESPAWN_DELAY`, `RESPAWN_INVULN`, canvas dimensions.
- **`PauseScene` / `GameOverScene`** — destination classes for transitions.

## Error Handling
Situations that may arise during normal scene operation and the response:

- **Input while ship is dead.** Any player actions (`Fire`, `Thrust`, `RotateLeft/Right`, `Hyperspace`) are ignored while `ship === null`. `Pause` works at any time.
- **`ship.fire()` returned `null`** (cooldown or bullet limit reached). The scene simply does not add a bullet, no error.
- **UFO fires, but ship is absent.** `ufo.tryFire(undefined)` — the UFO either doesn't fire or fires in a random direction (decision inside `Ufo`). The scene does not need to guarantee a target.
- **Collision with invulnerable ship.** `shipAsteroid` / `shipUfo` / `bulletShip` events are discarded: `ship.isInvulnerable()` protects. The asteroid/bullet remains alive — invulnerability does not "consume" enemies.
- **Simultaneous ship death and wave transition.** Order is strict: complete collision resolution → compaction → wave-clear check → respawn handling. Even if the ship dies while destroying the last asteroid, the next wave starts immediately and the respawn fires on the timer.
- **`respawnTimer` expired, but no lives remain.** Transition to `GameOverScene` via `sceneManager.replace`. The scene does not attempt to roll back the score.
- **Exception inside `entity.update` / `entity.draw`.** Not caught locally: the top-level `try/catch` in `GameLoop` (see architecture) will abort the frame and return to `MenuScene`. The scene does not attempt to continue with broken state.
- **Pause on top of the scene.** While `PauseScene` is on the stack, `GameScene.update` is not called (handled by `SceneManager`), but `draw` may be called — the scene draws the last frame. Internal timers that would continue ticking during a pause don't exist — all of them are updated only in `update`.
- **Player bullet limit.** Guaranteed on the `Ship.fire()` side (returns `null`). The scene does not count bullets itself.
- **Ship appears inside an asteroid after hyperspace.** The scene will detect this on the next tick through the normal `shipAsteroid` collision. No special handling needed.

## Stack & Libraries
- **Language and paradigm:** TypeScript, ES class `GameScene` implementing the `Scene` interface. No external libraries.
- **Canvas:** `CanvasRenderingContext2D` — all calls go through `Renderer` utilities; the scene does not touch low-level APIs directly.
- **State:** flat arrays and primitives — no observable/state managers; each game starts with a "clean" scene instance (via `enter`), simplifying invariants.
- **Validation/DI:** constructor DI through a `deps` object — makes the scene testable and reusable (e.g. a "new run" only requires creating a new scene with the same `input`/`highScores`).
- **Timers:** own `respawnTimer` field in seconds, decremented by `dt` in `update`. No `setTimeout` — everything through game ticks, to correctly freeze during pause.

## Configuration
The scene does not read environment variables. All settings come from `config.ts` and/or via DI:

| Name | Purpose | Default |
|---|---|---|
| `config.STARTING_LIVES` | Number of lives at the start of a session. | `3` |
| `config.RESPAWN_DELAY` | Seconds between ship death and respawn. | `2.0` |
| `config.RESPAWN_INVULN` | Seconds of invulnerability after respawn. | `2.5` |
| `config.CANVAS_WIDTH` / `config.CANVAS_HEIGHT` | Game field size (centre and wrap). | `800 / 600` |
| `config.HUD_MARGIN` | HUD margin from canvas edge. | `16` |
| `config.LIFE_ICON_SCALE` | Scale of the ship silhouette in HUD. | `0.6` |
| `import.meta.env.DEV` | Enables the diagnostic overlay (FPS, entity count). | build-dependent |

No secrets.

## Open Questions
- Whether to award points for an asteroid that kills the player in a `shipAsteroid` collision (the original didn't — currently that variant is chosen, but needs confirmation during tuning).
- Whether the `maybeSpawnUfo` timer should keep ticking while the ship is respawning, or pause — affects the "fairness" feel.
- Correct pause behaviour when `ship === null` and `respawnTimer` is active — should the timer resume from the same value after unpausing (currently — yes, since `update` is simply not called during pause).
- Whether a `bulletShip ↔ bulletUfo` collision is needed (mutual bullet destruction) — not in the original, not planned here, but worth documenting.
- Format of the final score passed to `GameOverScene`: full `snapshot()` or an extended object with history (e.g. maximum wave reached) — to be decided when designing `GameOverScene`.
- Whether to save state between `exit()` and a subsequent `enter()` (e.g. a "Retry" button from `GameOverScene`), or always create a new `GameScene` — current assumption: always a new instance.
