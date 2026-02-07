import { Application, Container, Graphics } from 'pixi.js';
import { clamp, type Vec2 } from '../core/math';
import type { HazardEntity, PlanetEntity, SunEntity, WallEntity } from '../game/entities';
import { createPlanetSprite, createSunSprite } from './sprites';
import { TrailRenderer } from './trails';
import type { PreviewLine } from '../physics/preview';

export interface WorldBounds {
  width: number;
  height: number;
}

interface CameraTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export class GameRenderer {
  readonly root: HTMLDivElement;
  readonly canvasHost: HTMLDivElement;
  readonly hudHost: HTMLDivElement;
  readonly app: Application;

  private bounds: WorldBounds;
  private readonly worldLayer: Container;
  private readonly staticLayer: Container;
  private readonly trailsLayer: Container;
  private readonly planetsLayer: Container;
  private readonly sunsLayer: Container;
  private readonly previewLayer: Container;
  private readonly boundsGraphics: Graphics;
  private readonly hazardsGraphics: Graphics;
  private readonly wallsGraphics: Graphics;
  private readonly previewGraphics: Graphics;
  private readonly sunSprites = new Map<string, Container>();
  private readonly planetSprites = new Map<string, Graphics>();
  private readonly trailRenderer: TrailRenderer;
  private camera: CameraTransform = { scale: 1, offsetX: 0, offsetY: 0 };

  constructor(parent: HTMLElement, bounds: WorldBounds) {
    this.bounds = bounds;
    this.root = document.createElement('div');
    this.root.className = 'game-root';

    this.canvasHost = document.createElement('div');
    this.canvasHost.className = 'game-canvas';

    this.hudHost = document.createElement('div');
    this.hudHost.className = 'hud-layer';

    this.app = new Application({
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
      width: 1,
      height: 1
    });

    this.worldLayer = new Container();
    this.staticLayer = new Container();
    this.trailsLayer = new Container();
    this.planetsLayer = new Container();
    this.sunsLayer = new Container();
    this.previewLayer = new Container();

    this.boundsGraphics = new Graphics();
    this.hazardsGraphics = new Graphics();
    this.wallsGraphics = new Graphics();
    this.previewGraphics = new Graphics();

    this.staticLayer.addChild(this.boundsGraphics, this.hazardsGraphics, this.wallsGraphics);
    this.previewLayer.addChild(this.previewGraphics);
    this.worldLayer.addChild(
      this.staticLayer,
      this.trailsLayer,
      this.previewLayer,
      this.planetsLayer,
      this.sunsLayer
    );

    this.app.stage.addChild(this.worldLayer);

    this.trailRenderer = new TrailRenderer(this.trailsLayer);

    const canvas = this.app.view as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    this.canvasHost.appendChild(canvas);
    this.root.appendChild(this.canvasHost);
    this.root.appendChild(this.hudHost);
    parent.appendChild(this.root);

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  get interactionElement(): HTMLCanvasElement {
    return this.app.view as HTMLCanvasElement;
  }

  destroy(): void {
    window.removeEventListener('resize', this.resize);
    this.trailRenderer.destroy();
    this.app.destroy(true, true);
    this.root.remove();
  }

  setBounds(bounds: WorldBounds): void {
    this.bounds = bounds;
    this.drawBounds();
    this.resize();
  }

  setPerformanceMode(lowPower: boolean): void {
    this.app.ticker.maxFPS = lowPower ? 30 : 60;
  }

  setTrailsEnabled(enabled: boolean): void {
    this.trailRenderer.setEnabled(enabled);
  }

  drawStaticGeometry(hazards: ReadonlyArray<HazardEntity>, walls: ReadonlyArray<WallEntity>): void {
    this.drawBounds();

    this.hazardsGraphics.clear();
    this.wallsGraphics.clear();

    for (const wall of walls) {
      this.wallsGraphics.lineStyle(1.2, 0x8ec2ff, 0.45);
      this.wallsGraphics.beginFill(0x497099, 0.16);
      this.wallsGraphics.drawRect(wall.x, wall.y, wall.width, wall.height);
      this.wallsGraphics.endFill();
    }

    for (const hazard of hazards) {
      this.hazardsGraphics.lineStyle(1.1, 0xff8a7c, 0.58);
      this.hazardsGraphics.beginFill(0xff695c, 0.18);
      if (hazard.type === 'circle') {
        this.hazardsGraphics.drawCircle(hazard.x, hazard.y, hazard.radius);
      } else {
        this.hazardsGraphics.drawRect(hazard.x, hazard.y, hazard.width, hazard.height);
      }
      this.hazardsGraphics.endFill();
    }
  }

  syncSuns(suns: ReadonlyArray<SunEntity>, draggingSunId: string | null): void {
    const activeIds = new Set(suns.map((sun) => sun.id));

    for (const [id, sprite] of this.sunSprites) {
      if (!activeIds.has(id)) {
        this.sunsLayer.removeChild(sprite);
        sprite.destroy({ children: true });
        this.sunSprites.delete(id);
      }
    }

    for (const sun of suns) {
      let sprite = this.sunSprites.get(sun.id);
      if (!sprite) {
        sprite = createSunSprite(sun);
        this.sunSprites.set(sun.id, sprite);
        this.sunsLayer.addChild(sprite);
      }

      sprite.position.set(sun.pos.x, sun.pos.y);
      sprite.alpha = draggingSunId === sun.id ? 0.95 : 0.82;
      sprite.scale.set(draggingSunId === sun.id ? 1.04 : 1);
    }
  }

  syncPlanets(planets: ReadonlyArray<PlanetEntity>, draggingPlanetId: string | null = null): void {
    const activeIds = new Set(planets.map((planet) => planet.id));

    for (const [id, sprite] of this.planetSprites) {
      if (!activeIds.has(id)) {
        this.planetsLayer.removeChild(sprite);
        sprite.destroy();
        this.planetSprites.delete(id);
      }
    }

    for (const planet of planets) {
      let sprite = this.planetSprites.get(planet.id);
      if (!sprite) {
        sprite = createPlanetSprite(planet);
        this.planetSprites.set(planet.id, sprite);
        this.planetsLayer.addChild(sprite);
      }

      sprite.position.set(planet.pos.x, planet.pos.y);
      sprite.alpha = planet.inOrbit ? 1 : 0.92;
      sprite.scale.set(draggingPlanetId === planet.id ? 1.08 : 1);
    }

    this.trailRenderer.sync(planets);
  }

  drawPreview(lines: ReadonlyArray<PreviewLine>): void {
    this.previewGraphics.clear();

    for (const line of lines) {
      if (line.points.length < 2) continue;
      const color = line.danger ? 0xff796d : 0x7cd8ff;
      const alpha = line.danger ? 0.95 : 0.72;

      this.previewGraphics.lineStyle(1.15, color, alpha);
      this.previewGraphics.moveTo(line.points[0].x, line.points[0].y);

      for (let i = 1; i < line.points.length; i += 1) {
        if (i % 2 === 0) {
          this.previewGraphics.lineTo(line.points[i].x, line.points[i].y);
        } else {
          this.previewGraphics.moveTo(line.points[i].x, line.points[i].y);
        }
      }
    }
  }

  clearPreview(): void {
    this.previewGraphics.clear();
  }

  worldFromClient(clientX: number, clientY: number): Vec2 | null {
    const rect = this.canvasHost.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || this.camera.scale <= 0) {
      return null;
    }

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const worldX = (localX - this.camera.offsetX) / this.camera.scale;
    const worldY = (localY - this.camera.offsetY) / this.camera.scale;

    return {
      x: clamp(worldX, -10, this.bounds.width + 10),
      y: clamp(worldY, -10, this.bounds.height + 10)
    };
  }

  private drawBounds(): void {
    this.boundsGraphics.clear();
  }

  private resize = (): void => {
    const width = this.canvasHost.clientWidth || window.innerWidth || 1;
    const height = this.canvasHost.clientHeight || window.innerHeight || 1;
    this.app.renderer.resize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));

    const scale = Math.min(width / this.bounds.width, height / this.bounds.height);
    const offsetX = (width - this.bounds.width * scale) * 0.5;
    const offsetY = (height - this.bounds.height * scale) * 0.5;

    this.camera = { scale, offsetX, offsetY };

    this.worldLayer.position.set(offsetX, offsetY);
    this.worldLayer.scale.set(scale, scale);
  };
}
