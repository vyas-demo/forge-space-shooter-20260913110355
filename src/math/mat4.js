// 4x4 matrix helpers (column-major, Float32Array-compatible plain arrays).
// Used by the renderer for camera/projection math; pure functions for testability.

export function identity() {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

export function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function perspective(fovYRadians, aspect, near, far) {
  const f = 1 / Math.tan(fovYRadians / 2);
  const out = new Array(16).fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function translation(x, y, z) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ];
}

export function rotationX(radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ];
}

export function rotationY(radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ];
}

export function rotationZ(radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

// Right-handed lookAt view matrix.
export function lookAt(eye, target, up) {
  const zx = eye.x - target.x;
  const zy = eye.y - target.y;
  const zz = eye.z - target.z;
  let zLen = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
  const z0 = zx / zLen, z1 = zy / zLen, z2 = zz / zLen;

  let xx = up.y * z2 - up.z * z1;
  let xy = up.z * z0 - up.x * z2;
  let xz = up.x * z1 - up.y * z0;
  let xLen = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
  xx /= xLen; xy /= xLen; xz /= xLen;

  const yx = z1 * xz - z2 * xy;
  const yy = z2 * xx - z0 * xz;
  const yz = z0 * xy - z1 * xx;

  return [
    xx, yx, z0, 0,
    xy, yy, z1, 0,
    xz, yz, z2, 0,
    -(xx * eye.x + xy * eye.y + xz * eye.z),
    -(yx * eye.x + yy * eye.y + yz * eye.z),
    -(z0 * eye.x + z1 * eye.y + z2 * eye.z),
    1,
  ];
}

// Projects a point through a 4x4 matrix and returns homogeneous-divided coords.
export function transformPoint(m, p) {
  const x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
  const y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
  const z = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14];
  const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
  if (w === 0) return { x, y, z };
  return { x: x / w, y: y / w, z: z / w };
}
