import rawLevels from './levels.json';
import { parseLevelDefinition, type LevelDefinition } from './levelSchema';

const parsedLevels = (): LevelDefinition[] => {
  if (!Array.isArray(rawLevels)) {
    throw new Error('levels.json must export an array of levels');
  }
  return rawLevels.map((level, index) => parseLevelDefinition(level, index));
};

export const LEVELS: LevelDefinition[] = parsedLevels();
