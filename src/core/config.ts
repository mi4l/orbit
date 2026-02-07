export const GAME_CONFIG = {
  world: {
    defaultWidth: 100,
    defaultHeight: 180
  },
  physics: {
    gravityConstant: 190,
    globalDrag: 0.02,
    fixedTimeStep: 1 / 60,
    maxStepsPerFrame: 5,
    maxDeltaTime: 0.25,
    minDistanceForGravity: 2,
    enablePlanetGravity: true,
    planetGravityScale: 2.2,
    planetGravitySoftening: 2.5,
    planetGravityMaxAccel: 62
  },
  gameplay: {
    dragTimeScale: 0.25,
    maxPlanets: 30,
    maxSuns: 8,
    defaultPlanetMass: 1,
    defaultPlanetRadius: 2.25,
    defaultPlanetRestitution: 0.88,
    defaultPlanetMaxSpeed: 65
  },
  trails: {
    maxTrailPoints: 70,
    sampleInterval: 1 / 30
  },
  preview: {
    minSteps: 36,
    maxSteps: 90,
    defaultSteps: 72,
    maxPlanets: 5,
    budgetMs: 10
  },
  performance: {
    lowFpsThresholdMs: 28,
    highFpsThresholdMs: 21
  }
} as const;
