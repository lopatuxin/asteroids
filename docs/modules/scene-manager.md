# Module — SceneManager

## Purpose

The game screen management subsystem maintains a stack of active scenes (menu, game, pause, game over) and delegates work to them: updating, rendering, and handling input. Without it, transitions between screens and implementing pause would turn into branching `if`-chains in the game loop, and "freezing" the picture under a pause overlay would require manual state copying. The module provides two primitives: the `Scene` interface as a universal screen contract, and a stack with `push` / `pop` / `replace` operations that trivially express any transition, including modal overlays.

## Responsibilities

- Holding the scene stack `Scene[]` and maintaining the invariant "the top scene is the active one".
- Stack operations: `push(scene)`, `pop()`, `replace(scene)` with correct lifecycle hook calls on affected scenes.
- Delegating `update(dt, input)` to exactly one — the top — scene.
- Delegating `draw(ctx)` to the top scene; optionally pre-rendering the scene below if the top scene has the `drawBelow = true` flag (modal overlay pattern for `PauseScene`).
- Calling `enter()` when a scene appears at the top of the stack as a result of `push` / `replace`.
- Calling `exit()` when a scene is removed from the stack (via `pop` or `replace`).
- Calling `handleResume()` on the scene that ends up at the top after a `pop` — so it can reset its transient states (e.g. clear the "pause key held" marker to prevent re-triggering).
- Protection against degenerate operations: `pop` on an empty stack — no-op, returns `null`; `current()` on an empty stack returns `null`.

### Non-Responsibilities

- Does not know about game entities, physics, or collisions — that is `GameScene` / `World`'s domain.
- Does not own either `InputSystem` or `CanvasRenderingContext2D` — receives them as parameters to `update` / `draw` from the outside.
- Does not implement the scenes themselves (`MenuScene`, `GameScene`, `PauseScene`, `GameOverScene`) — only the `Scene` contract and the stack.
- Does not manage the game loop (`requestAnimationFrame`, time accumulator) — that is `GameLoop`, which calls `SceneManager.update` / `draw`.
- Does not perform transitions with animations (fade in/out) — switches are immediate.
- Does not save/restore scene state on removal — `pop` means the scene is discarded and its state is lost.
- Does not know about pause as a concept: a pause is simply `push(new PauseScene())` from the outside; for `SceneManager` that is an ordinary push of a modal scene.

## Public Interface

- `interface Scene` — the contract for any scene, implemented by `MenuScene`, `GameScene`, `PauseScene`, `GameOverScene`.
  - `enter(): void` — called once when the scene first appears at the top of the stack (on `push` or `replace`).
  - `exit(): void` — called once when the scene leaves the stack (on `pop` or `replace`).
  - `update(dt: number, input: InputSystem): void` — simulation tick, `dt` in seconds.
  - `draw(ctx: CanvasRenderingContext2D): void` — frame rendering.
  - `handleResume?(): void` — optional hook, called when the scene is again at the top after a `pop` of the scene above it. The place to reset "one-shot" states (flags, timers) that may have gone stale during the freeze.
  - `drawBelow?: boolean` — optional flag. If `true`, `SceneManager` first renders the scene immediately below this one, then renders this one on top. Used by `PauseScene` to freeze the `GameScene` picture under a semi-transparent overlay. Defaults to `false`: only the top scene is drawn.

- `class SceneManager` — holds the stack and implements operations on it.
  - `push(scene: Scene): void` — places a scene at the top. `enter()` of the new scene is called; `exit()` of the old top is **not** called (it is frozen and can be returned by `pop`).
  - `pop(): Scene | null` — removes the top scene. Calls `exit()` on the removed scene; calls `handleResume()` on the new top if it has that method. Returns the removed scene; if the stack was empty — returns `null` and does nothing.
  - `replace(scene: Scene): void` — replaces the top scene with a new one. `exit()` is called on the old top, it is removed; the new scene is placed at the top and `enter()` is called on it. If the stack was empty — equivalent to `push(scene)`.
  - `current(): Scene | null` — the top scene, or `null` if the stack is empty.
  - `update(dt: number, input: InputSystem): void` — delegates `update(dt, input)` to the top scene; no-op if the stack is empty.
  - `draw(ctx: CanvasRenderingContext2D): void` — draws the top scene. If the top scene has `drawBelow === true`, first draws the scene below it (one level deeper), then draws the top scene. No-op if the stack is empty.

## Data Model

Internal state of a `SceneManager` instance:

- `stack: Scene[]` — array of scenes. The top is the last element (`stack[stack.length - 1]`). Invariant: all elements satisfy the `Scene` interface.

Related types (live in a shared type module):

- `interface Scene` — see the Public Interface section. All fields/methods except `enter` / `exit` / `update` / `draw` are optional.
- Implementation classes (`MenuScene`, `GameScene`, `PauseScene`, `GameOverScene`) are described in their own modules; what matters here is only that they are compatible with `Scene`.

The module has no persistent data — the stack lives in the tab's memory and is reset on page reload.

## Key Flows

**Application start and the first scene.** `bootstrap()` creates a `SceneManager` and calls `sceneManager.push(new MenuScene())`. The stack transitions from empty to `[MenuScene]`. `SceneManager` calls `menu.enter()` — the menu subscribes to the events it needs and prepares its internal state. From then on, `GameLoop` on each tick calls `sceneManager.update(dt, input)` and `sceneManager.draw(ctx)`, which are delegated to `MenuScene`.

**Starting a round from the menu.** The player presses `Confirm` in `MenuScene`. The menu calls `sceneManager.replace(new GameScene())`. `SceneManager` calls `menu.exit()` (the menu unsubscribes from any local subscriptions it has), removes `MenuScene` from the stack, places `GameScene` on top, and calls `game.enter()` — which creates the `World`, the ship, the starting asteroid wave, resets score and lives. From this moment `update` / `draw` go to `GameScene`.

**Pausing over the game.** The player presses `Pause` in `GameScene`. The game calls `sceneManager.push(new PauseScene())`. `SceneManager` does **not** call `gameScene.exit()` — the game remains on the stack, simply frozen. The new top is `PauseScene`, and `enter()` is called on it. Starting from the next tick, `update(dt, input)` goes only to `PauseScene` — `GameScene` does not update; its timers, physics, and collisions are paused. In `draw(ctx)`, `SceneManager` sees the `drawBelow = true` flag on `PauseScene` and first renders `GameScene` (the last world state — unchanged since the pause was triggered), then renders `PauseScene` on top (a semi-transparent overlay with "PAUSED" text).

**Returning from pause.** The player presses `Pause` or `Confirm` in `PauseScene`. The pause scene calls `sceneManager.pop()`. `SceneManager` removes `PauseScene` from the top and calls `pauseScene.exit()`. The new top is `GameScene`. `SceneManager` checks for `gameScene.handleResume` and, if it exists, calls it — the scene resets any lingering `wasPressed('Pause')` (via `input.clearFrame()` or equivalent) so the game doesn't immediately pause again. From the next tick, `update` goes back to `GameScene` with the same world state as before the pause.

**Game over.** A final collision occurs in `GameScene`, `Scoring.isGameOver()` becomes `true`. `GameScene` calls `sceneManager.replace(new GameOverScene(finalScore))`. `SceneManager` calls `gameScene.exit()` (releases entity references, allowing the GC to collect the World), removes `GameScene`, places `GameOverScene` on top, and calls `enter()` — which initiates a high-score save attempt via `HighScoreStorage` and prepares for name entry. After confirmation in `GameOverScene`, it calls `sceneManager.replace(new MenuScene())` — the cycle closes.

## Dependencies

- **`InputSystem` (type)** — passed through the `update(dt, input: InputSystem)` signature to the active scene. `SceneManager` does not call its methods; it merely passes it as a parameter.
- **`CanvasRenderingContext2D` (browser type)** — passed into `draw(ctx)` of the active scene (and optionally the one below). `SceneManager` does not call render primitives itself.
- **`Scene` interface** — the module's own contract; all application scenes must implement it.
- **No dependencies on concrete scenes** — `SceneManager` does not import `MenuScene` / `GameScene` / `PauseScene` / `GameOverScene`. Those links come from outside: scenes are passed to `SceneManager` already instantiated.

## Error Handling

- **`pop` on an empty stack** — no-op, returns `null`. Does not throw to avoid breaking the game loop in rare races (e.g. a double `pop` from a rapid double key press).
- **`current` / `update` / `draw` on an empty stack** — no-op. `update` and `draw` simply do nothing; theoretically this state should not occur at runtime after `bootstrap`, but the module must not crash.
- **Exception inside `enter` / `exit` / `handleResume` / `update` / `draw` of a scene** — `SceneManager` does not catch these exceptions: they propagate out to `GameLoop`, which already has a top-level try/catch (see architecture). This is a deliberate decision: hiding a scene crash inside the stack manager means masking bugs; let it fail loudly, and the global handler decides whether to roll back to `MenuScene`.
- **Partial transition in `replace`** — if an exception occurred in the old scene's `exit()`, the new scene is **not** placed on the stack and the exception propagates. The stack remains in a consistent state: the old scene is still at the top (its `exit` did not complete, but from the stack's perspective it was not removed). The option "force-remove and continue" was rejected — better to fail loudly.
- **Repeated `push` of the same scene** — not checked; it is the caller's responsibility. `SceneManager` will place it on top a second time and call `enter()` again; the scene must be prepared for this, or the caller should not do it.
- **`handleResume` absent on the new top after `pop`** — simply not called. This is an optional hook.

## Stack & Libraries

- **TypeScript** — inherited from the whole project; the `Scene` interface and generic stack method safety catch typos and forgotten hooks at compile time.
- **Class + interface** — `interface Scene` as the contract, `class SceneManager` as the sole stack implementation. No inheritance, no abstract base classes: all scenes are free to implement `Scene` directly without depending on a common "scene base".
- **Plain JS arrays (`Array<Scene>`)** — the stack is implemented via `push` / `pop` / `splice` on an ordinary array. No third-party data structure is needed: the stack length in a real game is 1–2 elements, peaking at 3 (theoretically `PauseScene` over `GameScene` over something — still short).
- **No third-party libraries** — state machines, routers, rxjs, and similar are excessive for a three-operation stack.
- **No dependency on Canvas/DOM at the `SceneManager` level itself** — `CanvasRenderingContext2D` is only forwarded. This makes the module trivially testable with fake scenes.

## Configuration

The module has no environment variables, secrets, or settings in `config.ts`. Behaviour is entirely determined by the calling code (which scenes are created and when `push` / `pop` / `replace` are called) and the `drawBelow` flag on specific scenes.

## Open Questions

- Whether a symmetrical `handlePause()` hook is needed for the scene that gets something pushed over it (i.e. called on the former top at the moment of `push`) — currently not required: freezing = "do nothing", no special notification is needed. If the game later needs to, say, stop music on pause, the hook can be added without breaking the contract.
- Whether to support "deep" `drawBelow` — i.e. recursively draw all scenes bottom-up until the first opaque one — instead of the current "only one scene below". The current approach is sufficient for MVP (pause over game), but if a modal dialog over a pause over the game ever appears, it will need to be extended.
- Whether to pass not just `InputSystem` but a general "frame context" (time, references to common services) in `update` — for now we explicitly pass only `dt` and `input`, with everything else coming through constructors. Revisit if scenes start requiring many shared services and constructors become bloated.
- Whether a `clear()` / `reset()` method is needed for a full stack reset (e.g. on an error screen) — currently the same effect is achieved by sequential `pop`s until empty and then `push(new MenuScene())`; a separate sugar method may appear if the "blow everything up and return to menu" scenario becomes frequent.
