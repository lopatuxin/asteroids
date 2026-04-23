import { BULLET } from '../config';
import { type Vec2 } from '../math/vec2';
import { drawPoint } from '../render/renderer';
import { Entity } from './entity';
import type { Ship } from './ship';
import type { Ufo } from './ufo';

export type BulletSource = 'ship' | 'ufo';

export class Bullet extends Entity {
  lifetime: number;
  source: BulletSource;
  owner: Ship | Ufo | null;

  constructor(position: Vec2, velocity: Vec2, source: BulletSource, owner: Ship | Ufo | null) {
    super(position, velocity, BULLET.RADIUS);
    this.lifetime = BULLET.LIFETIME;
    this.source = source;
    this.owner = owner;
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    if (this.source === 'ship' && this.owner) {
      (this.owner as Ship).onBulletExpired();
    }
  }

  update(dt: number): void {
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.kill();
      return;
    }
    this.integrate(dt);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawPoint(ctx, this.position, 2);
  }
}
