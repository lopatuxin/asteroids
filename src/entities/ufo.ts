import { BULLET, CANVAS, UFO, type UfoKind } from '../config';
import {
  normalize,
  randomRange,
  rotate as vrotate,
  scale,
  sub,
  vec2,
  wrap,
  type Vec2,
} from '../math/vec2';
import { drawPolyline } from '../render/renderer';
import { Bullet } from './bullet';
import { Entity } from './entity';

const MAX_SPREAD = Math.PI / 4;

export class Ufo extends Entity {
  kind: UfoKind;
  directionTimer: number;
  fireTimer: number;

  constructor(kind: UfoKind) {
    const radius = UFO.RADIUS[kind];
    const speed = UFO.SPEED[kind];
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const x = side === 'left' ? 0 : CANVAS.WIDTH;
    const y = randomRange(0, CANVAS.HEIGHT);
    const vx = side === 'left' ? speed : -speed;
    const vy = randomRange(-speed * 0.25, speed * 0.25);
    super(vec2(x, y), vec2(vx, vy), radius);
    this.kind = kind;
    this.directionTimer = UFO.DIRECTION_CHANGE_INTERVAL + randomRange(-0.3, 0.3);
    this.fireTimer = UFO.FIRE_INTERVAL + randomRange(-0.3, 0.3);
  }

  update(dt: number): void {
    this.directionTimer -= dt;
    if (this.directionTimer <= 0) {
      const speed = UFO.SPEED[this.kind];
      this.velocity = { x: this.velocity.x, y: randomRange(-speed * 0.5, speed * 0.5) };
      this.directionTimer = UFO.DIRECTION_CHANGE_INTERVAL + randomRange(-0.3, 0.3);
    }
    this.fireTimer -= dt;

    this.position = {
      x: this.position.x + this.velocity.x * dt,
      y: wrap(this.position.y + this.velocity.y * dt, CANVAS.HEIGHT),
    };

    if (this.position.x < 0 || this.position.x > CANVAS.WIDTH) {
      this.alive = false;
    }
  }

  tryFire(shipPos: Vec2 | null): Bullet | null {
    if (this.fireTimer > 0) return null;
    if (shipPos === null) return null;
    const dir = normalize(sub(shipPos, this.position));
    const accuracy = this.kind === 'small' ? UFO.SMALL_AIM_ACCURACY : UFO.LARGE_AIM_ACCURACY;
    const jitter = randomRange(-1, 1) * (1 - accuracy) * MAX_SPREAD;
    const aimed = vrotate(dir, jitter);
    const vel = scale(aimed, BULLET.SPEED);
    const bullet = new Bullet(this.position, vel, 'ufo', this);
    this.fireTimer = UFO.FIRE_INTERVAL + randomRange(-0.3, 0.3);
    return bullet;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const r = this.radius;
    const cx = this.position.x;
    const cy = this.position.y;
    const body: Vec2[] = [
      { x: cx - r, y: cy },
      { x: cx - r * 0.5, y: cy + r * 0.4 },
      { x: cx + r * 0.5, y: cy + r * 0.4 },
      { x: cx + r, y: cy },
      { x: cx + r * 0.5, y: cy - r * 0.2 },
      { x: cx - r * 0.5, y: cy - r * 0.2 },
    ];
    drawPolyline(ctx, body, true);
    const dome: Vec2[] = [
      { x: cx - r * 0.4, y: cy - r * 0.2 },
      { x: cx - r * 0.25, y: cy - r * 0.55 },
      { x: cx + r * 0.25, y: cy - r * 0.55 },
      { x: cx + r * 0.4, y: cy - r * 0.2 },
    ];
    drawPolyline(ctx, dome, false);
    drawPolyline(
      ctx,
      [
        { x: cx - r, y: cy },
        { x: cx + r, y: cy },
      ],
      false
    );
  }
}
