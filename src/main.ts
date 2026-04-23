import { CANVAS } from './config';
import { GameLoop } from './loop/game-loop';
import { MenuScene } from './scenes/menu';
import { SceneManager } from './scenes/scene-manager';
import { HighScoreStorage } from './systems/highscore';
import { InputSystem } from './systems/input';

export function bootstrap(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Canvas #game not found in document');
  }
  canvas.width = CANVAS.WIDTH;
  canvas.height = CANVAS.HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const input = new InputSystem();
  input.attach(window);
  const sceneManager = new SceneManager();
  const highScores = new HighScoreStorage();

  const loop = new GameLoop(
    (dt) => {
      sceneManager.update(dt, input);
      input.clearFrame();
    },
    () => sceneManager.draw(ctx)
  );

  sceneManager.push(new MenuScene({ sceneManager, highScores }));
  loop.start();

  window.addEventListener('beforeunload', () => {
    loop.stop();
    input.detach();
  });
}

bootstrap();
