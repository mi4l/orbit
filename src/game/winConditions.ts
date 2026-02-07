import { distance, normalize, sub, dot, length } from '../core/math';
import type { PlanetEntity, SunEntity } from './entities';
import type { LevelWinCondition } from '../levels/levelSchema';

interface OrbitCheck {
  nearestSun: SunEntity | null;
  distanceToSun: number;
  speed: number;
  radialSpeed: number;
}

const checkOrbit = (planet: PlanetEntity, suns: SunEntity[]): OrbitCheck => {
  let nearest: SunEntity | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const sun of suns) {
    const d = distance(planet.pos, sun.pos);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = sun;
    }
  }

  if (!nearest || !Number.isFinite(nearestDistance)) {
    return { nearestSun: null, distanceToSun: nearestDistance, speed: 0, radialSpeed: 0 };
  }

  const radialDir = normalize(sub(planet.pos, nearest.pos));
  const speed = length(planet.vel);
  const radialSpeed = Math.abs(dot(planet.vel, radialDir));

  return {
    nearestSun: nearest,
    distanceToSun: nearestDistance,
    speed,
    radialSpeed
  };
};

export interface OrbitProgress {
  stablePlanets: number;
  targetPlanets: number;
  stableSeconds: number;
  reached: boolean;
}

export const updateOrbitProgress = (
  planets: PlanetEntity[],
  suns: SunEntity[],
  winCondition: LevelWinCondition,
  dt: number
): OrbitProgress => {
  const orbit = winCondition.orbit;
  let stablePlanets = 0;

  for (const planet of planets) {
    const orbitCheck = checkOrbit(planet, suns);
    const qualifies =
      orbitCheck.nearestSun !== null &&
      orbitCheck.distanceToSun >= orbit.minOrbitRadius &&
      orbitCheck.distanceToSun <= orbit.maxOrbitRadius &&
      orbitCheck.speed >= orbit.minSpeed &&
      orbitCheck.speed <= orbit.maxSpeed &&
      orbitCheck.radialSpeed <= orbit.maxRadialSpeed;

    if (qualifies) {
      planet.orbitStableTime += dt;
      planet.inOrbit = true;
    } else {
      planet.orbitStableTime = 0;
      planet.inOrbit = false;
    }

    if (planet.orbitStableTime >= winCondition.stableSeconds) {
      stablePlanets += 1;
    }
  }

  return {
    stablePlanets,
    targetPlanets: winCondition.requiredPlanets,
    stableSeconds: winCondition.stableSeconds,
    reached: stablePlanets >= winCondition.requiredPlanets
  };
};
