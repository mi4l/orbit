import { clampLength, dot, scale, sub, vec2, type Vec2 } from '../core/math';
import type { PlanetEntity, SunEntity } from '../game/entities';

export interface GravityConfig {
  gravityConstant: number;
  minDistance: number;
}

export const computeSunOnlyGravity = (
  planet: Pick<PlanetEntity, 'pos'>,
  suns: ReadonlyArray<SunEntity>,
  config: GravityConfig
): Vec2 => {
  let total = vec2(0, 0);
  const minDistSquared = config.minDistance * config.minDistance;

  for (const sun of suns) {
    const direction = sub(sun.pos, planet.pos);
    const distSquared = Math.max(dot(direction, direction), minDistSquared);
    const epsSquared = sun.softeningEpsilon * sun.softeningEpsilon;
    const denom = Math.pow(distSquared + epsSquared, 1.5);

    if (!Number.isFinite(denom) || denom <= 1e-8) continue;

    const accelScale = (config.gravityConstant * sun.mass) / denom;
    const contribution = scale(direction, accelScale);
    const clampedContribution = clampLength(contribution, sun.maxAccel);

    total = {
      x: total.x + clampedContribution.x,
      y: total.y + clampedContribution.y
    };
  }

  return total;
};
