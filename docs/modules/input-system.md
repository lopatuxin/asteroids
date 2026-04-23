# Module — InputSystem

## Purpose

The keyboard input subsystem translates low-level browser events (`keydown` / `keyup`) into a stable, on-demand-queryable state of abstract game actions (`Action`). Without it, scenes would have to listen to DOM events themselves and deal with keyboard layouts, the "held-down" buzz, and edge triggers — the game loop would turn into a mess of event handlers. The module gives scenes exactly one thing: "what is pressed right now" and "what was pressed this frame".

## Responsibilities

- Subscribing to `keydown` / `keyup` on `window` and unsubscribing on deactivation.
- Mapping `KeyboardEvent.code` to an abstract `Action` via the binding table from `config`.
- Maintaining two parallel sets: "currently held" (`Set<Action>`) and "just pressed in this frame" (`Set<Action>`).
- Edge-triggering via one-time consumption of the press queue (`wasPressed` reads and keeps the record until end-of-frame; `clearFrame` empties the queue).
- Calling `preventDefault()` for game-used keys so that arrows/space don't scroll the page or activate default browser actions.
- Passing the character for the `NameChar` action (entering a 3-letter name in `GameOverScene`) — without interpretation, just forwarding the entered character.

### Non-Responsibilities

- Does not decide what to do with an action — that is the scene's job (`GameScene`, `MenuScene`, `GameOverScene`).
- Does not implement runtime key rebinding or a settings UI — the table is fixed in `config`.
- Does not handle mouse, gamepad, or touch input.
- Does not keep input history longer than one frame.
- Does not know about pause, scenes, or world state — only about keys and actions.

## Public Interface

- `class InputSystem` — the only exported class of the subsystem.
- `constructor(bindings: InputBindings)` — accepts a binding table of the form `{ [code: string]: Action }` from `config`.
- `attach(target: Window): void` — subscribes to `keydown` / `keyup` on the given window. A repeated `attach` without `detach` — no-op (protection against double subscription).
- `detach(): void` — removes handlers and clears internal sets. Safe to call multiple times.
- `isDown(action: Action): boolean` — true if the action is currently held (level-triggered).
- `wasPressed(action: Action): boolean` — true if the action was pressed in the current frame (edge-triggered); consumes the record from the queue.
- `clearFrame(): void` — called by the scene at the end of a tick; clears the "just-pressed" set without touching the "held" set.
- `getPressedChar(): string | null` — returns the character associated with the last `NameChar` press in the current frame (or `null`). Used only by `GameOverScene` for name entry.

## Data Model

Internal state of a `InputSystem` instance:

- `bindings: InputBindings` — immutable table `{ [code: string]: Action }`, received in the constructor.
- `down: Set<Action>` — set of actions for which `keydown` arrived and `keyup` has not yet arrived.
- `pressed: Set<Action>` — set of actions pressed in the current frame; cleared in `clearFrame()`.
- `lastChar: string | null` — character of the last `NameChar` press in the frame.
- `attached: boolean` — active subscription flag, for `attach` / `detach` idempotency.
- `handlers: { keydown: (e: KeyboardEvent) => void, keyup: (e: KeyboardEvent) => void } | null` — saved handler references, needed for correct `removeEventListener`.

External types (live in a shared type module, but logically belong to the subsystem):

- `type Action = 'RotateLeft' | 'RotateRight' | 'Thrust' | 'Fire' | 'Hyperspace' | 'Pause' | 'Confirm' | 'NameChar'`.
- `type InputBindings = Readonly<Record<string, Action>>` — key is `KeyboardEvent.code` (e.g. `'ArrowLeft'`, `'KeyA'`, `'Space'`).

Default bindings (fixed in `config`): arrows as primary layout and WASD as alternative, both mapping to the same actions — `ArrowLeft` / `KeyA` → `RotateLeft`, `ArrowRight` / `KeyD` → `RotateRight`, `ArrowUp` / `KeyW` → `Thrust`, `Space` → `Fire`, `ShiftLeft` / `ShiftRight` → `Hyperspace`, `Escape` / `KeyP` → `Pause`, `Enter` → `Confirm`. For the name entry screen `KeyA..KeyZ` are separately marked as `NameChar`.

## Key Flows

**Initialisation at scene start.** A scene (usually `GameScene.enter()`) creates or receives a `InputSystem` instance, calls `attach(window)`. The class saves handler references, attaches them to `keydown` and `keyup`, sets `attached = true`. A duplicate `attach` is silently ignored.

**Pressing a game key.** The user presses `ArrowUp`. The browser fires `keydown` with `event.code = 'ArrowUp'` and the `repeat` flag (on hold). The handler looks up `bindings['ArrowUp']`, gets `'Thrust'`. If `event.repeat === false` — adds `Thrust` to both `down` and `pressed`; if `repeat === true` — only maintains `down` (not added to `pressed`, so auto-repeat doesn't trigger `wasPressed`). Calls `event.preventDefault()` to prevent page scrolling. On the next tick `GameScene` reads `isDown('Thrust')` and activates ship thrust.

**Releasing a key.** The user releases `ArrowUp`. The browser fires `keyup`. The handler finds `'Thrust'` in bindings, removes it from `down`. `pressed` is not touched — the edge-event "was pressed this frame" remains valid until end-of-frame.

**One-shot action (fire, pause, hyperspace).** The scene calls `wasPressed('Fire')`. If `Fire` is in `pressed` — the method returns `true` and leaves the record until `clearFrame` (a repeat call in the same frame also returns `true` — this is desired if two places in the scene want to know about the press). At end-of-tick the scene calls `inputSystem.clearFrame()`, and `pressed` is emptied. The next frame will see `Fire` again only after a new `keydown`.

**Name input in GameOverScene.** The scene each tick checks `wasPressed('NameChar')` and, if true, reads `getPressedChar()`. The `keydown` handler for any letter key bound to `NameChar` puts the corresponding character in `lastChar` (taken from `event.key.toUpperCase()`, constrained to `A–Z`). The scene adds the letter to the current position in the 3-character name slot; `clearFrame` zeroes `lastChar`.

## Dependencies

- **`config`** — source of `InputBindings` (the binding table) and optionally the list of codes for which `preventDefault` is needed. No other dependencies.
- **`window` (global browser object)** — used as an `EventTarget`; the specific reference is passed through `attach(target)`, simplifying testing and isolation.

`InputSystem` depends on no other application modules: scenes read it, but it knows nothing about them.

## Error Handling

- **Unknown `KeyboardEvent.code`** — no record in `bindings`: the handler silently exits, neither `down` nor `pressed` are changed, `preventDefault` is not called (so browser system shortcuts on non-game keys are not broken).
- **Repeated `attach` without `detach`** — treated as no-op; prevents doubled handlers when scenes reinitialise input during transitions.
- **`detach` without an active `attach`** — safe: checks `attached`, does nothing.
- **Window losing focus (`blur`)** — risk of "sticky" held keys (user released `ArrowUp` in another window, `keyup` never arrived). The subsystem listens to `window.blur` as part of `attach` and fully clears `down` and `pressed` in that handler. This is within the module's responsibility since it concerns the correctness of input state.
- **Re-initialisation on scene transition** — `SceneManager` calls `detach` on the old scene and `attach` on the new one (or reuses a shared instance). Full set reset on `detach` guarantees that a key held in one scene doesn't "leak" into the next.
- **Exceptions inside a handler** — wrapped in try/catch at the handler level; logged with the prefix `[input]` in dev builds, suppressed in prod; input continues to work.

## Stack & Libraries

- **TypeScript** — inherited from the whole project; types `Action` and `InputBindings` catch binding typos at compile time.
- **Native `KeyboardEvent`** — key choice: `event.code` is used (physical key code, stable across layouts), not the deprecated `event.keyCode`. For character input of the name — `event.key`. No third-party input libraries (`mousetrap`, `hotkeys-js`) are needed: the mapping and two sets are trivially written manually.
- **No dependencies on Canvas, scenes, or game loop** — the module is isolated and testable by substituting a fake `EventTarget`.

## Configuration

All settings come from `config.ts` — not from the environment, since this is a frontend bundle without runtime configuration. Relevant entries for the subsystem:

- `INPUT_BINDINGS: InputBindings` — `code → Action` table. Default: arrows + WASD for movement, `Space` for fire, `ShiftLeft`/`ShiftRight` for hyperspace, `Escape`/`KeyP` for pause, `Enter` for confirm, `KeyA..KeyZ` for `NameChar`.
- `INPUT_PREVENT_DEFAULT_CODES: ReadonlySet<string>` — codes for which `preventDefault` is called (all game keys; `Escape` and name letters are typically not included to avoid breaking browser UX). Default: `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Space`, `KeyW`, `KeyA`, `KeyS`, `KeyD`.

No secrets or environment variables.

## Open Questions

- Whether to include `KeyDown` handling for `ArrowDown` (not used in the original) or map it to, e.g., "reverse thrust" / brake — not bound yet, but `preventDefault` on it makes sense to prevent scrolling.
- Whether held `Fire` should auto-fire (level-triggered) or only edge (as in the original) — both modes are supported at the subsystem level via `isDown` / `wasPressed`; the decision is made in `GameScene`. Finalise during balance tuning.
- Whether a separate action is needed for "left/right" in menus or whether `RotateLeft` / `RotateRight` are sufficient — currently reused, but worth verifying in a UX test of the menu.
- Whether to extract `NameChar` into a separate "text input" subsystem — currently it sticks out beside game actions; if the name entry screen grows in functionality (deletion, navigation), separation becomes justified.
