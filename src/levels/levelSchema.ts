import { GAME_CONFIG } from '../core/config';
import type { Vec2 } from '../core/math';

export interface LevelSunDefinition {
  pos: Vec2;
  mass: number;
  visualRadius: number;
  gravityRadius: number;
  softeningEpsilon: number;
  maxAccel: number;
  movable: boolean;
}

export interface LevelPlanetDefinition {
  pos: Vec2;
  vel: Vec2;
  mass: number;
  radius: number;
  restitution: number;
  maxSpeed: number;
  color?: number;
}

export interface LevelWallDefinition {
  x: number;
  y: number;
  width: number;
  height: number;
  restitution: number;
}

export interface CircleHazardDefinition {
  type: 'circle';
  x: number;
  y: number;
  radius: number;
}

export interface RectHazardDefinition {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LevelHazardDefinition = CircleHazardDefinition | RectHazardDefinition;

export interface OrbitThresholds {
  minOrbitRadius: number;
  maxOrbitRadius: number;
  minSpeed: number;
  maxSpeed: number;
  maxRadialSpeed: number;
}

export interface LevelWinCondition {
  requiredPlanets: number;
  stableSeconds: number;
  orbit: OrbitThresholds;
}

export interface LevelRules {
  maxPlanets: number;
  spawnSpeed: number;
  sunMoveAfterPlaced: boolean;
  failOnSunCollision: boolean;
}

export interface LevelDefinition {
  id: string;
  name: string;
  bounds: { width: number; height: number };
  suns: LevelSunDefinition[];
  planets: LevelPlanetDefinition[];
  walls: LevelWallDefinition[];
  hazards: LevelHazardDefinition[];
  winCondition: LevelWinCondition;
  rules: LevelRules;
}

const assertObject = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const assertNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
};

const getNumber = (object: Record<string, unknown>, key: string, fallback?: number): number => {
  const value = object[key];
  if (value === undefined && fallback !== undefined) return fallback;
  return assertNumber(value, key);
};

const getBoolean = (object: Record<string, unknown>, key: string, fallback?: boolean): boolean => {
  const value = object[key];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${key} must be boolean`);
  return value;
};

const getString = (object: Record<string, unknown>, key: string): string => {
  const value = object[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
};

const parseVec2 = (input: unknown, label: string): Vec2 => {
  const object = assertObject(input, label);
  return {
    x: getNumber(object, 'x'),
    y: getNumber(object, 'y')
  };
};

export const parseLevelDefinition = (input: unknown, index: number): LevelDefinition => {
  const root = assertObject(input, `levels[${index}]`);

  const boundsRoot = assertObject(root.bounds, `levels[${index}].bounds`);
  const bounds = {
    width: getNumber(boundsRoot, 'width', GAME_CONFIG.world.defaultWidth),
    height: getNumber(boundsRoot, 'height', GAME_CONFIG.world.defaultHeight)
  };
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error(`levels[${index}].bounds must be positive`);
  }

  const sunsRaw = root.suns;
  if (!Array.isArray(sunsRaw) || sunsRaw.length === 0 || sunsRaw.length > 3) {
    throw new Error(`levels[${index}].suns must contain 1 to 3 entries`);
  }

  const suns = sunsRaw.map((item, sunIndex) => {
    const sun = assertObject(item, `levels[${index}].suns[${sunIndex}]`);
    return {
      pos: parseVec2(sun.pos, `levels[${index}].suns[${sunIndex}].pos`),
      mass: getNumber(sun, 'mass'),
      visualRadius: getNumber(sun, 'visualRadius', 4.8),
      gravityRadius: getNumber(sun, 'gravityRadius', 36),
      softeningEpsilon: getNumber(sun, 'softeningEpsilon', 2.8),
      maxAccel: getNumber(sun, 'maxAccel', 90),
      movable: getBoolean(sun, 'movable', false)
    } satisfies LevelSunDefinition;
  });

  const planetsRaw = root.planets;
  if (!Array.isArray(planetsRaw)) throw new Error(`levels[${index}].planets must be an array`);

  const planets = planetsRaw.map((item, planetIndex) => {
    const planet = assertObject(item, `levels[${index}].planets[${planetIndex}]`);
    const color = planet.color;
    return {
      pos: parseVec2(planet.pos, `levels[${index}].planets[${planetIndex}].pos`),
      vel: parseVec2(planet.vel ?? { x: 0, y: 0 }, `levels[${index}].planets[${planetIndex}].vel`),
      mass: getNumber(planet, 'mass', GAME_CONFIG.gameplay.defaultPlanetMass),
      radius: getNumber(planet, 'radius', GAME_CONFIG.gameplay.defaultPlanetRadius),
      restitution: getNumber(planet, 'restitution', GAME_CONFIG.gameplay.defaultPlanetRestitution),
      maxSpeed: getNumber(planet, 'maxSpeed', GAME_CONFIG.gameplay.defaultPlanetMaxSpeed),
      color: typeof color === 'number' ? color : undefined
    } satisfies LevelPlanetDefinition;
  });

  const wallsRaw = root.walls;
  const walls = !Array.isArray(wallsRaw)
    ? []
    : wallsRaw.map((item, wallIndex) => {
        const wall = assertObject(item, `levels[${index}].walls[${wallIndex}]`);
        return {
          x: getNumber(wall, 'x'),
          y: getNumber(wall, 'y'),
          width: getNumber(wall, 'width'),
          height: getNumber(wall, 'height'),
          restitution: getNumber(wall, 'restitution', 0.92)
        } satisfies LevelWallDefinition;
      });

  const hazardsRaw = root.hazards;
  const hazards = !Array.isArray(hazardsRaw)
    ? []
    : hazardsRaw.map((item, hazardIndex) => {
        const hazard = assertObject(item, `levels[${index}].hazards[${hazardIndex}]`);
        if (hazard.type === 'circle') {
          return {
            type: 'circle',
            x: getNumber(hazard, 'x'),
            y: getNumber(hazard, 'y'),
            radius: getNumber(hazard, 'radius')
          } satisfies CircleHazardDefinition;
        }
        if (hazard.type === 'rect') {
          return {
            type: 'rect',
            x: getNumber(hazard, 'x'),
            y: getNumber(hazard, 'y'),
            width: getNumber(hazard, 'width'),
            height: getNumber(hazard, 'height')
          } satisfies RectHazardDefinition;
        }
        throw new Error(`levels[${index}].hazards[${hazardIndex}] has unsupported type`);
      });

  const winRoot = assertObject(root.winCondition, `levels[${index}].winCondition`);
  const orbitRoot = assertObject(winRoot.orbit, `levels[${index}].winCondition.orbit`);
  const winCondition: LevelWinCondition = {
    requiredPlanets: getNumber(winRoot, 'requiredPlanets', 1),
    stableSeconds: getNumber(winRoot, 'stableSeconds', 3),
    orbit: {
      minOrbitRadius: getNumber(orbitRoot, 'minOrbitRadius', 12),
      maxOrbitRadius: getNumber(orbitRoot, 'maxOrbitRadius', 60),
      minSpeed: getNumber(orbitRoot, 'minSpeed', 2),
      maxSpeed: getNumber(orbitRoot, 'maxSpeed', 38),
      maxRadialSpeed: getNumber(orbitRoot, 'maxRadialSpeed', 8)
    }
  };

  const rulesRoot = assertObject(root.rules ?? {}, `levels[${index}].rules`);
  const rules: LevelRules = {
    maxPlanets: Math.min(getNumber(rulesRoot, 'maxPlanets', 6), GAME_CONFIG.gameplay.maxPlanets),
    spawnSpeed: getNumber(rulesRoot, 'spawnSpeed', 13),
    sunMoveAfterPlaced: getBoolean(rulesRoot, 'sunMoveAfterPlaced', true),
    failOnSunCollision: getBoolean(rulesRoot, 'failOnSunCollision', true)
  };

  return {
    id: getString(root, 'id'),
    name: getString(root, 'name'),
    bounds,
    suns,
    planets,
    walls,
    hazards,
    winCondition,
    rules
  };
};
