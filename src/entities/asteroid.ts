import { ASTEROID, type AsteroidSize } from '../config';
import {
  degToRad,
  randomInt,
  randomRange,
  rotate as vrotate,
  scale,
  type Vec2,
} from '../math/vec2';
import { drawPolyline } from '../render/renderer';
import { Entity } from './entity';

export class Asteroid extends Entity {
  size: AsteroidSize;
  shape: readonly number[];
  rotation: number = 0;
  angularVelocity: number;

  constructor(size: AsteroidSize, position: Vec2, velocity: Vec2) {
    super(position, velocity, ASTEROID.RADIUS[size]);
    this.size = size;
    const n = randomInt(ASTEROID.VERTICES_MIN, ASTEROID.VERTICES_MAX);
    const shape: number[] = [];
    for (let i = 0; i < n; i++) {
      shape.push(this.radius * (1 + randomRange(-ASTEROID.ROUGHNESS, ASTEROID.ROUGHNESS)));
    }
    this.shape = shape;
    this.angularVelocity = randomRange(-ASTEROID.ANGULAR_SPEED_MAX, ASTEROID.ANGULAR_SPEED_MAX);
  }

  update(dt: number): void {
    this.rotation += this.angularVelocity * dt;
    this.integrate(dt);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const n = this.shape.length;
    const pts: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      const theta = (i / n) * Math.PI * 2 + this.rotation;
      const r = this.shape[i];
      pts.push({
        x: this.position.x + Math.cos(theta) * r,
        y: this.position.y + Math.sin(theta) * r,
      });
    }
    drawPolyline(ctx, pts, true);
  }

  split(): Asteroid[] {
    if (this.size === 'small') return [];
    const nextSize: AsteroidSize = this.size === 'large' ? 'medium' : 'small';
    const angleA = degToRad(randomRange(30, 45));
    const angleB = -degToRad(randomRange(30, 45));
    const speedMul = randomRange(1.2, 1.6);
    const vA = scale(vrotate(this.velocity, angleA), speedMul);
    const vB = scale(vrotate(this.velocity, angleB), speedMul);
    return [
      new Asteroid(nextSize, this.position, vA),
      new Asteroid(nextSize, this.position, vB),
    ];
  }
}
