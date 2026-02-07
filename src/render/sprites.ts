import { Container, Graphics } from 'pixi.js';
import type { PlanetEntity, SunEntity } from '../game/entities';

export const createSunSprite = (sun: SunEntity): Container => {
  const container = new Container();

  const fieldRing = new Graphics();
  fieldRing.lineStyle(0.65, 0x7ab7ff, 0.18);
  fieldRing.drawCircle(0, 0, sun.gravityRadius);

  const middleRing = new Graphics();
  middleRing.lineStyle(0.8, 0x9fd7ff, 0.26);
  middleRing.drawCircle(0, 0, Math.max(sun.visualRadius * 1.7, sun.gravityRadius * 0.45));

  const glow = new Graphics();
  glow.beginFill(0xfff3b3, 0.25);
  glow.drawCircle(0, 0, sun.visualRadius * 1.95);
  glow.endFill();

  const core = new Graphics();
  core.beginFill(0xffdd8f, 1);
  core.drawCircle(0, 0, sun.visualRadius);
  core.endFill();
  core.lineStyle(1.2, 0xfff2bf, 0.95);
  core.drawCircle(0, 0, sun.visualRadius - 0.2);

  container.addChild(fieldRing, middleRing, glow, core);
  container.position.set(sun.pos.x, sun.pos.y);

  return container;
};

export const createPlanetSprite = (planet: PlanetEntity): Graphics => {
  const graphics = new Graphics();
  graphics.beginFill(planet.color, 0.95);
  graphics.drawCircle(0, 0, planet.radius);
  graphics.endFill();
  graphics.lineStyle(0.9, 0xffffff, 0.45);
  graphics.drawCircle(0, 0, Math.max(planet.radius - 0.25, 0.5));
  graphics.position.set(planet.pos.x, planet.pos.y);
  return graphics;
};
