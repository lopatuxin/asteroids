import { CANVAS } from '../config';
import { add, scale, wrapVec2, type Vec2 } from '../math/vec2';

export abstract class Entity {
  position: Vec2;
  velocity: Vec2;
  radius: number;
  alive: boolean = true;

  constructor(position: Vec2, velocity: Vec2, radius: number) {
    this.position = position;
    this.velocity = velocity;
    this.radius = radius;
  }

  abstract update(dt: number): void;
  abstract draw(ctx: CanvasRenderingContext2D): void;

  protected integrate(dt: number): void {
    this.position = wrapVec2(add(this.position, scale(this.velocity, dt)), CANVAS.WIDTH, CANVAS.HEIGHT);
  }
}
