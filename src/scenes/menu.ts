import { CANVAS } from '../config';
import { clearScreen, drawText } from '../render/renderer';
import type { HighScoreStorage, ScoreEntry } from '../systems/highscore';
import type { InputSystem } from '../systems/input';
import { GameScene } from './game-scene';
import type { Scene, SceneManager } from './scene-manager';

export interface MenuSceneDeps {
  sceneManager: SceneManager;
  highScores: HighScoreStorage;
}

export class MenuScene implements Scene {
  drawBelow = false;
  private readonly deps: MenuSceneDeps;
  private scores: ScoreEntry[] = [];

  constructor(deps: MenuSceneDeps) {
    this.deps = deps;
  }

  enter(): void {
    this.scores = this.deps.highScores.load();
  }

  exit(): void {
    // no-op
  }

  update(_dt: number, input: InputSystem): void {
    if (input.wasPressed('Confirm')) {
      this.deps.sceneManager.replace(
        new GameScene({
          sceneManager: this.deps.sceneManager,
          highScores: this.deps.highScores,
        })
      );
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    clearScreen(ctx);
    drawText(
      ctx,
      'ASTEROIDS',
      { x: CANVAS.WIDTH / 2, y: 140 },
      { size: 56, align: 'center' }
    );
    drawText(
      ctx,
      'PRESS ENTER',
      { x: CANVAS.WIDTH / 2, y: 220 },
      { size: 22, align: 'center' }
    );
    drawText(
      ctx,
      'HIGH SCORES',
      { x: CANVAS.WIDTH / 2, y: 320 },
      { size: 20, align: 'center' }
    );
    if (this.scores.length === 0) {
      drawText(
        ctx,
        'NO SCORES YET',
        { x: CANVAS.WIDTH / 2, y: 360 },
        { size: 16, align: 'center' }
      );
    } else {
      const startY = 360;
      for (let i = 0; i < this.scores.length; i++) {
        const e = this.scores[i];
        const rank = String(i + 1).padStart(2, ' ');
        const score = String(e.score).padStart(7, ' ');
        drawText(
          ctx,
          `${rank}. ${e.name}  ${score}`,
          { x: CANVAS.WIDTH / 2, y: startY + i * 22 },
          { size: 16, align: 'center' }
        );
      }
    }
  }
}
