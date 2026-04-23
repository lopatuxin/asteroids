import { fromAngle, randomRange, type Vec2 } from '../math/vec2';
import { Entity } from './entity';

export class Particle extends Entity {
  lifetime: number;
  maxLifetime: number;

  constructor(position: Vec2, velocity: Vec2, lifetime: number) {
    super(position, velocity, 1);
    this.lifetime = lifetime;
    this.maxLifetime = lifetime;
  }

  update(dt: number): void {
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.alive = false;
      return;
    }
    this.integrate(dt);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const alpha = this.maxLifetime > 0 ? this.lifetime / this.maxLifetime : 0;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = '#fff';
    ctx.fillRect(this.position.x - 1, this.position.y - 1, 2, 2);
    ctx.restore();
  }
}

export function spawnExplosion(
  position: Vec2,
  count: number,
  speedRange: [number, number],
  lifetimeRange: [number, number]
): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomRange(speedRange[0], speedRange[1]);
    const vel = fromAngle(angle, speed);
    const life = randomRange(lifetimeRange[0], lifetimeRange[1]);
    out.push(new Particle(position, vel, life));
  }
  return out;
}
