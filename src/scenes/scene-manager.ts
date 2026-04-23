import type { InputSystem } from '../systems/input';

export interface Scene {
  drawBelow?: boolean;
  enter(): void;
  exit(): void;
  update(dt: number, input: InputSystem): void;
  draw(ctx: CanvasRenderingContext2D): void;
  handleResume?(): void;
}

export class SceneManager {
  private stack: Scene[] = [];

  push(scene: Scene): void {
    this.stack.push(scene);
    scene.enter();
  }

  pop(): Scene | null {
    if (this.stack.length === 0) return null;
    const scene = this.stack.pop()!;
    scene.exit();
    const top = this.current();
    if (top && top.handleResume) top.handleResume();
    return scene;
  }

  replace(scene: Scene): void {
    if (this.stack.length === 0) {
      this.push(scene);
      return;
    }
    const old = this.stack.pop()!;
    old.exit();
    this.stack.push(scene);
    scene.enter();
  }

  current(): Scene | null {
    return this.stack.length === 0 ? null : this.stack[this.stack.length - 1];
  }

  update(dt: number, input: InputSystem): void {
    const top = this.current();
    if (top) top.update(dt, input);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.stack.length === 0) return;
    const top = this.stack[this.stack.length - 1];
    if (top.drawBelow && this.stack.length >= 2) {
      this.stack[this.stack.length - 2].draw(ctx);
    }
    top.draw(ctx);
  }
}
