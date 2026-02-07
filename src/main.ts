import './style.css';

import { GAME_CONFIG } from './core/config';
import { clamp, distanceSquared, length, normalize, perp, scale, sub, type Vec2 } from './core/math';
import { FixedStepClock } from './core/time';
import { createPlanetEntity, type PlanetEntity, type SunEntity } from './game/entities';
import { PointerInput } from './game/input';
import { LevelManager, type ActiveLevel } from './game/levelManager';
import { GameStateMachine } from './game/stateMachine';
import { updateOrbitProgress } from './game/winConditions';
import {
  doesCircleOverlapHazard,
  doesCircleOverlapWall,
  isCollidingWithSun,
  isInHazard,
  isOutOfBounds,
  resolveWallCollisions
} from './physics/collisions';
import { computeSunOnlyGravity } from './physics/gravity';
import { integratePlanet } from './physics/integrator';
import { buildTrajectoryPreview, type PreviewLine } from './physics/preview';
import { Hud } from './render/hud';
import { GameRenderer } from './render/renderer';
import type { LevelPlanetDefinition } from './levels/levelSchema';

class OrbitPuzzlesGame {
  private readonly levelManager = new LevelManager();
  private readonly state = new GameStateMachine();
  private readonly clock = new FixedStepClock();
  private readonly renderer: GameRenderer;
  private readonly hud: Hud;
  private readonly input: PointerInput;

  private activeLevel: ActiveLevel;
  private suns: SunEntity[] = [];
  private planets: PlanetEntity[] = [];
  private previewLines: PreviewLine[] = [];

  private draggingSunId: string | null = null;
  private spawnMode = false;
  private trailsEnabled = true;
  private previewEnabled = true;

  private orbitBestTimer = 0;
  private playerSpawned = 0;
  private spawnSequence = 0;
  private previewSteps: number = GAME_CONFIG.preview.defaultSteps;
  private previewCooldown = 0;

  private frameMsEma = 16.67;
  private lowPowerMode = false;

  constructor(parent: HTMLElement) {
    this.activeLevel = this.levelManager.load(0);
    this.suns = this.activeLevel.suns;
    this.planets = this.activeLevel.planets;

    this.renderer = new GameRenderer(parent, this.activeLevel.definition.bounds);

    this.hud = new Hud(this.renderer.hudHost, {
      onPauseToggle: this.handlePauseToggle,
      onRestart: this.handleRestart,
      onSpawnToggle: this.handleSpawnToggle,
      onTrailsToggle: this.handleTrailsToggle,
      onPreviewToggle: this.handlePreviewToggle,
      onNextLevel: this.handleNextLevel,
      onRetry: this.handleRestart
    });

    this.input = new PointerInput(this.renderer.interactionElement, {
      toWorld: (x, y) => this.renderer.worldFromClient(x, y),
      isSpawnMode: () => this.spawnMode && this.state.current === 'playing',
      pickSun: (worldPos) => this.pickMovableSun(worldPos),
      onSpawnTap: (worldPos) => this.spawnPlanet(worldPos),
      onSunDragStart: (sunId, worldPos) => this.startSunDrag(sunId, worldPos),
      onSunDragMove: (sunId, worldPos) => this.moveSun(sunId, worldPos),
      onSunDragEnd: (sunId, worldPos) => this.endSunDrag(sunId, worldPos)
    });

    window.addEventListener('online', this.updateOfflineStatus);
    window.addEventListener('offline', this.updateOfflineStatus);

    this.applyLevel(this.activeLevel);

    this.renderer.app.ticker.maxFPS = 60;
    this.renderer.app.ticker.add(() => this.frame(this.renderer.app.ticker.deltaMS / 1000));
    this.updateOfflineStatus();
  }

  destroy(): void {
    window.removeEventListener('online', this.updateOfflineStatus);
    window.removeEventListener('offline', this.updateOfflineStatus);
    this.input.destroy();
    this.hud.destroy();
    this.renderer.destroy();
  }

  private frame(realDelta: number): void {
    this.updatePerformanceMode(realDelta);

    if (this.state.canSimulate()) {
      const timeScale = this.draggingSunId ? GAME_CONFIG.gameplay.dragTimeScale : 1;
      this.clock.run(realDelta, timeScale, (dt) => this.stepSimulation(dt));
    }

    this.updatePreview(realDelta);
    this.renderer.syncSuns(this.suns, this.draggingSunId);
    this.renderer.syncPlanets(this.planets);

    if (this.previewEnabled) {
      this.renderer.drawPreview(this.previewLines);
    } else {
      this.renderer.clearPreview();
    }
  }

  private stepSimulation(dt: number): void {
    const bounds = this.activeLevel.definition.bounds;

    for (const planet of this.planets) {
      const accel = computeSunOnlyGravity(planet, this.suns, {
        gravityConstant: GAME_CONFIG.physics.gravityConstant,
        minDistance: GAME_CONFIG.physics.minDistanceForGravity
      });

      const stable = integratePlanet(planet, accel, dt, {
        globalDrag: GAME_CONFIG.physics.globalDrag
      });

      if (!stable) {
        this.failLevel('Simulation became unstable.');
        return;
      }

      resolveWallCollisions(planet, this.activeLevel.walls);
      this.updateTrail(planet, dt);

      if (isOutOfBounds(planet, bounds)) {
        this.failLevel('A planet escaped the playfield.');
        return;
      }

      if (isInHazard(planet, this.activeLevel.hazards)) {
        this.failLevel('A planet touched a hazard zone.');
        return;
      }

      if (
        this.activeLevel.definition.rules.failOnSunCollision &&
        isCollidingWithSun(planet, this.suns, 0.8)
      ) {
        this.failLevel('A planet collided with a sun.');
        return;
      }
    }

    const orbit = updateOrbitProgress(this.planets, this.suns, this.activeLevel.definition.winCondition, dt);
    this.orbitBestTimer = this.planets.reduce(
      (best, planet) => Math.max(best, planet.orbitStableTime),
      this.orbitBestTimer
    );

    this.hud.setOrbitProgress(
      orbit.stablePlanets,
      orbit.targetPlanets,
      orbit.stableSeconds - this.orbitBestTimer
    );

    if (orbit.reached) {
      this.winLevel();
    }
  }

  private updateTrail(planet: PlanetEntity, dt: number): void {
    planet.trailAccumulator += dt;
    if (planet.trailAccumulator < GAME_CONFIG.trails.sampleInterval) return;

    planet.trailAccumulator = 0;
    planet.trail.push({ x: planet.pos.x, y: planet.pos.y });

    while (planet.trail.length > GAME_CONFIG.trails.maxTrailPoints) {
      planet.trail.shift();
    }
  }

  private updatePreview(realDelta: number): void {
    if (!this.previewEnabled || !this.draggingSunId || this.state.current !== 'playing') {
      if (this.previewLines.length > 0) {
        this.previewLines = [];
      }
      return;
    }

    this.previewCooldown -= realDelta;
    if (this.previewCooldown > 0) return;

    const draggedSun = this.suns.find((sun) => sun.id === this.draggingSunId);
    if (!draggedSun) return;

    const candidates = [...this.planets]
      .sort((a, b) => distanceSquared(a.pos, draggedSun.pos) - distanceSquared(b.pos, draggedSun.pos))
      .slice(0, GAME_CONFIG.preview.maxPlanets);

    const startTime = performance.now();
    this.previewLines = buildTrajectoryPreview(
      candidates,
      this.suns,
      this.activeLevel.definition.bounds,
      this.activeLevel.hazards,
      {
        dt: GAME_CONFIG.physics.fixedTimeStep,
        steps: this.previewSteps,
        drag: GAME_CONFIG.physics.globalDrag,
        gravity: {
          gravityConstant: GAME_CONFIG.physics.gravityConstant,
          minDistance: GAME_CONFIG.physics.minDistanceForGravity
        }
      }
    );

    const costMs = performance.now() - startTime;
    if (costMs > GAME_CONFIG.preview.budgetMs) {
      this.previewSteps = Math.max(GAME_CONFIG.preview.minSteps, Math.floor(this.previewSteps * 0.85));
    } else if (costMs < GAME_CONFIG.preview.budgetMs * 0.55) {
      this.previewSteps = Math.min(GAME_CONFIG.preview.maxSteps, this.previewSteps + 3);
    }

    this.previewCooldown = this.lowPowerMode ? 0.14 : 0.08;
  }

  private pickMovableSun(worldPos: Vec2): string | null {
    if (this.state.current !== 'playing') return null;

    let picked: SunEntity | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const sun of this.suns) {
      if (!sun.movable) continue;
      if (!this.activeLevel.definition.rules.sunMoveAfterPlaced && this.playerSpawned > 0) continue;

      const radius = sun.visualRadius * 1.65;
      const distSq = distanceSquared(worldPos, sun.pos);
      if (distSq <= radius * radius && distSq < bestDistance) {
        bestDistance = distSq;
        picked = sun;
      }
    }

    return picked?.id ?? null;
  }

  private moveSun(sunId: string, worldPos: Vec2): void {
    const sun = this.suns.find((item) => item.id === sunId);
    if (!sun) return;

    const bounds = this.activeLevel.definition.bounds;
    sun.pos.x = clamp(worldPos.x, sun.visualRadius, bounds.width - sun.visualRadius);
    sun.pos.y = clamp(worldPos.y, sun.visualRadius, bounds.height - sun.visualRadius);

    this.previewCooldown = 0;
  }

  private startSunDrag(sunId: string, worldPos: Vec2): void {
    if (this.state.current !== 'playing') return;
    this.draggingSunId = sunId;
    this.spawnMode = false;
    this.moveSun(sunId, worldPos);
    this.updateSpawnButton();
  }

  private endSunDrag(sunId: string, worldPos: Vec2): void {
    this.moveSun(sunId, worldPos);
    if (this.draggingSunId === sunId) {
      this.draggingSunId = null;
      this.previewLines = [];
      this.previewCooldown = 0;
    }
  }

  private spawnPlanet(worldPos: Vec2): void {
    if (this.state.current !== 'playing') return;

    const rules = this.activeLevel.definition.rules;
    if (this.planets.length >= rules.maxPlanets) {
      this.spawnMode = false;
      this.updateSpawnButton();
      return;
    }

    const radius = GAME_CONFIG.gameplay.defaultPlanetRadius;
    const bounds = this.activeLevel.definition.bounds;
    const safePos = {
      x: clamp(worldPos.x, radius + 0.5, bounds.width - radius - 0.5),
      y: clamp(worldPos.y, radius + 0.5, bounds.height - radius - 0.5)
    };

    if (!this.canSpawnPlanetAt(safePos, radius)) {
      return;
    }

    const nearestSun = this.findNearestSun(safePos);
    const velocity = this.estimateSpawnVelocity(safePos, nearestSun, this.spawnSequence, rules.spawnSpeed);

    const newPlanetData: LevelPlanetDefinition = {
      pos: safePos,
      vel: velocity,
      mass: GAME_CONFIG.gameplay.defaultPlanetMass,
      radius,
      restitution: GAME_CONFIG.gameplay.defaultPlanetRestitution,
      maxSpeed: GAME_CONFIG.gameplay.defaultPlanetMaxSpeed
    };

    const planet = createPlanetEntity(newPlanetData, this.spawnSequence, true);
    this.spawnSequence += 1;
    this.playerSpawned += 1;
    this.planets.push(planet);

    this.spawnMode = false;
    this.updateSpawnButton();
  }

  private canSpawnPlanetAt(position: Vec2, radius: number): boolean {
    if (doesCircleOverlapHazard(position, radius, this.activeLevel.hazards)) {
      return false;
    }

    if (doesCircleOverlapWall(position, radius, this.activeLevel.walls)) {
      return false;
    }

    for (const sun of this.suns) {
      const exclusionRadius = sun.visualRadius * 1.6 + radius;
      if (distanceSquared(position, sun.pos) <= exclusionRadius * exclusionRadius) {
        return false;
      }
    }

    for (const planet of this.planets) {
      const minGap = planet.radius + radius + 0.9;
      if (distanceSquared(position, planet.pos) <= minGap * minGap) {
        return false;
      }
    }

    return true;
  }

  private estimateSpawnVelocity(
    spawnPos: Vec2,
    nearestSun: SunEntity | null,
    sequence: number,
    configuredSpeed: number
  ): Vec2 {
    if (!nearestSun) {
      return { x: configuredSpeed, y: 0 };
    }

    const radial = sub(spawnPos, nearestSun.pos);
    const distanceToSun = Math.max(6, length(radial));
    let tangent = normalize(perp(radial));
    if (tangent.x === 0 && tangent.y === 0) {
      tangent = { x: 0, y: -1 };
    }

    const orbitalEstimate = Math.sqrt(
      (GAME_CONFIG.physics.gravityConstant * nearestSun.mass) / Math.max(distanceToSun, 1)
    );

    const speed = clamp(
      (orbitalEstimate + configuredSpeed) * 0.5,
      this.activeLevel.definition.winCondition.orbit.minSpeed,
      this.activeLevel.definition.winCondition.orbit.maxSpeed
    );

    const direction = sequence % 2 === 0 ? 1 : -1;
    return scale(tangent, speed * direction);
  }

  private findNearestSun(position: Vec2): SunEntity | null {
    let nearest: SunEntity | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const sun of this.suns) {
      const distSq = distanceSquared(position, sun.pos);
      if (distSq < nearestDistance) {
        nearestDistance = distSq;
        nearest = sun;
      }
    }

    return nearest;
  }

  private winLevel(): void {
    if (this.state.current !== 'playing') return;
    this.state.setWin();
    this.draggingSunId = null;
    this.spawnMode = false;
    this.previewLines = [];
    this.hud.setPauseState(this.state.current);
    this.updateSpawnButton();
    const hasNext = this.levelManager.index < this.levelManager.levelCount - 1;
    this.hud.showWin(hasNext);
  }

  private failLevel(message: string): void {
    if (this.state.current !== 'playing') return;
    this.state.setFail(message);
    this.draggingSunId = null;
    this.spawnMode = false;
    this.previewLines = [];
    this.hud.setPauseState(this.state.current);
    this.updateSpawnButton();
    this.hud.showFail(message);
  }

  private applyLevel(level: ActiveLevel): void {
    this.activeLevel = level;
    this.suns = level.suns;
    this.planets = level.planets;
    this.draggingSunId = null;
    this.spawnMode = false;
    this.playerSpawned = 0;
    this.spawnSequence = 0;
    this.orbitBestTimer = 0;
    this.previewLines = [];
    this.previewCooldown = 0;

    this.state.setPlaying();
    this.clock.reset();

    const bounds = level.definition.bounds;
    this.renderer.setBounds(bounds);
    this.renderer.drawStaticGeometry(level.hazards, level.walls);
    this.renderer.setTrailsEnabled(this.trailsEnabled);
    this.renderer.clearPreview();

    this.hud.hideOverlay();
    this.hud.setLevel(level.levelIndex, this.levelManager.levelCount, level.definition.name);
    this.hud.setPauseState(this.state.current);
    this.hud.setTrailsState(this.trailsEnabled);
    this.hud.setPreviewState(this.previewEnabled);
    this.hud.setOrbitProgress(0, level.definition.winCondition.requiredPlanets, level.definition.winCondition.stableSeconds);

    this.updateSpawnButton();

    this.renderer.syncSuns(this.suns, this.draggingSunId);
    this.renderer.syncPlanets(this.planets);
  }

  private updateSpawnButton(): void {
    this.hud.setSpawnState(
      this.spawnMode,
      this.planets.length,
      this.activeLevel.definition.rules.maxPlanets
    );
  }

  private handlePauseToggle = (): void => {
    if (this.state.current === 'win' || this.state.current === 'fail') return;

    this.state.togglePause();
    if (this.state.current !== 'playing') {
      this.draggingSunId = null;
      this.spawnMode = false;
      this.previewLines = [];
      this.previewCooldown = 0;
    }

    this.hud.setPauseState(this.state.current);
    this.updateSpawnButton();
  };

  private handleRestart = (): void => {
    this.applyLevel(this.levelManager.restart());
  };

  private handleNextLevel = (): void => {
    const nextLevel = this.levelManager.next();
    this.applyLevel(nextLevel ?? this.levelManager.load(0));
  };

  private handleSpawnToggle = (): void => {
    if (this.state.current !== 'playing') return;
    if (this.planets.length >= this.activeLevel.definition.rules.maxPlanets) return;

    this.spawnMode = !this.spawnMode;
    if (this.spawnMode) {
      this.draggingSunId = null;
      this.previewLines = [];
    }
    this.updateSpawnButton();
  };

  private handleTrailsToggle = (): void => {
    this.trailsEnabled = !this.trailsEnabled;
    this.renderer.setTrailsEnabled(this.trailsEnabled);
    this.hud.setTrailsState(this.trailsEnabled);
  };

  private handlePreviewToggle = (): void => {
    this.previewEnabled = !this.previewEnabled;
    if (!this.previewEnabled) {
      this.previewLines = [];
    }
    this.hud.setPreviewState(this.previewEnabled);
  };

  private updateOfflineStatus = (): void => {
    this.hud.setOffline(!navigator.onLine);
  };

  private updatePerformanceMode(realDelta: number): void {
    const frameMs = realDelta * 1000;
    this.frameMsEma = this.frameMsEma * 0.92 + frameMs * 0.08;

    if (!this.lowPowerMode && this.frameMsEma > GAME_CONFIG.performance.lowFpsThresholdMs) {
      this.lowPowerMode = true;
      this.previewSteps = Math.max(GAME_CONFIG.preview.minSteps, this.previewSteps - 10);
      this.renderer.setPerformanceMode(true);
      return;
    }

    if (this.lowPowerMode && this.frameMsEma < GAME_CONFIG.performance.highFpsThresholdMs) {
      this.lowPowerMode = false;
      this.renderer.setPerformanceMode(false);
    }
  }
}

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app container');
}

const game = new OrbitPuzzlesGame(root);

window.addEventListener('beforeunload', () => {
  game.destroy();
});
