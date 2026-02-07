export interface StarType {
  id: string;
  name: string;
  mass: number;
  visualRadius: number;
  gravityRadius: number;
  softeningEpsilon: number;
  maxAccel: number;
  color: number;
}

export const STAR_TYPES: StarType[] = [
  {
    id: 'dwarf',
    name: 'Dwarf Star',
    mass: 160,
    visualRadius: 4.2,
    gravityRadius: 28,
    softeningEpsilon: 2.4,
    maxAccel: 54,
    color: 0xffcf86
  },
  {
    id: 'yellow',
    name: 'Yellow Star',
    mass: 225,
    visualRadius: 5,
    gravityRadius: 36,
    softeningEpsilon: 2.8,
    maxAccel: 70,
    color: 0xffdf9a
  },
  {
    id: 'heavy',
    name: 'Heavy Star',
    mass: 300,
    visualRadius: 5.8,
    gravityRadius: 44,
    softeningEpsilon: 3.2,
    maxAccel: 82,
    color: 0xffba74
  }
];
