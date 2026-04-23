import { CANVAS, SCORING } from '../config';
import { Asteroid } from '../entities/asteroid';
import { Bullet } from '../entities/bullet';
import { Particle, spawnExplosion } from '../entities/particle';
import { Ship } from '../entities/ship';
import { Ufo } from '../entities/ufo';
import { vec2 } from '../math/vec2';
import {
  clearScreen,
  drawText,
  drawTriangle,
  withWrap,
} from '../render/renderer';
import {
  detect,
  type CollisionEvent,
  type CollisionWorld,
} from '../systems/collision';
import type { HighScoreStorage } from '../systems/highscore';
import type { InputSystem } from '../systems/input';
import { Scoring } from '../systems/scoring';
import { WaveManager } from '../systems/wave';
import { GameOverScene } from './gameover';
import { PauseScene } from './pause';
import type { Scene, SceneManager } from './scene-manager';

export interface GameSceneDeps {
  sceneManager: SceneManager;
  highScores: HighScoreStorage;
}

export class GameScene implements Scene {
  ship: Ship | null = null;
  asteroids: Asteroid[] = [];
  bullets: Bullet[] = [];
  ufos: Ufo[] = [];
  particles: Particle[] = [];

  private scoring: Scoring = new Scoring();
  private waveManager: WaveManager = new WaveManager();
  private readonly deps: GameSceneDeps;
  private respawnTimer: number = 0;

  constructor(deps: GameSceneDeps) {
    this.deps = deps;
  }

  enter(): void {
    this.scoring = new Scoring();
    this.waveManager = new WaveManager();
    this.asteroids = [];
    this.bullets = [];
    this.ufos = [];
    this.particles = [];
    this.ship = new Ship(vec2(CANVAS.WIDTH / 2, CANVAS.HEIGHT / 2));
    this.ship.respawn(vec2(CANVAS.WIDTH / 2, CANVAS.HEIGHT / 2));
    this.asteroids.push(...this.waveManager.startWave(1, this.ship.position));
    this.respawnTimer = 0;
  }

  exit(): void {
    this.ship = null;
    this.asteroids = [];
    this.bullets = [];
    this.ufos = [];
    this.particles = [];
  }

  handleResume(): void {
    // consume any stale pause press
  }

  update(dt: number, input: InputSystem): void {
    if (this.ship) {
      const s = this.ship;
      if (input.isDown('RotateLeft')) s.rotate(-1, dt);
      if (input.isDown('RotateRight')) s.rotate(1, dt);
      s.setThrust(input.isDown('Thrust'));
      if (input.wasPressed('Fire')) {
        const b = s.fire();
        if (b) this.bullets.push(b);
      }
      if (input.wasPressed('Hyperspace')) s.hyperspace();
      if (input.wasPressed('Pause')) {
        this.deps.sceneManager.push(new PauseScene({ sceneManager: this.deps.sceneManager }));
        return;
      }
    } else {
      if (input.wasPressed('Pause')) {
        this.deps.sceneManager.push(new PauseScene({ sceneManager: this.deps.sceneManager }));
        return;
      }
    }

    if (this.ship) this.ship.update(dt);
    for (const a of this.asteroids) a.update(dt);
    for (const b of this.bullets) b.update(dt);
    for (const u of this.ufos) {
      u.update(dt);
      const b = u.tryFire(this.ship ? this.ship.position : null);
      if (b) this.bullets.push(b);
    }
    for (const p of this.particles) p.update(dt);

    const world: CollisionWorld = {
      ship: this.ship,
      asteroids: this.asteroids,
      bullets: this.bullets,
      ufos: this.ufos,
    };
    const events = detect(world);
    this.resolveCollisions(events);

    this.asteroids = this.asteroids.filter((a) => a.alive);
    this.bullets = this.bullets.filter((b) => b.alive);
    this.ufos = this.ufos.filter((u) => u.alive);
    this.particles = this.particles.filter((p) => p.alive);
    if (this.ship && !this.ship.alive) {
      this.ship = null;
      this.respawnTimer = SCORING.RESPAWN_DELAY;
    }

    if (this.asteroids.length === 0 && this.ufos.length === 0) {
      this.scoring.nextWave();
      const next = this.scoring.snapshot().wave;
      const spawned = this.waveManager.startWave(
        next,
        this.ship ? this.ship.position : null
      );
      this.asteroids.push(...spawned);
    }

    const ufo = this.waveManager.maybeSpawnUfo(
      dt,
      this.scoring.snapshot().wave,
      this.ufos.length > 0
    );
    if (ufo) this.ufos.push(ufo);

    if (this.ship === null && this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        if (this.scoring.isGameOver()) {
          this.deps.sceneManager.replace(
            new GameOverScene(
              { sceneManager: this.deps.sceneManager, highScores: this.deps.highScores },
              this.scoring.snapshot()
            )
          );
          return;
        }
        const newShip = new Ship(vec2(CANVAS.WIDTH / 2, CANVAS.HEIGHT / 2));
        newShip.respawn(vec2(CANVAS.WIDTH / 2, CANVAS.HEIGHT / 2));
        this.ship = newShip;
        this.respawnTimer = 0;
      }
    }
  }

  private resolveCollisions(events: CollisionEvent[]): void {
    for (const ev of events) {
      if (!ev.a.alive || !ev.b.alive) continue;
      switch (ev.kind) {
        case 'bulletShipAsteroid': {
          const bullet = ev.a as Bullet;
          const asteroid = ev.b as Asteroid;
          bullet.kill();
          asteroid.alive = false;
          this.asteroids.push(...asteroid.split());
          this.spawnAsteroidExplosion(asteroid);
          this.scoring.addKill(asteroid.size, false);
          break;
        }
        case 'bulletShipUfo': {
          const bullet = ev.a as Bullet;
          const ufo = ev.b as Ufo;
          bullet.kill();
          ufo.alive = false;
          this.particles.push(...spawnExplosion(ufo.position, 16, [80, 200], [0.4, 0.9]));
          this.scoring.addKill(ufo.kind, true);
          break;
        }
        case 'bulletUfoShip': {
          const bullet = ev.a as Bullet;
          const ship = ev.b as Ship;
          bullet.kill();
          ship.alive = false;
          this.particles.push(...spawnExplosion(ship.position, 20, [60, 180], [0.5, 1.0]));
          this.scoring.loseLife();
          break;
        }
        case 'shipAsteroid': {
          const ship = ev.a as Ship;
          const asteroid = ev.b as Asteroid;
          ship.alive = false;
          asteroid.alive = false;
          this.asteroids.push(...asteroid.split());
          this.particles.push(...spawnExplosion(ship.position, 20, [60, 180], [0.5, 1.0]));
          this.spawnAsteroidExplosion(asteroid);
          this.scoring.loseLife();
          break;
        }
        case 'shipUfo': {
          const ship = ev.a as Ship;
          const ufo = ev.b as Ufo;
          ship.alive = false;
          ufo.alive = false;
          this.particles.push(...spawnExplosion(ship.position, 20, [60, 180], [0.5, 1.0]));
          this.particles.push(...spawnExplosion(ufo.position, 16, [80, 200], [0.4, 0.9]));
          this.scoring.loseLife();
          break;
        }
      }
    }
  }

  private spawnAsteroidExplosion(asteroid: Asteroid): void {
    const count = asteroid.size === 'large' ? 12 : asteroid.size === 'medium' ? 8 : 5;
    this.particles.push(
      ...spawnExplosion(asteroid.position, count, [60, 180], [0.4, 0.9])
    );
  }

  draw(ctx: CanvasRenderingContext2D): void {
    clearScreen(ctx);
    for (const p of this.particles) {
      withWrap(ctx, p.position, p.radius, (offset) => {
        ctx.save();
        ctx.translate(offset.x, offset.y);
        p.draw(ctx);
        ctx.restore();
      });
    }
    for (const a of this.asteroids) {
      withWrap(ctx, a.position, a.radius, (offset) => {
        ctx.save();
        ctx.translate(offset.x, offset.y);
        a.draw(ctx);
        ctx.restore();
      });
    }
    for (const u of this.ufos) {
      withWrap(ctx, u.position, u.radius, (offset) => {
        ctx.save();
        ctx.translate(offset.x, offset.y);
        u.draw(ctx);
        ctx.restore();
      });
    }
    for (const b of this.bullets) {
      withWrap(ctx, b.position, b.radius, (offset) => {
        ctx.save();
        ctx.translate(offset.x, offset.y);
        b.draw(ctx);
        ctx.restore();
      });
    }
    if (this.ship) {
      const ship = this.ship;
      withWrap(ctx, ship.position, ship.radius, (offset) => {
        ctx.save();
        ctx.translate(offset.x, offset.y);
        ship.draw(ctx);
        ctx.restore();
      });
    }
    this.drawHud(ctx);
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    const snap = this.scoring.snapshot();
    drawText(ctx, `SCORE ${snap.score}`, { x: 16, y: 28 }, { size: 20 });
    drawText(
      ctx,
      `WAVE ${snap.wave}`,
      { x: CANVAS.WIDTH - 16, y: 28 },
      { size: 20, align: 'right' }
    );
    for (let i = 0; i < snap.lives; i++) {
      drawTriangle(ctx, { x: 24 + i * 20, y: 56 }, -Math.PI / 2, 8);
    }
  }
}
