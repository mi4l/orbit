import type { Vec2 } from '../core/math';
import type { HazardEntity, PlanetEntity, SunEntity } from '../game/entities';
import type { Bounds } from './collisions';
import { isPreviewUnsafe } from './collisions';
import { computeSunOnlyGravity, type GravityConfig } from './gravity';
import { integrateTempBody } from './integrator';

export interface PreviewLine {
  planetId: string;
  points: Vec2[];
  danger: boolean;
}

export interface PreviewConfig {
  dt: number;
  steps: number;
  drag: number;
  gravity: GravityConfig;
}

export const buildTrajectoryPreview = (
  planets: ReadonlyArray<PlanetEntity>,
  suns: ReadonlyArray<SunEntity>,
  bounds: Bounds,
  hazards: ReadonlyArray<HazardEntity>,
  config: PreviewConfig
): PreviewLine[] =>
  planets.map((planet) => {
    const points: Vec2[] = [{ x: planet.pos.x, y: planet.pos.y }];
    const temp = {
      pos: { x: planet.pos.x, y: planet.pos.y },
      vel: { x: planet.vel.x, y: planet.vel.y },
      maxSpeed: planet.maxSpeed
    };

    let danger = false;

    for (let step = 0; step < config.steps; step += 1) {
      const accel = computeSunOnlyGravity(temp, suns, config.gravity);
      integrateTempBody(temp, accel, config.dt, { globalDrag: config.drag });

      if (step % 2 === 0 || step === config.steps - 1) {
        points.push({ x: temp.pos.x, y: temp.pos.y });
      }

      if (isPreviewUnsafe(temp.pos, planet.radius, bounds, hazards)) {
        danger = true;
        break;
      }
    }

    return {
      planetId: planet.id,
      points,
      danger
    };
  });
