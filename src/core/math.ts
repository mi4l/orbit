export interface Vec2 {
  x: number;
  y: number;
}

export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const lengthSquared = (v: Vec2): number => dot(v, v);

export const length = (v: Vec2): number => Math.sqrt(lengthSquared(v));

export const normalize = (v: Vec2): Vec2 => {
  const len = length(v);
  if (len < 1e-8) return vec2(0, 0);
  return scale(v, 1 / len);
};

export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b));

export const distanceSquared = (a: Vec2, b: Vec2): number => lengthSquared(sub(a, b));

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const clampLength = (v: Vec2, maxLen: number): Vec2 => {
  const lenSq = lengthSquared(v);
  const maxSq = maxLen * maxLen;
  if (lenSq <= maxSq) return v;
  const invLen = 1 / Math.sqrt(lenSq);
  return scale(v, maxLen * invLen);
};

export const isFiniteVec = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);

export const perp = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x });

export const nearestPointInRect = (
  p: Vec2,
  rect: { x: number; y: number; width: number; height: number }
): Vec2 => ({
  x: clamp(p.x, rect.x, rect.x + rect.width),
  y: clamp(p.y, rect.y, rect.y + rect.height)
});

export const isInsideRect = (
  p: Vec2,
  rect: { x: number; y: number; width: number; height: number }
): boolean =>
  p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
