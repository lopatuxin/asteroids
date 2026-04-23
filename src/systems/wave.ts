import { ASTEROID, CANVAS, WAVE } from '../config';
import { Asteroid } from '../entities/asteroid';
import { Ufo } from '../entities/ufo';
import { distance, randomRange, vec2, type Vec2 } from '../math/vec2';

export class WaveManager {
  ufoSpawnCooldown: number = 0;

  startWave(n: number, shipPos: Vec2 | null): Asteroid[] {
    const count = Math.min(
      WAVE.MAX_ASTEROIDS,
      WAVE.INITIAL_ASTEROIDS + WAVE.ASTEROIDS_PER_WAVE_INCREMENT * (n - 1)
    );
    const anchor = shipPos ?? vec2(CANVAS.WIDTH / 2, CANVAS.HEIGHT / 2);
    const out: Asteroid[] = [];
    for (let i = 0; i < count; i++) {
      let pos: Vec2 = vec2(0, 0);
      for (let attempts = 0; attempts < 20; attempts++) {
        pos = vec2(randomRange(0, CANVAS.WIDTH), randomRange(0, CANVAS.HEIGHT));
        if (distance(pos, anchor) >= WAVE.SAFE_RADIUS) break;
      }
      const angle = Math.random() * Math.PI * 2;
      const speed = randomRange(ASTEROID.SPEED_MIN, ASTEROID.SPEED_MAX);
      const velocity = vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
      out.push(new Asteroid('large', pos, velocity));
    }
    return out;
  }

  maybeSpawnUfo(dt: number, wave: number, hasUfo: boolean): Ufo | null {
    if (hasUfo) return null;
    this.ufoSpawnCooldown -= dt;
    if (this.ufoSpawnCooldown > 0) return null;
    const p = Math.min(
      WAVE.UFO_SPAWN_CHANCE_MAX,
      WAVE.UFO_SPAWN_CHANCE_BASE + wave * WAVE.UFO_SPAWN_CHANCE_PER_WAVE
    );
    this.ufoSpawnCooldown = WAVE.UFO_SPAWN_CHECK_INTERVAL;
    if (Math.random() >= p) return null;
    let kind: 'large' | 'small' = 'large';
    if (wave >= WAVE.UFO_SMALL_THRESHOLD_WAVE) {
      const pSmall = Math.min(
        WAVE.UFO_SMALL_MAX_CHANCE,
        (wave - WAVE.UFO_SMALL_THRESHOLD_WAVE + 1) * WAVE.UFO_SMALL_CHANCE_PER_WAVE
      );
      if (Math.random() < pSmall) kind = 'small';
    }
    return new Ufo(kind);
  }
}
