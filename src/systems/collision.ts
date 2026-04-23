import { CANVAS } from '../config';
import type { Asteroid } from '../entities/asteroid';
import type { Bullet } from '../entities/bullet';
import type { Entity } from '../entities/entity';
import type { Ship } from '../entities/ship';
import type { Ufo } from '../entities/ufo';
import { distanceSqTorus } from '../math/vec2';

export type CollisionKind =
  | 'bulletShipAsteroid'
  | 'bulletShipUfo'
  | 'bulletUfoShip'
  | 'shipAsteroid'
  | 'shipUfo';

export interface CollisionEvent {
  kind: CollisionKind;
  a: Entity;
  b: Entity;
}

export interface CollisionWorld {
  ship: Ship | null;
  asteroids: Asteroid[];
  bullets: Bullet[];
  ufos: Ufo[];
}

function overlap(a: Entity, b: Entity): boolean {
  const rSum = a.radius + b.radius;
  return distanceSqTorus(a.position, b.position, CANVAS.WIDTH, CANVAS.HEIGHT) < rSum * rSum;
}

export function detect(world: CollisionWorld): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  const ship = world.ship;
  const shipVulnerable = ship !== null && ship.alive && !ship.isInvulnerable();

  for (const bullet of world.bullets) {
    if (!bullet.alive) continue;
    if (bullet.source === 'ship') {
      for (const asteroid of world.asteroids) {
        if (!asteroid.alive) continue;
        if (overlap(bullet, asteroid)) {
          events.push({ kind: 'bulletShipAsteroid', a: bullet, b: asteroid });
        }
      }
      for (const ufo of world.ufos) {
        if (!ufo.alive) continue;
        if (overlap(bullet, ufo)) {
          events.push({ kind: 'bulletShipUfo', a: bullet, b: ufo });
        }
      }
    } else if (bullet.source === 'ufo') {
      if (shipVulnerable && ship) {
        if (overlap(bullet, ship)) {
          events.push({ kind: 'bulletUfoShip', a: bullet, b: ship });
        }
      }
    }
  }

  if (shipVulnerable && ship) {
    for (const asteroid of world.asteroids) {
      if (!asteroid.alive) continue;
      if (overlap(ship, asteroid)) {
        events.push({ kind: 'shipAsteroid', a: ship, b: asteroid });
      }
    }
    for (const ufo of world.ufos) {
      if (!ufo.alive) continue;
      if (overlap(ship, ufo)) {
        events.push({ kind: 'shipUfo', a: ship, b: ufo });
      }
    }
  }

  return events;
}
