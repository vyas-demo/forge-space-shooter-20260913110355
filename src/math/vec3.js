// Pure vector math helpers, DOM-free and independently testable.

export function create(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function length(a) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function normalize(a) {
  const len = length(a);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

export function distance(a, b) {
  return length(sub(a, b));
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Computes the minimum distance between two points that move linearly over
// a unit time interval [0, 1] — i.e. from aPrev to aNow, and from bPrev to
// bNow — rather than only comparing their positions at t=1. This "swept"
// check catches fast-moving entities (e.g. a projectile and an enemy
// closing distance quickly) that pass through/near each other within a
// single simulation step without their endpoint positions ever being close
// enough to register as a hit.
export function sweptMinDistance(aPrev, aNow, bPrev, bNow) {
  const r0 = sub(aPrev, bPrev);
  const v = sub(sub(aNow, aPrev), sub(bNow, bPrev));
  const vv = dot(v, v);
  let t = vv === 0 ? 0 : -dot(r0, v) / vv;
  t = clamp(t, 0, 1);
  const closest = add(r0, scale(v, t));
  return length(closest);
}
