import { CANVAS, SCORING } from '../config';
import { clearScreen, drawText } from '../render/renderer';
import type { HighScoreStorage, ScoreEntry } from '../systems/highscore';
import type { InputSystem } from '../systems/input';
import type { ScoringSnapshot } from '../systems/scoring';
import { MenuScene } from './menu';
import type { Scene, SceneManager } from './scene-manager';

export interface GameOverSceneDeps {
  sceneManager: SceneManager;
  highScores: HighScoreStorage;
}

type Mode = 'name' | 'scores';

export class GameOverScene implements Scene {
  drawBelow = false;
  private readonly deps: GameOverSceneDeps;
  private readonly snapshot: ScoringSnapshot;
  private mode: Mode = 'scores';
  private scores: ScoreEntry[] = [];
  private position: number | null = null;
  private cursorPos: 0 | 1 | 2 = 0;
  private finalName: string[] = ['A', 'A', 'A'];
  private accepted: boolean = false;

  constructor(deps: GameOverSceneDeps, snapshot: ScoringSnapshot) {
    this.deps = deps;
    this.snapshot = snapshot;
  }

  enter(): void {
    const current = this.deps.highScores.load();
    const threshold =
      current.length < SCORING.HIGHSCORE_TABLE_SIZE
        ? -Infinity
        : current[current.length - 1]?.score ?? 0;
    if (this.snapshot.score > threshold) {
      this.accepted = true;
      this.mode = 'name';
      this.cursorPos = 0;
      this.finalName = ['A', 'A', 'A'];
    } else {
      this.accepted = false;
      this.mode = 'scores';
      this.scores = current;
    }
  }

  exit(): void {
    // no-op
  }

  update(_dt: number, input: InputSystem): void {
    if (this.mode === 'name') {
      if (input.wasPressed('RotateLeft')) {
        this.cursorPos = ((this.cursorPos + 2) % 3) as 0 | 1 | 2;
      }
      if (input.wasPressed('RotateRight')) {
        this.cursorPos = ((this.cursorPos + 1) % 3) as 0 | 1 | 2;
      }
      if (input.wasPressed('Thrust')) {
        this.finalName[this.cursorPos] = this.shiftChar(this.finalName[this.cursorPos], 1);
      }
      if (input.wasPressed('Fire')) {
        this.finalName[this.cursorPos] = this.shiftChar(this.finalName[this.cursorPos], -1);
      }
      if (input.wasPressed('Confirm')) {
        const name = this.finalName.join('');
        const res = this.deps.highScores.trySubmit(this.snapshot.score, name);
        this.position = res.position;
        this.scores = this.deps.highScores.load();
        this.mode = 'scores';
      }
    } else {
      if (input.wasPressed('Confirm')) {
        this.deps.sceneManager.replace(
          new MenuScene({
            sceneManager: this.deps.sceneManager,
            highScores: this.deps.highScores,
          })
        );
      }
    }
  }

  private shiftChar(ch: string, delta: number): string {
    const A = 'A'.charCodeAt(0);
    const code = ch.charCodeAt(0);
    const idx = ((code - A + delta) % 26 + 26) % 26;
    return String.fromCharCode(A + idx);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    clearScreen(ctx);
    drawText(
      ctx,
      'GAME OVER',
      { x: CANVAS.WIDTH / 2, y: 140 },
      { size: 48, align: 'center' }
    );
    drawText(
      ctx,
      `SCORE ${this.snapshot.score}`,
      { x: CANVAS.WIDTH / 2, y: 200 },
      { size: 24, align: 'center' }
    );

    if (this.mode === 'name') {
      drawText(
        ctx,
        'ENTER YOUR NAME',
        { x: CANVAS.WIDTH / 2, y: 280 },
        { size: 18, align: 'center' }
      );
      const cellW = 40;
      const totalW = cellW * 3;
      const startX = CANVAS.WIDTH / 2 - totalW / 2;
      for (let i = 0; i < 3; i++) {
        const x = startX + i * cellW + cellW / 2;
        const color = i === this.cursorPos ? '#ff0' : '#fff';
        drawText(ctx, this.finalName[i], { x, y: 340 }, { size: 36, align: 'center', color });
      }
      drawText(
        ctx,
        'LEFT/RIGHT: MOVE  UP/FIRE: CHANGE  ENTER: OK',
        { x: CANVAS.WIDTH / 2, y: 400 },
        { size: 14, align: 'center' }
      );
    } else {
      drawText(
        ctx,
        'HIGH SCORES',
        { x: CANVAS.WIDTH / 2, y: 280 },
        { size: 20, align: 'center' }
      );
      if (this.scores.length === 0) {
        drawText(
          ctx,
          'NO SCORES YET',
          { x: CANVAS.WIDTH / 2, y: 320 },
          { size: 16, align: 'center' }
        );
      } else {
        const startY = 320;
        for (let i = 0; i < this.scores.length; i++) {
          const e = this.scores[i];
          const highlight = this.accepted && this.position === i;
          const rank = String(i + 1).padStart(2, ' ');
          const score = String(e.score).padStart(7, ' ');
          drawText(
            ctx,
            `${rank}. ${e.name}  ${score}`,
            { x: CANVAS.WIDTH / 2, y: startY + i * 22 },
            { size: 16, align: 'center', color: highlight ? '#ff0' : '#fff' }
          );
        }
      }
      drawText(
        ctx,
        'PRESS ENTER',
        { x: CANVAS.WIDTH / 2, y: CANVAS.HEIGHT - 40 },
        { size: 18, align: 'center' }
      );
    }
  }
}
