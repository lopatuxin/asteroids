import { SIMULATION } from '../config';

const MAX_STEPS_PER_FRAME = 8;

export class GameLoop {
  private onUpdate: (dt: number) => void;
  private onRender: () => void;
  private running: boolean = false;
  private rafId: number = 0;
  private lastTime: number = 0;
  private accumulator: number = 0;

  constructor(onUpdate: (dt: number) => void, onRender: () => void) {
    this.onUpdate = onUpdate;
    this.onRender = onRender;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    let delta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (delta > SIMULATION.MAX_FRAME_TIME) delta = SIMULATION.MAX_FRAME_TIME;
    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= SIMULATION.STEP) {
      try {
        this.onUpdate(SIMULATION.STEP);
      } catch (err) {
        console.error('[loop]', err);
      }
      this.accumulator -= SIMULATION.STEP;
      steps++;
      if (steps > MAX_STEPS_PER_FRAME) {
        this.accumulator = 0;
        break;
      }
    }
    try {
      this.onRender();
    } catch (err) {
      console.error('[loop]', err);
    }
    if (this.running) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };
}
