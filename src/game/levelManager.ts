import { LEVELS } from '../levels';
import type { LevelDefinition } from '../levels/levelSchema';
import {
  cloneHazardEntity,
  createPlanetEntity,
  createSunEntity,
  createWallEntity,
  type HazardEntity,
  type PlanetEntity,
  type SunEntity,
  type WallEntity
} from './entities';

export interface ActiveLevel {
  definition: LevelDefinition;
  levelIndex: number;
  suns: SunEntity[];
  planets: PlanetEntity[];
  hazards: HazardEntity[];
  walls: WallEntity[];
}

export class LevelManager {
  private readonly levels: LevelDefinition[];
  private currentIndex = 0;

  constructor(levels = LEVELS) {
    if (levels.length < 10) {
      throw new Error('At least 10 levels are required');
    }
    this.levels = levels;
  }

  get levelCount(): number {
    return this.levels.length;
  }

  get index(): number {
    return this.currentIndex;
  }

  load(index: number): ActiveLevel {
    const safeIndex = Math.max(0, Math.min(index, this.levels.length - 1));
    this.currentIndex = safeIndex;
    return this.instantiate(this.levels[safeIndex], safeIndex);
  }

  restart(): ActiveLevel {
    return this.instantiate(this.levels[this.currentIndex], this.currentIndex);
  }

  next(): ActiveLevel | null {
    if (this.currentIndex >= this.levels.length - 1) {
      return null;
    }
    return this.load(this.currentIndex + 1);
  }

  private instantiate(definition: LevelDefinition, levelIndex: number): ActiveLevel {
    return {
      definition,
      levelIndex,
      suns: definition.suns.map((sun, index) => createSunEntity(sun, index)),
      planets: definition.planets.map((planet, index) => createPlanetEntity(planet, index)),
      hazards: definition.hazards.map((hazard) => cloneHazardEntity(hazard)),
      walls: definition.walls.map((wall, index) => createWallEntity(wall, index))
    };
  }
}
