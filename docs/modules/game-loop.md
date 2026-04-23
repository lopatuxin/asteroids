# Module `game-loop`

## Purpose
Provides a stable game loop on top of `requestAnimationFrame` with a time accumulator and a fixed 60 Hz simulation step. Guarantees deterministic physics and collisions independent of the monitor's frame rate (60/120/144 Hz) and browser timing fluctuations. Without this module the simulation would be tied to the variable `dt` of the render, physics would "float" across different machines, and collisions would be missed during tab freezes.

## Responsibilities
- Requesting frames via `requestAnimationFrame` and measuring elapsed time via `performance.now()`.
- Accumulating the real frame delta and splitting it into fixed `SIMULATION.STEP` (1/60 s) simulation steps.
- Calling the `onUpdate(dt)` callback exactly as many times per frame as there are complete steps in the accumulator.
- Calling the `onRender()` callback exactly once per `rAF` frame, independent of the number of simulation steps executed.
- Clamping the frame delta from above with `SIMULATION.MAX_FRAME_TIME`, so that a long tab pause doesn't become an avalanche of simulation steps.
- Protection against "spiral of death": limiting the number of simulation steps per frame.
- Managing the loop lifecycle: `start()` / `stop()` with correct cancellation of the registered `rAF`.

### Non-Responsibilities
- Does not know about game objects, scenes, input, the canvas, or the drawing context — operates exclusively through the provided callbacks.
- Does not decide what is updated or drawn — that is `SceneManager`'s and `GameScene`'s responsibility.
- Does not manage game pausing (pause is the absence of updates in scenes, not stopping the loop); `stop()` is intended for application unmounting, not pausing.
- Does not interpolate state between steps — the renderer draws the "as-is" last simulated state (the `alpha` parameter for interpolation — see Open Questions).
- Does not measure FPS or provide telemetry — that is the optional dev-HUD's job.
- Does not catch errors inside callbacks as business logic — only a top-level protective `try/catch` (see Error Handling).

## Public Interface
One export from `src/core/game-loop.ts` — the `GameLoop` class.

- `new GameLoop(onUpdate: (dt: number) => void, onRender: () => void)` — constructor; accepts two callbacks and stores them in fields.
- `start(): void` — starts the loop. If already running — no-op. Initialises `lastTime` to the current `performance.now()`, zeroes `accumulator`, registers the first `requestAnimationFrame`.
- `stop(): void` — stops the loop. Cancels the registered `rafId` via `cancelAnimationFrame`, sets `running = false`. Repeated `stop()` — no-op.

Private method — `tick(now: number)` — the loop body, passed to `requestAnimationFrame` (via bound `this`).

## Data Model
The module is a stateful class with purely internal state; fields are not exposed.

| Field | Type | Purpose |
|---|---|---|
| `onUpdate` | `(dt: number) => void` | simulation step callback, called with fixed `dt = SIMULATION.STEP` |
| `onRender` | `() => void` | rendering callback, called once per `rAF` frame |
| `running` | `boolean` | active loop flag; used for `start/stop` idempotency |
| `rafId` | `number` | identifier returned by `requestAnimationFrame`, needed for `cancelAnimationFrame` |
| `lastTime` | `number` | previous tick timestamp in milliseconds (`performance.now()`) |
| `accumulator` | `number` | accumulated un-simulated time in seconds |

Constants used by the module: `SIMULATION.STEP` (1/60 s), `SIMULATION.MAX_FRAME_TIME` (0.25 s), local module constant `MAX_STEPS_PER_FRAME = 8` (spiral-of-death protection).

## Key Flows

1. **Loop start.** Bootstrap creates `new GameLoop(sceneManager.update.bind(sceneManager), sceneManager.draw.bind(sceneManager, ctx))` and calls `start()`. The module sets `running = true`, records `lastTime = performance.now()`, zeroes `accumulator`, registers `rafId = requestAnimationFrame(this.tick)`. From then on the loop runs on its own until `stop()`.

2. **Normal frame (dt ≈ 16 ms on a 60 Hz monitor).** The browser wakes `tick(now)`. `delta = (now - lastTime) / 1000`, `lastTime = now`. `delta` is clamped at `SIMULATION.MAX_FRAME_TIME` (if less — unchanged). `accumulator += delta` → approximately `0.0167`. Simulation loop runs: `accumulator (≈0.0167) >= STEP (≈0.0167)` — one call to `onUpdate(STEP)`, `accumulator -= STEP` → ≈0. Loop ends, `onRender()` is called, the next `rAF` is registered.

3. **Frame on a 144 Hz monitor (dt ≈ 7 ms).** The accumulator does not build up a full step per `rAF` frame (`0.007 < 0.0167`), `onUpdate` is not called, `onRender()` fires with the previous simulation state. On the next-second frame the accumulator crosses `STEP`, one `onUpdate` fires, and so on — on average one simulation step per ~2.4 render frames. Simulation stays at 60 Hz, rendering at 144 Hz.

4. **Long freeze / return from background tab.** The browser didn't wake `rAF` for several seconds; `now - lastTime` is huge. Raw `delta` would be, say, 10 seconds → 600 simulation steps in one frame, locking up the loop. Protection fires in two stages: `delta` is clamped to `MAX_FRAME_TIME = 0.25 s` (up to 15 steps), then an internal `steps` counter during accumulator draining breaks the loop at `steps > MAX_STEPS_PER_FRAME` (8), discarding the remaining `accumulator`. The game loses a bit of "debt" but continues running.

5. **Stop.** Someone from above (e.g. the `beforeunload` handler or a test) calls `stop()`. The module calls `cancelAnimationFrame(rafId)`, `running = false`. An already-started `tick` (if the browser managed to launch it) will complete — but since after `onRender()` it registers a new `rAF` only if `running`, the next frame won't be queued.

Tick pseudocode:

```
tick(now):
  if (!running) return
  delta = (now - lastTime) / 1000
  lastTime = now
  if (delta > MAX_FRAME_TIME) delta = MAX_FRAME_TIME
  accumulator += delta
  steps = 0
  while (accumulator >= STEP):
    safeCall(() => onUpdate(STEP))
    accumulator -= STEP
    steps++
    if (steps > MAX_STEPS_PER_FRAME):
      accumulator = 0   // discard debt
      break
  safeCall(() => onRender())
  if (running) rafId = requestAnimationFrame(tick)
```

## Dependencies
- **`config`** — reads `SIMULATION.STEP` and `SIMULATION.MAX_FRAME_TIME`. Nothing else.
- **Browser APIs** — `window.requestAnimationFrame`, `window.cancelAnimationFrame`, `performance.now()`. Available by default in any modern browser — the target platform from the concept (desktop browser).
- **Consumers** — `Bootstrap` (creates and starts), `SceneManager` (its `update/draw` methods are passed as callbacks). The module itself knows nothing about them.

## Error Handling
- **Exception inside `onUpdate` or `onRender`.** Caught by a top-level `try/catch` around each callback call (`safeCall` in the pseudocode). Behaviour depends on the build:
  - **dev (`import.meta.env.DEV === true`)**: the exception is logged to `console.error` with the prefix `[loop]` and **re-thrown** — the loop crashes, the browser shows the error in DevTools, the developer sees the problem immediately.
  - **prod**: the exception is logged to `console.error` but **swallowed** — the loop continues so the player doesn't hit a "black screen" due to a single edge-case error. As per the agreement in `architecture.md`, the top-level handler in bootstrap may decide to return the user to `MenuScene` on systematic crashes, but that is outside `GameLoop`'s responsibility.
- **Long tab pause / process freeze.** `MAX_FRAME_TIME` clips the accumulated delta; `MAX_STEPS_PER_FRAME` clips the number of simulation steps per frame. The game loses some "game time" but doesn't enter the spiral of death.
- **Repeated `start()` when the loop is already running** / **repeated `stop()` when already stopped.** Both are idempotent, no-op.
- **Invalid `rafId` in `cancelAnimationFrame`** (e.g. `stop()` before `start()`) — the browser API is tolerant of unknown ids and does not throw; no additional check needed.
- **Partial success.** Within a single frame it is possible: some `onUpdate` steps completed, the next one crashed (in prod — swallowed), `onRender` executes on top of a partially updated state. This is acceptable: visually the player sees one "smeared" frame, and simulation continues ticking.

## Stack & Libraries
- **TypeScript, ES2022 class** — the module is narrow; no external libraries; the class is chosen for explicit state ownership (`running`, `rafId`, `accumulator`, `lastTime`) and to bind `tick` to `this` via an arrow field.
- **`performance.now()`** — monotonic high-precision timestamps; `Date.now()` is unsuitable (can go backwards when system time is adjusted).
- **`requestAnimationFrame`** — the standard mechanism for synchronising with the vertical refresh, matching the decision in `architecture.md`.
- No libraries like `mainloop.js` — the implementation fits in ~50 lines; own code is simpler to maintain and test.

## Configuration
The module has no env variables, secrets, or runtime settings. All behaviour is determined by:
- Constants from the `config` module:
  - `SIMULATION.STEP` (1/60 s) — fixed simulation step; the default value is dictated by the 60 Hz canon.
  - `SIMULATION.MAX_FRAME_TIME` (0.25 s) — frame delta ceiling; default 250 ms (empirical compromise: enough to survive a rare GC pause, small enough to prevent an avalanche of steps after a long freeze).
- Local module constant `MAX_STEPS_PER_FRAME` (8) — ceiling on the number of simulation steps per `rAF` frame, protection against spiral of death. Derived empirically: at 60 Hz this is ~133 ms to "catch up" per frame — more than typically occurs during normal operation, but less than `MAX_FRAME_TIME / STEP = 15`, providing a margin.
- Build flag `import.meta.env.DEV` — determines whether a caught exception is re-thrown or only logged.

## Open Questions
- **`alpha` parameter for render interpolation.** `architecture.md` mentions `onRender(alpha)` — the fraction of the next simulation step (`accumulator / STEP`), needed to smooth rendering on 144 Hz monitors. In the current module API `onRender` has no parameters. Whether to introduce `alpha` now or defer until noticeable jitter appears on high-refresh monitors — to be decided during `GameScene.draw` implementation.
- **Behaviour on tab switch.** `requestAnimationFrame` in an inactive tab is suspended by the browser; on return we get one frame with a huge delta. The current design simply loses this time. Alternative — listen to `document.visibilitychange` and explicitly "freeze" the game (transition to `PauseScene`). This is outside the module's responsibility, but the API should be convenient for external management.
- **Value of `MAX_STEPS_PER_FRAME = 8`** — chosen by intuition; it may make sense to move it to `config.SIMULATION` alongside `MAX_FRAME_TIME` for uniform tuning.
- **Tests.** By the general decision (`architecture.md`) there are no tests, but the game loop is the most obvious unit-testing candidate (a deterministic function of a sequence of `now` timestamps). If tests are added, `performance.now` and `requestAnimationFrame` would need to be injectable dependencies.
