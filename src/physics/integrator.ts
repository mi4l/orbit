import { clampLength, isFiniteVec, scale, type Vec2 } from '../core/math';
import type { PlanetEntity } from '../game/entities';

export interface IntegratorConfig {
  globalDrag: number;
}

export const integratePlanet = (
  planet: Pick<PlanetEntity, 'pos' | 'vel' | 'maxSpeed'>,
  accel: Vec2,
  dt: number,
  config: IntegratorConfig
): boolean => {
  planet.vel.x += accel.x * dt;
  planet.vel.y += accel.y * dt;

  if (config.globalDrag > 0) {
    const dragFactor = Math.max(0, 1 - config.globalDrag * dt);
    planet.vel.x *= dragFactor;
    planet.vel.y *= dragFactor;
  }

  const clampedVel = clampLength(planet.vel, planet.maxSpeed);
  planet.vel.x = clampedVel.x;
  planet.vel.y = clampedVel.y;

  planet.pos.x += planet.vel.x * dt;
  planet.pos.y += planet.vel.y * dt;

  return isFiniteVec(planet.pos) && isFiniteVec(planet.vel);
};

export const integrateTempBody = (
  body: { pos: Vec2; vel: Vec2; maxSpeed: number },
  accel: Vec2,
  dt: number,
  config: IntegratorConfig
): void => {
  body.vel = {
    x: body.vel.x + accel.x * dt,
    y: body.vel.y + accel.y * dt
  };

  if (config.globalDrag > 0) {
    const dragFactor = Math.max(0, 1 - config.globalDrag * dt);
    body.vel = scale(body.vel, dragFactor);
  }

  body.vel = clampLength(body.vel, body.maxSpeed);
  body.pos = {
    x: body.pos.x + body.vel.x * dt,
    y: body.pos.y + body.vel.y * dt
  };
};
