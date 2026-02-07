export interface PlanetType {
  id: string;
  name: string;
  radius: number;
  density: number;
  restitution: number;
  maxSpeed: number;
  color: number;
}

const MASS_SCALE = 0.16;

export const PLANET_TYPES: PlanetType[] = [
  {
    id: 'ice',
    name: 'Ice',
    radius: 1.8,
    density: 0.8,
    restitution: 0.94,
    maxSpeed: 72,
    color: 0x90dfff
  },
  {
    id: 'rock',
    name: 'Rock',
    radius: 2.25,
    density: 1.45,
    restitution: 0.9,
    maxSpeed: 65,
    color: 0xf1c56f
  },
  {
    id: 'iron',
    name: 'Iron',
    radius: 2.55,
    density: 2.3,
    restitution: 0.82,
    maxSpeed: 58,
    color: 0xc2b8cf
  },
  {
    id: 'giant',
    name: 'Giant',
    radius: 3.25,
    density: 1.25,
    restitution: 0.86,
    maxSpeed: 54,
    color: 0xffb493
  }
];

export const computePlanetMass = (radius: number, density: number): number => {
  const mass = radius * radius * density * MASS_SCALE;
  return Math.max(0.4, mass);
};
