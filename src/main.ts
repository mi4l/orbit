import './style.css';

import { GAME_CONFIG } from './core/config';
import { clamp, distanceSquared, length, normalize, perp, scale, sub, type Vec2 } from './core/math';
import { FixedStepClock } from './core/time';
import {
  createPlanetEntity,
  type HazardEntity,
  type PlanetEntity,
  type SunEntity,
  type WallEntity
} from './game/entities';
import { PointerInput, type DragTarget } from './game/input';
import { PLANET_TYPES, computePlanetMass } from './game/planetTypes';
import { STAR_TYPES } from './game/starTypes';
import { GameStateMachine } from './game/stateMachine';
import { doesCircleOverlapHazard, doesCircleOverlapWall, resolveWallCollisions } from './physics/collisions';
import { computeGravityWithPlanets } from './physics/gravity';
import { integratePlanet } from './physics/integrator';
import { buildTrajectoryPreview, type PreviewLine } from './physics/preview';
import { Hud } from './render/hud';
import { GameRenderer } from './render/renderer';
import type { LevelPlanetDefinition } from './levels/levelSchema';

const WORLD_WIDTH = 160;
const STAR_THROW_SCALE = 0.28;
const PLANET_THROW_SCALE = 0.62;
const STAR_BOUNCE = 0.72;
const SANDBOX_SPAWN_SPEED = 12;
const PLANET_SPACING_BUFFER = 0.7;
const PLANET_SPACING_KICK = 0.035;

const boundsFromViewport = (): { width: number; height: number } => {
  const viewWidth = Math.max(window.innerWidth, 1);
  const viewHeight = Math.max(window.innerHeight, 1);
  return {
    width: WORLD_WIDTH,
    height: WORLD_WIDTH * (viewHeight / viewWidth)
  };
};

class OrbitPuzzlesGame {
  private readonly state = new GameStateMachine();
  private readonly clock = new FixedStepClock();
  private readonly renderer: GameRenderer;
  private readonly hud: Hud;
  private readonly input: PointerInput;

  private bounds = boundsFromViewport();
  private suns: SunEntity[] = [];
  private planets: PlanetEntity[] = [];
  private walls: WallEntity[] = [];
  private hazards: HazardEntity[] = [];
  private previewLines: PreviewLine[] = [];

  private dragTarget: DragTarget | null = null;
  private dragLastPos: Vec2 | null = null;
  private dragLastTimeMs = 0;
  private dragVelocity: Vec2 = { x: 0, y: 0 };

  private trailsEnabled = true;
  private previewEnabled = true;

  private spawnSequence = 0;
  private sunSpawnSequence = 0;
  private previewSteps: number = GAME_CONFIG.preview.defaultSteps;
  private previewCooldown = 0;

  private frameMsEma = 16.67;
  private lowPowerMode = false;

  constructor(parent: HTMLElement) {
    this.renderer = new GameRenderer(parent, this.bounds);

    this.hud = new Hud(
      this.renderer.hudHost,
      {
        onPauseToggle: this.handlePauseToggle,
        onRestart: this.handleRestart,
        onTrailsToggle: this.handleTrailsToggle,
        onPreviewToggle: this.handlePreviewToggle,
        onPaletteDrop: this.handlePaletteDrop,
        onNextLevel: this.handleRestart,
        onRetry: this.handleRestart
      },
      PLANET_TYPES,
      STAR_TYPES
    );

    this.input = new PointerInput(this.renderer.interactionElement, {
      toWorld: (x, y) => this.renderer.worldFromClient(x, y),
      isSpawnMode: () => false,
      pickDragTarget: (worldPos) => this.pickDragTarget(worldPos),
      onSpawnTap: () => undefined,
      onDragStart: (target, worldPos) => this.startDrag(target, worldPos),
      onDragMove: (target, worldPos) => this.moveDrag(target, worldPos),
      onDragEnd: (target, worldPos) => this.endDrag(target, worldPos)
    });

    window.addEventListener('online', this.updateOfflineStatus);
    window.addEventListener('offline', this.updateOfflineStatus);
    window.addEventListener('resize', this.handleViewportResize);

    this.resetSandbox();

    this.renderer.app.ticker.maxFPS = 60;
    this.renderer.app.ticker.add(() => this.frame(this.renderer.app.ticker.deltaMS / 1000));
    this.updateOfflineStatus();
  }

  destroy(): void {
    window.removeEventListener('online', this.updateOfflineStatus);
    window.removeEventListener('offline', this.updateOfflineStatus);
    window.removeEventListener('resize', this.handleViewportResize);
    this.input.destroy();
    this.hud.destroy();
    this.renderer.destroy();
  }

  private frame(realDelta: number): void {
    this.updatePerformanceMode(realDelta);

    if (this.state.canSimulate()) {
      const timeScale = this.dragTarget ? GAME_CONFIG.gameplay.dragTimeScale : 1;
      this.clock.run(realDelta, timeScale, (dt) => this.stepSimulation(dt));
    }

    this.updatePreview(realDelta);

    this.renderer.syncSuns(this.suns, this.dragTarget?.kind === 'sun' ? this.dragTarget.id : null);
    this.renderer.syncPlanets(this.planets, this.dragTarget?.kind === 'planet' ? this.dragTarget.id : null);

    if (this.previewEnabled) {
      this.renderer.drawPreview(this.previewLines);
    } else {
      this.renderer.clearPreview();
    }

    this.hud.setStatus(this.getSandboxStatus());
  }

  private stepSimulation(dt: number): void {
    const draggedPlanetId = this.dragTarget?.kind === 'planet' ? this.dragTarget.id : null;
    const draggedSunId = this.dragTarget?.kind === 'sun' ? this.dragTarget.id : null;

    const planetSources = this.planets.map((planet) => ({
      id: planet.id,
      pos: { x: planet.pos.x, y: planet.pos.y },
      mass: planet.mass
    }));

    for (const sun of this.suns) {
      if (sun.id === draggedSunId) {
        sun.vel.x = 0;
        sun.vel.y = 0;
        continue;
      }

      const accel = computeGravityWithPlanets(
        { id: sun.id, pos: sun.pos },
        this.suns,
        planetSources,
        {
          gravityConstant: GAME_CONFIG.physics.gravityConstant,
          minDistance: GAME_CONFIG.physics.minDistanceForGravity,
          enablePlanetGravity: true,
          planetGravityScale: GAME_CONFIG.physics.planetGravityScale,
          planetSofteningEpsilon: GAME_CONFIG.physics.planetGravitySoftening,
          planetMaxAccel: GAME_CONFIG.physics.planetGravityMaxAccel
        }
      );

      sun.vel.x += accel.x * dt * sun.mobility;
      sun.vel.y += accel.y * dt * sun.mobility;

      if (sun.drag > 0) {
        const dragFactor = Math.max(0, 1 - sun.drag * dt);
        sun.vel.x *= dragFactor;
        sun.vel.y *= dragFactor;
      }

      const speed = length(sun.vel);
      if (speed > sun.maxSpeed && speed > 1e-6) {
        const ratio = sun.maxSpeed / speed;
        sun.vel.x *= ratio;
        sun.vel.y *= ratio;
      }

      sun.pos.x += sun.vel.x * dt;
      sun.pos.y += sun.vel.y * dt;
      this.resolveBoundsBounce(sun.pos, sun.vel, sun.visualRadius, STAR_BOUNCE);
    }

    for (const planet of this.planets) {
      if (planet.id === draggedPlanetId) {
        planet.vel.x = 0;
        planet.vel.y = 0;
        continue;
      }

      const accel = computeGravityWithPlanets(planet, this.suns, planetSources, {
        gravityConstant: GAME_CONFIG.physics.gravityConstant,
        minDistance: GAME_CONFIG.physics.minDistanceForGravity,
        enablePlanetGravity: GAME_CONFIG.physics.enablePlanetGravity,
        planetGravityScale: GAME_CONFIG.physics.planetGravityScale,
        planetSofteningEpsilon: GAME_CONFIG.physics.planetGravitySoftening,
        planetMaxAccel: GAME_CONFIG.physics.planetGravityMaxAccel
      });

      const stable = integratePlanet(planet, accel, dt, {
        globalDrag: GAME_CONFIG.physics.globalDrag
      });

      if (!stable) {
        planet.pos = { x: this.bounds.width * 0.5, y: this.bounds.height * 0.5 };
        planet.vel = { x: 0, y: 0 };
      }

      resolveWallCollisions(planet, this.walls);
      this.resolveBoundsBounce(planet.pos, planet.vel, planet.radius, planet.restitution);
    }

    this.enforcePlanetSpacing(draggedPlanetId, dt);

    for (const planet of this.planets) {
      this.updateTrail(planet, dt);
    }
  }

  private enforcePlanetSpacing(draggedPlanetId: string | null, dt: number): void {
    const safeDt = Math.max(dt, 1 / 120);

    for (let iteration = 0; iteration < 2; iteration += 1) {
      for (let i = 0; i < this.planets.length; i += 1) {
        for (let j = i + 1; j < this.planets.length; j += 1) {
          const a = this.planets[i];
          const b = this.planets[j];

          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const distSq = dx * dx + dy * dy;
          const targetDistance = a.radius + b.radius + PLANET_SPACING_BUFFER;
          if (distSq >= targetDistance * targetDistance) continue;

          const dist = Math.sqrt(Math.max(distSq, 1e-8));
          const nx = distSq < 1e-8 ? 1 : dx / dist;
          const ny = distSq < 1e-8 ? 0 : dy / dist;
          const overlap = targetDistance - dist;
          if (overlap <= 0) continue;

          let moveA = 0.5;
          let moveB = 0.5;
          if (a.id === draggedPlanetId) {
            moveA = 0;
            moveB = 1;
          } else if (b.id === draggedPlanetId) {
            moveA = 1;
            moveB = 0;
          }

          a.pos.x -= nx * overlap * moveA;
          a.pos.y -= ny * overlap * moveA;
          b.pos.x += nx * overlap * moveB;
          b.pos.y += ny * overlap * moveB;

          a.pos.x = clamp(a.pos.x, a.radius, this.bounds.width - a.radius);
          a.pos.y = clamp(a.pos.y, a.radius, this.bounds.height - a.radius);
          b.pos.x = clamp(b.pos.x, b.radius, this.bounds.width - b.radius);
          b.pos.y = clamp(b.pos.y, b.radius, this.bounds.height - b.radius);

          const kickSpeed = (overlap / safeDt) * PLANET_SPACING_KICK;
          if (a.id !== draggedPlanetId) {
            a.vel.x -= nx * kickSpeed * moveA;
            a.vel.y -= ny * kickSpeed * moveA;
          }
          if (b.id !== draggedPlanetId) {
            b.vel.x += nx * kickSpeed * moveB;
            b.vel.y += ny * kickSpeed * moveB;
          }

          const speedA = length(a.vel);
          if (speedA > a.maxSpeed && speedA > 1e-6) {
            const ratio = a.maxSpeed / speedA;
            a.vel.x *= ratio;
            a.vel.y *= ratio;
          }

          const speedB = length(b.vel);
          if (speedB > b.maxSpeed && speedB > 1e-6) {
            const ratio = b.maxSpeed / speedB;
            b.vel.x *= ratio;
            b.vel.y *= ratio;
          }
        }
      }
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
    const dragTarget = this.dragTarget;
    if (!this.previewEnabled || dragTarget?.kind !== 'sun' || this.state.current !== 'playing') {
      if (this.previewLines.length > 0) {
        this.previewLines = [];
      }
      return;
    }

    this.previewCooldown -= realDelta;
    if (this.previewCooldown > 0) return;

    const draggedSun = this.suns.find((sun) => sun.id === dragTarget.id);
    if (!draggedSun) return;

    const candidates = [...this.planets]
      .sort((a, b) => distanceSquared(a.pos, draggedSun.pos) - distanceSquared(b.pos, draggedSun.pos))
      .slice(0, GAME_CONFIG.preview.maxPlanets);

    const startTime = performance.now();
    this.previewLines = buildTrajectoryPreview(
      candidates,
      this.suns,
      this.planets,
      this.bounds,
      this.hazards,
      {
        dt: GAME_CONFIG.physics.fixedTimeStep,
        steps: this.previewSteps,
        drag: GAME_CONFIG.physics.globalDrag,
        gravity: {
          gravityConstant: GAME_CONFIG.physics.gravityConstant,
          minDistance: GAME_CONFIG.physics.minDistanceForGravity,
          enablePlanetGravity: GAME_CONFIG.physics.enablePlanetGravity,
          planetGravityScale: GAME_CONFIG.physics.planetGravityScale,
          planetSofteningEpsilon: GAME_CONFIG.physics.planetGravitySoftening,
          planetMaxAccel: GAME_CONFIG.physics.planetGravityMaxAccel
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

  private pickDragTarget(worldPos: Vec2): DragTarget | null {
    if (this.state.current !== 'playing') return null;

    let pickedPlanet: PlanetEntity | null = null;
    let bestPlanetDistance = Number.POSITIVE_INFINITY;
    for (const planet of this.planets) {
      const radius = planet.radius * 1.9;
      const distSq = distanceSquared(worldPos, planet.pos);
      if (distSq <= radius * radius && distSq < bestPlanetDistance) {
        bestPlanetDistance = distSq;
        pickedPlanet = planet;
      }
    }
    if (pickedPlanet) {
      return { kind: 'planet', id: pickedPlanet.id };
    }

    let pickedSun: SunEntity | null = null;
    let bestSunDistance = Number.POSITIVE_INFINITY;
    for (const sun of this.suns) {
      if (!sun.movable) continue;
      const radius = sun.visualRadius * 1.75;
      const distSq = distanceSquared(worldPos, sun.pos);
      if (distSq <= radius * radius && distSq < bestSunDistance) {
        bestSunDistance = distSq;
        pickedSun = sun;
      }
    }

    return pickedSun ? { kind: 'sun', id: pickedSun.id } : null;
  }

  private startDrag(target: DragTarget, worldPos: Vec2): void {
    if (this.state.current !== 'playing') return;

    this.dragTarget = target;
    this.previewLines = [];
    this.dragLastPos = { x: worldPos.x, y: worldPos.y };
    this.dragLastTimeMs = performance.now();
    this.dragVelocity = { x: 0, y: 0 };

    if (target.kind === 'sun') {
      this.moveSun(target.id, worldPos, true);
    } else {
      this.movePlanet(target.id, worldPos, true);
    }
  }

  private moveDrag(target: DragTarget, worldPos: Vec2): void {
    this.captureDragVelocity(worldPos);

    if (target.kind === 'sun') {
      this.moveSun(target.id, worldPos, true);
      return;
    }

    this.movePlanet(target.id, worldPos, true);
  }

  private endDrag(target: DragTarget, worldPos: Vec2): void {
    this.moveDrag(target, worldPos);

    if (target.kind === 'sun') {
      const sun = this.suns.find((entry) => entry.id === target.id);
      if (sun) {
        sun.vel = scale(this.dragVelocity, STAR_THROW_SCALE);
      }
    } else {
      const planet = this.planets.find((entry) => entry.id === target.id);
      if (planet) {
        planet.vel = scale(this.dragVelocity, PLANET_THROW_SCALE);
      }
    }

    if (this.dragTarget?.kind === target.kind && this.dragTarget.id === target.id) {
      this.dragTarget = null;
      this.previewLines = [];
      this.previewCooldown = 0;
      this.dragLastPos = null;
      this.dragLastTimeMs = 0;
      this.dragVelocity = { x: 0, y: 0 };
    }
  }

  private moveSun(sunId: string, worldPos: Vec2, stopVelocity: boolean): void {
    const sun = this.suns.find((item) => item.id === sunId);
    if (!sun) return;

    sun.pos.x = clamp(worldPos.x, sun.visualRadius, this.bounds.width - sun.visualRadius);
    sun.pos.y = clamp(worldPos.y, sun.visualRadius, this.bounds.height - sun.visualRadius);

    if (stopVelocity) {
      sun.vel.x = 0;
      sun.vel.y = 0;
    }

    this.previewCooldown = 0;
  }

  private movePlanet(planetId: string, worldPos: Vec2, stopVelocity: boolean): void {
    const planet = this.planets.find((item) => item.id === planetId);
    if (!planet) return;

    planet.pos.x = clamp(worldPos.x, planet.radius, this.bounds.width - planet.radius);
    planet.pos.y = clamp(worldPos.y, planet.radius, this.bounds.height - planet.radius);

    if (stopVelocity) {
      planet.vel.x = 0;
      planet.vel.y = 0;
    }
    planet.orbitStableTime = 0;

    this.previewCooldown = 0;
  }

  private captureDragVelocity(worldPos: Vec2): void {
    const now = performance.now();
    if (!this.dragLastPos || this.dragLastTimeMs <= 0) {
      this.dragLastPos = { x: worldPos.x, y: worldPos.y };
      this.dragLastTimeMs = now;
      return;
    }

    const dt = (now - this.dragLastTimeMs) / 1000;
    if (dt <= 1e-4) return;

    const instantVelocity = {
      x: (worldPos.x - this.dragLastPos.x) / dt,
      y: (worldPos.y - this.dragLastPos.y) / dt
    };

    const blend = 0.35;
    this.dragVelocity = {
      x: this.dragVelocity.x * (1 - blend) + instantVelocity.x * blend,
      y: this.dragVelocity.y * (1 - blend) + instantVelocity.y * blend
    };

    this.dragLastPos = { x: worldPos.x, y: worldPos.y };
    this.dragLastTimeMs = now;
  }

  private spawnPlanet(worldPos: Vec2, type: (typeof PLANET_TYPES)[number]): void {
    if (this.state.current !== 'playing') return;
    if (this.planets.length >= GAME_CONFIG.gameplay.maxPlanets) return;

    const radius = type.radius;
    const safePos = {
      x: clamp(worldPos.x, radius + 0.5, this.bounds.width - radius - 0.5),
      y: clamp(worldPos.y, radius + 0.5, this.bounds.height - radius - 0.5)
    };

    if (!this.canSpawnPlanetAt(safePos, radius)) return;

    const nearestSun = this.findNearestSun(safePos);
    const velocity = this.estimateSpawnVelocity(
      safePos,
      nearestSun,
      this.spawnSequence,
      SANDBOX_SPAWN_SPEED,
      type.maxSpeed
    );

    const newPlanetData: LevelPlanetDefinition = {
      pos: safePos,
      vel: velocity,
      mass: computePlanetMass(type.radius, type.density),
      radius,
      restitution: type.restitution,
      maxSpeed: type.maxSpeed,
      color: type.color
    };

    const planet = createPlanetEntity(newPlanetData, this.spawnSequence, true);
    this.spawnSequence += 1;
    this.planets.push(planet);
  }

  private spawnSun(worldPos: Vec2, type: (typeof STAR_TYPES)[number]): void {
    if (this.state.current !== 'playing') return;
    if (this.suns.length >= GAME_CONFIG.gameplay.maxSuns) return;

    const safePos = {
      x: clamp(worldPos.x, type.visualRadius, this.bounds.width - type.visualRadius),
      y: clamp(worldPos.y, type.visualRadius, this.bounds.height - type.visualRadius)
    };

    if (doesCircleOverlapHazard(safePos, type.visualRadius, this.hazards)) return;
    if (doesCircleOverlapWall(safePos, type.visualRadius, this.walls)) return;

    const sunOverlap = this.suns.some((sun) => {
      const minGap = sun.visualRadius + type.visualRadius + 1.4;
      return distanceSquared(sun.pos, safePos) <= minGap * minGap;
    });
    if (sunOverlap) return;

    const planetOverlap = this.planets.some((planet) => {
      const minGap = planet.radius + type.visualRadius + 0.9;
      return distanceSquared(planet.pos, safePos) <= minGap * minGap;
    });
    if (planetOverlap) return;

    const maxSpeed = clamp(22 - type.visualRadius * 1.8, 8, 16);

    this.suns.push({
      id: `spawn-sun-${this.sunSpawnSequence}`,
      pos: safePos,
      vel: { x: 0, y: 0 },
      maxSpeed,
      drag: 0.24,
      mobility: 0.33,
      mass: type.mass,
      visualRadius: type.visualRadius,
      gravityRadius: type.gravityRadius,
      softeningEpsilon: type.softeningEpsilon,
      maxAccel: type.maxAccel,
      movable: true
    });
    this.sunSpawnSequence += 1;
  }

  private canSpawnPlanetAt(position: Vec2, radius: number): boolean {
    if (doesCircleOverlapHazard(position, radius, this.hazards)) return false;
    if (doesCircleOverlapWall(position, radius, this.walls)) return false;

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
    configuredSpeed: number,
    maxSpeed: number
  ): Vec2 {
    if (!nearestSun) {
      return { x: sequence % 2 === 0 ? configuredSpeed : -configuredSpeed, y: 0 };
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

    const speed = clamp((orbitalEstimate + configuredSpeed) * 0.5, 2, maxSpeed * 0.88);
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

  private resolveBoundsBounce(pos: Vec2, vel: Vec2, radius: number, restitution: number): void {
    if (pos.x < radius) {
      pos.x = radius;
      if (vel.x < 0) vel.x = Math.abs(vel.x) * restitution;
    } else if (pos.x > this.bounds.width - radius) {
      pos.x = this.bounds.width - radius;
      if (vel.x > 0) vel.x = -Math.abs(vel.x) * restitution;
    }

    if (pos.y < radius) {
      pos.y = radius;
      if (vel.y < 0) vel.y = Math.abs(vel.y) * restitution;
    } else if (pos.y > this.bounds.height - radius) {
      pos.y = this.bounds.height - radius;
      if (vel.y > 0) vel.y = -Math.abs(vel.y) * restitution;
    }
  }

  private resetSandbox(): void {
    this.state.setPlaying();
    this.clock.reset();

    this.suns = [];
    this.planets = [];
    this.walls = [];
    this.hazards = [];

    this.dragTarget = null;
    this.dragLastPos = null;
    this.dragLastTimeMs = 0;
    this.dragVelocity = { x: 0, y: 0 };

    this.spawnSequence = 0;
    this.sunSpawnSequence = 0;

    this.previewLines = [];
    this.previewCooldown = 0;

    this.bounds = boundsFromViewport();
    this.renderer.setBounds(this.bounds);
    this.renderer.drawStaticGeometry(this.hazards, this.walls);
    this.renderer.setTrailsEnabled(this.trailsEnabled);
    this.renderer.clearPreview();

    this.hud.hideOverlay();
    this.hud.setTitle('Sandbox');
    this.hud.setStatus(this.getSandboxStatus());
    this.hud.setPauseState(this.state.current);
    this.hud.setTrailsState(this.trailsEnabled);
    this.hud.setPreviewState(this.previewEnabled);

    this.renderer.syncSuns(this.suns, null);
    this.renderer.syncPlanets(this.planets, null);
  }

  private getSandboxStatus(): string {
    return `Bodies P${this.planets.length} S${this.suns.length}`;
  }

  private handlePauseToggle = (): void => {
    this.state.togglePause();
    if (this.state.current !== 'playing') {
      this.dragTarget = null;
      this.previewLines = [];
      this.previewCooldown = 0;
      this.dragLastPos = null;
      this.dragVelocity = { x: 0, y: 0 };
    }
    this.hud.setPauseState(this.state.current);
  };

  private handleRestart = (): void => {
    this.resetSandbox();
  };

  private handlePaletteDrop = (
    kind: 'planet' | 'star',
    typeId: string,
    clientX: number,
    clientY: number
  ): void => {
    if (this.state.current !== 'playing') return;

    const canvasRect = this.renderer.interactionElement.getBoundingClientRect();
    if (
      clientX < canvasRect.left ||
      clientX > canvasRect.right ||
      clientY < canvasRect.top ||
      clientY > canvasRect.bottom
    ) {
      return;
    }

    const worldPos = this.renderer.worldFromClient(clientX, clientY);
    if (!worldPos) return;

    this.dragTarget = null;
    this.previewLines = [];

    if (kind === 'planet') {
      const planetType = PLANET_TYPES.find((entry) => entry.id === typeId);
      if (planetType) {
        this.spawnPlanet(worldPos, planetType);
      }
      return;
    }

    const starType = STAR_TYPES.find((entry) => entry.id === typeId);
    if (starType) {
      this.spawnSun(worldPos, starType);
    }
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

  private handleViewportResize = (): void => {
    this.bounds = boundsFromViewport();
    this.renderer.setBounds(this.bounds);

    for (const sun of this.suns) {
      sun.pos.x = clamp(sun.pos.x, sun.visualRadius, this.bounds.width - sun.visualRadius);
      sun.pos.y = clamp(sun.pos.y, sun.visualRadius, this.bounds.height - sun.visualRadius);
    }

    for (const planet of this.planets) {
      planet.pos.x = clamp(planet.pos.x, planet.radius, this.bounds.width - planet.radius);
      planet.pos.y = clamp(planet.pos.y, planet.radius, this.bounds.height - planet.radius);
    }
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
