import type { Vec2 } from '../core/math';
import {
  type LevelHazardDefinition,
  type LevelPlanetDefinition,
  type LevelSunDefinition,
  type LevelWallDefinition
} from '../levels/levelSchema';

export interface SunEntity extends LevelSunDefinition {
  id: string;
}

export interface PlanetEntity {
  id: string;
  pos: Vec2;
  vel: Vec2;
  mass: number;
  radius: number;
  restitution: number;
  maxSpeed: number;
  color: number;
  trail: Vec2[];
  trailAccumulator: number;
  orbitStableTime: number;
  inOrbit: boolean;
  spawnedByPlayer: boolean;
}

export type HazardEntity = LevelHazardDefinition;

export interface WallEntity extends LevelWallDefinition {
  id: string;
}

const PLANET_COLORS = [0x5dd9ff, 0x8bffbe, 0xffd36e, 0xff9f94, 0xd1b3ff, 0x9fffc5];

const cloneVec = (v: Vec2): Vec2 => ({ x: v.x, y: v.y });

export const createSunEntity = (source: LevelSunDefinition, index: number): SunEntity => ({
  id: `sun-${index}`,
  pos: cloneVec(source.pos),
  mass: source.mass,
  visualRadius: source.visualRadius,
  gravityRadius: source.gravityRadius,
  softeningEpsilon: source.softeningEpsilon,
  maxAccel: source.maxAccel,
  movable: source.movable
});

export const createPlanetEntity = (
  source: LevelPlanetDefinition,
  index: number,
  spawnedByPlayer = false
): PlanetEntity => ({
  id: spawnedByPlayer ? `spawn-${index}` : `planet-${index}`,
  pos: cloneVec(source.pos),
  vel: cloneVec(source.vel),
  mass: source.mass,
  radius: source.radius,
  restitution: source.restitution,
  maxSpeed: source.maxSpeed,
  color: source.color ?? PLANET_COLORS[index % PLANET_COLORS.length],
  trail: [],
  trailAccumulator: 0,
  orbitStableTime: 0,
  inOrbit: false,
  spawnedByPlayer
});

export const createWallEntity = (source: LevelWallDefinition, index: number): WallEntity => ({
  id: `wall-${index}`,
  x: source.x,
  y: source.y,
  width: source.width,
  height: source.height,
  restitution: source.restitution
});

export const cloneHazardEntity = (source: LevelHazardDefinition): HazardEntity => ({ ...source });
