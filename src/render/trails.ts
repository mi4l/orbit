import { Container, Graphics } from 'pixi.js';
import type { PlanetEntity } from '../game/entities';

export class TrailRenderer {
  private readonly container: Container;
  private readonly graphicsByPlanet = new Map<string, Graphics>();
  private enabled = true;

  constructor(container: Container) {
    this.container = container;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearAll();
    }
  }

  sync(planets: ReadonlyArray<PlanetEntity>): void {
    if (!this.enabled) return;

    const activeIds = new Set(planets.map((planet) => planet.id));

    for (const [id, graphics] of this.graphicsByPlanet) {
      if (!activeIds.has(id)) {
        this.container.removeChild(graphics);
        graphics.destroy();
        this.graphicsByPlanet.delete(id);
      }
    }

    for (const planet of planets) {
      let graphics = this.graphicsByPlanet.get(planet.id);
      if (!graphics) {
        graphics = new Graphics();
        this.graphicsByPlanet.set(planet.id, graphics);
        this.container.addChild(graphics);
      }

      graphics.clear();
      if (planet.trail.length < 2) continue;

      graphics.lineStyle(1.2, planet.color, 0.32);
      graphics.moveTo(planet.trail[0].x, planet.trail[0].y);
      for (let i = 1; i < planet.trail.length; i += 1) {
        graphics.lineTo(planet.trail[i].x, planet.trail[i].y);
      }
    }
  }

  clearAll(): void {
    for (const [, graphics] of this.graphicsByPlanet) {
      graphics.clear();
    }
  }

  destroy(): void {
    for (const [, graphics] of this.graphicsByPlanet) {
      this.container.removeChild(graphics);
      graphics.destroy();
    }
    this.graphicsByPlanet.clear();
  }
}
