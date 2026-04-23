# Concept — Asteroids

## What It Is
A browser arcade game — a clone of the classic Atari Asteroids (1979): a triangular spaceship in open space destroys flying asteroids while dodging collisions and UFOs.

## Who It Is For
- The developer-author — as a learning/portfolio project to practice vector math, inertia physics, circle-to-circle collisions, a `requestAnimationFrame` game loop, and scene state management.
- Retro-arcade casual players — as a short session game in the browser with no installation required.

## Why It Exists (Problem & Value)
A compact yet non-trivial project that lets you get hands-on experience with real 2D physics and a game loop — more complex than Snake, but still manageable in scope. It also produces a playable artifact that can be opened in a browser and shown to others.

## Key Scenarios
1. **New game.** The player opens the page, presses start, controls the ship (rotate left/right, thrust forward, fire, hyperspace), shoots asteroids, and earns points.
2. **Wave progression.** After all asteroids in the current wave are destroyed, the next wave launches — with more asteroids and/or a UFO enemy.
3. **Game over and high score.** When all lives are lost, the final score is displayed; if it ranks in the top — it is saved to the high-score table in `localStorage`.

## Constraints
- **Stack is fixed:** TypeScript + Canvas 2D + Vite (analogous to the Snake project).
- **Platform:** desktop browser, keyboard controls. Mobile touch controls are out of scope.
- **Single-player offline game** — no server, no accounts. All state lives in tab memory and `localStorage`.
- **Graphics:** vector, in the spirit of the 1979 original — lines on a black background, no sprites or 3D.

## Deliberately Out of Scope
- Multiplayer, online leaderboards, accounts.
- Mobile/touch version.
- Ship customization, upgrades, shop, monetization.
- Level maps, bosses, storyline.
- Level editor.

## Optional Features (for extended scope, not required for MVP)
- UFO enemy that appears periodically and shoots at the player.
- Particle effects on asteroid/ship explosions.
- Sound effects (shot, explosion, thrust, UFO appearance).
- High-score table in `localStorage`.

## What This Project Tests (Engineering Goals)
- Vector math and inertia physics (velocity as a vector, acceleration along the ship's heading, no friction).
- Circle-to-circle collision detection for all pairs (bullet↔asteroid, ship↔asteroid, UFO bullet↔ship).
- Stable game loop on `requestAnimationFrame` with a fixed/normalized time step.
- Scene state management and transitions between screens (menu, game, pause, game over).
- Game balance — speeds, sizes, asteroid counts per wave, UFO spawn frequency.
