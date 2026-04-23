import { ASTEROID, SCORING, UFO, type AsteroidSize, type UfoKind } from '../config';

export type KillKind = AsteroidSize | UfoKind;

export interface ScoringSnapshot {
  score: number;
  lives: number;
  wave: number;
}

export class Scoring {
  private score: number = 0;
  private lives: number = SCORING.INITIAL_LIVES;
  private wave: number = 1;
  private nextBonusLifeAt: number = SCORING.BONUS_LIFE_THRESHOLD;

  addKill(kind: KillKind, isUfo: boolean = false): void {
    const pts = isUfo
      ? UFO.POINTS[kind as UfoKind]
      : ASTEROID.POINTS[kind as AsteroidSize];
    if (pts === undefined) return;
    this.score += pts;
    while (this.score >= this.nextBonusLifeAt) {
      this.lives += 1;
      this.nextBonusLifeAt += SCORING.BONUS_LIFE_THRESHOLD;
    }
  }

  loseLife(): void {
    if (this.lives <= 0) return;
    this.lives -= 1;
  }

  nextWave(): void {
    this.wave += 1;
  }

  isGameOver(): boolean {
    return this.lives === 0;
  }

  snapshot(): ScoringSnapshot {
    return { score: this.score, lives: this.lives, wave: this.wave };
  }
}
