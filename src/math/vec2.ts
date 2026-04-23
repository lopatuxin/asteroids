export type Vec2 = { readonly x: number; readonly y: number };

const EPSILON = 1e-9;

export const ZERO: Vec2 = { x: 0, y: 0 };

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, k: number): Vec2 {
  return { x: v.x * k, y: v.y * k };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function lengthSq(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

export function length(v: Vec2): number {
  return Math.sqrt(lengthSq(v));
}

export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len < EPSILON) return ZERO;
  return { x: v.x / len, y: v.y / len };
}

export function rotate(v: Vec2, angleRad: number): Vec2 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function fromAngle(angleRad: number, len: number = 1): Vec2 {
  return { x: Math.cos(angleRad) * len, y: Math.sin(angleRad) * len };
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.sqrt(distanceSq(a, b));
}

export function distanceSqTorus(a: Vec2, b: Vec2, width: number, height: number): number {
  let dx = Math.abs(a.x - b.x);
  let dy = Math.abs(a.y - b.y);
  if (dx > width - dx) dx = width - dx;
  if (dy > height - dy) dy = height - dy;
  return dx * dx + dy * dy;
}

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function wrap(x: number, size: number): number {
  return ((x % size) + size) % size;
}

export function wrapVec2(v: Vec2, width: number, height: number): Vec2 {
  return { x: wrap(v.x, width), y: wrap(v.y, height) };
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
