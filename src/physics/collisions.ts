import {
  add,
  distanceSquared,
  dot,
  isInsideRect,
  length,
  nearestPointInRect,
  scale,
  sub,
  type Vec2
} from '../core/math';
import type { HazardEntity, PlanetEntity, SunEntity, WallEntity } from '../game/entities';

export interface Bounds {
  width: number;
  height: number;
}

const circleRectIntersects = (
  center: Vec2,
  radius: number,
  rect: { x: number; y: number; width: number; height: number }
): boolean => {
  const nearest = nearestPointInRect(center, rect);
  return distanceSquared(center, nearest) <= radius * radius;
};

const resolveInsideRectNormal = (
  point: Vec2,
  rect: { x: number; y: number; width: number; height: number }
): Vec2 => {
  const distances = [
    { normal: { x: -1, y: 0 }, value: point.x - rect.x },
    { normal: { x: 1, y: 0 }, value: rect.x + rect.width - point.x },
    { normal: { x: 0, y: -1 }, value: point.y - rect.y },
    { normal: { x: 0, y: 1 }, value: rect.y + rect.height - point.y }
  ];
  distances.sort((a, b) => a.value - b.value);
  return distances[0].normal;
};

export const resolveWallCollisions = (planet: PlanetEntity, walls: ReadonlyArray<WallEntity>): boolean => {
  let collided = false;

  for (const wall of walls) {
    const rect = { x: wall.x, y: wall.y, width: wall.width, height: wall.height };
    const nearest = nearestPointInRect(planet.pos, rect);
    const delta = sub(planet.pos, nearest);
    const dist = length(delta);
    const overlap = planet.radius - dist;

    if (overlap <= 0) continue;

    collided = true;

    const normal =
      dist > 1e-6 ? scale(delta, 1 / dist) : resolveInsideRectNormal(planet.pos, { ...wall });

    planet.pos = add(planet.pos, scale(normal, overlap + 0.01));

    const velAlongNormal = dot(planet.vel, normal);
    if (velAlongNormal < 0) {
      const restitution = Math.max(0, Math.min(1.05, wall.restitution * planet.restitution));
      const impulse = (1 + restitution) * velAlongNormal;
      planet.vel = sub(planet.vel, scale(normal, impulse));
    }
  }

  return collided;
};

export const isOutOfBounds = (planet: PlanetEntity, bounds: Bounds): boolean =>
  planet.pos.x < -planet.radius ||
  planet.pos.y < -planet.radius ||
  planet.pos.x > bounds.width + planet.radius ||
  planet.pos.y > bounds.height + planet.radius;

export const isInHazard = (planet: PlanetEntity, hazards: ReadonlyArray<HazardEntity>): boolean => {
  return doesCircleOverlapHazard(planet.pos, planet.radius, hazards);
};

export const doesCircleOverlapHazard = (
  center: Vec2,
  radius: number,
  hazards: ReadonlyArray<HazardEntity>
): boolean => {
  for (const hazard of hazards) {
    if (
      hazard.type === 'circle' &&
      distanceSquared(center, { x: hazard.x, y: hazard.y }) <= (hazard.radius + radius) * (hazard.radius + radius)
    ) {
      return true;
    }

    if (
      hazard.type === 'rect' &&
      circleRectIntersects(center, radius, {
        x: hazard.x,
        y: hazard.y,
        width: hazard.width,
        height: hazard.height
      })
    ) {
      return true;
    }
  }

  return false;
};

export const doesCircleOverlapWall = (
  center: Vec2,
  radius: number,
  walls: ReadonlyArray<WallEntity>
): boolean => {
  for (const wall of walls) {
    if (
      circleRectIntersects(center, radius, {
        x: wall.x,
        y: wall.y,
        width: wall.width,
        height: wall.height
      })
    ) {
      return true;
    }
  }
  return false;
};

export const isCollidingWithSun = (
  planet: PlanetEntity,
  suns: ReadonlyArray<SunEntity>,
  coreScale = 1
): boolean => {
  for (const sun of suns) {
    const minDistance = sun.visualRadius * coreScale + planet.radius;
    if (distanceSquared(planet.pos, sun.pos) <= minDistance * minDistance) {
      return true;
    }
  }
  return false;
};

export const isPreviewUnsafe = (
  point: Vec2,
  radius: number,
  _bounds: Bounds,
  hazards: ReadonlyArray<HazardEntity>
): boolean => {
  for (const hazard of hazards) {
    if (
      hazard.type === 'circle' &&
      distanceSquared(point, { x: hazard.x, y: hazard.y }) <= (hazard.radius + radius) * (hazard.radius + radius)
    ) {
      return true;
    }

    if (
      hazard.type === 'rect' &&
      (isInsideRect(point, {
        x: hazard.x - radius,
        y: hazard.y - radius,
        width: hazard.width + radius * 2,
        height: hazard.height + radius * 2
      }) ||
        circleRectIntersects(point, radius, {
          x: hazard.x,
          y: hazard.y,
          width: hazard.width,
          height: hazard.height
        }))
    ) {
      return true;
    }
  }

  return false;
};
