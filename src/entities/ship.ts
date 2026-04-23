import { BULLET, CANVAS, SHIP } from '../config';
import {
  add,
  fromAngle,
  length as vlen,
  normalize,
  randomRange,
  rotate as vrotate,
  scale,
  vec2,
  ZERO,
  type Vec2,
} from '../math/vec2';
import { drawPolyline } from '../render/renderer';
import { Bullet } from './bullet';
import { Entity } from './entity';

const BLINK_HZ = 10;

export class Ship extends Entity {
  heading: number = -Math.PI / 2;
  thrusting: boolean = false;
  fireCooldown: number = 0;
  invulnRemaining: number = 0;
  hyperspaceCooldown: number = 0;
  bulletsInFlight: number = 0;

  private simTime: number = 0;

  constructor(position: Vec2) {
    super(position, ZERO, SHIP.RADIUS);
  }

  rotate(dir: -1 | 0 | 1, dt: number): void {
    if (dir === 0) return;
    this.heading += dir * SHIP.ROTATION_SPEED * dt;
  }

  setThrust(on: boolean): void {
    this.thrusting = on;
  }

  fire(): Bullet | null {
    if (this.fireCooldown > 0) return null;
    if (this.bulletsInFlight >= SHIP.MAX_BULLETS) return null;
    const forward = fromAngle(this.heading, 1);
    const muzzle = add(this.position, scale(forward, SHIP.RADIUS));
    const bulletVel = add(this.velocity, scale(forward, BULLET.SPEED));
    const b = new Bullet(muzzle, bulletVel, 'ship', this);
    this.fireCooldown = SHIP.FIRE_COOLDOWN;
    this.bulletsInFlight += 1;
    return b;
  }

  hyperspace(): void {
    if (this.hyperspaceCooldown > 0) return;
    this.position = vec2(randomRange(0, CANVAS.WIDTH), randomRange(0, CANVAS.HEIGHT));
    this.velocity = ZERO;
    this.hyperspaceCooldown = SHIP.HYPERSPACE_COOLDOWN;
    if (Math.random() < SHIP.HYPERSPACE_FAIL_CHANCE) {
      this.alive = false;
    }
  }

  respawn(centerPos: Vec2): void {
    this.position = centerPos;
    this.velocity = ZERO;
    this.heading = -Math.PI / 2;
    this.fireCooldown = 0;
    this.hyperspaceCooldown = 0;
    this.invulnRemaining = SHIP.RESPAWN_INVULN_TIME;
    this.alive = true;
    this.thrusting = false;
  }

  onBulletExpired(): void {
    if (this.bulletsInFlight > 0) this.bulletsInFlight -= 1;
  }

  isInvulnerable(): boolean {
    return this.invulnRemaining > 0;
  }

  update(dt: number): void {
    this.simTime += dt;
    if (this.thrusting) {
      const forward = fromAngle(this.heading, 1);
      this.velocity = add(this.velocity, scale(forward, SHIP.THRUST_ACCEL * dt));
      const speed = vlen(this.velocity);
      if (speed > SHIP.MAX_SPEED) {
        this.velocity = scale(normalize(this.velocity), SHIP.MAX_SPEED);
      }
    }
    if (this.fireCooldown > 0) {
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    }
    if (this.hyperspaceCooldown > 0) {
      this.hyperspaceCooldown = Math.max(0, this.hyperspaceCooldown - dt);
    }
    if (this.invulnRemaining > 0) {
      this.invulnRemaining = Math.max(0, this.invulnRemaining - dt);
    }
    this.integrate(dt);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.isInvulnerable()) {
      if (Math.floor(this.simTime * BLINK_HZ) % 2 === 0) return;
    }
    const size = SHIP.RADIUS;
    const local: Vec2[] = [
      { x: size, y: 0 },
      { x: -size * 0.7, y: size * 0.6 },
      { x: -size * 0.4, y: 0 },
      { x: -size * 0.7, y: -size * 0.6 },
    ];
    const pts = local.map((p) => {
      const r = vrotate(p, this.heading);
      return { x: r.x + this.position.x, y: r.y + this.position.y };
    });
    drawPolyline(ctx, pts, true);

    if (this.thrusting && Math.floor(this.simTime * 20) % 2 === 0) {
      const flame: Vec2[] = [
        { x: -size * 0.4, y: size * 0.3 },
        { x: -size * 1.1, y: 0 },
        { x: -size * 0.4, y: -size * 0.3 },
      ];
      const fpts = flame.map((p) => {
        const r = vrotate(p, this.heading);
        return { x: r.x + this.position.x, y: r.y + this.position.y };
      });
      drawPolyline(ctx, fpts, false);
    }
  }
}
