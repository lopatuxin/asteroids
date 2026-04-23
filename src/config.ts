export const CANVAS = {
  WIDTH: 960,
  HEIGHT: 720,
} as const;

export const SIMULATION = {
  HZ: 60,
  STEP: 1 / 60,
  MAX_FRAME_TIME: 0.25,
} as const;

export const SHIP = {
  RADIUS: 12,
  MAX_SPEED: 400,
  THRUST_ACCEL: 250,
  ROTATION_SPEED: 3.5,
  FRICTION: 0,
  FIRE_COOLDOWN: 0.25,
  MAX_BULLETS: 4,
  RESPAWN_INVULN_TIME: 2.0,
  HYPERSPACE_COOLDOWN: 1.0,
  HYPERSPACE_FAIL_CHANCE: 0.1,
} as const;

export const BULLET = {
  RADIUS: 2,
  SPEED: 600,
  LIFETIME: 1.0,
} as const;

export type AsteroidSize = 'large' | 'medium' | 'small';
export type UfoKind = 'large' | 'small';

export const ASTEROID = {
  RADIUS: { large: 40, medium: 20, small: 10 } as Record<AsteroidSize, number>,
  SPEED_MIN: 30,
  SPEED_MAX: 90,
  VERTICES_MIN: 8,
  VERTICES_MAX: 12,
  ROUGHNESS: 0.35,
  POINTS: { large: 20, medium: 50, small: 100 } as Record<AsteroidSize, number>,
  ANGULAR_SPEED_MAX: 1.5,
} as const;

export const UFO = {
  RADIUS: { large: 20, small: 10 } as Record<UfoKind, number>,
  SPEED: { large: 120, small: 160 } as Record<UfoKind, number>,
  DIRECTION_CHANGE_INTERVAL: 1.5,
  FIRE_INTERVAL: 1.2,
  SMALL_AIM_ACCURACY: 0.9,
  LARGE_AIM_ACCURACY: 0.3,
  POINTS: { large: 200, small: 1000 } as Record<UfoKind, number>,
} as const;

export const WAVE = {
  INITIAL_ASTEROIDS: 4,
  ASTEROIDS_PER_WAVE_INCREMENT: 2,
  MAX_ASTEROIDS: 11,
  START_DELAY: 2.0,
  UFO_SPAWN_CHANCE_BASE: 0.002,
  UFO_SPAWN_CHANCE_PER_WAVE: 0.0005,
  UFO_SPAWN_CHANCE_MAX: 0.01,
  UFO_SMALL_THRESHOLD_WAVE: 3,
  SAFE_RADIUS: 160,
  UFO_SPAWN_CHECK_INTERVAL: 1.0,
  UFO_SMALL_CHANCE_PER_WAVE: 0.15,
  UFO_SMALL_MAX_CHANCE: 0.8,
} as const;

export const SCORING = {
  INITIAL_LIVES: 3,
  BONUS_LIFE_THRESHOLD: 10000,
  HIGHSCORE_TABLE_SIZE: 10,
  HIGHSCORE_NAME_LENGTH: 3,
  HIGHSCORE_STORAGE_KEY: 'asteroids.highscores',
  RESPAWN_DELAY: 2.0,
} as const;

export type Action =
  | 'RotateLeft'
  | 'RotateRight'
  | 'Thrust'
  | 'Fire'
  | 'Hyperspace'
  | 'Pause'
  | 'Confirm';

export const INPUT_BINDINGS: Readonly<Record<string, Action>> = {
  ArrowLeft: 'RotateLeft',
  ArrowRight: 'RotateRight',
  ArrowUp: 'Thrust',
  Space: 'Fire',
  ShiftLeft: 'Hyperspace',
  ShiftRight: 'Hyperspace',
  Escape: 'Pause',
  KeyP: 'Pause',
  Enter: 'Confirm',
};

export const INPUT_PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
]);
