# Module — renderer

## Purpose

The module provides a set of pure utility functions for drawing vector primitives on `CanvasRenderingContext2D` in the retro style of Atari Asteroids 1979 — white single-pixel lines on a black background, monospace text, no sprites or fills. It also centralises the wrap-around drawing strategy: entities that are closer to the screen-torus border than their radius are redrawn with additional copies offset by the canvas size, so that "crossing" the edge is seamless. Without this module every entity (`Ship`, `Asteroid`, `Ufo`, `Bullet`, `Particle`) would have to duplicate low-level canvas code and separately solve the problem of drawing near the screen edge.

## Responsibilities

- Providing drawing primitives: background fill, polyline/polygon, circle outline, ship triangle, point, text.
- Fixing and centralising the "white lines on black" visual style in one place: `strokeStyle`, `lineWidth`, `fillStyle` for text, font family and size.
- Implementing the `withWrap(ctx, position, radius, draw)` helper, which invokes the provided callback for the primary position and up to three additional offsets when the entity is close to the border of the canvas-torus.
- Pure stateless functions: all utilities take `ctx` as their first parameter and store nothing between calls.
- Consistency with field dimensions: reading `CANVAS.WIDTH` and `CANVAS.HEIGHT` from the `config` module for correct wrap offsets.

### Non-Responsibilities

- Contains no game logic: knows nothing about entities (`Ship`, `Asteroid`, etc.), does not read or write their fields beyond what is passed as arguments.
- Does not manage the rendering loop: does not call `requestAnimationFrame`, does not clear the screen on its own between frames (that is done by the calling scene via `clearScreen`).
- Does not create or own the `<canvas>` element or the context — those are created by `Bootstrap`; a ready `ctx` is passed in.
- Does not perform scene transformations (camera, zoom, scaling) — coordinates are accepted in the canvas pixel space.
- Does not handle collisions, physics, or coordinate wrapping of entities themselves (that is done by `vec2-math.wrapVec2` and the entities in `update`). `withWrap` is only about rendering.
- Does not draw complex composite entities (ship with thruster flame, full UFO silhouette) — those are assembled in the entity's own `draw(ctx)` from module primitives.
- Does not cache prepared paths, offscreen canvases, or gradients — premature optimisation, unnecessary at the expected graphics volume.

## Public Interface

All functions are named exports from `src/renderer.ts`. The first parameter is always `ctx: CanvasRenderingContext2D`. The module has no state.

- `clearScreen(ctx): void` — fills the entire canvas with black (`fillStyle = COLOR_BG`, `fillRect(0, 0, WIDTH, HEIGHT)`). Called once at the start of each frame by the active scene.
- `drawPolyline(ctx, points: Vec2[], closed: boolean = true): void` — draws a polyline through an array of points. If `closed === true` — closes it into a polygon (used for asteroids, the ship, the UFO silhouette); if `false` — an open polyline (thruster flame line, debug lines).
- `drawCircleOutline(ctx, center: Vec2, radius: number): void` — draws a circle outline (`ctx.arc` + `stroke`). Used for debug visualisation of collision radii and, if needed, for stylised UFO elements.
- `drawTriangle(ctx, center: Vec2, heading: number, size: number): void` — draws the ship's triangular silhouette with its tip in the `heading` direction (radians) and overall `size` (distance from centre to nose, in pixels). Internally reduces to constructing three points and calling `drawPolyline(ctx, points, true)` — see Key Flows for the exact algorithm.
- `drawPoint(ctx, p: Vec2, size: number = 1): void` — draws a point (a small `fillRect` square of `size × size` centred at `p`). Used for bullets and particles, where a full circle is excessive.
- `drawText(ctx, text: string, p: Vec2, options?: { align?: CanvasTextAlign; size?: number; color?: string }): void` — draws a string in monospace font. Defaults: `align = 'left'`, `size = 16`, `color = COLOR_FG` (`'#fff'`). Sets `ctx.font = "${size}px monospace"`, applies `textAlign`, `fillStyle`, calls `fillText(text, p.x, p.y)`.
- `withWrap(ctx, position: Vec2, radius: number, draw: (offset: Vec2) => void): void` — calls `draw(ZERO)` for the primary position and additionally calls `draw(offset)` for each border the entity is closer to than `radius`. Possible offsets: `(±WIDTH, 0)`, `(0, ±HEIGHT)`, `(±WIDTH, ±HEIGHT)` — up to 3 additional calls (corners).

Types: `Vec2` is imported from `vec2-math`. `CanvasTextAlign` is a built-in DOM type.

## Data Model

The module owns no long-lived data. Shape of public values:

**Internal style constants** (exported if needed, otherwise private):

| Name | Type | Value | Purpose |
|---|---|---|---|
| `COLOR_BG` | string | `'#000'` | canvas background colour |
| `COLOR_FG` | string | `'#fff'` | default colour for all lines and text |
| `LINE_WIDTH` | number | `1` | line width for all primitives |
| `FONT_FAMILY` | string | `'monospace'` | font family for `drawText` |
| `FONT_SIZE_DEFAULT` | number | `16` | default font size in `drawText` |

Decision on constant location: kept in `renderer.ts` as private module constants. Moving them to `config` makes no sense — these are not balance parameters, they are not subject to tuning, and they are tightly coupled to the module's implementation. If a theme is needed later (e.g. "green phosphor" instead of white) — the constants will be promoted to `config` in a single commit.

**`options` argument in `drawText`**:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `align` | `CanvasTextAlign` | `'left'` | horizontal alignment (`'left' \| 'center' \| 'right'`) |
| `size` | number | `16` | font size in pixels |
| `color` | string | `'#fff'` | text colour (for rare deviations — e.g. a blinking "PRESS START" can alternate between `'#fff'` and `'#888'`) |

The module has no state, indexes, or relations.

## Key Flows

**Clearing the screen and rendering a frame.** `GameScene.draw(ctx)` at the start of each frame calls `clearScreen(ctx)` — the canvas is filled with black. Then the scene iterates its entities (ship, asteroids, bullets, UFOs, particles) and calls `entity.draw(ctx)` on each. The entity inside `draw` calls module utilities — `drawPolyline`, `drawTriangle`, `drawPoint`. Finally the scene draws the HUD via `drawText` (score, lives, wave number). The `renderer` module here is a pure primitive library; the order and composition of calls is entirely determined by the scene.

**Building the ship triangle `drawTriangle(ctx, center, heading, size)`.** The function computes three vertices of a local triangle: the nose at `(size, 0)`, and two rear vertices symmetrical about the heading axis — approximately `(-size * 0.7, ±size * 0.6)` (exact coefficients determined at implementation, retro silhouette). Each local point is rotated by `heading` using `rotate` from `vec2-math` and shifted by `center`. The resulting array of three `Vec2` values is passed to `drawPolyline(ctx, points, true)`. No `ctx.translate/rotate` is used — computation is done in coordinates, `ctx` is used only for drawing: this is simpler for wrap rendering (see below) and leaves no "leaking" transforms in the context.

**Wrap rendering via `withWrap`.** An entity in its `draw(ctx)` calls `withWrap(ctx, this.position, this.radius, (offset) => { /* draw with offset */ })`. Inside `withWrap`:
1. The set of required offsets is computed: empty set by default; if `position.x < radius` — add `+WIDTH` to the x-offset; if `position.x > WIDTH - radius` — add `-WIDTH`; analogously for `y`. The output is 0, 1, 2, or 3 non-zero offsets (the last case near a corner).
2. `draw({x: 0, y: 0})` is always called for the primary position.
3. For each non-zero offset an additional `draw(offset)` call is made. The callback is responsible for applying `offset` to the primitive coordinates (e.g. `drawPolyline(ctx, points.map(p => ({x: p.x + offset.x, y: p.y + offset.y})), true)`).

Alternative — using `ctx.save/translate/restore` inside `withWrap` so the callback doesn't need to handle the offset. That solution is shorter in calling code but requires the drawing code to be written in the entity's local coordinates. The explicit offset-callback is preferred: entities already store world coordinates, and adding `offset` to ready-made points is trivial, while the risk of "forgetting `restore`" disappears.

**Drawing HUD text.** `GameScene.draw` at the end of a frame calls `drawText(ctx, "SCORE " + score, {x: 16, y: 24}, { size: 20 })` and similar lines for lives and wave. `GameOverScene` renders `drawText(ctx, "GAME OVER", {x: WIDTH/2, y: HEIGHT/2}, { align: 'center', size: 48 })` and the score table line by line. Each call is self-contained — it sets `font`, `textAlign`, `fillStyle` itself; no need to care about ordering between calls.

## Dependencies

- **`vec2-math`** — the `Vec2` type, the `rotate` function (for rotating ship triangle vertices). Stateless pure functions.
- **`config`** — constants `CANVAS.WIDTH` and `CANVAS.HEIGHT`: needed exclusively inside `withWrap` for computing offsets at the torus borders. Nothing else from `config` is read.
- **Standard browser API `CanvasRenderingContext2D`** — via the context passed as the first argument. The module does not create the context itself.

Has no reverse dependencies. Importers include: `Ship`, `Asteroid`, `Bullet`, `Ufo`, `Particle`, all scenes (`MenuScene`, `GameScene`, `PauseScene`, `GameOverScene`).

## Error Handling

- **Empty point array in `drawPolyline`.** Scenario: calling code passes `points = []`. Response: the function draws nothing and returns without errors. Internally the implementation starts with `if (points.length < 2) return;` — `moveTo/lineTo` for a single point is meaningless, throwing an exception is unnecessary, this is a graceful no-op.
- **Negative or zero `radius` in `drawCircleOutline` / `withWrap`.** A contract violation; in a dev build it will manifest visually as nothing drawn / strange wrap behaviour, same in prod. No runtime checks: types and entity invariants guarantee a positive radius.
- **Invalid coordinates (`NaN`, `Infinity`) in position.** Not filtered. Canvas 2D itself safely ignores primitives with `NaN` coordinates (draws nothing and does not corrupt the context). The root of the problem is a bug in physics; it should be caught in `update`, not hidden here.
- **Downstream browser failure.** `CanvasRenderingContext2D` does not throw exceptions in normal scenarios; the context can only be `null` during initialisation, and that is checked in `Bootstrap`, not here.
- **Partial success.** Not applicable: each function is atomic within a single frame; drawing several primitives is a series of independent calls from the scene.
- **Errors further up the stack.** An exception accidentally thrown from an entity's `draw` is caught by the game loop's top-level try/catch (see the architecture "Error Handling" section) and results in a transition to `MenuScene` — the `renderer` module itself throws nothing externally.

## Stack & Libraries

- **TypeScript + `CanvasRenderingContext2D`.** Dictated by the architecture. No render libraries (Pixi, Konva, Two.js) — the graphics volume is trivial, built-in Canvas 2D is sufficient.
- **Functional style, no classes.** The module is a set of pure functions; a `Renderer` wrapper class with methods gives no benefit (there is no state anyway), and only adds noise to imports.
- **Font — system `monospace` via `ctx.font`.** No external fonts (`@font-face`, Google Fonts) — the retro style is preserved by any system monospace font, no dependencies or loading stage.
- **No offscreen canvases / path pools.** GC pressure and overdraw at this scale (tens of lines per frame) are negligible; premature optimisation is not justified.

## Configuration

The module has no environment variables, secrets, or runtime settings. Everything that could be called "config" is the private style constants listed in the Data Model section (`COLOR_BG`, `COLOR_FG`, `LINE_WIDTH`, `FONT_FAMILY`, `FONT_SIZE_DEFAULT`). Canvas dimensions `CANVAS.WIDTH` / `CANVAS.HEIGHT` are read from the `config` module (see Dependencies). To change the theme or field size — edit either `config` or the module constants in `renderer.ts` and rebuild the bundle.

## Open Questions

- Implementation of `drawTriangle`: assemble via `drawPolyline` with three points, or via direct `moveTo/lineTo`? Preference — via `drawPolyline`, to avoid duplicating style and stroke strategy; final decision at the coding stage, if the frame profile shows unexpected cost from creating an array of three literals.
- Whether to keep `COLOR_FG`/`COLOR_BG` here or promote them to `config` immediately — depends on whether we want "themes" in the future (green phosphor, amber phosphor). For now, kept in `renderer.ts` and will be promoted if a second theme appears.
- `withWrap` with offset-callback vs. `ctx.save/translate/restore` — offset-callback chosen; if calling code regularly needs rotations/scaling before drawing (e.g. a rotating asteroid), a `withWrapTransform` helper on top of `ctx.translate` may be provided.
- Whether a separate `drawCircleFilled` (filled circle) is needed — no use case visible in MVP scenarios; if particles go with fill instead of a point, it will be added.
- Default `drawPoint` size (`1`): on HiDPI displays a pixel may be too thin. The question hinges on whether we account for `devicePixelRatio` during canvas initialisation (that is resolved in `Bootstrap`, not here). For now, fixing at `1` and revisiting when readability complaints appear.
