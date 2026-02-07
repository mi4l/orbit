import { clampLength, dot, scale, sub, vec2, type Vec2 } from '../core/math';
import type { PlanetEntity, SunEntity } from '../game/entities';

export interface GravityConfig {
  gravityConstant: number;
  minDistance: number;
  enablePlanetGravity?: boolean;
  planetGravityScale?: number;
  planetSofteningEpsilon?: number;
  planetMaxAccel?: number;
}

export interface PlanetGravitySource {
  id: string;
  pos: Vec2;
  mass: number;
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

export const computeGravityWithPlanets = (
  planet: Pick<PlanetEntity, 'id' | 'pos'>,
  suns: ReadonlyArray<SunEntity>,
  planets: ReadonlyArray<PlanetGravitySource>,
  config: GravityConfig
): Vec2 => {
  const total = computeSunOnlyGravity(planet, suns, config);
  if (!config.enablePlanetGravity) return total;

  const minDistSquared = config.minDistance * config.minDistance;
  const softening = config.planetSofteningEpsilon ?? 2.5;
  const softeningSquared = softening * softening;
  const gravityScale = config.planetGravityScale ?? 1;
  const maxAccel = config.planetMaxAccel ?? Number.POSITIVE_INFINITY;

  let result = { x: total.x, y: total.y };

  for (const source of planets) {
    if (source.id === planet.id) continue;

    const direction = sub(source.pos, planet.pos);
    const distSquared = Math.max(dot(direction, direction), minDistSquared);
    const denom = Math.pow(distSquared + softeningSquared, 1.5);
    if (!Number.isFinite(denom) || denom <= 1e-8) continue;

    const accelScale = (config.gravityConstant * gravityScale * source.mass) / denom;
    const contribution = clampLength(scale(direction, accelScale), maxAccel);

    result = {
      x: result.x + contribution.x,
      y: result.y + contribution.y
    };
  }

  return result;
};
