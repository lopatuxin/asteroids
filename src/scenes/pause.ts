import { CANVAS } from '../config';
import { drawText } from '../render/renderer';
import type { InputSystem } from '../systems/input';
import type { Scene, SceneManager } from './scene-manager';

export interface PauseSceneDeps {
  sceneManager: SceneManager;
}

export class PauseScene implements Scene {
  drawBelow = true;
  private readonly deps: PauseSceneDeps;

  constructor(deps: PauseSceneDeps) {
    this.deps = deps;
  }

  enter(): void {
    // no-op
  }

  exit(): void {
    // no-op
  }

  update(_dt: number, input: InputSystem): void {
    if (input.wasPressed('Pause') || input.wasPressed('Confirm')) {
      this.deps.sceneManager.pop();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT);
    drawText(
      ctx,
      'PAUSED',
      { x: CANVAS.WIDTH / 2, y: CANVAS.HEIGHT / 2 },
      { size: 48, align: 'center' }
    );
    drawText(
      ctx,
      'PRESS ESC OR ENTER',
      { x: CANVAS.WIDTH / 2, y: CANVAS.HEIGHT / 2 + 40 },
      { size: 16, align: 'center' }
    );
  }
}
