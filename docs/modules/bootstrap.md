# Module `bootstrap`

## Purpose
The application entry point: the HTML page and initialisation function that assemble the root game objects (canvas + 2D context, `InputSystem`, `SceneManager`, `GameLoop`) and start the game loop with the initial `MenuScene`. Without this module the project literally cannot start — all other subsystems are self-contained as classes, but something must create them, wire them together, and deliver the first frame. The build configuration (`vite.config.ts`, TypeScript, `package.json`) also lives here, defining the source structure and the output artifact.

## Responsibilities
- Providing `index.html` with a single `<canvas id="game">` and a `<script type="module" src="/src/main.ts">` tag, plus minimal CSS (black background, centred canvas, no scrollbars).
- Defining the `bootstrap()` function in `src/main.ts`, which performs initialisation in a strictly fixed order (see Key Flows).
- Obtaining the canvas DOM node by `id="game"` and setting `canvas.width` / `canvas.height` from `CANVAS.WIDTH` / `CANVAS.HEIGHT` in the `config` module.
- Obtaining `CanvasRenderingContext2D` and passing it to `GameLoop.onRender` through `SceneManager`.
- Creating and wiring the root application singletons: `InputSystem` (with `attach(window)`), `SceneManager`, `GameLoop`.
- Pushing the initial `MenuScene` onto the scene stack, passing it its dependencies (input, scene manager, and whatever else the scene needs).
- Starting `GameLoop.start()` and performing graceful cleanup on `beforeunload` (`loop.stop()`, `input.detach()`).
- Owning the build configuration files (`vite.config.ts`, `tsconfig.json`, `package.json`) and fixing the `src/` directory structure.

### Non-Responsibilities
- Contains no game logic: does not update entities, does not draw, does not handle collisions, does not count points.
- Does not own game state (`World`, `Scoring`, `HighScoreStorage`) — all of that lives inside scenes.
- Does not map keys or interpret input events — that is `InputSystem`'s job.
- Does not hold references to scenes beyond the initial one — the scene stack is managed by `SceneManager` from that point on.
- Does not handle runtime configuration, feature flags, or A/B tests — values are taken from `config.ts`.
- Does not register a Service Worker, initialise analytics, or load external assets — there are none.

## Public Interface
The module exposes exactly one entry point and a set of project configuration files.

- `bootstrap(): void` — the only exported function from `src/main.ts`. Called once at module load time; idempotent in the sense that a repeated call is not expected (if made — a second `GameLoop` will be created, which is clearly a caller bug).
- `index.html` — a static page with `<canvas id="game">` and `src/main.ts` attached as an ES module. Has no programmatic API, but establishes the contract: the DOM contains a canvas with a specific id by the time the script executes.
- `vite.config.ts` — bundler configuration (minimal: `base` for GitHub Pages deployment, everything else at Vite defaults).
- `tsconfig.json` — TypeScript configuration (strict, ES2022, `moduleResolution: bundler`, `lib: ["DOM", "ES2022"]`).
- `package.json` — scripts `dev` / `build` / `preview` and dev dependencies (`typescript`, `vite`). No runtime dependencies.

## Data Model
The module owns no persistent data and defines no entities. At runtime, inside `bootstrap()`, there is exactly one "model" — local references to root application objects living in the function closure (and via the `beforeunload` handler):

| Name | Type | Purpose |
|---|---|---|
| `canvas` | `HTMLCanvasElement` | Game field DOM node, obtained by `id="game"` |
| `ctx` | `CanvasRenderingContext2D` | Canvas 2D context, passed into `draw` |
| `input` | `InputSystem` | Sole input system instance, attached to `window` |
| `sceneManager` | `SceneManager` | Scene stack, active scene on top |
| `loop` | `GameLoop` | `requestAnimationFrame` loop with a time accumulator |

All references are private to `bootstrap()`. The module publishes none of them to avoid bypass access to singletons outside the scene system.

From configuration files:
- `package.json` — standard npm manifest structure; significant fields: `type: "module"`, `scripts: { dev, build, preview }`, `devDependencies: { typescript, vite }`.
- `tsconfig.json` — `{ compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, lib: ["DOM", "ES2022"], noEmit: true }, include: ["src"] }`.

## Key Flows

1. **Cold application start.** The browser loads `index.html`, parses it and encounters `<script type="module" src="/src/main.ts">`. Vite (in dev) or the built bundle (in prod) loads the module; at the top level `main.ts` calls `bootstrap()`. The function finds `document.getElementById('game')` as an `HTMLCanvasElement`; if not found it throws a meaningful error (page without a canvas is a layout bug). Then it sets `canvas.width = CANVAS.WIDTH`, `canvas.height = CANVAS.HEIGHT`, obtains `ctx = canvas.getContext('2d')` and verifies the context was obtained. Creates `input = new InputSystem()`, calls `input.attach(window)` — keyboard events are now being listened to. Creates `sceneManager = new SceneManager()`. Creates `loop = new GameLoop({ onUpdate: (dt) => { sceneManager.update(dt, input); input.clearFrame(); }, onRender: () => sceneManager.draw(ctx) })`. Calls `sceneManager.push(new MenuScene({ sceneManager, input, ctx }))`. Calls `loop.start()` — from this moment `requestAnimationFrame` ticks start arriving.

2. **Loop tick (the wiring bootstrap is responsible for).** `GameLoop` internally maintains the time accumulator; when it reaches ≥ `SIMULATION.STEP`, it calls `onUpdate(dt)`. The callback from `bootstrap` delegates to `sceneManager.update(dt, input)`, then calls `input.clearFrame()` — this is critical for edge-triggered states (just-pressed actions), otherwise `Fire` would "stick" for several ticks. Rendering is called once per frame: `onRender` → `sceneManager.draw(ctx)`. The module in this flow is just a callback router, with no logic of its own.

3. **Tab closing.** A `beforeunload` handler is registered on `window` that calls `loop.stop()` and `input.detach()`. Strictly speaking, the browser will unload the page and release resources regardless, but explicit cleanup is good hygiene: it stops `requestAnimationFrame` pinging and removes listeners from `window` before the DOM is destroyed. This is also useful in the dev server with HMR — when a module is hot-reloaded.

4. **Production build.** The developer runs `npm run build`, Vite reads `vite.config.ts` (picks `base` for GitHub Pages), transpiles TS, minifies, and outputs `index.html`, one JS bundle, and one CSS into `dist/`. The folder is uploaded to a static host; in production the page works by exactly the same path as in dev, only without HMR.

## Dependencies
By definition the module closes over the entire project dependency graph — it must create the root objects. Explicitly imported modules:

- `./config` — `CANVAS` (canvas dimensions), used transitively by all subsystems.
- `./systems/input` — class `InputSystem` and methods `attach(window)` / `detach()` / `clearFrame()`.
- `./scenes/scene-manager` — class `SceneManager` with `push` / `update(dt, input)` / `draw(ctx)`.
- `./scenes/menu` — class `MenuScene`, created as the first scene on the stack.
- `./loop/game-loop` — class `GameLoop` with a constructor accepting `{ onUpdate, onRender }` and methods `start` / `stop`.

Runtime external dependencies are only browser APIs: `document`, `window`, `HTMLCanvasElement`, `CanvasRenderingContext2D`, `requestAnimationFrame` (used inside `GameLoop`, not here directly). Build dev dependencies — `vite` and `typescript`.

Project directory structure owned by bootstrap:

```
index.html
vite.config.ts
tsconfig.json
package.json
src/
  main.ts
  config.ts
  math/
    vec2.ts
  entities/
    entity.ts
    ship.ts
    asteroid.ts
    bullet.ts
    ufo.ts
    particle.ts
  systems/
    input.ts
    collision.ts
    wave.ts
    scoring.ts
    highscore.ts
  scenes/
    scene-manager.ts
    menu.ts
    game-scene.ts
    pause.ts
    gameover.ts
  render/
    renderer.ts
  loop/
    game-loop.ts
```

## Error Handling
Bootstrap operates at the narrow throat of the application lifecycle — most errors here indicate an invalid build/markup and should fail loudly, not degrade silently.

- **Invalid DOM input.** `document.getElementById('game')` returned `null` or it is not an `HTMLCanvasElement` — `bootstrap()` throws `Error('Canvas #game not found in document')`. Same for `canvas.getContext('2d') === null` (theoretically possible on exotic browsers without 2D) — `Error('Canvas 2D context unavailable')`. These errors are not caught; they surface to the console and halt initialisation — playing without a canvas is impossible.
- **Subsystem failure during initialisation.** If the `InputSystem` / `SceneManager` / `GameLoop` constructor throws, `bootstrap()` does not catch it; the error surfaces to the console. The game does not start, which is correct: a partially alive state is worse than an absent one.
- **Failure inside a loop tick.** Not bootstrap's responsibility — it belongs to `GameLoop` (top-level `try/catch` around calls to `onUpdate` / `onRender`, see the "Error Handling" section in the architecture). Bootstrap here only provides the scenes that the loop can return to a safe state (e.g. `sceneManager.replace(new MenuScene(...))`).
- **Partial success.** Not applicable: either `bootstrap()` completed fully and all root objects are created, or an exception was thrown and the page remains "blank".
- **Repeated `bootstrap()` call.** Not expected; no guards are present (the module executes once at load time). If called manually — a second `GameLoop` and double input handling will result; this is a clear caller bug.

## Stack & Libraries
- **TypeScript (strict mode)** — language defined by architecture; here `strict: true`, `target/module: ES2022`, `moduleResolution: bundler`, `lib: ["DOM", "ES2022"]` are fixed. Bundler resolution is needed to work correctly with Vite (which serves imports itself).
- **Vite** — bundler and dev server. Chosen by the architecture; in this module — a minimal `vite.config.ts`: only `base` for correct paths when deploying to GitHub Pages (`/asteroids/`) and optionally `root` at its default. No plugins: for one TS file and one HTML, plugins are redundant.
- **No runtime dependencies.** No React, no UI library — everything is rendered on Canvas 2D. `package.json` contains only `devDependencies: typescript + vite` and scripts `dev / build / preview`.
- **CSS — inlined in `<style>` in `index.html`**, about 10 lines: `body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }` and `canvas { display: block; }`. A separate `.css` file is not warranted — there is too little to justify it.

## Configuration
The module is itself infrastructure; its "configuration" is the project configuration files and the constants it reads.

| Name | Purpose | Default |
|---|---|---|
| `CANVAS.WIDTH` (from `config.ts`) | Canvas width, set in `bootstrap()` | `960` |
| `CANVAS.HEIGHT` (from `config.ts`) | Canvas height | `720` |
| `vite.config.ts: base` | Base URL for static paths in production build | `'/asteroids/'` (for GitHub Pages; ignored in dev) |
| `tsconfig.json: compilerOptions.strict` | TypeScript strict mode | `true` |
| `tsconfig.json: compilerOptions.target` | Target JS version | `ES2022` |
| `tsconfig.json: compilerOptions.module` | Module system | `ES2022` |
| `tsconfig.json: compilerOptions.moduleResolution` | Module resolution | `bundler` |
| `tsconfig.json: compilerOptions.lib` | Available environment types | `["DOM", "ES2022"]` |
| `package.json: scripts.dev` | Start dev server | `vite` |
| `package.json: scripts.build` | Production build | `tsc --noEmit && vite build` |
| `package.json: scripts.preview` | Preview built artifact | `vite preview` |

No environment variables, secrets, or `.env` files. All values are known at build time.

## Open Questions
- Whether to protect against a double `bootstrap()` call (e.g. in some HMR dev scenarios), or rely on the convention "call exactly once from `main.ts`". Currently — the latter.
- The exact value of `base` in `vite.config.ts` depends on the deployment host and path; `'./'` (relative paths) works for local runs and preview, `'/asteroids/'` for GitHub Pages. Decision deferred until actual deployment.
- Whether to introduce a separate CSS file (`src/styles.css`) instead of inline styles in `index.html` — the current volume of styles doesn't justify a separate file, but might be reconsidered if overlays (dev HUD, game over) are added.
- Whether to wrap `bootstrap()` in a top-level `try/catch` and show the user an "error page" instead of a blank screen — for a learning project, the error is visible in the console anyway; open for future iterations.
- Whether a `DOMContentLoaded` guard is needed before reading the canvas, or whether it is sufficient that `<script type="module">` executes after DOM parsing (true by specification defer semantics of module scripts). Current decision — no guard, relying on module script semantics.
