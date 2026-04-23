# Module — ui-scenes (MenuScene, PauseScene, GameOverScene)

## Purpose

The module combines the three auxiliary scenes surrounding `GameScene`: the start menu (`MenuScene`), the pause overlay (`PauseScene`), and the end-of-session screen (`GameOverScene`). Each is short — a purely text screen with a static layout and minimal logic — so keeping them in one module is more economical than spreading them across three files. Without these scenes the game would have no entry point (no way to start a session from a clean state), no reversible pause, and no proper finale with high-score saving — meaning the lifecycle "menu → game → pause ↔ game → game over → menu" would never close.

## Responsibilities

- Implementing the `Scene` interface from `scene-manager` for three screens: `enter / exit / update / draw`, optional `drawBelow` flag.
- `MenuScene`: showing the game title, a "PRESS ENTER" hint, and the top-10 high-score table; starting a new session on `Confirm`.
- `PauseScene`: semi-transparent overlay on top of the frozen `GameScene` with a "PAUSED" label; returning to the game on `Pause` or `Confirm`.
- `GameOverScene`: showing the final score, attempting to submit to the high-score table, arcade-style 3-character name entry if the score ranked in the top, then showing the table and returning to the menu on `Confirm`.
- Scene routing via `SceneManager` (`replace` for one-way transitions, `pop` for exiting the pause).
- Reading and displaying `HighScoreStorage` data (in `MenuScene` and `GameOverScene`).
- Interpreting `InputSystem` input in terms of UI navigation (confirm, cancel, moving the name-entry cursor).

### Non-Responsibilities

- Do not store or update game entities (`Ship`, `Asteroid`, …) — those are owned by `GameScene`.
- Do not access `localStorage` directly — only through `HighScoreStorage`.
- Do not manage the scene stack — they call ready-made `SceneManager.push / pop / replace` methods, but do not imitate them.
- Do not implement transition animations, fade effects, sprites, or sound.
- Do not listen to DOM keyboard events — read state only through `InputSystem` in `update`.
- Do not configure key bindings — use pre-defined `Action` constants.
- Do not validate or normalise the player name before submission — that is `HighScoreStorage`'s responsibility.
- `PauseScene` does not decide what "pause" means for the world — it simply does not update the scene below it (that is handled by `SceneManager`, which only calls `update` on the top scene).

## Public Interface

The module exports three classes, each implementing `Scene`.

**`class MenuScene implements Scene`**
- `drawBelow = false`.
- `constructor(deps: { sceneManager: SceneManager, highScores: HighScoreStorage })` — dependencies injected from outside.
- `enter(): void` — loads the high scores: `this.scores = highScores.load()`.
- `exit(): void` — no-op.
- `update(dt: number, input: InputSystem): void` — if `input.wasPressed('Confirm')` → `sceneManager.replace(new GameScene(...))`. `Pause` / `Escape` are explicitly ignored (no-op) to prevent transitioning to an empty stack from the menu.
- `draw(ctx: CanvasRenderingContext2D): void` — background fill, "ASTEROIDS" title centred at the top, "PRESS ENTER" hint below, high-score table (rank, name, score) centred at the bottom.

**`class PauseScene implements Scene`**
- `drawBelow = true` — `SceneManager` first draws the `GameScene` below (its last frame — the world is frozen), then draws this scene on top.
- `constructor(deps: { sceneManager: SceneManager })`.
- `enter(): void` — no-op.
- `exit(): void` — no-op.
- `update(dt: number, input: InputSystem): void` — if `input.wasPressed('Pause')` **or** `input.wasPressed('Confirm')` → `sceneManager.pop()`.
- `draw(ctx: CanvasRenderingContext2D): void` — `ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H)` to darken the `GameScene` frame, then `drawText` "PAUSED" centred.

**`class GameOverScene implements Scene`**
- `drawBelow = false`.
- `constructor(deps: { sceneManager: SceneManager, highScores: HighScoreStorage }, snapshot: { score: number, wave: number })` — the final session snapshot arrives as a separate parameter alongside the deps.
- `enter(): void` — attempts to submit the score with the default placeholder name `'AAA'`: `const res = highScores.trySubmit(snapshot.score, 'AAA')`. If `res.accepted === true` — transitions to `'name'` sub-mode (the player will enter their name, which will then overwrite the record), saves `pendingEntry` and `position`. Otherwise — loads the current table `this.scores = highScores.load()` and immediately transitions to `'scores'` sub-mode.
- `exit(): void` — no-op.
- `update(dt: number, input: InputSystem): void` — branches by current `mode` (see Key Flows).
- `draw(ctx: CanvasRenderingContext2D): void` — background fill, "GAME OVER" centred at the top, "SCORE: <n>" line. Then depending on `mode`: `'name'` — three letter placeholder cells with the current position highlighted (`cursorPos`); `'scores'` — high-score table with the fresh entry highlighted (`pendingEntry`), a "PRESS ENTER" hint to return to the menu.

All three classes have no public methods beyond the `Scene` contract.

## Data Model

State lives in memory; nothing is persisted. The table below shows instance fields.

**`MenuScene`**

| Field | Type | Purpose |
|---|---|---|
| `sceneManager` | `SceneManager` | for transitioning to `GameScene`. |
| `highScores` | `HighScoreStorage` | source of the score table. |
| `scores` | `ScoreEntry[]` | loaded in `enter`, displayed in `draw`. |

**`PauseScene`**

| Field | Type | Purpose |
|---|---|---|
| `sceneManager` | `SceneManager` | for `pop()` when returning to the game. |

**`GameOverScene`**

| Field | Type | Purpose |
|---|---|---|
| `sceneManager` | `SceneManager` | for transitioning to `MenuScene`. |
| `highScores` | `HighScoreStorage` | reading and writing the high score. |
| `snapshot` | `{ score: number, wave: number }` | final session state, received from `GameScene`. |
| `mode` | `'name' \| 'scores'` | current screen sub-mode. |
| `scores` | `ScoreEntry[]` | current score table for display. |
| `pendingEntry` | `ScoreEntry \| null` | reference to the just-saved entry (for highlighting in the table). |
| `position` | `number \| null` | position of the fresh entry in the top-10 (`0..9`). |
| `cursorPos` | `0 \| 1 \| 2` | index of the character being edited in `'name'` sub-mode. |
| `finalName` | `string` (length 3) | the name being edited, starts as `'AAA'`. |

Relations: all three scenes live no longer than their single time on the stack; their state is discarded on `exit()`. `HighScoreStorage`, `SceneManager`, `InputSystem` outlive the scenes.

## Key Flows

### 1. Opening the menu
Immediately after `bootstrap()`: `SceneManager.push(new MenuScene(...))`. In `enter()` the scene calls `highScores.load()` and stores the result in `this.scores`. Each tick `update` checks `wasPressed('Confirm')`; if so — `sceneManager.replace(new GameScene(...))`. Until the player presses Enter, the scene simply redraws.

### 2. Pausing the game and returning
During `GameScene.update` the player presses `Pause` → `GameScene` calls `sceneManager.push(new PauseScene(...))`. From the next tick `SceneManager` delegates `update` only to `PauseScene`; the game world is stopped. In `draw`, thanks to `drawBelow = true`, first the last `GameScene` frame is redrawn, then a semi-transparent black rectangle and the "PAUSED" text are overlaid. When the player presses `Pause` or `Confirm`, `PauseScene.update` calls `sceneManager.pop()`; `SceneManager` removes the pause and calls `handleResume` on `GameScene`, which resets the lingering `wasPressed('Pause')`.

### 3. Session end with a top-10 ranking
`GameScene` calls `sceneManager.replace(new GameOverScene({...}, snapshot))`. In `enter()` the scene initiates `highScores.trySubmit(score, 'AAA')`. Suppose `res.accepted === true` — meaning the record is already in storage under the name `'AAA'` at position `res.position`. The scene enters `mode = 'name'`, `cursorPos = 0`, `finalName = 'AAA'`. The player changes characters arcade-style: `wasPressed('RotateLeft')` / `wasPressed('RotateRight')` moves `cursorPos` (modulo 3), `wasPressed('Thrust')` cycles the letter at the current position upward (`A → B → … → Z → A`), `wasPressed('Fire')` — downward. Rendering shows three cells with the current one highlighted. When the player presses `Confirm`, the scene re-submits: `highScores.trySubmit(score, finalName)` (this replaces the `'AAA'` record in the top with the correct name; the old submission with the same score may remain one position below — see Open Questions). After this, `mode = 'scores'`, `this.scores = highScores.load()`, `pendingEntry` — the last entry with this name and score.

### 4. Session end without a top-10 ranking
In `enter()`, `trySubmit` returns `{ accepted: false, position: null }`. The scene immediately loads `this.scores = highScores.load()`, `mode = 'scores'`, `pendingEntry = null`. `draw` shows "GAME OVER", the final score, and the high-score table without highlighting. On `wasPressed('Confirm')` — `sceneManager.replace(new MenuScene(...))`.

### 5. Returning from the score table to the menu
In `'scores'` sub-mode, any `wasPressed('Confirm')` leads to `sceneManager.replace(new MenuScene(...))`. The "menu → game → game over → menu" cycle closes.

## Dependencies

- **`scene-manager`** — the `Scene` interface (implemented by all three classes) and the `SceneManager` class (calling `push / pop / replace`).
- **`GameScene`** — imported by `MenuScene` to start a session; transitively, `PauseScene` lives above its frame.
- **`HighScoreStorage`** — `load()` in `MenuScene` and `GameOverScene`; `trySubmit(score, name)` in `GameOverScene`.
- **`InputSystem`** — reads `wasPressed(Confirm)`, `wasPressed(Pause)`, and in `GameOverScene` also `RotateLeft`, `RotateRight`, `Thrust`, `Fire`. `isDown` methods are not used: all UI navigation is discrete.
- **`renderer`** — `clearScreen`, `drawText` (titles, hints, table rows), `drawPolyline` if needed to draw a letter-entry cell border.
- **`config`** — `CANVAS.WIDTH` / `CANVAS.HEIGHT` for text centering, `TOP_N` for the number of table rows, `NAME_LENGTH = 3` for the name editor size.

The scenes are **not** dependent on `GameLoop`, `CollisionSystem`, `WaveManager`, `Scoring`, `Ship`, or other game entities.

## Error Handling

- **Empty score table in `MenuScene`.** `highScores.load()` returned `[]`. `draw` shows a "NO SCORES YET" placeholder or simply empty space below the hint — no errors.
- **`trySubmit` threw (it cannot: the module swallows exceptions).** Per the `HighScoreStorage` contract, the method does not throw and returns `{ accepted: false, position: null }` on `localStorage` failure. The scene then goes into `'scores'` sub-mode and behaves as if the score simply didn't rank. The player sees no error — graceful degradation per the architecture.
- **The second submit with the correct name may not cleanly replace the first.** The "submit on `enter` with `'AAA'` → second submit with the real name on `Confirm`" scheme relies on stable sorting: the new entry is placed below the first on equal scores, and the old `'AAA'` entry cannot be atomically removed — the table may contain both. This is consciously deferred to Open Questions; a simple solution was chosen for MVP.
- **Pressing `Pause` in `MenuScene` / `GameOverScene`.** Ignored (no-op). There is nothing to pause outside the game; a spurious `pop` from the menu would leave an empty stack.
- **Double press of `Confirm` during a scene transition.** No protection at the module level: `SceneManager.replace` is atomic, and `wasPressed` resets to `false` after `clearFrame` in the same frame the transition occurred. If `replace` happened mid-`update`, the scene has already changed and the second call will not reach the same scene.
- **Invalid characters in `finalName`.** The constructor and mutations guarantee that `finalName` is always a 3-character string `A..Z`; stepping `+1` / `-1` modulo 26 cannot exceed the range. No additional validation before submission is needed — `HighScoreStorage` normalises anyway.
- **Focus loss during pause.** `InputSystem` clears held keys on `blur` (see input-system docs), `PauseScene` uses only `wasPressed`, not `isDown` — the scenario is safe.

## Stack & Libraries

- **TypeScript + ES classes.** Three independent classes implementing a common `Scene` interface. No common base class: the scene code is too different; a common ancestor gives no benefit and only complicates reading.
- **No third-party UI libraries.** Scenes are raw Canvas + text; React/Vue/other frameworks are pointless here.
- **Constructor DI via a `deps` object.** Uniform with `GameScene`: all dependencies come from outside, scenes are easy to recreate.
- **No timers (`setTimeout/setInterval`).** Anything that needs to tick would tick via `update(dt)`; in these scenes static content is sufficient, and no animation is planned.
- **`renderer` as the single drawing point.** Scenes do not touch `ctx.font` / `ctx.strokeStyle` directly — except for one place in `PauseScene` (`fillRect` with `rgba(0,0,0,0.5)` for the semi-transparent overlay — this is specific enough that a dedicated helper utility would be excessive).

## Configuration

The module has no environment variables. Values the scenes read from `config`:

| Name | Purpose | Default |
|---|---|---|
| `CANVAS.WIDTH` / `CANVAS.HEIGHT` | field size for text centering and the overlay. | `800 / 600` |
| `TOP_N` | number of rows in the score table. | `10` |
| `NAME_LENGTH` | length of the editable name in `GameOverScene`. | `3` |
| `PAUSE_OVERLAY_ALPHA` | overlay opacity in `PauseScene` (`rgba(0,0,0, α)`). | `0.5` |
| `MENU_TITLE_SIZE` / `MENU_HINT_SIZE` / `MENU_TABLE_SIZE` | font sizes in the menu. | `48 / 20 / 16` |
| `GAMEOVER_TITLE_SIZE` | font size of the "GAME OVER" label. | `48` |

No secrets.

## Open Questions

- **Double submit in `GameOverScene`.** Currently proposed: submit in `enter()` with `'AAA'`, then again on `Confirm` with the entered name. This may leave both entries in the table (the old `'AAA'` and the new with the correct name if they have the same score). Alternative: manually check for top-10 eligibility (`const scores = highScores.load(); if (score > scores[TOP_N-1]?.score ?? 0) ...`) without the pre-write, and submit exactly once on `Confirm`. Decision deferred to the implementation stage.
- **Allow `Pause` in `MenuScene`/`GameOverScene`.** Currently — no-op; possibly binding `Escape` as "back to menu" from `GameOverScene` makes sense so the player can leave without pressing `Confirm`. Not required for MVP.
- **Using `NameChar` for name entry.** `InputSystem` already supports direct letter entry via `NameChar` + `getPressedChar`. The current arcade-style input (arrows for cursor position, Thrust/Fire for letter cycling) is more atmospheric but less convenient. If UX feedback arrives, both modes should be supported simultaneously: arrows / Thrust / Fire **or** direct letter input.
- **Freezing UFO and `GameScene` timers during pause.** Formally this is `GameScene`'s and `SceneManager`'s responsibility (which simply doesn't call `update` on it), but if background music or HUD animation is ever added, a "on pause" hook will be needed (see the open question in `scene-manager.md`).
- **"PRESS ENTER" blinking animation.** Currently text is static; blinking would add a "retro feel" but requires storing a phase timer and calling `update(dt)`. Deferred to polish.
- **Highlighting the fresh entry in the score table.** A useful UX feature (different colour or `>` prefix), requiring colour variation in `drawText`. Currently in scope only as an option, not mandatory for MVP.
- **Auto-return to menu on timeout.** If the player walks away from the computer on the `GameOverScene` screen, automatically returning to the menu after N seconds is reasonable. Not critical for MVP.
